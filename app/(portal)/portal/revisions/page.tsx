import { getSession } from '@/lib/utils/auth';
import { adminGetPaginatedRevisions } from '@/lib/firebase/revisions';
import { adminGetTasksByIds, serializeTask } from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import RevisionsClient from '@/components/shared/RevisionsClient';
import { filterTasksForSession, filterUsersForSession } from '@/lib/utils/access';
import { hydrateTasksWithUsers } from '@/lib/utils/taskHydration';

export default async function PortalRevisionsPage() {
  const session = await getSession();
  if (!session) return null;

  const visibleForUid = session.role === 'leader' ? undefined : session.uid;
  const department = session.role === 'leader' ? session.department : undefined;

  const [result, allUsers, pendingResult, resolvedResult] = await Promise.all([
    adminGetPaginatedRevisions({ page: 1, limit: 50, visibleForUid, department }),
    adminGetAllUsers(),
    adminGetPaginatedRevisions({ page: 1, limit: 1, status: 'pending', visibleForUid, department }),
    adminGetPaginatedRevisions({ page: 1, limit: 1, status: 'resolved', visibleForUid, department }),
  ]);
  const allTasks = await adminGetTasksByIds(result.items.map(revision => revision.taskId));
  const visibleUsers = filterUsersForSession(session, allUsers);
  const tasks = filterTasksForSession(session, hydrateTasksWithUsers(allTasks, visibleUsers));
  const serializedTasks = tasks.map(serializeTask);

  const serializedRevisions = result.items.map(r => ({
    ...r,
    requestedDate: r.requestedDate?.toDate().toISOString() ?? null,
    decidedAt:     r.decidedAt?.toDate().toISOString() ?? null,
    createdAt:     r.createdAt?.toDate().toISOString() ?? null,
  }));

  return (
    <div className="p-6">
      <div className="mb-6 pr-14">
        <h1 className="text-xl font-semibold text-gray-900">Revision Requests</h1>
        <p className="mt-0.5 text-sm text-gray-500">{result.pagination.total} submitted or pending requests</p>
      </div>
      <RevisionsClient
        initialRevisions={serializedRevisions}
        initialTasks={serializedTasks}
        initialPagination={result?.pagination || { page: 1, limit: 50, total: serializedRevisions.length, totalPages: 1, hasMore: false }}
        initialPendingCount={pendingResult?.pagination?.total ?? 0}
        initialResolvedCount={resolvedResult?.pagination?.total ?? 0}
        role="user"
        currentUid={session.uid}
      />
    </div>
  );
}

