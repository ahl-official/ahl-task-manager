import { getSession } from '@/lib/utils/auth';
import { adminGetTasksByAssignee, adminGetTaskCounts, serializeTask } from '@/lib/firebase/tasks';
import TaskListClient from '@/components/shared/TaskListClient';
import { Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hydrateTasksWithUsers } from '@/lib/utils/taskHydration';
import { getPersonalTimelyTasks, mergePersonalDashboardTasks } from '@/lib/utils/timelyDashboard';
import { getPreviousMisWeekPeriod } from '@/lib/mis/week';
import { adminGetMisWeeklySnapshots } from '@/lib/mis/weeklySnapshot';
import { formatGapPercent } from '@/lib/mis/sheetFormula';
import { normalizePersonName } from '@/lib/utils/names';

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

  const prevWeek = getPreviousMisWeekPeriod();

  const [databaseTasks, timelyTasks, prevSnaps, taskCounts] = await Promise.all([
    adminGetTasksByAssignee(session.uid),
    getPersonalTimelyTasks(session),
    adminGetMisWeeklySnapshots({ weekKey: prevWeek.weekKey }).catch(() => []),
    adminGetTaskCounts(undefined, { scope: 'mine', uid: session.uid, excludeRecurring: true, includeChecklist: true }),
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

  // MIS Score badge shows the last COMPLETED week only — the current week isn't
  // reconciled yet, so no current-week score is calculated or shown anywhere.
  const prevSnap = prevSnaps.find(row =>
    row.uid === session.uid || normalizePersonName(row.name) === normalizePersonName(session.name)
  );
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

        {/* MIS Score badge — last completed week only */}
        <div className="card px-4 py-2.5 flex items-center gap-3 shadow-sm border border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center shrink-0 shadow-sm">
            <Trophy size={18} className="text-white" />
          </div>
          <div>
            <p className={cn('text-xl font-bold leading-tight', getScoreColor(lastWeekGapPercent))}>
              {lastWeekGapLabel}
            </p>
            <p className="text-[11px] font-medium text-gray-400">MIS Score (Last Week)</p>
          </div>
        </div>
      </div>

      {/* Task list with interactive filter cards */}
      <TaskListClient initialCounts={taskCounts} totalCount={taskCounts.total} tasks={serialized} role="user" currentUid={session.uid} currentUserName={session.name} />
    </div>
  );
}

