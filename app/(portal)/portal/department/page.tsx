import { getSession } from '@/lib/utils/auth';
import { adminGetAllTasks } from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import TaskListClient from '@/components/shared/TaskListClient';
import { filterTasksForSession, filterUsersForSession } from '@/lib/utils/access';
import { hydrateTasksWithUsers } from '@/lib/utils/taskHydration';

export default async function DepartmentTasksPage() {
  const session = await getSession();
  if (!session) return null;

  const [allTasks, allUsers] = await Promise.all([
    adminGetAllTasks(),
    adminGetAllUsers(),
  ]);
  const visibleUsers = filterUsersForSession(session, allUsers);
  const tasks = filterTasksForSession(session, hydrateTasksWithUsers(allTasks, visibleUsers));

  const serialized = tasks.map(t => ({
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
  const serializedUsers = visibleUsers.map(user => ({
    uid: user.uid,
    name: user.name,
    department: user.department,
    role: user.role,
    isActive: user.isActive,
  }));

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">
          {session.role === 'leader' ? 'Department Tasks' : 'My Tasks'}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">{session.department} - {tasks.length} tasks</p>
      </div>
      <TaskListClient tasks={serialized} role="user" currentUid={session.uid} users={serializedUsers} />
    </div>
  );
}

