import { adminGetAllUsers } from '@/lib/firebase/users';
import CalendarClient from '@/components/admin/CalendarClient';

export default async function CalendarPage() {
  const users = await adminGetAllUsers();

  const serializedUsers = users
    .filter(u => u.isActive !== false)
    .map(u => ({
      uid: u.uid,
      name: u.name,
      department: u.department,
      isActive: u.isActive !== false,
    }));

  return <CalendarClient tasks={[]} users={serializedUsers} />;
}
