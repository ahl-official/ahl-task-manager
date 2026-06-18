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
      adminGetAllTasks(),
      adminGetAllUsers(),
    ]);
    const visibleScores = filterScoresForSession(session, scores);
    const visibleUsers = filterUsersForSession(session, users);
    const visibleTasks = filterTasksForSession(session, hydrateTasksWithUsers(tasks, visibleUsers));
    const serializedScores = visibleScores.map(score => ({
      ...score,
      lastUpdated: score.lastUpdated.toDate().toISOString(),
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
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Team Score</h1>
          <p className="text-sm text-gray-500 mt-0.5">{session.department} department performance</p>
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

  return (
    <div className="p-6 max-w-xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">My Score</h1>
        <p className="text-sm text-gray-500 mt-0.5">Your performance metrics</p>
      </div>

      {/* Score card */}
      <div className="card p-6 text-center bg-gradient-to-br from-brand-50 to-white">
        <div className="w-16 h-16 rounded-2xl bg-brand-600 flex items-center justify-center mx-auto mb-4">
          <Trophy size={28} className="text-white" />
        </div>
        <p className={cn('text-5xl font-bold mb-1', scoreColor(mis))}>{mis}%</p>
        <p className="text-gray-500 text-sm font-medium">{scoreLabel(mis)}</p>
        <p className="text-xs text-gray-400 mt-1">MIS Score</p>

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
