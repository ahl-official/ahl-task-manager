import { adminGetAllTasks } from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import { getSession } from '@/lib/utils/auth';
import CalendarClient from '@/components/admin/CalendarClient';

export default async function CalendarPage() {
  const [tasks, users] = await Promise.all([
    adminGetAllTasks(),
    adminGetAllUsers(),
  ]);

  const serializedTasks = tasks.map(t => ({
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

  const serializedUsers = users.map(u => ({
    uid:        u.uid,
    name:       u.name,
    department: u.department,
  }));

  return <CalendarClient tasks={serializedTasks} users={serializedUsers} />;
}

