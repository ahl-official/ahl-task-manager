import { adminGetAllUsers } from '@/lib/firebase/users';
import CalendarClient from '@/components/admin/CalendarClient';

export default async function CalendarPage() {
  const users = await adminGetAllUsers();

  const serializedUsers = users.map(u => ({
    uid:        u.uid,
    name:       u.name,
    department: u.department,
  }));

  return <CalendarClient tasks={[]} users={serializedUsers} />;
}

