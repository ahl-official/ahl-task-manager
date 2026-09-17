/**
 * Exact MIS Report Master view: drive the live sheet (A4 / F2 / G2) then read
 * the formatted grid so the portal matches Google Sheets cell-for-cell.
 */
import {
  formatDateAppsScript,
  misReportSpreadsheetId,
} from '@/lib/mis/appsScript';
import { hasGoogleSheetsAuth } from '@/lib/google/sheets';
import { createSign } from 'crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

/** Visible MIS Report Master grid (left KRA/KPI + right FMS step panels). */
export const MIS_MASTER_GRID_RANGE = "'MIS Report Master'!A1:R160";

let cachedToken: { token: string; expiresAt: number } | null = null;
let sheetLock: Promise<void> = Promise.resolve();

function envPrivateKey() {
  const encoded = process.env.GOOGLE_SHEETS_PRIVATE_KEY_BASE64 || '';
  if (encoded) return Buffer.from(encoded, 'base64').toString('utf8');
  return (process.env.GOOGLE_SHEETS_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
}

function clientEmail() {
  return process.env.GOOGLE_SHEETS_CLIENT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL || '';
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: clientEmail(),
    scope: SCOPES,
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
    throw new Error(data.error_description || data.error || 'Google Sheets auth failed for MIS Master view');
  }
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

function quoteSheet(name: string) {
  return `'${name.replace(/'/g, "''")}'`;
}

async function sheetsGet(range: string, render: 'FORMATTED_VALUE' | 'UNFORMATTED_VALUE' = 'FORMATTED_VALUE') {
  const token = await getAccessToken();
  const id = misReportSpreadsheetId();
  const url = `${SHEETS_API}/${id}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=${render}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Sheets get failed (${res.status})`);
  return (data.values ?? []) as string[][];
}

async function sheetsUpdate(range: string, values: unknown[][]) {
  const token = await getAccessToken();
  const id = misReportSpreadsheetId();
  const url = `${SHEETS_API}/${id}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Sheets update failed (${res.status})`);
  return data;
}

function isoToSheetDate(iso: string) {
  // MIS Report Master shows dd/mm/yyyy (e.g. 09/09/2026)
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  return formatDateAppsScript(iso);
}

function withSheetLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = sheetLock.then(fn, fn);
  sheetLock = run.then(() => undefined, () => undefined);
  return run;
}

export function hasMisReportMasterSheet() {
  return Boolean(misReportSpreadsheetId() && hasGoogleSheetsAuth() && clientEmail() && envPrivateKey());
}

export interface MisReportMasterGrid {
  name: string;
  weekStart: string;
  weekEnd: string;
  weekStartLabel: string;
  weekEndLabel: string;
  misScore: string;
  rows: string[][];
  colCount: number;
  spreadsheetId: string;
  sheetUrl: string;
}

/**
 * Set person + week on MIS Report Master, then read the formatted display grid.
 * Serialized so concurrent admin clicks don't race on A4.
 */
export async function fetchMisReportMasterGrid(input: {
  name: string;
  weekStart: string;
  weekEnd: string;
}): Promise<MisReportMasterGrid> {
  if (!hasMisReportMasterSheet()) {
    throw new Error('MIS Report Master sheet auth is not configured');
  }
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Person name is required');

  const weekStartLabel = isoToSheetDate(input.weekStart);
  const weekEndLabel = isoToSheetDate(input.weekEnd);

  return withSheetLock(async () => {
    // Drive the same inputs the sheet formulas use
    await sheetsUpdate(`${quoteSheet('MIS Report Master')}!A4`, [[name]]);
    await sheetsUpdate(`${quoteSheet('MIS Report Master')}!F2:G2`, [[weekStartLabel, weekEndLabel]]);

    // Allow Sheets to recalculate before read
    await new Promise(resolve => setTimeout(resolve, 800));

    const rows = await sheetsGet(MIS_MASTER_GRID_RANGE, 'FORMATTED_VALUE');
    const colCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
    const padded = rows.map(row => {
      const next = row.map(cell => String(cell ?? ''));
      while (next.length < colCount) next.push('');
      return next;
    });

    const misScore = String(padded[1]?.[18] ?? padded[3]?.[6] ?? ''); // S2 or G4
    const id = misReportSpreadsheetId();

    return {
      name,
      weekStart: input.weekStart,
      weekEnd: input.weekEnd,
      weekStartLabel: String(padded[1]?.[5] ?? weekStartLabel),
      weekEndLabel: String(padded[1]?.[6] ?? weekEndLabel),
      misScore,
      rows: padded,
      colCount,
      spreadsheetId: id,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`,
    };
  });
}
