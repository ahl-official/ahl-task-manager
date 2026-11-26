import { adminGetPaginatedRevisions } from '@/lib/firebase/revisions';
import { getSession } from '@/lib/utils/auth';
import { adminGetTasksByIds, serializeTask } from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import RevisionsClient from '@/components/shared/RevisionsClient';
import { hydrateTasksWithUsers } from '@/lib/utils/taskHydration';

export default async function AdminRevisionsPage() {
  const session = await getSession();
  if (!session) return null;

  const [result, users, pendingResult, resolvedResult] = await Promise.all([
    adminGetPaginatedRevisions({ page: 1, limit: 50 }),
    adminGetAllUsers(),
    adminGetPaginatedRevisions({ page: 1, limit: 1, status: 'pending' }),
    adminGetPaginatedRevisions({ page: 1, limit: 1, status: 'resolved' }),
  ]);
  const tasks = await adminGetTasksByIds(result.items.map(revision => revision.taskId));

  const revisions = result.items.map(r => ({
    ...r,
    requestedDate: r.requestedDate?.toDate().toISOString() ?? null,
    decidedAt:     r.decidedAt?.toDate().toISOString() ?? null,
    createdAt:     r.createdAt?.toDate().toISOString() ?? null,
  }));

  const hydratedTasks = hydrateTasksWithUsers(tasks, users);
  const serializedTasks = hydratedTasks.map(serializeTask);

  return (
    <div className="p-6">
      <div className="mb-6 pr-14">
        <h1 className="text-xl font-semibold text-gray-900">Revision Requests</h1>
        <p className="mt-0.5 text-sm text-gray-500">{result.pagination.total} revision requests</p>
      </div>
      <RevisionsClient
        initialRevisions={revisions}
        initialTasks={serializedTasks}
        initialPagination={result?.pagination || { page: 1, limit: 50, total: revisions.length, totalPages: 1, hasMore: false }}
        initialPendingCount={pendingResult?.pagination?.total ?? 0}
        initialResolvedCount={resolvedResult?.pagination?.total ?? 0}
        role="admin"
        currentUid={session.uid}
      />
    </div>
  );
}

