import { getSession } from '@/lib/utils/auth';
import { adminGetAllScores, adminGetScore } from '@/lib/firebase/scores';
import { adminGetAllTasks, adminGetTasksByAssignee, serializeTask } from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import { Trophy, TrendingUp, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { filterScoresForSession, filterTasksForSession, filterUsersForSession } from '@/lib/utils/access';
import ScoresClient from '@/components/shared/ScoresClient';
import { hydrateTasksWithUsers } from '@/lib/utils/taskHydration';

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

  let pdfGapLabel = '—';
  let pdfGapPercent: number | null = null;
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
    const { computeMisScoresForWeek } = await import('@/lib/mis/compute');
    const { formatGapPercent } = await import('@/lib/mis/sheetFormula');
    const { normalizePersonName } = await import('@/lib/utils/names');
    const { adminGetMisWeeklySnapshots } = await import('@/lib/mis/weeklySnapshot');
    const { getMisWeekPeriod } = await import('@/lib/mis/week');

    const week = getMisWeekPeriod();
    const [liveRows, stored] = await Promise.all([
      computeMisScoresForWeek(week.weekStart, week.weekEnd),
      adminGetMisWeeklySnapshots({ year: week.year, monthName: week.monthName }).catch(() => []),
    ]);

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

  function scoreColor(s: number) {
    if (s >= 90) return 'text-green-600';
    if (s >= 70) return 'text-blue-600';
    if (s >= 50) return 'text-yellow-600';
    return 'text-red-600';
  }

  function scoreLabel(s: number) {
    if (s >= 90) return 'Excellent';
    if (s >= 70) return 'Good';
    if (s >= 50) return 'Average';
    return 'Needs Improvement';
  }

  function gapColor(gap: number | null) {
    if (gap === null) return 'text-gray-400';
    if (gap >= -5) return 'text-green-600';
    if (gap >= -20) return 'text-blue-600';
    if (gap >= -50) return 'text-yellow-600';
    return 'text-red-600';
  }

  return (
    <div className="max-w-xl space-y-5 p-6">
      <div className="pr-14">
        <h1 className="text-xl font-semibold text-gray-900">My Score</h1>
        <p className="mt-0.5 text-sm text-gray-500">Your performance metrics</p>
      </div>

      {/* Score card */}
      <div className="card p-6 text-center bg-gradient-to-br from-brand-50 to-white">
        <div className="w-16 h-16 rounded-2xl bg-brand-600 flex items-center justify-center mx-auto mb-4">
          <Trophy size={28} className="text-white" />
        </div>
        <p className={cn('text-5xl font-bold mb-1', scoreColor(mis))}>{mis}%</p>
        <p className="text-gray-500 text-sm font-medium">{scoreLabel(mis)}</p>
        <p className="text-xs text-gray-400 mt-1">Portal MIS (on-time / assigned)</p>

        <div className="mt-4 rounded-xl bg-white/80 px-4 py-3">
          <p className={cn('text-2xl font-bold', gapColor(pdfGapPercent))}>{pdfGapLabel}</p>
          <p className="text-xs text-gray-400 mt-0.5">PDF MIS this week (done/planned − 100). 0% = all planned done</p>
          {liveMis && (
            <p className="mt-1 text-[11px] text-gray-400">
              {liveMis.weekStart} → {liveMis.weekEnd} · planned {liveMis.planned} · done {liveMis.done}
            </p>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-5 h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-700',
              mis >= 90 ? 'bg-green-500' :
              mis >= 70 ? 'bg-blue-500' :
              mis >= 50 ? 'bg-yellow-500' : 'bg-red-500'
            )}
            style={{ width: `${mis}%` }}
          />
        </div>
      </div>

      <div className="card p-4">
        <p className="text-sm font-semibold text-gray-700 mb-1">MIS Weekly history</p>
        <p className="mb-3 text-xs text-gray-400">
          Saved by Tuesday cron into Cloudflare <code className="text-[10px]">mis_weekly</code>
        </p>
        {weeklyRows.length === 0 ? (
          <p className="text-sm text-gray-500">
            No weekly snapshots yet. They appear after the weekly MIS cron runs (or an admin triggers{' '}
            <code className="text-xs">/api/mis/cron?action=weekly</code>).
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
                    {row.weekStart} → {row.weekEnd} · planned {row.planned} · done {row.done}
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
          <p className="text-sm font-semibold text-gray-700 mb-3">This week buckets (live)</p>
          <div className="space-y-2 text-sm">
            {[
              { label: 'Checklist', bucket: liveMis.checklist },
              { label: 'Delegation', bucket: liveMis.delegation },
              { label: 'FMS', bucket: liveMis.fms },
            ].map(row => (
              <div key={row.label} className="flex items-center gap-3">
                <span className="w-24 text-gray-600">{row.label}</span>
                <span className="flex-1 text-xs text-gray-400">
                  P {row.bucket.planned} · D {row.bucket.done} · OT {row.bucket.onTime}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: TrendingUp,    label: 'Tasks Assigned',  value: score?.tasksAssigned ?? 0,  color: 'text-gray-600',   bg: 'bg-gray-50' },
          { icon: CheckCircle2,  label: 'Completed',       value: score?.tasksCompleted ?? 0,  color: 'text-green-600',  bg: 'bg-green-50' },
          { icon: Clock,         label: 'On Time',         value: score?.onTimeCount ?? 0,     color: 'text-blue-600',   bg: 'bg-blue-50' },
          { icon: AlertTriangle, label: 'Late',            value: score?.lateCount ?? 0,       color: 'text-red-600',    bg: 'bg-red-50' },
        ].map(stat => (
          <div key={stat.label} className={cn('card p-4 flex items-center gap-3 border-0', stat.bg)}>
            <stat.icon size={20} className={stat.color} />
            <div>
              <p className="text-xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-500">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Task summary */}
      <div className="card p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">Current Task Status</p>
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
