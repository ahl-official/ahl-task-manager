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
  const users = await adminGetAllUsers();
  const assignableUsers = getAssignableUsers(currentUser as any, users.map(u => ({
    ...u,
    role: normalizeRole(u.role),
  })) as any).map(u => ({
    uid:        u.uid,
    name:       u.name,
    department: u.department,
    role:       normalizeRole(u.role),
    isActive:   u.isActive,
  }));

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Create Task</h1>
        <p className="text-sm text-gray-500 mt-0.5">Delegate a task to a team member</p>
      </div>
      <CreateTaskForm users={assignableUsers as any} currentUser={currentUser as any} redirectTo="/portal" />
    </div>
  );
}
