import { createSign } from 'crypto';
import type { SessionUser, TaskCategory } from '@/types';
import { namesEqual, normalizePersonName } from '@/lib/utils/names';
import { indiaTodayKey, parseSheetDate, sheetDateFormula } from '@/lib/utils/indiaDate';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const DEFAULT_COMPLETIONS_SHEET = 'Checklist Completions';
const WEEKDAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

const DEFAULT_OFFICE_DAILY_ID = '1CE0ydiaeYYAPU31QJiZxMk444odWVXHgxj4O1nXu6Vc';
const DEFAULT_SALON_DAILY_ID = '1I3hRSp9vSiwAorQub27r6rdulg7Ryp730K7IlA98eOE';
const DEFAULT_WEEKLY_MONTHLY_ID = '13vWQz1G99hAsbvo0qDs9i92421RVAWuLY33clG_rBqg';

const CHECKLIST_HEADERS = ['id', 'taskId', 'uid', 'category', 'periodKey', 'completedAt'];

let cachedToken: { token: string; expiresAt: number } | null = null;
let checklistSheetReady = false;

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

function envPrivateKey() {
  const encoded = process.env.GOOGLE_SHEETS_PRIVATE_KEY_BASE64 || '';
  if (encoded) return Buffer.from(encoded, 'base64').toString('utf8');
  return (process.env.GOOGLE_SHEETS_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
}

function clientEmail() {
  return process.env.GOOGLE_SHEETS_CLIENT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL || '';
}

function spreadsheetId() {
  return process.env.CHECKLIST_SPREADSHEET_ID || '';
}

function timelySources() {
  return [
    { key: 'office', id: process.env.CHECKLIST_OFFICE_DAILY_ID || DEFAULT_OFFICE_DAILY_ID },
    { key: 'salon', id: process.env.CHECKLIST_SALON_DAILY_ID || DEFAULT_SALON_DAILY_ID },
    { key: 'weekly', id: process.env.CHECKLIST_WEEKLY_MONTHLY_ID || DEFAULT_WEEKLY_MONTHLY_ID },
  ].filter(source => source.id);
}

export function hasTimelyMasterSheets() {
  return timelySources().length === 3;
}

function completionsSheetName() {
  return process.env.CHECKLIST_COMPLETIONS_SHEET || DEFAULT_COMPLETIONS_SHEET;
}

function quoteSheetName(name: string) {
  return `'${name.replace(/'/g, "''")}'`;
}

export function hasGoogleSheetsAuth() {
  return Boolean(clientEmail() && envPrivateKey());
}

export function hasChecklistSheets() {
  return Boolean(spreadsheetId() && hasGoogleSheetsAuth());
}

export function hasChecklistBackend() {
  return hasGoogleSheetsAuth() && hasTimelyMasterSheets();
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: clientEmail(),
    scope: SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  }));
  const unsigned = `${header}.${payload}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(envPrivateKey());
  const assertion = `${unsigned}.${base64url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Google Sheets auth failed');
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

async function sheetsFetch(path: string, init: RequestInit = {}, targetId = spreadsheetId()) {
  if (!hasGoogleSheetsAuth()) throw new Error('Checklist Google Sheets is not configured');
  if (!targetId) throw new Error('Spreadsheet id is missing');
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  headers.set('content-type', headers.get('content-type') || 'application/json');

  const res = await fetch(`${SHEETS_API}/${targetId}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.error?.message || data.error || `Google Sheets request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

/** Read one or more A1 ranges from any spreadsheet the service account can access. */
export async function readSpreadsheetValues(
  targetId: string,
  ranges: string | string[],
  valueRenderOption: 'FORMATTED_VALUE' | 'UNFORMATTED_VALUE' | 'FORMULA' = 'UNFORMATTED_VALUE',
): Promise<unknown[][][]> {
  if (!hasGoogleSheetsAuth()) throw new Error('Google Sheets is not configured');
  if (!targetId) throw new Error('Spreadsheet id is missing');

  const list = Array.isArray(ranges) ? ranges : [ranges];
  if (list.length === 0) return [];

  if (list.length === 1) {
    const data = await sheetsFetch(
      `/values/${encodeURIComponent(list[0])}?majorDimension=ROWS&valueRenderOption=${valueRenderOption}`,
      {},
      targetId,
    );
    return [(data.values ?? []) as unknown[][]];
  }

  const params = new URLSearchParams({ majorDimension: 'ROWS', valueRenderOption });
  list.forEach(range => params.append('ranges', range));
  const data = await sheetsFetch(`/values:batchGet?${params.toString()}`, {}, targetId);
  return ((data.valueRanges ?? []) as Array<{ values?: unknown[][] }>).map(range => range.values ?? []);
}

async function ensureChecklistSheet() {
  if (checklistSheetReady) return;

  const sheetName = completionsSheetName();
  const metadata = await sheetsFetch('?fields=sheets.properties');
  const sheets = metadata.sheets ?? [];
  const exists = sheets.some((sheet: any) => sheet.properties?.title === sheetName);

  if (!exists) {
    await sheetsFetch(':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      }),
    });
  }

  await sheetsFetch(`/values/${encodeURIComponent(`${quoteSheetName(sheetName)}!A1:F1`)}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: [CHECKLIST_HEADERS] }),
  });
  checklistSheetReady = true;
}

export interface SheetChecklistCompletion {
  id: string;
  taskId: string;
  uid: string;
  category: TaskCategory;
  periodKey: string;
  completedAt: string;
}

function rowToCompletion(row: unknown[]): SheetChecklistCompletion | null {
  const [id, taskId, uid, category, periodKey, completedAt] = row.map(value => String(value ?? ''));
  if (!id || !taskId || !uid || !periodKey || !completedAt) return null;
  return {
    id,
    taskId,
    uid,
    category: category as TaskCategory,
    periodKey,
    completedAt,
  };
}

export async function getSheetChecklistCompletions(filters: {
  uid?: string;
  uids?: string[];
  taskId?: string;
  periodKey?: string;
  periodKeys?: string[];
} = {}) {
  await ensureChecklistSheet();
  const sheetName = completionsSheetName();
  const data = await sheetsFetch(`/values/${encodeURIComponent(`${quoteSheetName(sheetName)}!A2:F`)}`);
  const rows = (data.values ?? [])
    .map(rowToCompletion)
    .filter(Boolean) as SheetChecklistCompletion[];

  const uidSet = new Set([...(filters.uids ?? []), ...(filters.uid ? [filters.uid] : [])]);
  const periodSet = new Set([...(filters.periodKeys ?? []), ...(filters.periodKey ? [filters.periodKey] : [])]);

  return rows.filter(row => {
    if (uidSet.size > 0 && !uidSet.has(row.uid)) return false;
    if (filters.taskId && row.taskId !== filters.taskId) return false;
    if (periodSet.size > 0 && !periodSet.has(row.periodKey)) return false;
    return true;
  });
}

export async function appendSheetChecklistCompletion(input: {
  id: string;
  taskId: string;
  uid: string;
  category: TaskCategory;
  periodKey: string;
}) {
  await ensureChecklistSheet();
  const completedAt = new Date().toISOString();
  const sheetName = completionsSheetName();
  await sheetsFetch(`/values/${encodeURIComponent(`${quoteSheetName(sheetName)}!A:F`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    body: JSON.stringify({
      values: [[input.id, input.taskId, input.uid, input.category, input.periodKey, completedAt]],
    }),
  });
  return { ...input, completedAt };
}

export type ChecklistSheetCategory = 'Daily' | 'Weekly' | 'Monthly';

export interface SheetChecklistUser {
  rowNumber: number;
  userId: string;
  displayName: string;
  department: string;
  email: string;
  phone: string;
  portalUserId: string;
  active: boolean;
  sourceNames: string[];
}

export interface SheetChecklistTask {
  rowNumber: number;
  taskId: string;
  userId: string;
  userName: string;
  department: string;
  task: string;
  scheduleRule: string;
  scheduleValue: string;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  completed: boolean;
  completedAt: string;
  status: string;
  phone: string;
  email: string;
  active: boolean;
  dead: boolean;
  deadAt: string;
  remark: string;
  remarkBy: string;
  category?: ChecklistSheetCategory;
  sourceKey?: string;
  sourceSpreadsheetId?: string;
  sourceSheetName?: string;
}

interface ChecklistSheetData {
  users: SheetChecklistUser[];
  tasks: SheetChecklistTask[];
}

const sheetDataCache = new Map<ChecklistSheetCategory, { expiresAt: number; data: ChecklistSheetData }>();
let timelyBundleCache: { expiresAt: number; data: ChecklistSheetData } | null = null;
let timelyAllPeriodsCache: { expiresAt: number; data: ChecklistSheetData } | null = null;
const SHEET_CACHE_MS = 15_000;
const MIS_ALL_PERIODS_CACHE_MS = 60_000;

function clearTimelyCache() {
  timelyBundleCache = null;
  timelyAllPeriodsCache = null;
  sheetDataCache.clear();
}

function cell(row: unknown[], index: number) {
  return String(row[index] ?? '').trim();
}

function sheetBoolean(value: unknown, defaultValue = false) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!normalized) return defaultValue;
  return normalized === 'TRUE' || normalized === 'YES' || normalized === '1';
}

function normalizeName(value: string) {
  return normalizePersonName(value);
}

function lastTenDigits(value: string) {
  return value.replace(/\D/g, '').slice(-10);
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function addUtcDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function utcWeekday(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function weekBounds(isoDate: string) {
  const daysSinceWednesday = (utcWeekday(isoDate) - 3 + 7) % 7;
  const periodStart = addUtcDays(isoDate, -daysSinceWednesday);
  const periodEnd = addUtcDays(periodStart, 6);
  return {
    periodKey: `${periodStart}_${periodEnd}`,
    periodStart,
    periodEnd,
  };
}

function monthBounds(isoDate: string) {
  const [year, month] = isoDate.split('-');
  const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return {
    periodKey: `${year}-${month}`,
    periodStart: `${year}-${month}-01`,
    periodEnd: `${year}-${month}-${pad(lastDay)}`,
  };
}

function categoryFromFreq(freq: string): ChecklistSheetCategory | null {
  const value = freq.trim().toUpperCase();
  if (value === 'D' || value === 'DAILY') return 'Daily';
  if (value === 'W' || value === 'F' || value === 'WEEKLY') return 'Weekly';
  if (value === 'M' || value === 'Q' || value === 'Y' || value.startsWith('E')) return 'Monthly';
  return null;
}

function scheduleFor(category: ChecklistSheetCategory, freq: string, dueDate: string) {
  if (category === 'Daily') return { scheduleRule: 'EVERY_WORKING_DAY', scheduleValue: '' };
  if (category === 'Weekly') {
    return {
      scheduleRule: freq.toUpperCase() === 'F' ? 'FORTNIGHTLY' : 'DAY_OF_WEEK',
      scheduleValue: WEEKDAY_NAMES[utcWeekday(dueDate)] || '',
    };
  }
  return { scheduleRule: 'DAY_OF_MONTH', scheduleValue: String(Number(dueDate.slice(-2))) };
}

function periodFor(category: ChecklistSheetCategory, dueDate: string) {
  if (category === 'Daily') return { periodKey: dueDate, periodStart: dueDate, periodEnd: dueDate };
  if (category === 'Weekly') return weekBounds(dueDate);
  return monthBounds(dueDate);
}

function inCurrentPeriod(category: ChecklistSheetCategory, dueDate: string, today = indiaTodayKey()) {
  const period = periodFor(category, dueDate);
  const current = periodFor(category, today);
  return period.periodKey === current.periodKey;
}

function isMasterCompleted(actual: string, status: string) {
  if (/^(done|completed|complete|yes)$/i.test(status)) return true;
  return Boolean(actual);
}

function matchDirectoryUser(users: SheetChecklistUser[], name: string, email: string) {
  const normalized = normalizeName(name);
  const emailKey = email.trim().toLowerCase();
  return users.find(user => normalizeName(user.displayName) === normalized)
    || users.find(user => user.sourceNames.some(alias => normalizeName(alias) === normalized))
    || (emailKey ? users.find(user => user.email.trim().toLowerCase() === emailKey) : undefined)
    || null;
}

function rowToSheetUser(row: unknown[], index: number): SheetChecklistUser | null {
  const userId = cell(row, 0);
  const displayName = cell(row, 1);
  if (!userId || !displayName) return null;
  return {
    rowNumber: index + 2,
    userId,
    displayName,
    department: cell(row, 2),
    email: cell(row, 3),
    phone: lastTenDigits(cell(row, 4)),
    portalUserId: cell(row, 5),
    active: sheetBoolean(row[6], true),
    sourceNames: cell(row, 8).split('|').map(value => value.trim()).filter(Boolean),
  };
}

export async function getChecklistSheetData(category: ChecklistSheetCategory, force = false): Promise<ChecklistSheetData> {
  const all = await loadAllTimelyTasks(force);
  return {
    users: all.users,
    tasks: all.tasks.filter(task => task.category === category),
  };
}

export async function getAllTimelyChecklistData(
  force = false,
  options?: { includeAllPeriods?: boolean },
) {
  return loadAllTimelyTasks(force, options);
}

export function isTimelySheetTaskId(taskId: string) {
  return /^(office|salon|weekly)-/i.test(taskId);
}

async function loadAllTimelyTasks(
  force = false,
  options?: { includeAllPeriods?: boolean },
): Promise<ChecklistSheetData> {
  const includeAllPeriods = Boolean(options?.includeAllPeriods);
  if (includeAllPeriods && !force && timelyAllPeriodsCache && timelyAllPeriodsCache.expiresAt > Date.now()) {
    return timelyAllPeriodsCache.data;
  }
  if (!includeAllPeriods && !force && timelyBundleCache && timelyBundleCache.expiresAt > Date.now()) {
    return timelyBundleCache.data;
  }

  const sources = timelySources();
  const sourceResults = await Promise.all(sources.map(async source => {
    try {
      const params = new URLSearchParams({
        majorDimension: 'ROWS',
        valueRenderOption: 'FORMATTED_VALUE',
      });
      params.append('ranges', `${quoteSheetName('Master')}!A2:J`);
      params.append('ranges', `${quoteSheetName('Doer List')}!A2:C`);
      const response = await sheetsFetch(`/values:batchGet?${params.toString()}`, {}, source.id);
      const ranges = response.valueRanges ?? [];
      return {
        source,
        master: (ranges[0]?.values ?? []) as unknown[][],
        doers: (ranges[1]?.values ?? []) as unknown[][],
      };
    } catch (err) {
      console.error(`Failed to read ${source.key} timely sheet`, err);
      return { source, master: [] as unknown[][], doers: [] as unknown[][] };
    }
  }));

  const users = await loadDirectoryUsers(sourceResults.map(result => ({ source: result.source, values: result.doers })));
  const tasks: SheetChecklistTask[] = [];
  for (const { source, master } of sourceResults) {
    master.forEach((row, index) => {
      const task = masterRowToTask(row, index, source, users, { includeAllPeriods });
      if (task) tasks.push(task);
    });
  }

  const data = { users, tasks };
  if (includeAllPeriods) {
    timelyAllPeriodsCache = { expiresAt: Date.now() + MIS_ALL_PERIODS_CACHE_MS, data };
  } else {
    timelyBundleCache = { expiresAt: Date.now() + SHEET_CACHE_MS, data };
  }
  return data;
}

async function loadDirectoryUsers(doerLists: Array<{ source: { key: string; id: string }; values: unknown[][] }>) {
  const users: SheetChecklistUser[] = [];

  if (spreadsheetId()) {
    try {
      const response = await sheetsFetch(`/values/${encodeURIComponent(`${quoteSheetName('Users')}!A2:J`)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`);
      users.push(...(((response.values ?? []) as unknown[][]).map(rowToSheetUser).filter(Boolean) as SheetChecklistUser[]));
    } catch (err) {
      console.error('Failed to read optional Users directory overlay', err);
    }
  }

  for (const { source, values } of doerLists) {
    values.forEach((row, index) => {
      const name = cell(row, 0);
      const department = cell(row, 1);
      const email = cell(row, 2);
      if (!name) return;
      const existing = matchDirectoryUser(users, name, email);
      if (existing) {
        if (!existing.email && email) existing.email = email;
        if (!existing.sourceNames.includes(name)) existing.sourceNames.push(name);
        return;
      }
      users.push({
        rowNumber: index + 2,
        userId: `doer-${source.key}-${normalizeName(name).replace(/\s+/g, '-')}`,
        displayName: name,
        department,
        email,
        phone: '',
        portalUserId: '',
        active: true,
        sourceNames: [name],
      });
    });
  }

  return users;
}

function masterRowToTask(
  row: unknown[],
  index: number,
  source: { key: string; id: string },
  users: SheetChecklistUser[],
  options?: { includeAllPeriods?: boolean },
): SheetChecklistTask | null {
  const name = cell(row, 0);
  const task = cell(row, 5);
  const freq = cell(row, 4);
  const mappedCategory = categoryFromFreq(freq);
  if (!name || !task || !mappedCategory) return null;

  const dueDate = parseSheetDate(row[6]);
  if (!dueDate) return null;
  if (!options?.includeAllPeriods && !inCurrentPeriod(mappedCategory, dueDate)) return null;

  const email = cell(row, 1);
  const matched = matchDirectoryUser(users, name, email);
  const period = periodFor(mappedCategory, dueDate);
  const schedule = scheduleFor(mappedCategory, freq, dueDate);
  const actual = cell(row, 7);
  const status = cell(row, 8);
  const completed = isMasterCompleted(actual, status);
  const sourceTaskId = cell(row, 3) || String(index + 2);

  return {
    rowNumber: index + 2,
    taskId: `${source.key}-${sourceTaskId}`,
    userId: matched?.userId || `unmapped-${source.key}-${normalizeName(name).replace(/\s+/g, '-')}`,
    userName: matched?.displayName || name,
    department: matched?.department || cell(row, 2),
    task,
    scheduleRule: schedule.scheduleRule,
    scheduleValue: schedule.scheduleValue,
    periodKey: period.periodKey,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    dueDate,
    completed,
    completedAt: completed ? (parseSheetDate(actual) || dueDate) : '',
    status: completed ? 'COMPLETED' : 'PENDING',
    phone: matched?.phone || '',
    email: matched?.email || email,
    active: matched ? matched.active : true,
    dead: false,
    deadAt: '',
    remark: '',
    remarkBy: '',
    category: mappedCategory,
    sourceKey: source.key,
    sourceSpreadsheetId: source.id,
    sourceSheetName: 'Master',
  };
}

export function findChecklistSheetUser(users: SheetChecklistUser[], session: SessionUser) {
  const activeUsers = users.filter(user => user.active);
  const byPortalId = activeUsers.find(user => user.portalUserId && user.portalUserId === session.uid);
  if (byPortalId) return byPortalId;

  const sessionPhone = lastTenDigits(session.waNumber);
  if (sessionPhone) {
    const byPhone = activeUsers.find(user => user.phone && user.phone === sessionPhone);
    if (byPhone) return byPhone;
  }

  return activeUsers.find(user => namesEqual(user.displayName, session.name))
    || activeUsers.find(user => user.sourceNames.some(alias => namesEqual(alias, session.name)))
    || null;
}

export function taskBelongsToSession(
  row: Pick<SheetChecklistTask, 'userId' | 'userName'>,
  session: SessionUser,
  sheetUser?: SheetChecklistUser | null,
) {
  if (sheetUser && row.userId === sheetUser.userId) return true;
  if (sheetUser && namesEqual(row.userName, sheetUser.displayName)) return true;
  if (sheetUser?.sourceNames.some(alias => namesEqual(row.userName, alias))) return true;
  return namesEqual(row.userName, session.name);
}

export async function linkChecklistSheetUser(user: SheetChecklistUser, portalUserId: string) {
  if (!spreadsheetId()) return;
  if (!portalUserId || user.portalUserId === portalUserId) return;
  if (user.userId.startsWith('doer-') || user.userId.startsWith('unmapped-')) return;
  const range = `${quoteSheetName('Users')}!F${user.rowNumber}`;
  await sheetsFetch(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: [[portalUserId]] }),
  });
  clearTimelyCache();
}

