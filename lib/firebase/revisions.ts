import { adminDb } from './admin';
import { Timestamp } from 'firebase-admin/firestore';
import type { RevisionLog, RevisionDecision } from '@/types';

const COL = 'revisionLog';

export async function adminCreateRevision(data: {
  taskId: string;
  requestedBy: string;
  requestedByName: string;
  requestedDate: string; // ISO
  reason: string;
}): Promise<RevisionLog> {
  const ref = adminDb.collection(COL).doc();
  const now = Timestamp.now();

  const revision: RevisionLog = {
    id:               ref.id,
    taskId:           data.taskId,
    requestedBy:      data.requestedBy,
    requestedByName:  data.requestedByName,
    requestedDate:    Timestamp.fromDate(new Date(data.requestedDate)),
    reason:           data.reason,
    status:           'pending',
    decidedBy:        null,
    decidedByName:    null,
    decidedAt:        null,
    createdAt:        now,
  };

  await ref.set(revision);
  return revision;
}

export async function adminDecideRevision(
  revisionId: string,
  decision: 'approved' | 'rejected',
  decidedBy: string,
  decidedByName: string,
): Promise<RevisionLog> {
  const ref = adminDb.collection(COL).doc(revisionId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Revision not found');

  const now = Timestamp.now();
  await ref.update({
    status:       decision,
    decidedBy,
    decidedByName,
    decidedAt:    now,
  });

  return { ...snap.data() as RevisionLog, status: decision, decidedBy, decidedByName, decidedAt: now };
}

export async function adminGetRevisionsByTask(taskId: string): Promise<RevisionLog[]> {
  const snap = await adminDb
    .collection(COL)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs
    .map(d => d.data() as RevisionLog)
    .filter(r => r.taskId === taskId);
}

export async function adminGetAllRevisions(): Promise<RevisionLog[]> {
  const snap = await adminDb
    .collection(COL)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map(d => d.data() as RevisionLog);
}

export async function adminGetPendingRevisionsByHandoff(handoffUid: string): Promise<RevisionLog[]> {
  // Get all pending revisions for tasks where this user is handoff
  const snap = await adminDb
    .collection(COL)
    .orderBy('createdAt', 'desc')
    .get();

  const revisions = snap.docs
    .map(d => d.data() as RevisionLog)
    .filter(r => r.status === 'pending');

  // Filter by checking if handoffUid matches the task
  const taskIds = Array.from(new Set(revisions.map(r => r.taskId)));
  if (taskIds.length === 0) return [];

  const taskSnaps = await Promise.all(
    taskIds.map(id => adminDb.collection('tasks').doc(id).get())
  );

  const handoffTaskIds = new Set(
    taskSnaps
      .filter(s => s.exists && s.data()!.handoffUid === handoffUid)
      .map(s => s.id)
  );

  return revisions.filter(r => handoffTaskIds.has(r.taskId));
}

export async function adminGetRevisionsForUser(uid: string): Promise<RevisionLog[]> {
  const revisions = await adminGetAllRevisions();
  const taskIds = Array.from(new Set(revisions.map(r => r.taskId)));
  if (taskIds.length === 0) return revisions.filter(r => r.requestedBy === uid);

  const taskSnaps = await Promise.all(
    taskIds.map(id => adminDb.collection('tasks').doc(id).get())
  );

  const handoffTaskIds = new Set(
    taskSnaps
      .filter(s => s.exists && s.data()!.handoffUid === uid)
      .map(s => s.id)
  );

  return revisions.filter(r => r.requestedBy === uid || handoffTaskIds.has(r.taskId));
}

export function serializeRevision(r: RevisionLog): Record<string, unknown> {
  const tsToIso = (ts: any) => ts ? ts.toDate().toISOString() : null;
  return {
    ...r,
    requestedDate: tsToIso(r.requestedDate),
    decidedAt:     tsToIso(r.decidedAt),
    createdAt:     tsToIso(r.createdAt),
  };
}
