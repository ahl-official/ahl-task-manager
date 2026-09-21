import { getSession } from '@/lib/utils/auth';
import { adminGetAllScores, adminGetScore } from '@/lib/firebase/scores';
import { adminGetAllTasks, adminGetTasksByAssignee, serializeTask } from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import { Trophy, TrendingUp, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { filterScoresForSession, filterTasksForSession, filterUsersForSession } from '@/lib/utils/access';
import ScoresClient from '@/components/shared/ScoresClient';
import { hydrateTasksWithUsers } from '@/lib/utils/taskHydration';
import { getMisWeekPeriod, getPreviousMisWeekPeriod } from '@/lib/mis/week';
import { adminGetMisWeeklySnapshots } from '@/lib/mis/weeklySnapshot';
import { formatGapPercent } from '@/lib/mis/sheetFormula';
import { normalizePersonName } from '@/lib/utils/names';
import { computeMisScoresForWeek } from '@/lib/mis/compute';
import type { MisWeeklySnapshot } from '@/lib/mis/types';

export default async function PortalScorePage() {
  const session = await getSession();
  if (!session) return null;

  if (session.role === 'leader') {
    const [scores, tasks, users] = await Promise.all([
      adminGetAllScores(),
      adminGetAllTasks({ department: session.department, limit: null }),
      adminGetAllUsers(),
    ]);
    const visibleScores = filterScoresForSession(session, scores);
    const visibleUsers = filterUsersForSession(session, users);
    const visibleTasks = filterTasksForSession(session, hydrateTasksWithUsers(tasks, visibleUsers));
    const toIso = (value: unknown) => {
      if (!value) return new Date().toISOString();
      if (typeof value === 'string') return value;
      if (typeof value === 'object' && value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
        try {
          return (value as { toDate: () => Date }).toDate().toISOString();
        } catch {
          return new Date().toISOString();
        }
      }
      return new Date().toISOString();
    };
    const serializedScores = visibleScores.map(score => ({
      ...score,
      lastUpdated: toIso(score.lastUpdated),
    }));
    const serializedTasks = visibleTasks.map(serializeTask);
    const serializedUsers = visibleUsers.map(user => ({
      uid: user.uid,
      name: user.name,
      department: user.department,
      role: user.role,
      isActive: user.isActive,
    }));

    return (
      <div className="p-6 space-y-5">
        <div className="pr-14">
          <h1 className="text-xl font-semibold text-gray-900">Team Score</h1>
          <p className="mt-0.5 text-sm text-gray-500">{session.department} department performance</p>
        </div>
        <ScoresClient
          scores={serializedScores}
          users={serializedUsers}
          tasks={serializedTasks}
          departments={[{ name: session.department }]}
          currentUid={session.uid}
          viewerRole="leader"
          showDepartments
        />
      </div>
    );
  }

  const [score, tasks] = await Promise.all([
    adminGetScore(session.uid),
    adminGetTasksByAssignee(session.uid),
  ]);

  const week = getMisWeekPeriod();
  const prevWeek = getPreviousMisWeekPeriod();

  let pdfGapLabel = '—';
  let pdfGapPercent: number | null = null;
  let lastWeekSnapshot: MisWeeklySnapshot | undefined = undefined;
  let liveMis: {
    planned: number;
    done: number;
    onTime: number;
    checklist: { planned: number; done: number; onTime: number };
    delegation: { planned: number; done: number; onTime: number };
    fms: { planned: number; done: number; onTime: number };
    weekStart: string;
    weekEnd: string;
    weekKey: string;
  } | null = null;
  let weeklyRows: Array<{
    weekKey: string;
    weekStart: string;
    weekEnd: string;
    gapPercent: number | null;
    gapLabel: string;
    planned: number;
    done: number;
  }> = [];

  try {
    const stored = await adminGetMisWeeklySnapshots({ year: week.year, monthName: week.monthName }).catch(() => []);

    // Check if current week snapshot is already present in DB
    const currentWeekSnapshot = stored.find(row =>
      row.weekKey === week.weekKey && (row.uid === session.uid || normalizePersonName(row.name) === normalizePersonName(session.name))
    );

    if (currentWeekSnapshot) {
      pdfGapPercent = currentWeekSnapshot.gapPercent ?? null;
      pdfGapLabel = formatGapPercent(pdfGapPercent);
      liveMis = {
        planned: currentWeekSnapshot.planned,
        done: currentWeekSnapshot.done,
        onTime: currentWeekSnapshot.onTime,
        checklist: currentWeekSnapshot.checklist,
        delegation: currentWeekSnapshot.delegation,
        fms: currentWeekSnapshot.fms,
        weekStart: currentWeekSnapshot.weekStart,
        weekEnd: currentWeekSnapshot.weekEnd,
        weekKey: currentWeekSnapshot.weekKey,
      };
    } else {
      // Calculate only if not stored in DB
      const liveRows = await computeMisScoresForWeek(week.weekStart, week.weekEnd);
      const mine = liveRows.find(row =>
        row.uid === session.uid || normalizePersonName(row.name) === normalizePersonName(session.name),
      );
      pdfGapPercent = mine?.gapPercent ?? null;
      pdfGapLabel = formatGapPercent(pdfGapPercent);
      if (mine) {
        liveMis = {
          planned: mine.planned,
          done: mine.done,
          onTime: mine.onTime,
          checklist: mine.checklist,
          delegation: mine.delegation,
          fms: mine.fms,
          weekStart: mine.weekStart,
          weekEnd: mine.weekEnd,
          weekKey: mine.weekKey,
        };
      }
    }

    // Last Week Snapshot
    lastWeekSnapshot = stored.find(row =>
      row.weekKey === prevWeek.weekKey && (row.uid === session.uid || normalizePersonName(row.name) === normalizePersonName(session.name))
    );
    if (!lastWeekSnapshot) {
      const prevSnaps = await adminGetMisWeeklySnapshots({ weekKey: prevWeek.weekKey }).catch(() => []);
      lastWeekSnapshot = prevSnaps.find(row => row.uid === session.uid || normalizePersonName(row.name) === normalizePersonName(session.name));
    }

    weeklyRows = stored
      .filter(row =>
        row.uid === session.uid || normalizePersonName(row.name) === normalizePersonName(session.name),
      )
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
      .map(row => ({
        weekKey: row.weekKey,
        weekStart: row.weekStart,
        weekEnd: row.weekEnd,
        gapPercent: row.gapPercent,
        gapLabel: formatGapPercent(row.gapPercent),
        planned: row.planned,
        done: row.done,
      }));
  } catch {
    // optional PDF MIS
  }

  const verified  = tasks.filter(t => t.status === 'Verified').length;
  const completed = tasks.filter(t => t.status === 'Completed').length;
  const overdue   = tasks.filter(t => t.status === 'Overdue').length;
  const pending   = tasks.filter(t => t.status === 'Pending Accept').length;

  const mis = score?.monthlyScore ?? 0;

  function gapColor(gap: number | null) {
    if (gap === null) return 'text-gray-400';
    if (gap >= 0) return 'text-emerald-600';
    if (gap >= -10) return 'text-green-600';
    if (gap >= -25) return 'text-blue-600';
    if (gap >= -50) return 'text-amber-600';
    return 'text-red-600';
  }

  function gapStatusBadge(gap: number | null) {
    if (gap === null) return { text: 'No Planned Tasks', bg: 'bg-gray-100 text-gray-700' };
    if (gap >= 0) return { text: 'Perfect (100% Achieved)', bg: 'bg-emerald-100 text-emerald-800' };
    if (gap >= -10) return { text: 'Excellent', bg: 'bg-green-100 text-green-800' };
    if (gap >= -25) return { text: 'Good', bg: 'bg-blue-100 text-blue-800' };
    if (gap >= -50) return { text: 'Average', bg: 'bg-amber-100 text-amber-800' };
    return { text: 'Needs Improvement', bg: 'bg-red-100 text-red-800' };
  }

  const badge = gapStatusBadge(pdfGapPercent);
  const lastWeekGapPercent = lastWeekSnapshot?.gapPercent ?? null;
  const lastWeekGapLabel = lastWeekSnapshot ? formatGapPercent(lastWeekGapPercent) : '—';
  const lastWeekBadge = gapStatusBadge(lastWeekGapPercent);

  return (
    <div className="max-w-xl space-y-5 p-6">
      <div className="pr-14">
        <h1 className="text-xl font-semibold text-gray-900">My Score</h1>
        <p className="mt-0.5 text-sm text-gray-500">Your weekly performance metrics</p>
      </div>

      {/* Hero Score cards: Current Week & Last Week */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Current Week Card */}
        <div className="card p-5 text-center bg-gradient-to-br from-brand-50/50 via-white to-gray-50 border border-gray-100 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
              <span className="font-semibold text-gray-700">Current Week</span>
              <span className="text-[10px] font-mono text-gray-400">{week.weekKey}</span>
            </div>
            <p className={cn('text-3xl sm:text-4xl font-extrabold tracking-tight mb-1', gapColor(pdfGapPercent))}>
              {pdfGapLabel}
            </p>
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold mb-1">
              <span className={cn('px-2 py-0.5 rounded-full font-medium text-[11px]', badge.bg)}>
                {badge.text}
              </span>
            </div>
            <p className="text-[10px] text-gray-400 mb-3">{week.weekStart} → {week.weekEnd}</p>
          </div>

          {liveMis && (
            <div className="rounded-xl bg-white border border-gray-100 px-3 py-2 text-left">
              <div className="grid grid-cols-3 gap-1 text-center text-xs">
                <div className="bg-gray-50 rounded-lg py-1 px-1">
                  <span className="text-gray-400 block text-[9px]">Planned</span>
                  <span className="font-bold text-gray-800 text-xs">{liveMis.planned}</span>
                </div>
                <div className="bg-green-50/70 rounded-lg py-1 px-1">
                  <span className="text-green-600 block text-[9px]">Done</span>
                  <span className="font-bold text-green-800 text-xs">{liveMis.done}</span>
                </div>
                <div className="bg-blue-50/70 rounded-lg py-1 px-1">
                  <span className="text-blue-600 block text-[9px]">On-Time</span>
                  <span className="font-bold text-blue-800 text-xs">{liveMis.onTime}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Last Week Card */}
        <div className="card p-5 text-center bg-gradient-to-br from-purple-50/40 via-white to-gray-50 border border-gray-100 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
              <span className="font-semibold text-gray-700">Last Week</span>
              <span className="text-[10px] font-mono text-gray-400">{prevWeek.weekKey}</span>
            </div>
            <p className={cn('text-3xl sm:text-4xl font-extrabold tracking-tight mb-1', gapColor(lastWeekGapPercent))}>
              {lastWeekGapLabel}
            </p>
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold mb-1">
              <span className={cn('px-2 py-0.5 rounded-full font-medium text-[11px]', lastWeekBadge.bg)}>
                {lastWeekBadge.text}
              </span>
            </div>
            <p className="text-[10px] text-gray-400 mb-3">{prevWeek.weekStart} → {prevWeek.weekEnd}</p>
          </div>

          {typeof lastWeekSnapshot !== 'undefined' && lastWeekSnapshot ? (
            <div className="rounded-xl bg-white border border-gray-100 px-3 py-2 text-left">
              <div className="grid grid-cols-3 gap-1 text-center text-xs">
                <div className="bg-gray-50 rounded-lg py-1 px-1">
                  <span className="text-gray-400 block text-[9px]">Planned</span>
                  <span className="font-bold text-gray-800 text-xs">{lastWeekSnapshot.planned}</span>
                </div>
                <div className="bg-green-50/70 rounded-lg py-1 px-1">
                  <span className="text-green-600 block text-[9px]">Done</span>
                  <span className="font-bold text-green-800 text-xs">{lastWeekSnapshot.done}</span>
                </div>
                <div className="bg-blue-50/70 rounded-lg py-1 px-1">
                  <span className="text-blue-600 block text-[9px]">On-Time</span>
                  <span className="font-bold text-blue-800 text-xs">{lastWeekSnapshot.onTime}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-gray-50/60 border border-gray-100 px-3 py-2.5 text-center text-[11px] text-gray-400">
              No snapshot recorded for last week
            </div>
          )}
        </div>
      </div>

      <div className="card p-4">
        <p className="text-sm font-semibold text-gray-700 mb-1">Weekly History</p>
        <p className="mb-3 text-xs text-gray-400">
          Weekly performance records calculated for each week cycle
        </p>
        {weeklyRows.length === 0 ? (
          <p className="text-sm text-gray-500 py-3 text-center">
            No past weekly records found yet.
          </p>
        ) : (
          <div className="space-y-2">
            {weeklyRows.map(row => (
              <div
                key={`${row.weekKey}-${row.weekStart}`}
                className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{row.weekKey}</p>
                  <p className="text-[11px] text-gray-400">
                    {row.weekStart} → {row.weekEnd} · Planned: {row.planned} · Done: {row.done}
                  </p>
                </div>
                <p className={cn('text-base font-bold', gapColor(row.gapPercent))}>{row.gapLabel}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {liveMis && (
        <div className="card p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">Current Week Execution</p>
          <div className="space-y-2 text-sm">
            {[
              { label: 'Checklist', bucket: liveMis.checklist },
              { label: 'One Time', bucket: liveMis.delegation },
              { label: 'FMS', bucket: liveMis.fms },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between gap-3 border-b border-gray-50 pb-2 last:border-b-0 last:pb-0">
                <span className="font-medium text-gray-700">{row.label}</span>
                <span className="text-xs text-gray-500">
                  Planned: <strong className="text-gray-800">{row.bucket.planned}</strong> · Done: <strong className="text-gray-800">{row.bucket.done}</strong> · On-Time: <strong className="text-gray-800">{row.bucket.onTime}</strong>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Task summary */}
      <div className="card p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">One-Time Tasks Status</p>
        <div className="space-y-2">
          {[
            { label: 'Pending Accept', value: pending,   color: 'bg-yellow-400' },
            { label: 'Verified',       value: verified,  color: 'bg-brand-500' },
            { label: 'Completed',      value: completed, color: 'bg-green-500' },
            { label: 'Overdue',        value: overdue,   color: 'bg-red-500' },
          ].map(row => (
            <div key={row.label} className="flex items-center gap-3 text-sm">
              <span className={cn('w-2 h-2 rounded-full shrink-0', row.color)} />
              <span className="text-gray-600 flex-1">{row.label}</span>
              <span className="font-semibold text-gray-800">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
