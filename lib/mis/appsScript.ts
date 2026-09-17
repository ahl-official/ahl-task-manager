/**
 * Literal ports of the MIS Report Master Apps Script functions.
 * Sheet IDs / template / folder match generateAndSendReports in Apps Script.
 */
import { createSign } from 'crypto';
import { hasGoogleSheetsAuth } from '@/lib/google/sheets';
import { parseSheetDate } from '@/lib/utils/indiaDate';
import { sendWhatsAppPdfFromDriveLink } from '@/lib/waha';

export const DEFAULT_MIS_REPORT_SPREADSHEET_ID = '1seVqJ5xPqva1Si6CXDpuZSePvP40PDO2fzJSJfss8GU';
export const DEFAULT_MIS_DOC_TEMPLATE_ID = '1W0V2w3-xd08FK_Zx7M37k8xOysh2KL2uqNbltbJ1PTs';
export const DEFAULT_MIS_OUTPUT_FOLDER_ID = '1QR7OGXtND7F6hFTuKPA6hkL06A0u2RDI';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DOCS_API = 'https://docs.googleapis.com/v1';
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
].join(' ');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

let cachedToken: { token: string; expiresAt: number } | null = null;

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

export function misReportSpreadsheetId() {
  return process.env.MIS_REPORT_SPREADSHEET_ID || DEFAULT_MIS_REPORT_SPREADSHEET_ID;
}

export function misDocTemplateId() {
  return process.env.MIS_DOC_TEMPLATE_ID || DEFAULT_MIS_DOC_TEMPLATE_ID;
}

export function misOutputFolderId() {
  return process.env.MIS_REPORT_OUTPUT_FOLDER_ID || DEFAULT_MIS_OUTPUT_FOLDER_ID;
}

function quoteSheet(name: string) {
  return `'${name.replace(/'/g, "''")}'`;
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
  const signature = createSignRSA(unsigned);
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
    throw new Error(data.error_description || data.error || 'Google auth failed for MIS Apps Script parity');
  }
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

function createSignRSA(unsigned: string) {
  return createSign('RSA-SHA256').update(unsigned).sign(envPrivateKey());
}

async function sheetsValuesGet(range: string, render: 'UNFORMATTED_VALUE' | 'FORMATTED_VALUE' = 'UNFORMATTED_VALUE') {
  const token = await getAccessToken();
  const id = misReportSpreadsheetId();
  const url = `${SHEETS_API}/${id}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=${render}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Sheets get failed (${res.status})`);
  return (data.values ?? []) as unknown[][];
}

async function sheetsValuesUpdate(range: string, values: unknown[][]) {
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

async function sheetsValuesAppend(range: string, values: unknown[][]) {
  const token = await getAccessToken();
  const id = misReportSpreadsheetId();
  const url = `${SHEETS_API}/${id}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Sheets append failed (${res.status})`);
  return data;
}

async function sheetsGetBackgroundsAndFonts(a1: string) {
  const token = await getAccessToken();
  const id = misReportSpreadsheetId();
  const url = `${SHEETS_API}/${id}?includeGridData=true&ranges=${encodeURIComponent(a1)}&fields=sheets.data.rowData.values(userEnteredFormat(backgroundColor,textFormat(foregroundColor)))`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Sheets format read failed (${res.status})`);

  const rowData = data.sheets?.[0]?.data?.[0]?.rowData ?? [];
  const backgrounds: string[][] = [];
  const fontColors: string[][] = [];
  for (const row of rowData) {
    const bgRow: string[] = [];
    const fgRow: string[] = [];
    for (const cell of row.values ?? []) {
      bgRow.push(rgbToHex(cell.userEnteredFormat?.backgroundColor) || '#ffffff');
      fgRow.push(rgbToHex(cell.userEnteredFormat?.textFormat?.foregroundColor) || '#000000');
    }
    backgrounds.push(bgRow);
    fontColors.push(fgRow);
  }
  return { backgrounds, fontColors };
}

function rgbToHex(color?: { red?: number; green?: number; blue?: number }) {
  if (!color) return '';
  const r = Math.round((color.red ?? 0) * 255);
  const g = Math.round((color.green ?? 0) * 255);
  const b = Math.round((color.blue ?? 0) * 255);
  return `#${[r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')}`;
}

