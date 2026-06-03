import { getSession } from '@/lib/utils/auth';
import { adminGetAllTasks } from '@/lib/firebase/tasks';
import TaskListClient from '@/components/shared/TaskListClient';

export default async function DepartmentTasksPage() {
  const session = await getSession();
  if (!session) return null;

  const tasks = await adminGetAllTasks({ department: session.department });

  const serialized = tasks.map(t => ({
    ...t,
    startDate:   t.startDate.toDate().toISOString(),
    endDate:     t.endDate.toDate().toISOString(),
    delayedDate: t.delayedDate?.toDate().toISOString() ?? null,
    acceptedAt:  t.acceptedAt?.toDate().toISOString() ?? null,
    completedAt: t.completedAt?.toDate().toISOString() ?? null,
    verifiedAt:  t.verifiedAt?.toDate().toISOString() ?? null,
    createdAt:   t.createdAt.toDate().toISOString(),
    updatedAt:   t.updatedAt.toDate().toISOString(),
  }));

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Department Tasks</h1>
        <p className="text-sm text-gray-500 mt-0.5">{session.department} · {tasks.length} tasks</p>
      </div>
      <TaskListClient tasks={serialized} role="user" currentUid={session.uid} />
    </div>
  );
}
