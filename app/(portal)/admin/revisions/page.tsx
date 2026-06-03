import { adminGetPendingRevisionsByHandoff } from '@/lib/firebase/revisions';
import { getSession } from '@/lib/utils/auth';
import { adminGetAllTasks } from '@/lib/firebase/tasks';
import RevisionsClient from '@/components/shared/RevisionsClient';

export default async function AdminRevisionsPage() {
  const session = await getSession();
  if (!session) return null;

  // Admin sees all pending revisions
  const tasks = await adminGetAllTasks({ status: 'Delay Requested' });
  const taskIds = tasks.map(t => t.taskId);

  const { adminDb } = await import('@/lib/firebase/admin');
  const snap = await adminDb.collection('revisionLog')
    .orderBy('createdAt', 'desc')
    .get();

  const revisions = snap.docs.filter(d => d.data().status === 'pending').map(d => {
    const r = d.data();
    return {
      ...r,
      requestedDate: r.requestedDate?.toDate().toISOString() ?? null,
      decidedAt:     r.decidedAt?.toDate().toISOString() ?? null,
      createdAt:     r.createdAt?.toDate().toISOString() ?? null,
    };
  });

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
        <p className="text-sm text-gray-500 mt-0.5">{revisions.length} pending requests</p>
      </div>
      <RevisionsClient revisions={revisions} tasks={serializedTasks} role="admin" />
    </div>
  );
}