export async function completeChecklistSheetTask(input: {
  category: ChecklistSheetCategory;
  taskId: string;
  periodKey: string;
  session: SessionUser;
}) {
  const data = await getChecklistSheetData(input.category, true);
  const user = findChecklistSheetUser(data.users, input.session);
  const task = data.tasks.find(row =>
    row.taskId === input.taskId &&
    row.periodKey === input.periodKey &&
    taskBelongsToSession(row, input.session, user)
  );
  if (!task) throw new Error('Checklist task was not found for your account and current period');
  if (!task.active) throw new Error('This checklist task is inactive');
  if (task.completed) throw new Error('This checklist task is already completed');
  if (task.dead) throw new Error('Revive this task before marking it complete');
  if (!task.sourceSpreadsheetId) {
    throw new Error('This checklist task is not linked to a timely Master sheet');
  }

  const today = indiaTodayKey();
  const sheetName = task.sourceSheetName || 'Master';
  const range = `${quoteSheetName(sheetName)}!H${task.rowNumber}:I${task.rowNumber}`;
  await sheetsFetch(`/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    body: JSON.stringify({ values: [[sheetDateFormula(today), 'Done']] }),
  }, task.sourceSpreadsheetId);
  clearTimelyCache();
  return { taskId: task.taskId, periodKey: task.periodKey, completedAt: today };
}

export async function completeTimelySheetTaskById(taskId: string) {
  const all = await loadAllTimelyTasks(true);
  const task = all.tasks.find(row => row.taskId === taskId);
  if (!task) return null;
  if (task.completed) return task;
  if (!task.sourceSpreadsheetId) throw new Error('This checklist task is not linked to a timely Master sheet');
  const today = indiaTodayKey();
  const sheetName = task.sourceSheetName || 'Master';
  const range = `${quoteSheetName(sheetName)}!H${task.rowNumber}:I${task.rowNumber}`;
  await sheetsFetch(`/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    body: JSON.stringify({ values: [[sheetDateFormula(today), 'Done']] }),
  }, task.sourceSpreadsheetId);
  clearTimelyCache();
  return { ...task, completed: true, completedAt: today, status: 'COMPLETED' };
}

