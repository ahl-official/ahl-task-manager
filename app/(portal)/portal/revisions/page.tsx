import { getSession } from '@/lib/utils/auth';
import { adminGetAllRevisions, adminGetRevisionsForUser } from '@/lib/firebase/revisions';
import { adminGetAllTasks } from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import RevisionsClient from '@/components/shared/RevisionsClient';
import { filterTasksForSession, filterUsersForSession } from '@/lib/utils/access';
import { hydrateTasksWithUsers } from '@/lib/utils/taskHydration';

export default async function PortalRevisionsPage() {
  const session = await getSession();
  if (!session) return null;

  const [revisions, allTasks, allUsers] = await Promise.all([
    session.role === 'leader' ? adminGetAllRevisions() : adminGetRevisionsForUser(session.uid),
    adminGetAllTasks(),
    adminGetAllUsers(),
  ]);
  const visibleUsers = filterUsersForSession(session, allUsers);
  const tasks = filterTasksForSession(session, hydrateTasksWithUsers(allTasks, visibleUsers));
  const visibleTaskIds = new Set(tasks.map(task => task.taskId));
  const visibleRevisions = revisions.filter(revision => visibleTaskIds.has(revision.taskId));

  const serializedRevisions = visibleRevisions.map(r => ({
    ...r,
    requestedDate: r.requestedDate?.toDate().toISOString() ?? null,
    decidedAt:     r.decidedAt?.toDate().toISOString() ?? null,
    createdAt:     r.createdAt?.toDate().toISOString() ?? null,
  }));

  const serializedTasks = tasks.map(t => ({
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

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Revision Requests</h1>
        <p className="text-sm text-gray-500 mt-0.5">{visibleRevisions.length} submitted or pending requests</p>
      </div>
      <RevisionsClient revisions={serializedRevisions} tasks={serializedTasks} role="user" currentUid={session.uid} />
    </div>
  );
}

