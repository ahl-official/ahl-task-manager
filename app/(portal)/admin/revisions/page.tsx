import { adminGetAllRevisions } from '@/lib/firebase/revisions';
import { getSession } from '@/lib/utils/auth';
import { adminGetAllTasks, serializeTask } from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import RevisionsClient from '@/components/shared/RevisionsClient';
import { hydrateTasksWithUsers } from '@/lib/utils/taskHydration';

export default async function AdminRevisionsPage() {
  const session = await getSession();
  if (!session) return null;

  const [tasks, allRevisions, users] = await Promise.all([
    adminGetAllTasks({ limit: null }),
    adminGetAllRevisions(),
    adminGetAllUsers(),
  ]);

  const revisions = allRevisions.map(r => ({
    ...r,
    requestedDate: r.requestedDate?.toDate().toISOString() ?? null,
    decidedAt:     r.decidedAt?.toDate().toISOString() ?? null,
    createdAt:     r.createdAt?.toDate().toISOString() ?? null,
  }));

  const hydratedTasks = hydrateTasksWithUsers(tasks, users);

  const serializedTasks = hydratedTasks.map(serializeTask);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Revision Requests</h1>
        <p className="text-sm text-gray-500 mt-0.5">{revisions.length} revision requests</p>
      </div>
      <RevisionsClient revisions={revisions} tasks={serializedTasks} role="admin" currentUid={session.uid} />
    </div>
  );
}

