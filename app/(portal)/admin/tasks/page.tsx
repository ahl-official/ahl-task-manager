import { adminGetAllTasks, serializeTask } from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import TaskListClient from '@/components/shared/TaskListClient';
import { hydrateTasksWithUsers } from '@/lib/utils/taskHydration';

export default async function AdminTasksPage() {
  const [tasks, users] = await Promise.all([
    adminGetAllTasks({ limit: null }),
    adminGetAllUsers(),
  ]);

  const hydratedTasks = hydrateTasksWithUsers(tasks, users);

  const serialized = hydratedTasks.map(serializeTask);
  const serializedUsers = users.map(u => ({
    uid: u.uid,
    name: u.name,
    department: u.department,
    role: u.role,
    isActive: u.isActive,
  }));

  return (
    <div className="p-6">
      <div className="mb-6 pr-14">
        <h1 className="text-xl font-semibold text-gray-900">All Tasks</h1>
        <p className="mt-0.5 text-sm text-gray-500">Showing all {tasks.length} tasks.</p>
      </div>
      <TaskListClient tasks={serialized} role="admin" currentUid="" users={serializedUsers} />
    </div>
  );
}

