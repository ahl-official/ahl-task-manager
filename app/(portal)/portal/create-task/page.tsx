import { adminGetAllUsers } from '@/lib/firebase/users';
import { getSession } from '@/lib/utils/auth';
import CreateTaskForm from '@/components/shared/CreateTaskForm';
import ServerLimitBanner from '@/components/shared/ServerLimitBanner';
import { redirect } from 'next/navigation';
import { isReadLimitHit } from '@/lib/firebase/errors';

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

  const readLimitReached = isReadLimitHit() || (rawUsers.length === 0);

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Create Task</h1>
        <p className="mt-0.5 text-sm text-gray-500">Delegate a task to a team member</p>
      </div>
      {readLimitReached && (
        <ServerLimitBanner
          role="user"
          message="Server read limit reached: The user directory could not be read from the database right now. Task creation is fully functional and writes directly — select from cached team members or enter assignee details below."
        />
      )}
      <CreateTaskForm
        users={activeUsers as any}
        currentUser={currentUser as any}
        redirectTo="/portal"
        isReadLimit={readLimitReached}
      />
    </div>
  );
}
