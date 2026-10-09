import { createSign } from 'crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

let cachedToken: { token: string; expiresAt: number } | null = null;

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

export function hasGoogleSheetsAuth() {
  return Boolean(clientEmail() && envPrivateKey());
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

async function sheetsFetch(path: string, init: RequestInit = {}, targetId: string) {
  if (!hasGoogleSheetsAuth()) throw new Error('Google Sheets is not configured');
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

/** Get all sheet titles in a spreadsheet. Cached for 10 minutes. */
const spreadsheetTitlesCache = new Map<string, { expiresAt: number; titles: Set<string> }>();

export async function getSpreadsheetSheetTitles(targetId: string): Promise<Set<string>> {
  if (!hasGoogleSheetsAuth()) throw new Error('Google Sheets is not configured');
  if (!targetId) throw new Error('Spreadsheet id is missing');

  const cached = spreadsheetTitlesCache.get(targetId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.titles;
  }

  try {
    const metadata = await sheetsFetch('?fields=sheets.properties.title', {}, targetId);
    const titles = new Set<string>((metadata.sheets || []).map((s: any) => String(s.properties?.title || '').trim()));
    spreadsheetTitlesCache.set(targetId, { expiresAt: Date.now() + 10 * 60 * 1000, titles });
    return titles;
  } catch (err) {
    console.warn(`Failed to fetch sheet titles for ${targetId}`, err);
    return new Set<string>();
  }
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
