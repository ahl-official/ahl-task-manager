import { adminGetAllUsers } from '@/lib/firebase/users';
import { adminGetDepartments, serializeDepartment } from '@/lib/firebase/departments';
import UsersClient from '@/components/admin/UsersClient';

export default async function AdminUsersPage() {
  const [users, departments] = await Promise.all([
    adminGetAllUsers(),
    adminGetDepartments(),
  ]);

  const serialized = users.map(u => ({
    ...u,
    createdAt: u.createdAt.toDate().toISOString(),
    updatedAt: u.updatedAt.toDate().toISOString(),
  }));

  return (
    <div className="p-6">
      <div className="mb-6 pr-14">
        <h1 className="text-xl font-semibold text-gray-900">Team</h1>
        <p className="mt-0.5 text-sm text-gray-500">{users.length} registered users</p>
      </div>
      <UsersClient users={serialized} departments={departments.map(serializeDepartment)} />
    </div>
  );
}
