import { averageWeekGaps, gapToDecimal } from '@/lib/mis/sheetFormula';
import type { MisMonthlyPersonReport } from '@/lib/mis/types';
import { getMonthWeekSlots } from '@/lib/mis/week';
import { adminGetMisWeeklySnapshots } from '@/lib/mis/weeklySnapshot';
import { buildMonthlyMisPdfBuffer } from '@/lib/mis/docTemplatePdf';
import { adminGetAllUsers } from '@/lib/firebase/users';
import { sendWhatsAppFile } from '@/lib/waha';
import { indiaDateKey, INDIA_TIMEZONE } from '@/lib/utils/indiaDate';
import { normalizePersonName } from '@/lib/utils/names';

function shouldRunMonthlyReports(now = new Date()) {
  const day = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: INDIA_TIMEZONE, day: 'numeric' }).format(now),
  );
  const month = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: INDIA_TIMEZONE, month: 'numeric' }).format(now),
  );
  if (month === 2) return day === 28;
  return day === 30;
}

export function buildMonthlyReportsFromSnapshots(
  snapshots: Awaited<ReturnType<typeof adminGetMisWeeklySnapshots>>,
  year: number,
  monthIndex0: number,
): MisMonthlyPersonReport[] {
  const slots = getMonthWeekSlots(year, monthIndex0);
  const monthName = slots[0]?.monthName
    ?? new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(Date.UTC(year, monthIndex0, 1)));
  const monthKey = `${year}-${String(monthIndex0 + 1).padStart(2, '0')}`;

  const byPerson = new Map<string, typeof snapshots>();
  for (const row of snapshots) {
    const key = normalizePersonName(row.name);
    const list = byPerson.get(key) ?? [];
    list.push(row);
    byPerson.set(key, list);
  }

  const reports: MisMonthlyPersonReport[] = [];
  for (const [, rows] of Array.from(byPerson.entries())) {
    const sample = rows[0];
    const weekGaps = slots.map(slot => {
      const match = rows.find((row: { weekKey: string; gapPercent: number | null }) => row.weekKey === slot.weekKey);
      return match?.gapPercent ?? null;
    });
    while (weekGaps.length < 5) weekGaps.push(null);

    reports.push({
      uid: sample.uid,
      name: sample.name,
      department: sample.department,
      waNumber: sample.waNumber,
      w1: weekGaps[0] ?? null,
      w2: weekGaps[1] ?? null,
      w3: weekGaps[2] ?? null,
      w4: weekGaps[3] ?? null,
      w5: weekGaps[4] ?? null,
      ms: averageWeekGaps(weekGaps),
      monthKey,
      monthName,
    });
  }

  return reports.sort((a, b) => a.name.localeCompare(b.name));
}

export async function buildMonthlyMisReports(input?: { year?: number; monthIndex0?: number }) {
  const nowKey = indiaDateKey(new Date());
  const year = input?.year ?? Number(nowKey.slice(0, 4));
  const monthIndex0 = input?.monthIndex0 ?? Number(nowKey.slice(5, 7)) - 1;
  const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
    new Date(Date.UTC(year, monthIndex0, 1)),
  );

  const snapshots = await adminGetMisWeeklySnapshots({ year, monthName });
  return buildMonthlyReportsFromSnapshots(snapshots, year, monthIndex0);
}

function formatReportCaption(report: MisMonthlyPersonReport) {
  return `Hello ${report.name}, please find your ${report.monthName} performance report attached.`;
}

/**
 * Monthly WhatsApp PDFs from misWeekly / D1 mis_weekly (not sheet Week/Month Report).
 * Same Google Doc template + placeholders as Apps Script when available.
 */
export async function generateAndSendMonthlyMisReports(input?: {
  year?: number;
  monthIndex0?: number;
  force?: boolean;
  dryRun?: boolean;
  onlyName?: string;
}) {
  if (!input?.force && !shouldRunMonthlyReports()) {
    console.warn('[MIS monthly] skipped — not scheduled day (30th, or Feb 28)');
    return { skipped: true, reason: 'Not scheduled day (30th, or Feb 28)', sent: 0, reports: [] as MisMonthlyPersonReport[] };
  }

  const reports = await buildMonthlyMisReports(input);
  console.log(`[MIS monthly] built ${reports.length} report(s) from misWeekly/mis_weekly`);
  if (reports.length === 0) {
    console.warn('[MIS monthly] no weekly rows for this month — weekly cron may have failed or store is empty');
  }

  const users = await adminGetAllUsers().catch(err => {
    console.error('[MIS monthly] adminGetAllUsers failed', err);
    return [];
  });
  const waByName = new Map(users.map(user => [normalizePersonName(user.name), user.waNumber]));

  let sent = 0;
  const errors: string[] = [];

  for (const report of reports) {
    if (input?.onlyName && !normalizePersonName(report.name).includes(normalizePersonName(input.onlyName))) {
      continue;
    }

    const phone = report.waNumber || waByName.get(normalizePersonName(report.name)) || '';
    if (!phone) {
      const msg = `${report.name}: no WhatsApp number`;
      errors.push(msg);
      console.error('[MIS monthly]', msg);
      continue;
    }
    if (input?.dryRun) continue;

    try {
      const { pdf, filename } = await buildMonthlyMisPdfBuffer(report);
      const result = await sendWhatsAppFile({
        waNumber: phone,
        filename,
        mimetype: 'application/pdf',
        data: pdf,
        caption: formatReportCaption(report),
      });
      if (result.ok) sent += 1;
      else {
        const msg = `${report.name}: ${result.error || result.body || 'send failed'}`;
        errors.push(msg);
        console.error('[MIS monthly]', msg);
      }
    } catch (err) {
      const msg = `${report.name}: ${String(err)}`;
      errors.push(msg);
      console.error('[MIS monthly]', msg, err);
    }
  }

  if (errors.length > 0) {
    console.error(`[MIS monthly] finished with ${errors.length} error(s); sent=${sent}/${reports.length}`, errors);
  } else {
    console.log(`[MIS monthly] finished ok; sent=${sent}/${reports.length}`);
  }

  return {
    skipped: false,
    sent,
    reportCount: reports.length,
    reports: reports.map(report => ({
      ...report,
      msDecimal: gapToDecimal(report.ms),
    })),
    errors,
  };
}

export { shouldRunMonthlyReports };
