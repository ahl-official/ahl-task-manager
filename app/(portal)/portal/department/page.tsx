import { getSession } from '@/lib/utils/auth';
import { adminGetAllTasks, serializeTask } from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import TaskListClient from '@/components/shared/TaskListClient';
import { filterTasksForSession, filterUsersForSession } from '@/lib/utils/access';
import { hydrateTasksWithUsers } from '@/lib/utils/taskHydration';
import { getPersonalTimelyTasks, mergePersonalDashboardTasks } from '@/lib/utils/timelyDashboard';

export default async function DepartmentTasksPage() {
  const session = await getSession();
  if (!session) return null;

  const [allTasks, allUsers, timelyTasks] = await Promise.all([
    session.role === 'leader'
      ? adminGetAllTasks({ department: session.department, limit: null })
      : adminGetAllTasks({ limit: null }),
    adminGetAllUsers(),
    session.role === 'leader' ? Promise.resolve([]) : getPersonalTimelyTasks(session),
  ]);
  const visibleUsers = filterUsersForSession(session, allUsers);
  const databaseTasks = filterTasksForSession(session, hydrateTasksWithUsers(allTasks, visibleUsers));
  const tasks = session.role === 'leader'
    ? databaseTasks
    : mergePersonalDashboardTasks(databaseTasks, timelyTasks);

  const serialized = tasks.map(serializeTask);
  const serializedUsers = visibleUsers.map(user => ({
    uid: user.uid,
    name: user.name,
    department: user.department,
    role: user.role,
    isActive: user.isActive,
  }));

  return (
    <div className="p-6">
      <div className="mb-6 pr-14">
        <h1 className="text-xl font-semibold text-gray-900">
          {session.role === 'leader' ? 'Department Tasks' : 'My Tasks'}
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">{session.department} - {tasks.length} tasks</p>
      </div>
      <TaskListClient tasks={serialized} role="user" currentUid={session.uid} users={serializedUsers} />
    </div>
  );
}

