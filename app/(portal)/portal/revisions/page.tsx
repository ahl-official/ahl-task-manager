import { getSession } from '@/lib/utils/auth';
import { adminGetPendingRevisionsByHandoff } from '@/lib/firebase/revisions';
import { adminGetTasksByHandoff } from '@/lib/firebase/tasks';
import RevisionsClient from '@/components/shared/RevisionsClient';

export default async function PortalRevisionsPage() {
  const session = await getSession();
  if (!session) return null;

  const [revisions, tasks] = await Promise.all([
    adminGetPendingRevisionsByHandoff(session.uid),
    adminGetTasksByHandoff(session.uid),
  ]);

  const serializedRevisions = revisions.map(r => ({
    ...r,
    requestedDate: r.requestedDate?.toDate().toISOString() ?? null,
    decidedAt:     r.decidedAt?.toDate().toISOString() ?? null,
    createdAt:     r.createdAt?.toDate().toISOString() ?? null,
  }));

  const serializedTasks = tasks.map(t => ({
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
        <h1 className="text-xl font-semibold text-gray-900">Revision Requests</h1>
        <p className="text-sm text-gray-500 mt-0.5">{revisions.length} pending decisions</p>
      </div>
      <RevisionsClient revisions={serializedRevisions} tasks={serializedTasks} role="user" />
    </div>
  );
}