/** Apps Script formatDate */
export function formatDateAppsScript(date: unknown): string {
  if (date instanceof Date && !Number.isNaN(date.getTime())) {
    const day = (`0${date.getDate()}`).slice(-2);
    const month = (`0${date.getMonth() + 1}`).slice(-2);
    return `${day}/${month}/${date.getFullYear()}`;
  }
  if (typeof date === 'number' && Number.isFinite(date)) {
    const key = parseSheetDate(date);
    if (!key) return String(date);
    const [y, m, d] = key.split('-');
    return `${d}/${m}/${y}`;
  }
  return date === '' || date == null ? '' : String(date).trim();
}

/** Apps Script normalizeDate */
export function normalizeDateAppsScript(v: unknown): string {
  if (v instanceof Date) return formatDateAppsScript(v);
  if (typeof v === 'number') return formatDateAppsScript(v);
  return v === '' || v == null ? '' : String(v).trim();
}

/** Apps Script G4 → decimalG4 */
export function toDecimalG4(cellG4: unknown): number {
  if (typeof cellG4 === 'number') {
    return cellG4 > 1 ? cellG4 / 100 : cellG4;
  }
  if (typeof cellG4 === 'string' && cellG4.includes('%')) {
    return parseFloat(cellG4.replace('%', '').trim()) / 100;
  }
  return 0;
}

/** Apps Script display: numeric → (value * 100).toFixed(2) + '%' */
export function displayAppsScriptPercent(value: unknown): string {
  const isNumeric = typeof value === 'number' && !Number.isNaN(value);
  if (isNumeric) return `${((value as number) * 100).toFixed(2)}%`;
  return String(value ?? '');
}

/**
 * archiveData()
 * Reads MIS Report Master!A4,H4,H5 → appends Archive!A:D
 */
export async function archiveData() {
  if (!hasGoogleSheetsAuth()) throw new Error('Google Sheets auth is not configured');

  const [[a4] = [], [h4] = [], [h5] = []] = await Promise.all([
    sheetsValuesGet(`${quoteSheet('MIS Report Master')}!A4`),
    sheetsValuesGet(`${quoteSheet('MIS Report Master')}!H4`),
    sheetsValuesGet(`${quoteSheet('MIS Report Master')}!H5`),
  ]);

  const employeeName = a4?.[0] ?? '';
  const nextWeekPlannedPercentage1 = h4?.[0] ?? '';
  const nextWeekPlannedPercentage2 = h5?.[0] ?? '';
  const timestamp = new Date().toISOString();

  await sheetsValuesAppend(`${quoteSheet('Archive')}!A:D`, [[
    timestamp,
    employeeName,
    nextWeekPlannedPercentage1,
    nextWeekPlannedPercentage2,
  ]]);

  return {
    ok: true,
    employeeName,
    h4: nextWeekPlannedPercentage1,
    h5: nextWeekPlannedPercentage2,
    timestamp,
  };
}

/**
 * addDataToMISData()
 * Reads A4, F2, G2, G4 → writes MIS Data row (deduped)
 */
export async function addDataToMISData() {
  if (!hasGoogleSheetsAuth()) throw new Error('Google Sheets auth is not configured');

  const a4Rows = await sheetsValuesGet(`${quoteSheet('MIS Report Master')}!A4`, 'FORMATTED_VALUE');
  const headerVals = await sheetsValuesGet(`${quoteSheet('MIS Report Master')}!F2:G4`, 'UNFORMATTED_VALUE');

  const cellA4 = String(a4Rows?.[0]?.[0] ?? '').trim();
  const cellF2 = headerVals?.[0]?.[0];
  const cellG2 = headerVals?.[0]?.[1];
  const cellG4 = headerVals?.[2]?.[1];

  const decimalG4 = toDecimalG4(cellG4);
  const formattedF2 = formatDateAppsScript(cellF2);
  const formattedG2 = formatDateAppsScript(cellG2);

  const existing = await sheetsValuesGet(`${quoteSheet('MIS Data')}!A2:D`, 'UNFORMATTED_VALUE');
  let nextRow = (existing?.length ?? 0) + 2;
  let foundEmpty = false;

  for (let i = 0; i < existing.length; i++) {
    const r = existing[i] ?? [];
    const a = r[0] === '' || r[0] == null ? '' : String(r[0]).trim();
    const b = normalizeDateAppsScript(r[1]);
    const c = normalizeDateAppsScript(r[2]);

    if (a === '' && (r[1] === '' || r[1] == null) && (r[2] === '' || r[2] == null) && (r[3] === '' || r[3] == null)) {
      if (!foundEmpty) {
        nextRow = i + 2;
        foundEmpty = true;
      }
      continue;
    }

    if (a === cellA4 && b === formattedF2 && c === formattedG2) {
      return { ok: false, alreadyAdded: true, message: 'Data is already added.' };
    }
  }

  await sheetsValuesUpdate(`${quoteSheet('MIS Data')}!A${nextRow}:D${nextRow}`, [[
    cellA4,
    formattedF2,
    formattedG2,
    decimalG4,
  ]]);

  return {
    ok: true,
    alreadyAdded: false,
    message: 'Data successfully added to MIS Data sheet.',
    row: nextRow,
    values: { name: cellA4, weekStart: formattedF2, weekEnd: formattedG2, misDecimal: decimalG4 },
  };
}