export async function updateChecklistSheetTask(input: {
  category: ChecklistSheetCategory;
  taskId: string;
  periodKey: string;
  action: 'dead' | 'remark' | 'revive';
  remark: string;
  session: SessionUser;
}) {
  const data = await getChecklistSheetData(input.category, true);
  const elevated = input.session.role === 'admin' || input.session.role === 'leader';
  const user = findChecklistSheetUser(data.users, input.session);
  const task = data.tasks.find(row =>
    row.taskId === input.taskId &&
    row.periodKey === input.periodKey &&
    (elevated || taskBelongsToSession(row, input.session, user))
  );
  if (!task) throw new Error('Checklist task was not found or you cannot update it');
  if (task.sourceSpreadsheetId) {
    throw new Error('Dead and remarks are not available on the live timely Master sheets. Mark the task complete instead.');
  }
  if (!task.active) throw new Error('This checklist task is inactive');
  if (task.completed && input.action !== 'remark') throw new Error('Completed checklist tasks cannot be flagged Dead');

  const cleanRemark = input.remark.trim();
  if (!cleanRemark) throw new Error('A remark is required');
  if (cleanRemark.length > 1000) throw new Error('Remark must be 1000 characters or fewer');

  const now = new Date().toISOString();
  const entry = `[${now}] ${input.session.name}: ${cleanRemark}`;
  const remark = task.remark ? `${task.remark}\n${entry}` : entry;
  const updates: Array<{ range: string; values: unknown[][] }> = [
    { range: `${quoteSheetName(input.category)}!T1:W1`, values: [['dead', 'dead_at', 'remark', 'remark_by']] },
    { range: `${quoteSheetName(input.category)}!V${task.rowNumber}:W${task.rowNumber}`, values: [[remark, input.session.name]] },
  ];

  if (input.action === 'dead') {
    updates.push(
      { range: `${quoteSheetName(input.category)}!N${task.rowNumber}`, values: [['DEAD']] },
      { range: `${quoteSheetName(input.category)}!T${task.rowNumber}:U${task.rowNumber}`, values: [[true, now]] },
    );
  } else if (input.action === 'revive') {
    updates.push(
      { range: `${quoteSheetName(input.category)}!N${task.rowNumber}`, values: [['PENDING']] },
      { range: `${quoteSheetName(input.category)}!T${task.rowNumber}:U${task.rowNumber}`, values: [[false, '']] },
    );
  }

  await sheetsFetch('/values:batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updates }),
  });
  sheetDataCache.delete(input.category);
  return {
    taskId: task.taskId,
    periodKey: task.periodKey,
    dead: input.action === 'dead' ? true : input.action === 'revive' ? false : task.dead,
    deadAt: input.action === 'dead' ? now : input.action === 'revive' ? null : task.deadAt || null,
    remark,
    remarkBy: input.session.name,
  };
}
