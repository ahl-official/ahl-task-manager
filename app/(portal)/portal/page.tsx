import { getSession } from '@/lib/utils/auth';
import { adminGetTasksByAssignee, serializeTask } from '@/lib/firebase/tasks';
import { adminGetScore } from '@/lib/firebase/scores';
import TaskListClient from '@/components/shared/TaskListClient';
import { Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hydrateTasksWithUsers } from '@/lib/utils/taskHydration';
import { getPersonalTimelyTasks, mergePersonalDashboardTasks } from '@/lib/utils/timelyDashboard';
import { getMisWeekPeriod, getPreviousMisWeekPeriod } from '@/lib/mis/week';
import { adminGetMisWeeklySnapshots } from '@/lib/mis/weeklySnapshot';
import { formatGapPercent } from '@/lib/mis/sheetFormula';
import { normalizePersonName } from '@/lib/utils/names';
import { computeMisScoresForWeek } from '@/lib/mis/compute';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getScoreColor(gap: number | null) {
  if (gap === null) return 'text-gray-700';
  if (gap >= 0) return 'text-emerald-600';
  if (gap >= -10) return 'text-green-600';
  if (gap >= -25) return 'text-blue-600';
  if (gap >= -50) return 'text-amber-600';
  return 'text-red-600';
}

export default async function PortalPage() {
  const session = await getSession();
  if (!session) return null;

  const currentWeek = getMisWeekPeriod();
  const prevWeek = getPreviousMisWeekPeriod();

  const [databaseTasks, score, timelyTasks, storedSnapshots] = await Promise.all([
    adminGetTasksByAssignee(session.uid),
    adminGetScore(session.uid),
    getPersonalTimelyTasks(session),
    adminGetMisWeeklySnapshots({ year: currentWeek.year, monthName: currentWeek.monthName }).catch(() => []),
  ]);
  const tasks = mergePersonalDashboardTasks(databaseTasks, timelyTasks);
  const hydratedTasks = hydrateTasksWithUsers(tasks, [{
    uid: session.uid,
    name: session.name,
    department: session.department,
    waNumber: session.waNumber,
  }]);

  const serialized = hydratedTasks.map(serializeTask);

  const pending    = hydratedTasks.filter(t => t.status === 'Pending Accept').length;
  const inProgress = hydratedTasks.filter(t => t.status === 'In Progress').length;
  const overdue    = hydratedTasks.filter(t => t.status === 'Overdue').length;
  const completed  = hydratedTasks.filter(t => ['Completed', 'Verified'].includes(t.status)).length;

  // Current Week MIS
  let currentSnap = storedSnapshots.find(row =>
    row.weekKey === currentWeek.weekKey && (row.uid === session.uid || normalizePersonName(row.name) === normalizePersonName(session.name))
  );
  let currentGapPercent: number | null = currentSnap?.gapPercent ?? null;
  let currentGapLabel = currentSnap ? formatGapPercent(currentGapPercent) : '';

  if (!currentSnap) {
    try {
      const liveRows = await computeMisScoresForWeek(currentWeek.weekStart, currentWeek.weekEnd);
      const mine = liveRows.find(row =>
        row.uid === session.uid || normalizePersonName(row.name) === normalizePersonName(session.name)
      );
      if (mine) {
        currentGapPercent = mine.gapPercent ?? null;
        currentGapLabel = formatGapPercent(currentGapPercent);
      }
    } catch {
      // fallback
    }
  }
  if (!currentGapLabel) {
    currentGapLabel = score ? `${score.monthlyScore}%` : '—';
  }

  // Last Week MIS
  let prevSnap = storedSnapshots.find(row =>
    row.weekKey === prevWeek.weekKey && (row.uid === session.uid || normalizePersonName(row.name) === normalizePersonName(session.name))
  );
  if (!prevSnap) {
    const prevSnaps = await adminGetMisWeeklySnapshots({ weekKey: prevWeek.weekKey }).catch(() => []);
    prevSnap = prevSnaps.find(row => row.uid === session.uid || normalizePersonName(row.name) === normalizePersonName(session.name));
  }
  const lastWeekGapPercent: number | null = prevSnap?.gapPercent ?? null;
  const lastWeekGapLabel = prevSnap ? formatGapPercent(lastWeekGapPercent) : '—';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 pr-14 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">My Tasks</h1>
          <p className="mt-0.5 text-sm text-gray-500">Welcome back, {session.name}</p>
        </div>

        {/* MIS Score badge (Current Week) */}
        <div className="card px-4 py-2.5 flex items-center gap-3 shadow-sm border border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center shrink-0 shadow-sm">
            <Trophy size={18} className="text-white" />
          </div>
          <div>
            <p className={cn('text-xl font-bold leading-tight', getScoreColor(currentGapPercent))}>
              {currentGapLabel}
            </p>
            <p className="text-[11px] font-medium text-gray-400">MIS Score</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Pending',     value: pending,    color: 'text-yellow-600', bg: 'bg-yellow-50' },
          { label: 'In Progress', value: inProgress, color: 'text-blue-600',   bg: 'bg-blue-50'   },
          { label: 'Overdue',     value: overdue,    color: 'text-red-600',    bg: 'bg-red-50'    },
          { label: 'Completed',   value: completed,  color: 'text-green-600',  bg: 'bg-green-50'  },
        ].map(stat => (
          <div key={stat.label} className={cn('card p-4 border-0', stat.bg)}>
            <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            <p className={cn('text-xs font-medium mt-0.5', stat.color)}>{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Task list */}
      <TaskListClient tasks={serialized} role="user" currentUid={session.uid} currentUserName={session.name} />
    </div>
  );
}

