import { adminDb } from './admin';
import { Timestamp } from 'firebase-admin/firestore';
import type { RevisionLog, RevisionDecision } from '@/types';
import { cachedFirestoreRead, clearFirestoreReadCache } from './readCache';
import { cfApi, hasCloudflareApi } from '@/lib/cloudflare/api';
import { cfRevision } from '@/lib/cloudflare/models';
import { adminGetTask } from './tasks';

const COL = 'revisionLog';
const DEFAULT_REVISION_READ_LIMIT = 300;
const MAX_REVISION_READ_LIMIT = 1000;

function clampRevisionLimit(limitCount = DEFAULT_REVISION_READ_LIMIT) {
  return Math.min(Math.max(limitCount, 1), MAX_REVISION_READ_LIMIT);
}

export async function adminCreateRevision(data: {
  taskId: string;
  requestedBy: string;
  requestedByName: string;
  requestedDate: string; // ISO
  reason: string;
}): Promise<RevisionLog> {
  if (hasCloudflareApi()) {
    return cfRevision(await cfApi('/revisions', {
      method: 'POST',
      body: JSON.stringify(data),
    }))!;
  }

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
  clearFirestoreReadCache('revisions:');
  return revision;
}

export async function adminDecideRevision(
  revisionId: string,
  decision: 'approved' | 'rejected',
  decidedBy: string,
  decidedByName: string,
): Promise<RevisionLog> {
  if (hasCloudflareApi()) {
    return cfRevision(await cfApi('/revisions', {
      method: 'PATCH',
      body: JSON.stringify({ revisionId, decision, decidedBy, decidedByName }),
    }))!;
  }

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

  clearFirestoreReadCache('revisions:');
  return { ...snap.data() as RevisionLog, status: decision, decidedBy, decidedByName, decidedAt: now };
}

export async function adminGetRevisionsByTask(taskId: string, limitCount = DEFAULT_REVISION_READ_LIMIT): Promise<RevisionLog[]> {
  if (hasCloudflareApi()) {
    const revisions = await cfApi<any[]>(`/revisions?taskId=${encodeURIComponent(taskId)}&limit=${encodeURIComponent(String(clampRevisionLimit(limitCount)))}`);
    return revisions.map(cfRevision).filter(Boolean) as RevisionLog[];
  }

  const readLimit = clampRevisionLimit(limitCount);
  return cachedFirestoreRead(`revisions:task:${taskId}:${readLimit}`, 2 * 60 * 1000, async () => {
    const snap = await adminDb
      .collection(COL)
      .where('taskId', '==', taskId)
      .orderBy('createdAt', 'desc')
      .limit(readLimit)
      .get();
    return snap.docs.map(d => d.data() as RevisionLog);
  });
}

export async function adminGetAllRevisions(options?: {
  status?: RevisionDecision;
  limit?: number | null;
}): Promise<RevisionLog[]> {
  if (hasCloudflareApi()) {
    const params = new URLSearchParams();
    if (options?.status) params.set('status', options.status);
    if (options?.limit !== null) params.set('limit', String(options?.limit ?? DEFAULT_REVISION_READ_LIMIT));
    const revisions = await cfApi<any[]>(`/revisions?${params.toString()}`);
    return revisions.map(cfRevision).filter(Boolean) as RevisionLog[];
  }

  const readLimit = options?.limit === null ? null : clampRevisionLimit(options?.limit);
  const key = `revisions:all:${options?.status ?? 'any'}:${readLimit ?? 'all'}`;

  return cachedFirestoreRead(key, 2 * 60 * 1000, async () => {
    let ref = options?.status
      ? adminDb.collection(COL).where('status', '==', options.status).orderBy('createdAt', 'desc')
      : adminDb.collection(COL).orderBy('createdAt', 'desc');

    if (readLimit) ref = ref.limit(readLimit);

    const snap = await ref.get();
    return snap.docs.map(d => d.data() as RevisionLog);
  });
}

export async function adminGetPendingRevisionsByHandoff(handoffUid: string): Promise<RevisionLog[]> {
  if (hasCloudflareApi()) {
    const revisions = await adminGetAllRevisions({ status: 'pending', limit: MAX_REVISION_READ_LIMIT });
    const pairs = await Promise.all(revisions.map(async revision => ({
      revision,
      task: await adminGetTask(revision.taskId),
    })));
    return pairs.filter(pair => pair.task?.handoffUid === handoffUid).map(pair => pair.revision);
  }

  const revisions = await adminGetAllRevisions({ status: 'pending', limit: MAX_REVISION_READ_LIMIT });

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
  if (hasCloudflareApi()) {
    const revisions = await adminGetAllRevisions({ limit: MAX_REVISION_READ_LIMIT });
    const pairs = await Promise.all(revisions.map(async revision => ({
      revision,
      task: await adminGetTask(revision.taskId),
    })));
    return pairs
      .filter(pair => pair.revision.requestedBy === uid || pair.task?.handoffUid === uid)
      .map(pair => pair.revision);
  }

  const revisions = await adminGetAllRevisions({ limit: MAX_REVISION_READ_LIMIT });
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
