import { createHash, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { cfApi } from '@/lib/cloudflare/api';
import { D1_READ_SOFT_LIMIT, D1_WRITE_SOFT_LIMIT, getTodayD1Usage } from '@/lib/cloudflare/d1Usage';
import { readSpreadsheetValues } from '@/lib/google/sheets';
import { normalizePersonName } from '@/lib/utils/names';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DELEGATION_ID = '1CB9OuKKypGmbyZmbm6810lPbxLQmVQoJBWTMeBg2dfI';
const CHECKLISTS = [
  { id: '1I3hRSp9vSiwAorQub27r6rdulg7Ryp730K7IlA98eOE' },
  { id: '13vWQz1G99hAsbvo0qDs9i92421RVAWuLY33clG_rBqg' },
  { id: '1CE0ydiaeYYAPU31QJiZxMk444odWVXHgxj4O1nXu6Vc' },
] as const;
const MAX_CHANGES = 1_000;
const READ_RESERVE = 250_000;
const WRITE_RESERVE = 5_000;

type Candidate = Record<string, any>;
type SheetRow = unknown[];

function normalizedTask(value: unknown) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s\u200B-\u200D\uFEFF]+/g, '');
}

function taskKey(name: unknown, description: unknown) {
  return `${normalizePersonName(name)}\u0000${normalizedTask(description)}`;
}

