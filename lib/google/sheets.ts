import { createSign } from 'crypto';
import type { SessionUser, TaskCategory } from '@/types';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const DEFAULT_COMPLETIONS_SHEET = 'Checklist Completions';

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

function completionsSheetName() {
  return process.env.CHECKLIST_COMPLETIONS_SHEET || DEFAULT_COMPLETIONS_SHEET;
}

function quoteSheetName(name: string) {
  return `'${name.replace(/'/g, "''")}'`;
}

export function hasChecklistSheets() {
  return Boolean(spreadsheetId() && clientEmail() && envPrivateKey());
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

async function sheetsFetch(path: string, init: RequestInit = {}) {
  if (!hasChecklistSheets()) throw new Error('Checklist Google Sheets is not configured');
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  headers.set('content-type', headers.get('content-type') || 'application/json');

  const res = await fetch(`${SHEETS_API}/${spreadsheetId()}${path}`, {
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
}

interface ChecklistSheetData {
  users: SheetChecklistUser[];
  tasks: SheetChecklistTask[];
}

const sheetDataCache = new Map<ChecklistSheetCategory, { expiresAt: number; data: ChecklistSheetData }>();
const SHEET_CACHE_MS = 15_000;

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
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function lastTenDigits(value: string) {
  return value.replace(/\D/g, '').slice(-10);
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
  };
}

function rowToSheetTask(row: unknown[], index: number): SheetChecklistTask | null {
  const taskId = cell(row, 0);
  const userId = cell(row, 1);
  const task = cell(row, 4);
  if (!taskId || !userId || !task) return null;
  return {
    rowNumber: index + 2,
    taskId,
    userId,
    userName: cell(row, 2),
    department: cell(row, 3),
    task,
    scheduleRule: cell(row, 5),
    scheduleValue: cell(row, 6),
    periodKey: cell(row, 7),
    periodStart: cell(row, 8),
    periodEnd: cell(row, 9),
    dueDate: cell(row, 10),
    completed: sheetBoolean(row[11]),
    completedAt: cell(row, 12),
    status: cell(row, 13) || 'PENDING',
    phone: lastTenDigits(cell(row, 16)),
    email: cell(row, 17),
    active: sheetBoolean(row[18], true),
    dead: sheetBoolean(row[19]),
    deadAt: cell(row, 20),
    remark: cell(row, 21),
    remarkBy: cell(row, 22),
  };
}

export async function getChecklistSheetData(category: ChecklistSheetCategory, force = false): Promise<ChecklistSheetData> {
  const cached = sheetDataCache.get(category);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.data;

  const params = new URLSearchParams({
    majorDimension: 'ROWS',
    valueRenderOption: 'FORMATTED_VALUE',
  });
  params.append('ranges', `${quoteSheetName('Users')}!A2:G`);
  params.append('ranges', `${quoteSheetName(category)}!A2:W`);
  const response = await sheetsFetch(`/values:batchGet?${params.toString()}`);
  const ranges = response.valueRanges ?? [];
  const users = ((ranges[0]?.values ?? []) as unknown[][])
    .map(rowToSheetUser)
    .filter(Boolean) as SheetChecklistUser[];
  const tasks = ((ranges[1]?.values ?? []) as unknown[][])
    .map(rowToSheetTask)
    .filter(Boolean) as SheetChecklistTask[];
  const data = { users, tasks };
  sheetDataCache.set(category, { expiresAt: Date.now() + SHEET_CACHE_MS, data });
  return data;
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

  const sessionName = normalizeName(session.name);
  return activeUsers.find(user => normalizeName(user.displayName) === sessionName) ?? null;
}

export async function linkChecklistSheetUser(user: SheetChecklistUser, portalUserId: string) {
  if (!portalUserId || user.portalUserId === portalUserId) return;
  const range = `${quoteSheetName('Users')}!F${user.rowNumber}`;
  await sheetsFetch(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: [[portalUserId]] }),
  });
  sheetDataCache.clear();
}

export async function completeChecklistSheetTask(input: {
  category: ChecklistSheetCategory;
  taskId: string;
  periodKey: string;
  session: SessionUser;
}) {
  const data = await getChecklistSheetData(input.category, true);
  const user = findChecklistSheetUser(data.users, input.session);
  if (!user) throw new Error('Your portal account is not linked to the checklist user directory');

  const task = data.tasks.find(row =>
    row.taskId === input.taskId &&
    row.periodKey === input.periodKey &&
    row.userId === user.userId
  );
  if (!task) throw new Error('Checklist task was not found for your account and current period');
  if (!task.active) throw new Error('This checklist task is inactive');
  if (task.completed) throw new Error('This checklist task is already completed');
  if (task.dead) throw new Error('Revive this task before marking it complete');

  const completedAt = new Date().toISOString();
  const range = `${quoteSheetName(input.category)}!L${task.rowNumber}:N${task.rowNumber}`;
  await sheetsFetch(`/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    body: JSON.stringify({ values: [[true, completedAt, 'COMPLETED']] }),
  });
  sheetDataCache.delete(input.category);
  return { taskId: task.taskId, periodKey: task.periodKey, completedAt };
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
    (elevated || row.userId === user?.userId)
  );
  if (!task) throw new Error('Checklist task was not found or you cannot update it');
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
