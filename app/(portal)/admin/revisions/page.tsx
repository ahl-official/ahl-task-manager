import { adminGetAllRevisions } from '@/lib/firebase/revisions';
import { getSession } from '@/lib/utils/auth';
import { adminGetAllTasks } from '@/lib/firebase/tasks';
import RevisionsClient from '@/components/shared/RevisionsClient';

export default async function AdminRevisionsPage() {
  const session = await getSession();
  if (!session) return null;

  const [tasks, allRevisions] = await Promise.all([
    adminGetAllTasks(),
    adminGetAllRevisions(),
  ]);

  const revisions = allRevisions.map(r => ({
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
        <p className="text-sm text-gray-500 mt-0.5">{revisions.length} revision requests</p>
      </div>
      <RevisionsClient revisions={revisions} tasks={serializedTasks} role="admin" currentUid={session.uid} />
    </div>
  );
}