function dateKey(value: unknown): string | null {
  const text = String(value ?? '').trim();
  const valid = (key: string) => {
    const date = new Date(`${key}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === key ? key : null;
  };
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const key = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    return valid(key);
  }
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? valid(iso[1]) : null;
}

function sheetStatus(value: unknown): 'Completed' | 'Verified' | 'Dead' | 'Pending' | null {
  const status = normalizedTask(value);
  if (['done', 'completed', 'complete'].includes(status)) return 'Completed';
  if (status === 'verified') return 'Verified';
  if (status === 'dead') return 'Dead';
  if (['pending', 'pendingaccept', 'inprogress'].includes(status)) return 'Pending';
  return null;
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const supplied = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!secret) return false;
  const expected = Buffer.from(secret), actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function candidates(kind: string): Promise<Candidate[]> {
  const output: Candidate[] = [];
  let after = '';
  for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
    const params = new URLSearchParams({ kind, limit: '1000' });
    if (after) params.set('after', after);
    const page = await cfApi<Candidate[]>(`/sheet-sync/candidates?${params}`);
    output.push(...page);
    if (page.length < 1000) return output;
    const next = String(page[page.length - 1]?.id || page[page.length - 1]?.task_id || '');
    if (!next || next === after) throw new Error(`Sheet sync ${kind} pagination did not advance`);
    after = next;
  }
  throw new Error(`Sheet sync ${kind} exceeded the safe page limit`);
}

function indexRows(rows: SheetRow[], nameColumn: number, taskColumn: number) {
  const map = new Map<string, SheetRow[]>();
  for (const row of rows.slice(1)) {
    const key = taskKey(row[nameColumn], row[taskColumn]);
    if (!key.includes('\u0000') || !normalizedTask(row[taskColumn]) || !normalizePersonName(row[nameColumn])) continue;
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

function matchDelegation(task: Candidate, rows: SheetRow[]) {
  if (rows.length === 1) return rows[0];
  const dbDue = dateKey(task.delayed_date || task.end_date);
  const matches = rows.filter(row => dateKey(row[5] || row[2]) === dbDue);
  return matches.length === 1 ? matches[0] : null;
}

function categoryFromFrequency(value: unknown): 'Daily' | 'Weekly' | 'Monthly' | null {
  const frequency = normalizedTask(value);
  if (frequency === 'd' || frequency === 'daily') return 'Daily';
  if (frequency === 'w' || frequency === 'weekly') return 'Weekly';
  if (frequency === 'm' || frequency === 'monthly') return 'Monthly';
  return null;
}

async function checkBudget() {
  const usage = await getTodayD1Usage();
  return {
    usage,
    allowed: usage.rowsRead < D1_READ_SOFT_LIMIT - READ_RESERVE &&
      usage.rowsWritten < D1_WRITE_SOFT_LIMIT - WRITE_RESERVE,
  };
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    // Fail closed before any D1 read or write if analytics is unavailable or usage is high.
    const initial = await checkBudget();
    if (!initial.allowed) return NextResponse.json({ success: true, skipped: 'D1 soft limit reserve reached', usage: initial.usage });

    const [delegationValues, ...checklistValues] = await Promise.all([
      readSpreadsheetValues(DELEGATION_ID, "'Master'!A:H", 'FORMATTED_VALUE'),
      ...CHECKLISTS.map(sheet => readSpreadsheetValues(sheet.id, [
        "'Master'!A:I",
        "'Task List'!A:G",
      ], 'FORMATTED_VALUE')),
    ]);
    const delegation = indexRows(delegationValues[0] || [], 0, 1);
    const recurringMasters = checklistValues.map(values => indexRows(values[0] || [], 0, 5));
    const beforeDatabaseReads = await checkBudget();
    if (!beforeDatabaseReads.allowed) return NextResponse.json({ success: true, skipped: 'D1 soft limit reserve reached before database reads', usage: beforeDatabaseReads.usage });

    const [openDelegation, openPeriods, legacyRecurring, recurringHistory, templates, users] = await Promise.all([
      candidates('delegation'),
      candidates('recurring-period'),
      candidates('recurring-legacy'),
      cfApi<Candidate[]>('/sheet-sync/recurring-history'),
      cfApi<Candidate[]>('/recurring/templates'),
      cfApi<Candidate[]>('/users'),
    ]);
    if (!users.length) throw new Error('Cannot resolve assignees from an empty user list');
    if (recurringHistory.length > 5000) throw new Error('Recurring history exceeds the safe deduplication limit');
    const beforeWrites = await checkBudget();
    if (!beforeWrites.allowed) return NextResponse.json({ success: true, skipped: 'D1 soft limit reserve reached after reads', usage: beforeWrites.usage });

    const userByName = new Map<string, Candidate | null>();
    for (const user of users.filter(user => user.isActive !== false)) {
      for (const value of [user.name, user.rawName, String(user.uid || '').replace(/^user[-_]/i, '')]) {
        const key = normalizePersonName(value);
        if (!key) continue;
        if (userByName.has(key) && userByName.get(key)?.uid !== user.uid) userByName.set(key, null);
        else if (!userByName.has(key)) userByName.set(key, user);
      }
    }

    let updatedDelegation = 0, updatedRecurring = 0, createdRecurring = 0, skippedAmbiguous = 0;
    let changes = 0, estimatedReads = 0, estimatedWrites = 0;
    const mayWrite = async (readCost: number, writeCost: number, changeCount = 1) => {
      if (changes + changeCount > MAX_CHANGES) return false;
      if (beforeWrites.usage.rowsRead + estimatedReads + readCost >= D1_READ_SOFT_LIMIT - 50_000) return false;
      if (beforeWrites.usage.rowsWritten + estimatedWrites + writeCost >= D1_WRITE_SOFT_LIMIT - 1_000) return false;
      if (changes % 20 === 0 && !(await checkBudget()).allowed) return false;
      return true;
    };

    for (const task of openDelegation) {
      const matches = delegation.get(taskKey(task.assigned_to_name, task.description)) || [];
      const row = matchDelegation(task, matches);
      if (!row) { if (matches.length > 1) skippedAmbiguous++; continue; }
      const due = dateKey(row[5] || row[2]); // Final Date, then First Date. No start date is read.
      const status = sheetStatus(row[7]);
      const update: Record<string, string> = {};
      if (due && due !== dateKey(task.end_date)) update.endDate = `${due}T12:00:00+05:30`;
      if (status && status !== 'Pending' && status !== task.status) update.status = status;
      if (!Object.keys(update).length) continue;
      if (!(await mayWrite(1_000, 50))) break;
      await cfApi(`/tasks/${encodeURIComponent(task.task_id)}`, { method: 'PATCH', body: JSON.stringify(update) });
      changes++; updatedDelegation++; estimatedReads += 1_000; estimatedWrites += 50;
    }

    const periodMaps = recurringMasters;
    const periodUpdates: Array<{ id: string; status: 'Completed' | 'Verified' | 'Dead'; actualDate: string | null; dueDate: string }> = [];
    for (const period of openPeriods) {
      const due = dateKey(period.due_date || period.period_key);
      if (!due) continue;
      const key = taskKey(period.assigned_to_name, period.description || period.title);
      const dated = periodMaps.flatMap(map => map.get(key) || []).filter(row => dateKey(row[6]) === due);
      const byDepartment = dated.filter(row => normalizePersonName(row[2]) === normalizePersonName(period.department));
      const matches = byDepartment.length === 1 ? byDepartment : dated;
      if (matches.length !== 1) { if (matches.length > 1) skippedAmbiguous++; continue; }
      const status = sheetStatus(matches[0][8]);
      if (!status || status === 'Pending') continue;
      periodUpdates.push({ id: period.id, status, actualDate: dateKey(matches[0][7]), dueDate: due });
    }
    for (let offset = 0; offset < periodUpdates.length && changes < MAX_CHANGES; offset += 100) {
      const batch = periodUpdates.slice(offset, offset + Math.min(100, MAX_CHANGES - changes));
      if (!(await mayWrite(batch.length * 100, batch.length * 10, batch.length))) break;
      const result = await cfApi<{ updated: number }>('/sheet-sync/period-status', {
        method: 'PATCH', body: JSON.stringify({ items: batch }),
      });
      estimatedReads += batch.length * 100; estimatedWrites += batch.length * 10;
      changes += result.updated; updatedRecurring += result.updated;
    }

    const existingRecurring = new Set<string>();
    for (const task of [...templates, ...legacyRecurring, ...openPeriods, ...recurringHistory]) {
      const category = categoryFromFrequency(task.category);
      if (category) existingRecurring.add(`${category}\u0000${taskKey(task.assignedToName || task.assigned_to_name, task.description || task.title)}`);
    }
    for (let i = 0; i < CHECKLISTS.length; i++) {
      for (const row of (checklistValues[i][1] || []).slice(1)) {
        const category = categoryFromFrequency(row[3]);
        const taskText = String(row[0] || '').trim();
        const name = String(row[1] || '').trim();
        if (!category || !taskText || !name || ['deleted', 'inactive', 'removed'].includes(normalizedTask(row[5]))) continue;
        const key = `${category}\u0000${taskKey(name, taskText)}`;
        if (existingRecurring.has(key)) continue;
        const user = userByName.get(normalizePersonName(name));
        const startDate = dateKey(row[4]);
        if (!user || !startDate) { skippedAmbiguous++; continue; }
        if (!(await mayWrite(1_000, 300))) break;
        const id = `rec_sheet_${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
        const date = new Date(`${startDate}T12:00:00Z`);
        const isoDow = date.getUTCDay() || 7;
        await cfApi('/recurring/templates', {
          method: 'POST',
          body: JSON.stringify({
            id, category, frequency: category, title: taskText.split(/\r?\n/)[0].slice(0, 100),
            description: taskText, assignedTo: user.uid, assignedToName: user.name,
            department: user.department || String(row[2] || ''),
            dayOfWeek: category === 'Weekly' ? isoDow : null,
            dayOfMonth: category === 'Monthly' ? date.getUTCDate() : null,
            isActive: true, metadata: { startDate },
          }),
        });
        existingRecurring.add(key);
        changes++; createdRecurring++; estimatedReads += 1_000; estimatedWrites += 300;
      }
    }

    return NextResponse.json({ success: true, updatedDelegation, updatedRecurring, createdRecurring, skippedAmbiguous, changes });
  } catch (error) {
    console.error('[sheet-sync] stopped without WhatsApp notification:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Sheet sync failed' }, { status: 503 });
  }
}
