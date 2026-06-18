import { adminGetAllTasks, serializeTask } from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import { getSession } from '@/lib/utils/auth';
import CalendarClient from '@/components/admin/CalendarClient';
import { hydrateTasksWithUsers } from '@/lib/utils/taskHydration';

export default async function CalendarPage() {
  const [tasks, users] = await Promise.all([
    adminGetAllTasks({ limit: 500 }),
    adminGetAllUsers(),
  ]);

  const hydratedTasks = hydrateTasksWithUsers(tasks, users);

  const serializedTasks = hydratedTasks.map(serializeTask);

  const serializedUsers = users.map(u => ({
    uid:        u.uid,
    name:       u.name,
    department: u.department,
  }));

  return <CalendarClient tasks={serializedTasks} users={serializedUsers} />;
}

