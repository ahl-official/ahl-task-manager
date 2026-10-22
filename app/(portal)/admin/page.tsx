import { getSession } from '@/lib/utils/auth';
import { adminGetAllUsers } from '@/lib/firebase/users';
import { adminGetAllTasks, adminGetTaskCounts, serializeTask } from '@/lib/firebase/tasks';
import { adminGetAllScores } from '@/lib/firebase/scores';
import { adminGetDepartments, serializeDepartment } from '@/lib/firebase/departments';
import AdminDashboardClient from '@/components/admin/AdminDashboardClient';
import { hydrateTasksWithUsers } from '@/lib/utils/taskHydration';

export default async function AdminDashboardPage() {
  const session = await getSession();
  const [users, tasks, scores, departments, taskCounts] = await Promise.all([
    adminGetAllUsers(),
    adminGetAllTasks({ limit: 100 }),
    adminGetAllScores(),
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

  const serializedScores = scores.map(s => ({
    ...s,
    lastUpdated: s.lastUpdated.toDate().toISOString(),
  }));

  return (
    <AdminDashboardClient
      currentUid={session?.uid || ''}
      taskCounts={taskCounts}
      users={serializedUsers}
      tasks={serializedTasks}
      scores={serializedScores}
      departments={departments.map(serializeDepartment)}
    />
  );
}

