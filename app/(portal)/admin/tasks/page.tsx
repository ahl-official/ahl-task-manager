import { adminGetAllTasks, serializeTask } from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import TaskListClient from '@/components/shared/TaskListClient';
import { hydrateTasksWithUsers } from '@/lib/utils/taskHydration';

export default async function AdminTasksPage() {
  const [tasks, users] = await Promise.all([
    adminGetAllTasks(),
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
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">All Tasks</h1>
        <p className="text-sm text-gray-500 mt-0.5">Showing latest {tasks.length} tasks. Use filters to load specific completed or active work.</p>
      </div>
      <TaskListClient tasks={serialized} role="admin" currentUid="" users={serializedUsers} />
    </div>
  );
}

