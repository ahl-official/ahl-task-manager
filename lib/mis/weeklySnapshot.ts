import { Timestamp, type Query } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { cfApi, hasCloudflareApi } from '@/lib/cloudflare/api';
import { computeMisScoresForWeek, misSnapshotId } from '@/lib/mis/compute';
import type { MisArchiveRow, MisWeeklySnapshot } from '@/lib/mis/types';
import { formatWeekLabel, getMisWeekPeriod, getPreviousMisWeekPeriod } from '@/lib/mis/week';
import { normalizePersonName } from '@/lib/utils/names';

const WEEKLY = 'misWeekly';
const ARCHIVE = 'misArchive';

/** Alert when MIS write/read falls back from Cloudflare → Firebase. */
const MIS_FALLBACK_ALERT_WA = (
  process.env.MIS_FALLBACK_ALERT_WA || '919967716945'
).replace(/\D/g, '');

function serializeSnapshot(data: Record<string, any>): MisWeeklySnapshot {
  return {
    id: String(data.id ?? ''),
    uid: data.uid ?? null,
    name: String(data.name ?? ''),
    department: String(data.department ?? ''),
    waNumber: String(data.waNumber ?? ''),
    checklist: data.checklist ?? { planned: 0, done: 0, onTime: 0 },
    delegation: data.delegation ?? { planned: 0, done: 0, onTime: 0 },
    fms: data.fms ?? { planned: 0, done: 0, onTime: 0 },
    planned: Number(data.planned ?? 0),
    done: Number(data.done ?? 0),
    onTime: Number(data.onTime ?? 0),
    gapPercent: data.gapPercent ?? null,
    gapDecimal: data.gapDecimal ?? null,
    onTimeGapPercent: data.onTimeGapPercent ?? null,
    weekKey: String(data.weekKey ?? ''),
    weekStart: String(data.weekStart ?? ''),
    weekEnd: String(data.weekEnd ?? ''),
    weekNumber: Number(data.weekNumber ?? 0),
    monthName: String(data.monthName ?? ''),
    year: Number(data.year ?? 0),
    combinedWeek: String(data.combinedWeek ?? ''),
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? String(data.createdAt ?? ''),
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? String(data.updatedAt ?? ''),
  };
}

async function notifyMisFirebaseFallback(input: {
  operation: string;
  error: unknown;
  detail?: Record<string, unknown>;
}) {
  const errText = input.error instanceof Error ? input.error.message : String(input.error);
  const detailLine = input.detail
    ? Object.entries(input.detail)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')
    : '';

  console.error(`[MIS] Cloudflare failed → Firebase fallback (${input.operation})`, errText, input.detail ?? '');

  if (!MIS_FALLBACK_ALERT_WA) return;

  const text = [
    '⚠️ MIS Cloudflare error — data went to Firebase fallback',
    `Operation: ${input.operation}`,
    detailLine ? `Details: ${detailLine}` : null,
    `Error: ${errText.slice(0, 500)}`,
    `Time: ${new Date().toISOString()}`,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const { sendWhatsApp } = await import('@/lib/waha');
    const result = await sendWhatsApp(MIS_FALLBACK_ALERT_WA, text);
    if (!result.ok) {
      console.error('[MIS] fallback WAHA alert failed', result.error || result.body || result.status);
    } else {
      console.log(`[MIS] fallback alert sent to ${MIS_FALLBACK_ALERT_WA}`);
    }
  } catch (err) {
    console.error('[MIS] fallback WAHA alert error', err);
  }
}

