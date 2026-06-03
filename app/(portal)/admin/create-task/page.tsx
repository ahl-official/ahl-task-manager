import { adminGetAllUsers } from '@/lib/firebase/users';
import { getSession } from '@/lib/utils/auth';
import CreateTaskForm from '@/components/shared/CreateTaskForm';

function normalizeRole(role: string) {
  return role === 'user' ? 'member' : role;
}

export default async function CreateTaskPage() {
  const [session, users] = await Promise.all([
    getSession(),
    adminGetAllUsers(),
  ]);
  const activeUsers = users.filter(u => u.isActive).map(u => ({
    uid:        u.uid,
    name:       u.name,
    department: u.department,
    role:       normalizeRole(u.role),
    isActive:   u.isActive,
  }));
  const currentUser = {
    uid: session?.uid ?? '',
    name: session?.name ?? 'Admin',
    department: session?.department ?? '',
    role: normalizeRole(session?.role ?? 'admin'),
  };

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Create Task</h1>
        <p className="text-sm text-gray-500 mt-0.5">Delegate a new task to a team member</p>
      </div>
      <CreateTaskForm users={activeUsers as any} currentUser={currentUser as any} redirectTo="/admin" />
    </div>
  );
}
