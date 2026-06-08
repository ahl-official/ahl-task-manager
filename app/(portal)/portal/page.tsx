import { getSession } from '@/lib/utils/auth';
import { adminGetTasksByAssignee } from '@/lib/firebase/tasks';
import { adminGetScore } from '@/lib/firebase/scores';
import TaskListClient from '@/components/shared/TaskListClient';
import { Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hydrateTasksWithUsers } from '@/lib/utils/taskHydration';

export default async function PortalPage() {
  const session = await getSession();
  if (!session) return null;

  const [tasks, score] = await Promise.all([
    adminGetTasksByAssignee(session.uid),
    adminGetScore(session.uid),
  ]);
  const hydratedTasks = hydrateTasksWithUsers(tasks, [{
    uid: session.uid,
    name: session.name,
    department: session.department,
    waNumber: session.waNumber,
  }]);

  const serialized = hydratedTasks.map(t => ({
    ...t,
    startDate:   t.startDate?.toDate().toISOString() ?? null,
    endDate:     t.endDate?.toDate().toISOString() ?? null,
    delayedDate: t.delayedDate?.toDate().toISOString() ?? null,
    acceptedAt:  t.acceptedAt?.toDate().toISOString() ?? null,
    completedAt: t.completedAt?.toDate().toISOString() ?? null,
    verifiedAt:  t.verifiedAt?.toDate().toISOString() ?? null,
    createdAt:   t.createdAt.toDate().toISOString(),
    updatedAt:   t.updatedAt.toDate().toISOString(),
  }));

  const pending    = hydratedTasks.filter(t => t.status === 'Pending Accept').length;
  const inProgress = hydratedTasks.filter(t => t.status === 'In Progress').length;
  const overdue    = hydratedTasks.filter(t => t.status === 'Overdue').length;
  const completed  = hydratedTasks.filter(t => ['Completed', 'Verified'].includes(t.status)).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">My Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">Welcome back, {session.name}</p>
        </div>

        {/* MIS Score badge */}
        {score && (
          <div className="card px-4 py-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center">
              <Trophy size={18} className="text-white" />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{score.monthlyScore}%</p>
              <p className="text-[11px] text-gray-400">MIS Score</p>
            </div>
          </div>
        )}
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
      <TaskListClient tasks={serialized} role="user" currentUid={session.uid} />
    </div>
  );
}