async function writeWeeklyToFirebase(
  rows: Array<Record<string, unknown>>,
  meta: { weekKey: string; weekStart: string; weekEnd: string; people: number },
) {
  const now = Timestamp.now();
  let written = 0;
  let batch = adminDb.batch();
  let ops = 0;

  for (const row of rows) {
    const id = String(row.id);
    const ref = adminDb.collection(WEEKLY).doc(id);
    batch.set(ref, { ...row, updatedAt: now, createdAt: now }, { merge: true });
    ops += 1;
    written += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = adminDb.batch();
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();

  return {
    written,
    weekKey: meta.weekKey,
    weekStart: meta.weekStart,
    weekEnd: meta.weekEnd,
    people: meta.people,
    store: 'firebase' as const,
  };
}

async function writeArchiveToFirebase(rows: MisArchiveRow[], weekKey: string) {
  const now = Timestamp.now();
  let written = 0;
  let batch = adminDb.batch();
  let ops = 0;

  for (const row of rows) {
    const ref = adminDb.collection(ARCHIVE).doc(row.id);
    batch.set(ref, { ...row, createdAt: now });
    ops += 1;
    written += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = adminDb.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  return { written, weekKey, store: 'firebase' as const };
}

/**
 * Upsert one weekly G4 snapshot per person.
 * Prefer Cloudflare D1 `mis_weekly`; on CF error fall back to Firestore + WAHA alert.
 */
export async function saveMisWeeklySnapshots(input?: { weekStart?: string; weekEnd?: string }) {
  const weekMeta = input?.weekStart
    ? getMisWeekPeriod(input.weekStart)
    : getPreviousMisWeekPeriod();

  const weekStart = input?.weekStart ?? weekMeta.weekStart;
  const weekEnd = input?.weekEnd ?? weekMeta.weekEnd;
  const scores = await computeMisScoresForWeek(weekStart, weekEnd);
  const nowIso = new Date().toISOString();
  const combinedWeek = formatWeekLabel(weekStart, weekEnd);
  const meta = getMisWeekPeriod(weekStart);

  const rows = scores
    .filter(row => !(row.planned <= 0 && row.gapPercent === null))
    .map(row => {
      const id = misSnapshotId(row.name, meta.weekKey);
      return {
        ...row,
        id,
        weekKey: meta.weekKey,
        weekStart,
        weekEnd,
        weekNumber: meta.weekNumber,
        monthName: meta.monthName,
        year: meta.year,
        combinedWeek,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    });

  const baseMeta = {
    weekKey: meta.weekKey,
    weekStart,
    weekEnd,
    people: scores.length,
  };

  if (hasCloudflareApi()) {
    try {
      const result = await cfApi<{ written: number }>('/mis/weekly/batch', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      const written = Number(result?.written ?? rows.length);
      const summary = { written, ...baseMeta, store: 'cloudflare' as const };
      if (written <= 0) console.warn('[MIS weekly] wrote 0 mis_weekly rows', summary);
      else console.log('[MIS weekly] saved snapshots to Cloudflare mis_weekly', summary);
      return summary;
    } catch (err) {
      await notifyMisFirebaseFallback({
        operation: 'saveMisWeeklySnapshots',
        error: err,
        detail: { weekKey: meta.weekKey, weekStart, weekEnd, rows: rows.length },
      });
      const summary = await writeWeeklyToFirebase(rows, baseMeta);
      console.warn('[MIS weekly] saved snapshots to Firebase misWeekly after CF failure', summary);
      return { ...summary, fallbackFromCloudflare: true as const };
    }
  }

  const summary = await writeWeeklyToFirebase(rows, baseMeta);
  if (summary.written <= 0) console.warn('[MIS weekly] wrote 0 misWeekly rows', summary);
  else console.log('[MIS weekly] saved snapshots to Firebase misWeekly', summary);
  return summary;
}

/** Optional H4/H5-style gap archive. Not used for monthly PDFs. */
export async function archiveMisGaps(input?: { weekStart?: string }) {
  const week = input?.weekStart ? getMisWeekPeriod(input.weekStart) : getMisWeekPeriod();
  const scores = await computeMisScoresForWeek(week.weekStart, week.weekEnd);
  const nowIso = new Date().toISOString();
  const rows: MisArchiveRow[] = scores.map((row, index) => ({
    id: `${Date.now()}_${index}_${normalizePersonName(row.name).replace(/\s+/g, '-')}`,
    timestamp: nowIso,
    name: row.name,
    uid: row.uid,
    h4: row.gapPercent,
    h5: row.onTimeGapPercent,
    weekKey: week.weekKey,
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
  }));

  if (hasCloudflareApi()) {
    try {
      const result = await cfApi<{ written: number }>('/mis/archive/batch', {
        method: 'POST',
        body: JSON.stringify({ rows: rows.map(row => ({ ...row, createdAt: nowIso })) }),
      });
      const written = Number(result?.written ?? rows.length);
      console.log('[MIS archive] saved to Cloudflare mis_archive', { written, weekKey: week.weekKey });
      return { written, weekKey: week.weekKey, store: 'cloudflare' as const };
    } catch (err) {
      await notifyMisFirebaseFallback({
        operation: 'archiveMisGaps',
        error: err,
        detail: { weekKey: week.weekKey, rows: rows.length },
      });
      const summary = await writeArchiveToFirebase(rows, week.weekKey);
      console.warn('[MIS archive] saved to Firebase after CF failure', summary);
      return { ...summary, fallbackFromCloudflare: true as const };
    }
  }

  const summary = await writeArchiveToFirebase(rows, week.weekKey);
  console.log('[MIS archive] saved to Firebase misArchive', summary);
  return summary;
}

export async function adminGetMisWeeklySnapshots(filters?: {
  weekKey?: string;
  monthName?: string;
  year?: number;
  name?: string;
}): Promise<MisWeeklySnapshot[]> {
  if (hasCloudflareApi()) {
    try {
      const params = new URLSearchParams();
      if (filters?.weekKey) params.set('weekKey', filters.weekKey);
      if (filters?.year != null) params.set('year', String(filters.year));
      if (filters?.monthName) params.set('monthName', filters.monthName);
      if (filters?.name) params.set('name', filters.name);
      const qs = params.toString();
      const rows = await cfApi<MisWeeklySnapshot[]>(`/mis/weekly${qs ? `?${qs}` : ''}`);
      return (rows || []).map(row => serializeSnapshot(row));
    } catch (err) {
      await notifyMisFirebaseFallback({
        operation: 'adminGetMisWeeklySnapshots',
        error: err,
        detail: {
          weekKey: filters?.weekKey,
          year: filters?.year,
          monthName: filters?.monthName,
        },
      });
      // fall through to Firebase
    }
  }

  let ref: Query = adminDb.collection(WEEKLY);
  if (filters?.weekKey) ref = ref.where('weekKey', '==', filters.weekKey);
  if (filters?.year) ref = ref.where('year', '==', filters.year);
  if (filters?.monthName) ref = ref.where('monthName', '==', filters.monthName);

  const snap = await ref.get();
  let rows = snap.docs.map(doc => serializeSnapshot({ id: doc.id, ...doc.data() }));
  if (filters?.name) {
    const key = normalizePersonName(filters.name);
    rows = rows.filter(row => normalizePersonName(row.name) === key);
  }
  return rows.sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.name.localeCompare(b.name));
}

export async function adminGetLatestMisByPerson(): Promise<MisWeeklySnapshot[]> {
  if (hasCloudflareApi()) {
    try {
      const rows = await cfApi<MisWeeklySnapshot[]>('/mis/weekly/latest');
      return (rows || []).map(row => serializeSnapshot(row));
    } catch (err) {
      await notifyMisFirebaseFallback({
        operation: 'adminGetLatestMisByPerson',
        error: err,
      });
    }
  }

  const snap = await adminDb.collection(WEEKLY).get();
  const latest = new Map<string, MisWeeklySnapshot>();
  for (const doc of snap.docs) {
    const row = serializeSnapshot({ id: doc.id, ...doc.data() });
    const key = normalizePersonName(row.name);
    const existing = latest.get(key);
    if (!existing || row.weekStart > existing.weekStart) latest.set(key, row);
  }
  return Array.from(latest.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Generates and sends executive Weekly Performance PDF Reports via WhatsApp.
 */
export async function generateAndSendWeeklyMisPdfReports(input?: {
  weekStart?: string;
  weekEnd?: string;
  onlyName?: string;
  dryRun?: boolean;
}) {
  const weekMeta = input?.weekStart
    ? getMisWeekPeriod(input.weekStart)
    : getPreviousMisWeekPeriod();

  const weekStart = input?.weekStart ?? weekMeta.weekStart;
  const weekEnd = input?.weekEnd ?? weekMeta.weekEnd;
  const scores = await computeMisScoresForWeek(weekStart, weekEnd);

  const { adminGetAllUsers } = await import('@/lib/firebase/users');
  const { buildWeeklyMisPdfAsync, weeklyMisPdfFilename } = await import('@/lib/mis/pdfReport');
  const { sendWhatsAppFile } = await import('@/lib/waha');

  const users = await adminGetAllUsers().catch(() => []);
  const waByName = new Map(users.map(u => [normalizePersonName(u.name), u.waNumber]));

  let sent = 0;
  const errors: string[] = [];

  for (const score of scores) {
    if (score.planned <= 0) continue;
    if (input?.onlyName && !normalizePersonName(score.name).includes(normalizePersonName(input.onlyName))) {
      continue;
    }

    const phone = score.waNumber || waByName.get(normalizePersonName(score.name)) || '';
    if (!phone) {
      errors.push(`${score.name}: no WhatsApp number`);
      continue;
    }

    if (input?.dryRun) continue;

    try {
      const pdf = await buildWeeklyMisPdfAsync(score, {
        weekKey: weekMeta.weekKey,
        weekStart,
        weekEnd,
      });
      const filename = weeklyMisPdfFilename(score.name, weekMeta.weekKey);
      const caption = `Hello ${score.name}, please find your Weekly Performance Report (Week ${weekMeta.weekKey}) attached.`;

      const result = await sendWhatsAppFile({
        waNumber: phone,
        filename,
        mimetype: 'application/pdf',
        data: pdf,
        caption,
      });

      if (result.ok) sent += 1;
      else errors.push(`${score.name}: ${result.error || result.body || 'send failed'}`);
    } catch (err) {
      errors.push(`${score.name}: ${String(err)}`);
    }
  }

  return { sent, errors, total: scores.length };
}
