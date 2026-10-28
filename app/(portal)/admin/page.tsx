import { getSession } from '@/lib/utils/auth';
import { adminGetAllUsers } from '@/lib/firebase/users';
import { adminGetAllTasks, adminGetTaskCounts, serializeTask } from '@/lib/firebase/tasks';
import { adminGetDepartments, serializeDepartment } from '@/lib/firebase/departments';
import AdminDashboardClient from '@/components/admin/AdminDashboardClient';
import { hydrateTasksWithUsers } from '@/lib/utils/taskHydration';

export default async function AdminDashboardPage() {
  const session = await getSession();
  const [users, tasks, departments, taskCounts] = await Promise.all([
    adminGetAllUsers(),
    adminGetAllTasks({ limit: 100 }),
    adminGetDepartments(),
    adminGetTaskCounts(),
  ]);

  // Serialize for client
  const serializedUsers = users.map(u => ({
    ...u,
    createdAt: u.createdAt.toDate().toISOString(),
    updatedAt: u.updatedAt.toDate().toISOString(),
  }));

  const hydratedTasks = hydrateTasksWithUsers(tasks, users);

  const serializedTasks = hydratedTasks.map(serializeTask);

  return (
    <AdminDashboardClient
      currentUid={session?.uid || ''}
      taskCounts={taskCounts}
      users={serializedUsers}
      tasks={serializedTasks}
      departments={departments.map(serializeDepartment)}
    />
  );
}

