import { createSign } from 'crypto';
import type { TaskCategory } from '@/types';

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
  return (process.env.GOOGLE_SHEETS_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
}

function clientEmail() {
  return process.env.GOOGLE_SHEETS_CLIENT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
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
