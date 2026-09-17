import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { computeMisScoresForWeek } from '@/lib/mis/compute';
import { buildMisMasterReport } from '@/lib/mis/masterReport';
import { formatGapPercent } from '@/lib/mis/sheetFormula';
import { getMisWeekPeriod } from '@/lib/mis/week';
import { adminGetLatestMisByPerson, adminGetMisWeeklySnapshots } from '@/lib/mis/weeklySnapshot';
import { buildMonthlyMisReports } from '@/lib/mis/monthlyReport';
import { normalizePersonName } from '@/lib/utils/names';

function canViewAll(session: { role: string }) {
  return session.role === 'admin' || session.role === 'leader';
}

// GET /api/mis?mode=live|master|latest|weekly|monthly&name=&weekStart=&weekEnd=
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('mode') || 'live';
  const weekStart = searchParams.get('weekStart') || undefined;
  const week = weekStart ? getMisWeekPeriod(weekStart) : getMisWeekPeriod();

  try {
    // In-app Master formulas (Checklist sheets + CF Delegation + FMS tabs)
    if (mode === 'master' || mode === 'sheet' || mode === 'sheetMaster') {
      const name = String(searchParams.get('name') || '').trim();
      if (!name) {
        return NextResponse.json({ success: false, error: 'name is required' }, { status: 400 });
      }
      if (!canViewAll(session) && normalizePersonName(name) !== normalizePersonName(session.name)) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
      }
      const end = searchParams.get('weekEnd') || week.weekEnd;
      const start = searchParams.get('weekStart') || week.weekStart;
      const report = await buildMisMasterReport({ name, weekStart: start, weekEnd: end });
      if (!report) {
        return NextResponse.json({ success: false, error: 'Could not build MIS report' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: report });
    }

    if (mode === 'weekly') {
      const weekKey = searchParams.get('weekKey') || week.weekKey;
      let rows = await adminGetMisWeeklySnapshots({ weekKey });
      if (!canViewAll(session)) {
        rows = rows.filter(row =>
          row.uid === session.uid || normalizePersonName(row.name) === normalizePersonName(session.name),
        );
      }
      return NextResponse.json({
        success: true,
        data: rows.map(row => ({ ...row, gapLabel: formatGapPercent(row.gapPercent) })),
        meta: { weekKey, elevated: canViewAll(session) },
      });
    }

    if (mode === 'latest') {
      let rows = await adminGetLatestMisByPerson();
      if (!canViewAll(session)) {
        rows = rows.filter(row =>
          row.uid === session.uid || normalizePersonName(row.name) === normalizePersonName(session.name),
        );
      }
      return NextResponse.json({
        success: true,
        data: rows.map(row => ({ ...row, gapLabel: formatGapPercent(row.gapPercent) })),
        meta: { elevated: canViewAll(session) },
      });
    }

    if (mode === 'monthly') {
      const year = Number(searchParams.get('year') || week.year);
      const month = Number(searchParams.get('month') || week.weekEnd.slice(5, 7));
      let reports = await buildMonthlyMisReports({ year, monthIndex0: month - 1 });
      if (!canViewAll(session)) {
        reports = reports.filter(row =>
          row.uid === session.uid || normalizePersonName(row.name) === normalizePersonName(session.name),
        );
      }
      return NextResponse.json({
        success: true,
        data: reports.map(row => ({
          ...row,
          w1Label: formatGapPercent(row.w1),
          w2Label: formatGapPercent(row.w2),
          w3Label: formatGapPercent(row.w3),
          w4Label: formatGapPercent(row.w4),
          w5Label: formatGapPercent(row.w5),
          msLabel: formatGapPercent(row.ms),
        })),
        meta: { year, month, elevated: canViewAll(session) },
      });
    }

    // live current (or requested) week — prefer saved snapshots for past weeks (fast)
    const currentWeek = getMisWeekPeriod();
    const preferSnapshot = week.weekKey !== currentWeek.weekKey || searchParams.get('source') === 'snapshot';
    let rows: Awaited<ReturnType<typeof computeMisScoresForWeek>> = [];
    let source: 'live' | 'snapshot' = 'live';

    if (preferSnapshot) {
      const snapshots = await adminGetMisWeeklySnapshots({ weekKey: week.weekKey });
      // Only use snapshots that include parameter breakdown (Office/Salon/Weekly).
      const withParams = snapshots.filter(row => Array.isArray(row.parameters) && row.parameters.length > 0);
      if (withParams.length > 0) {
        source = 'snapshot';
        rows = withParams.map(row => ({
          uid: row.uid,
          name: row.name,
          department: row.department,
          waNumber: row.waNumber,
          checklist: row.checklist,
          delegation: row.delegation,
          fms: row.fms,
          parameters: row.parameters,
          planned: row.planned,
          done: row.done,
          onTime: row.onTime,
          gapPercent: row.gapPercent,
          gapDecimal: row.gapDecimal,
          onTimeGapPercent: row.onTimeGapPercent,
          weekKey: row.weekKey,
          weekStart: row.weekStart,
          weekEnd: row.weekEnd,
        }));
        const { misCacheKey, misCacheSet } = await import('@/lib/mis/cache');
        misCacheSet(misCacheKey(['live', 'v2-params', week.weekStart, week.weekEnd]), rows, 60_000);
      }
    }

    if (rows.length === 0) {
      rows = await computeMisScoresForWeek(week.weekStart, week.weekEnd);
      source = 'live';
    }

    if (!canViewAll(session)) {
      rows = rows.filter(row =>
        row.uid === session.uid || normalizePersonName(row.name) === normalizePersonName(session.name),
      );
    }

    return NextResponse.json({
      success: true,
      data: rows.map(row => ({ ...row, gapLabel: formatGapPercent(row.gapPercent) })),
      meta: {
        weekKey: week.weekKey,
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        weekNumber: week.weekNumber,
        source,
        elevated: canViewAll(session),
        formula: 'ROUND(done/planned*100 - 100, 2)',
        sources: {
          checklist: 'Master sheets (Office / Salon / Weekly)',
          delegation: 'Cloudflare One Time tasks',
          fms: 'MIS Report FMS tabs',
        },
      },
    });
  } catch (err) {
    console.error('GET /api/mis', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
