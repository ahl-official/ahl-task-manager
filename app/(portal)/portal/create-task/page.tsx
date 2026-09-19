import { adminGetAllUsers } from '@/lib/firebase/users';
import { getSession } from '@/lib/utils/auth';
import CreateTaskForm from '@/components/shared/CreateTaskForm';
import { redirect } from 'next/navigation';
import { getAssignableUsers } from '@/lib/utils/hierarchy';

function normalizeRole(role: string) {
  return role === 'user' ? 'member' : role;
}

export default async function PortalCreateTaskPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const currentUser = {
    uid: session.uid,
    name: session.name,
    department: session.department,
    role: normalizeRole(session.role),
  };
  const rawUsers = await adminGetAllUsers();
  const activeUsers = rawUsers
    .filter(u => u.isActive)
    .map(u => ({
      uid:        u.uid,
      name:       u.name,
      department: u.department,
      role:       normalizeRole(u.role),
      isActive:   u.isActive,
    }));

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6 pr-14">
        <h1 className="text-xl font-semibold text-gray-900">Create Task</h1>
        <p className="mt-0.5 text-sm text-gray-500">Delegate a task to a team member</p>
      </div>
      <CreateTaskForm users={activeUsers as any} currentUser={currentUser as any} redirectTo="/portal" />
    </div>
  );
}
