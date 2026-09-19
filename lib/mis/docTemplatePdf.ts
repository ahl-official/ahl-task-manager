import { createSign } from 'crypto';
import type { MisMonthlyPersonReport } from '@/lib/mis/types';
import { formatAppsScriptPercent } from '@/lib/mis/sheetFormula';
import { monthlyMisPdfFilename } from '@/lib/mis/pdfReport';
import { DEFAULT_MIS_DOC_TEMPLATE_ID, misDocTemplateId } from '@/lib/mis/appsScript';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DOCS_API = 'https://docs.googleapis.com/v1';
const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
].join(' ');

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

export function hasMisDocTemplateAuth() {
  return Boolean(clientEmail() && envPrivateKey() && misDocTemplateId());
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
    throw new Error(data.error_description || data.error || 'Google Docs/Drive auth failed');
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

async function driveFetch(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  if (!headers.has('content-type') && init.body && !(init.body instanceof FormData)) {
    headers.set('content-type', 'application/json');
  }
  const res = await fetch(`${DRIVE_API}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive API ${res.status}: ${text.slice(0, 400)}`);
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();
  return res.arrayBuffer();
}

async function docsFetch(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  headers.set('content-type', headers.get('content-type') || 'application/json');
  const res = await fetch(`${DOCS_API}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Docs API ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.json().catch(() => ({}));
}

/**
 * Exact Apps Script generateAndSendReports PDF path:
 * copy Doc template → replace <<name>>, <<w1>>…<<ms>> → export PDF → trash copy.
 */
export async function buildMonthlyMisPdfFromTemplate(report: MisMonthlyPersonReport): Promise<Buffer> {
  const templateId = misDocTemplateId();
  if (!templateId) throw new Error('MIS_DOC_TEMPLATE_ID is not set');

  const copyName = `Report - ${report.name} (${new Date().toISOString()})`;
  const folderId = process.env.MIS_REPORT_OUTPUT_FOLDER_ID || '';

  const copyBody: Record<string, unknown> = { name: copyName };
  if (folderId) copyBody.parents = [folderId];

  const copied = await driveFetch(`/files/${encodeURIComponent(templateId)}/copy?supportsAllDrives=true`, {
    method: 'POST',
    body: JSON.stringify(copyBody),
  }) as { id: string };

  const docId = copied.id;
  try {
    const replacements: Array<[string, string]> = [
      ['name', String(report.name ?? '')],
      ['w1', formatAppsScriptPercent(report.w1)],
      ['w2', formatAppsScriptPercent(report.w2)],
      ['w3', formatAppsScriptPercent(report.w3)],
      ['w4', formatAppsScriptPercent(report.w4)],
      ['w5', formatAppsScriptPercent(report.w5)],
      ['ms', formatAppsScriptPercent(report.ms)],
    ];

    await docsFetch(`/documents/${encodeURIComponent(docId)}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: replacements.map(([tag, value]) => ({
          replaceAllText: {
            containsText: { text: `<<${tag}>>`, matchCase: true },
            replaceText: value,
          },
        })),
      }),
    });

    const token = await getAccessToken();
    const exportRes = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(docId)}/export?mimeType=${encodeURIComponent('application/pdf')}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!exportRes.ok) {
      const text = await exportRes.text();
      throw new Error(`PDF export failed ${exportRes.status}: ${text.slice(0, 400)}`);
    }
    const pdf = Buffer.from(await exportRes.arrayBuffer());
    return pdf;
  } finally {
    try {
      await driveFetch(`/files/${encodeURIComponent(docId)}?supportsAllDrives=true`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Failed to trash temp MIS doc copy', err);
    }
  }
}

export async function buildMonthlyMisPdfBuffer(report: MisMonthlyPersonReport): Promise<{
  pdf: Buffer;
  filename: string;
  source: 'google-doc-template' | 'fallback';
}> {
  const filename = monthlyMisPdfFilename(report);
  const { buildMonthlyMisPdfAsync } = await import('@/lib/mis/pdfReport');

  try {
    const pdf = await buildMonthlyMisPdfAsync(report);
    return { pdf, filename, source: 'fallback' };
  } catch (err) {
    console.error('buildMonthlyMisPdfAsync failed, checking doc template fallback', err);
  }

  if (hasMisDocTemplateAuth()) {
    try {
      const pdf = await buildMonthlyMisPdfFromTemplate(report);
      return { pdf, filename, source: 'google-doc-template' };
    } catch (err) {
      console.error('MIS Doc template PDF failed, using fallback layout', err);
    }
  }

  const { buildMonthlyMisPdf } = await import('@/lib/mis/pdfReport');
  return { pdf: buildMonthlyMisPdf(report), filename, source: 'fallback' };
}