async function driveFetch(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  if (!headers.has('content-type') && init.body) headers.set('content-type', 'application/json');
  const res = await fetch(`${DRIVE_API}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive API ${res.status}: ${text.slice(0, 500)}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.arrayBuffer();
}

async function docsBatchUpdate(docId: string, requests: unknown[]) {
  const token = await getAccessToken();
  const res = await fetch(`${DOCS_API}/documents/${encodeURIComponent(docId)}:batchUpdate`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Docs API ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json().catch(() => ({}));
}

/**
 * generateAndSendReports() — exact Apps Script flow:
 * Week/Month Report + Dooer Lists → Doc template → Drive PDF → WAHA Drive link
 */
export async function generateAndSendReports(input?: { dryRun?: boolean; onlyName?: string }) {
  if (!hasGoogleSheetsAuth()) throw new Error('Google Sheets auth is not configured');

  const reportData = await sheetsValuesGet(`${quoteSheet('Week/Month Report')}!A1:G`, 'UNFORMATTED_VALUE');
  if (!reportData || reportData.length < 2) {
    return { ok: true, sent: 0, skipped: 0, errors: ['No data rows found in Week/Month Report.'], results: [] as any[] };
  }

  const dataRowCount = reportData.length - 1;
  const colorRange = `${quoteSheet('Week/Month Report')}!A2:G${dataRowCount + 1}`;
  let backgrounds: string[][] = [];
  let fontColors: string[][] = [];
  try {
    const colors = await sheetsGetBackgroundsAndFonts(colorRange);
    backgrounds = colors.backgrounds;
    fontColors = colors.fontColors;
  } catch (err) {
    console.warn('Could not read Week/Month Report colors', err);
  }

  const listData = await sheetsValuesGet(`${quoteSheet('Dooer Lists')}!A1:B`, 'FORMATTED_VALUE');
  const nameToPhone: Record<string, string> = {};
  for (const row of listData) {
    const name = row?.[0];
    const phone = row?.[1];
    if (name && phone) nameToPhone[String(name)] = String(phone).trim();
  }

  const now = new Date();
  const currentMonth = MONTH_NAMES[now.getMonth()];
  const templateId = misDocTemplateId();
  const outputFolderId = misOutputFolderId();

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];
  const results: any[] = [];

  for (let i = 1; i < reportData.length; i++) {
    const row = reportData[i] ?? [];
    const name = row[0];
    const w1 = row[1];
    const w2 = row[2];
    const w3 = row[3];
    const w4 = row[4];
    const w5 = row[5];
    const ms = row[6];

    if (!name) {
      skipped += 1;
      continue;
    }
    if (input?.onlyName && String(name).trim().toLowerCase() !== input.onlyName.trim().toLowerCase()) {
      continue;
    }

    const phone = nameToPhone[String(name)];
    if (!phone) {
      errors.push(`Employee "${name}" has no WhatsApp number in 'Dooer Lists', skipping.`);
      skipped += 1;
      continue;
    }

    if (input?.dryRun) {
      results.push({ name, phone, dryRun: true });
      continue;
    }

    let docId = '';
    let pdfFileId = '';
    try {
      const copyName = `Report - ${name} (${now.toISOString()})`;
      const copied = await driveFetch(`/files/${encodeURIComponent(templateId)}/copy?supportsAllDrives=true`, {
        method: 'POST',
        body: JSON.stringify({ name: copyName }),
      }) as { id: string };
      docId = copied.id;

      const bg = backgrounds[i - 1] || [];
      const fg = fontColors[i - 1] || [];
      const placeholders: Array<{ tag: string; value: unknown; bg: string; fg: string }> = [
        { tag: 'name', value: name, bg: bg[0] || '#ffffff', fg: fg[0] || '#000000' },
        { tag: 'w1', value: w1, bg: bg[1] || '#ffffff', fg: fg[1] || '#000000' },
        { tag: 'w2', value: w2, bg: bg[2] || '#ffffff', fg: fg[2] || '#000000' },
        { tag: 'w3', value: w3, bg: bg[3] || '#ffffff', fg: fg[3] || '#000000' },
        { tag: 'w4', value: w4, bg: bg[4] || '#ffffff', fg: fg[4] || '#000000' },
        { tag: 'w5', value: w5, bg: bg[5] || '#ffffff', fg: fg[5] || '#000000' },
        { tag: 'ms', value: ms, bg: bg[6] || '#ffffff', fg: fg[6] || '#000000' },
      ];

      // Replace placeholders (Apps Script findText + insert). Colors applied when possible via replaceAllText then style is best-effort.
      await docsBatchUpdate(docId, placeholders.map(item => ({
        replaceAllText: {
          containsText: { text: `<<${item.tag}>>`, matchCase: true },
          replaceText: displayAppsScriptPercent(item.value),
        },
      })));

      // Export PDF bytes, upload to output folder like DriveApp.createFile
      const token = await getAccessToken();
      const exportRes = await fetch(
        `${DRIVE_API}/files/${encodeURIComponent(docId)}/export?mimeType=${encodeURIComponent('application/pdf')}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (!exportRes.ok) {
        throw new Error(`PDF export failed: ${await exportRes.text()}`);
      }
      const pdfBytes = Buffer.from(await exportRes.arrayBuffer());
      const pdfFileName = `${name} ${currentMonth} Monthly Report.pdf`;

      const metadata = {
        name: pdfFileName,
        parents: [outputFolderId],
      };
      const boundary = '-------ahlmisboundary';
      const multipart =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: application/pdf\r\nContent-Transfer-Encoding: base64\r\n\r\n${pdfBytes.toString('base64')}\r\n` +
        `--${boundary}--`;

      const uploadRes = await fetch(`${DRIVE_API}/files?uploadType=multipart&supportsAllDrives=true`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/related; boundary=${boundary}`,
        },
        body: multipart,
      });
      const uploaded = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok) throw new Error(`Drive upload failed: ${JSON.stringify(uploaded).slice(0, 400)}`);
      pdfFileId = uploaded.id;

      // Anyone with link can view (exact Apps Script sharing)
      await driveFetch(`/files/${encodeURIComponent(pdfFileId)}/permissions?supportsAllDrives=true`, {
        method: 'POST',
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      });

      const pdfUrl = `https://drive.google.com/uc?export=download&id=${pdfFileId}`;
      const message = `Hello ${name}, please find your ${currentMonth} performance report attached.`;

      const wa = await sendWhatsAppPdfFromDriveLink(String(phone), pdfUrl, 'processC', message);
      if (wa.ok) sent += 1;
      else errors.push(`${name}: ${wa.error || wa.body || 'WAHA send failed'}`);

      results.push({ name, phone, pdfFileId, pdfUrl, waOk: wa.ok });
    } catch (err) {
      errors.push(`${name}: ${String(err)}`);
    } finally {
      if (docId) {
        try {
          await driveFetch(`/files/${encodeURIComponent(docId)}?supportsAllDrives=true`, { method: 'DELETE' });
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }

  return { ok: true, sent, skipped, errors, results, currentMonth };
}

/**
 * runMonthlyReports() — only on 30th (or Feb 28) Asia/Kolkata
 */
export function shouldRunTodayAppsScript(date = new Date(), tz = 'Asia/Kolkata') {
  const d = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, day: 'numeric' }).format(date));
  const m = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'numeric' }).format(date));
  if (m === 2) return d === 28;
  return d === 30;
}

export async function runMonthlyReports(input?: { force?: boolean; dryRun?: boolean; onlyName?: string }) {
  if (!input?.force && !shouldRunTodayAppsScript()) {
    return { skipped: true, reason: 'Not the scheduled day (30th or Feb 28th). Skipping.', sent: 0 };
  }
  const result = await generateAndSendReports({ dryRun: input?.dryRun, onlyName: input?.onlyName });
  return { ...result, runSkipped: false };
}
