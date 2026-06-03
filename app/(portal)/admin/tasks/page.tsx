import { adminGetAllTasks } from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import TaskListClient from '@/components/shared/TaskListClient';

export default async function AdminTasksPage() {
  const [tasks, users] = await Promise.all([
    adminGetAllTasks(),
    adminGetAllUsers(),
  ]);

  const serialized = tasks.map(t => ({
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
    uid: u.uid,
    name: u.name,
    department: u.department,
    role: u.role,
    isActive: u.isActive,
  }));

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">All Tasks</h1>
        <p className="text-sm text-gray-500 mt-0.5">{tasks.length} total tasks</p>
      </div>
      <TaskListClient tasks={serialized} role="admin" currentUid="" users={serializedUsers} />
    </div>
  );
}

