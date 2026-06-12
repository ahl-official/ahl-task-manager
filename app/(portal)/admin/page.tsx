import { adminGetAllUsers } from '@/lib/firebase/users';
import { adminGetAllTasks } from '@/lib/firebase/tasks';
import { adminGetAllScores } from '@/lib/firebase/scores';
import { adminGetDepartments, serializeDepartment } from '@/lib/firebase/departments';
import AdminDashboardClient from '@/components/admin/AdminDashboardClient';
import { hydrateTasksWithUsers } from '@/lib/utils/taskHydration';

export default async function AdminDashboardPage() {
  const [users, tasks, scores, departments] = await Promise.all([
    adminGetAllUsers(),
    adminGetAllTasks(),
    adminGetAllScores(),
    adminGetDepartments(),
  ]);

  // Serialize for client
  const serializedUsers = users.map(u => ({
    ...u,
    createdAt: u.createdAt.toDate().toISOString(),
    updatedAt: u.updatedAt.toDate().toISOString(),
  }));

  const hydratedTasks = hydrateTasksWithUsers(tasks, users);

  const serializedTasks = hydratedTasks.map(t => ({
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

  const serializedScores = scores.map(s => ({
    ...s,
    lastUpdated: s.lastUpdated.toDate().toISOString(),
  }));

  return (
    <AdminDashboardClient
      users={serializedUsers}
      tasks={serializedTasks}
      scores={serializedScores}
      departments={departments.map(serializeDepartment)}
    />
  );
}

