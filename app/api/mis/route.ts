import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { computeMisScoresForWeek, overlayLiveFmsOnScores } from '@/lib/mis/compute';
import { buildMisMasterReport } from '@/lib/mis/masterReport';
import { formatGapPercent } from '@/lib/mis/sheetFormula';
import { getMisWeekPeriod, getMonthWeekSlots } from '@/lib/mis/week';
import { adminGetLatestMisByPerson, adminGetMisWeeklySnapshots, saveMisWeeklySnapshots } from '@/lib/mis/weeklySnapshot';
import { buildMonthlyReportsFromSnapshots } from '@/lib/mis/monthlyReport';
import type { MisPersonScore, MisWeeklySnapshot } from '@/lib/mis/types';
import { misCacheKey, misCacheSet } from '@/lib/mis/cache';
import { adminGetAllUsers } from '@/lib/firebase/users';
import { cfApi } from '@/lib/cloudflare/api';
import { normalizePersonName, isVinittUser } from '@/lib/utils/names';

function canViewAll(session: { role: string }) {
  return session.role === 'admin' || session.role === 'leader';
}

// Resolve weekly scores the same way for the weekly and monthly views.
async function loadWeekScores(
  week: ReturnType<typeof getMisWeekPeriod>,
  options: { snapshots?: MisWeeklySnapshot[]; preferSnapshot: boolean; fresh?: boolean },
): Promise<{ rows: MisPersonScore[]; source: 'snapshot' | 'live' }> {
  if (options.preferSnapshot && !options.fresh) {
    const snapshots = options.snapshots ?? await adminGetMisWeeklySnapshots({ weekKey: week.weekKey, fresh: false });
    if (snapshots.length) {
      // For past completed weeks, the snapshot is already final and frozen.
      // Return frozen snapshot directly without re-querying external live Google Sheets!
      return { rows: snapshots, source: 'snapshot' };
    }
  }
  return {
    rows: await computeMisScoresForWeek(week.weekStart, week.weekEnd, { strict: options.fresh }),
    source: 'live',
  };
}

// GET /api/mis?mode=live|master|latest|weekly|monthly&name=&weekStart=&weekEnd=
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('mode') || 'live';
  const fresh = searchParams.get('fresh') === 'true';
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
      if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
        return NextResponse.json({ success: false, error: 'Invalid month or year' }, { status: 400 });
      }
      const current = getMisWeekPeriod();
      const slots = getMonthWeekSlots(year, month - 1).filter(slot => slot.weekEnd < current.weekStart);
      const snapshots = slots.length
        ? await adminGetMisWeeklySnapshots({ year, monthName: slots[0].monthName, fresh })
        : [];
      const scores: MisPersonScore[] = [];
      // Fetch the month's snapshots once and cap concurrent weekly source reads.
      for (let index = 0; index < slots.length; index += 2) {
        const weeks = await Promise.all(slots.slice(index, index + 2).map(slot => loadWeekScores(slot, {
          snapshots: snapshots.filter(row => row.weekKey === slot.weekKey),
          preferSnapshot: true,
          fresh,
        })));
        for (const result of weeks) scores.push(...result.rows);
      }
      const users = await adminGetAllUsers();
      const byUid = new Map(users.map(user => [user.uid, user]));
      const byName = new Map(users.map(user => [normalizePersonName(user.name), user]));
      let reports = buildMonthlyReportsFromSnapshots(scores, year, month - 1).filter(row => {
        const user = (row.uid ? byUid.get(row.uid) : undefined) ?? byName.get(normalizePersonName(row.name));
        if (isVinittUser(user) || isVinittUser({ uid: row.uid, name: row.name })) return false;
        return user?.isActive === true && row.ms !== null;
      });
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
      }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    const currentWeek = getMisWeekPeriod();
    const isPastWeek = week.weekKey < currentWeek.weekKey;
    const forceLive = searchParams.get('source') === 'live';
    let { rows, source } = await loadWeekScores(week, {
      preferSnapshot: !forceLive && (isPastWeek || searchParams.get('source') === 'snapshot'),
      fresh,
    });

    // If an admin explicitly requested a fresh reload on a past completed week (e.g. after late Google Sheets edits),
    // or if a past week was missing a snapshot (source === 'live'), persist the calculated rows to Cloudflare D1/Firebase.
    if (isPastWeek && canViewAll(session) && (fresh || source === 'live')) {
      saveMisWeeklySnapshots({ weekStart: week.weekStart, weekEnd: week.weekEnd, rows }).catch(err => {
        console.error('[MIS] Background snapshot sync failed:', err);
      });
    }

    if (!canViewAll(session)) {
      rows = rows.filter(row =>
        row.uid === session.uid || normalizePersonName(row.name) === normalizePersonName(session.name),
      );
    }

    // Status counts come from grouped rows, not a partially loaded task list.
    let taskCounts = await cfApi<Array<{ uid: string; name: string; department: string; planned: number; active: number; pending: number; completed: number; overdue: number }>>(
      '/mis/delegation-counts?' + new URLSearchParams({ weekStart: week.weekStart, weekEnd: week.weekEnd, ...(fresh ? { fresh: 'true' } : {}) }),
    );
    if (!canViewAll(session)) taskCounts = taskCounts.filter(row => row.uid === session.uid);
    else if (session.role === 'leader') taskCounts = taskCounts.filter(row =>
      normalizePersonName(row.department) === normalizePersonName(session.department));
    return NextResponse.json({
      success: true,
      data: rows.map(row => ({ ...row, gapLabel: formatGapPercent(row.gapPercent) })),
      meta: {
        taskCounts,
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
