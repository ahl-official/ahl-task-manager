import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './admin';
import type { UserScore, AppLog, LogType } from '@/types';

// ─── Scores ─────────────────────────────────────────────────────────────────

const SCORES = 'scores';

export async function adminIncrementScore(
  uid: string,
  field: 'tasksAssigned' | 'tasksCompleted' | 'onTimeCount' | 'lateCount',
): Promise<void> {
  const ref = adminDb.collection(SCORES).doc(uid);
  const snap = await ref.get();

  if (!snap.exists) {
    // Initialize score doc if missing
    const userSnap = await adminDb.collection('users').doc(uid).get();
    const user = userSnap.data();
    await ref.set({
      uid,
      name:           user?.name ?? '',
      department:     user?.department ?? '',
      waNumber:       user?.waNumber ?? '',
      tasksAssigned:  0,
      tasksCompleted: 0,
      onTimeCount:    0,
      lateCount:      0,
      monthlyScore:   0,
      lastUpdated:    Timestamp.now(),
    });
  }

  await ref.update({
    [field]:     FieldValue.increment(1),
    lastUpdated: Timestamp.now(),
  });

  // Recalculate monthlyScore
  const updated = await ref.get();
  const data = updated.data()!;
  const assigned  = data.tasksAssigned || 1;
  const completed = data.tasksCompleted || 0;
  const onTime    = data.onTimeCount || 0;
  const score     = Math.round((onTime / assigned) * 100);

  await ref.update({ monthlyScore: score });
}

export async function adminGetAllScores(): Promise<UserScore[]> {
  const snap = await adminDb.collection(SCORES).orderBy('monthlyScore', 'desc').get();
  return snap.docs.map(d => d.data() as UserScore);
}

export async function adminGetScore(uid: string): Promise<UserScore | null> {
  const snap = await adminDb.collection(SCORES).doc(uid).get();
  return snap.exists ? snap.data() as UserScore : null;
}

export function serializeScore(s: UserScore): Record<string, unknown> {
  return {
    ...s,
    lastUpdated: (s.lastUpdated as Timestamp).toDate().toISOString(),
  };
}

// ─── Logs ────────────────────────────────────────────────────────────────────

const LOGS = 'logs';

export async function adminLog(
  type: LogType,
  message: string,
  opts?: { taskId?: string; uid?: string; meta?: Record<string, unknown> },
): Promise<void> {
  try {
    const ref = adminDb.collection(LOGS).doc();
    await ref.set({
      id:        ref.id,
      type,
      taskId:    opts?.taskId ?? null,
      uid:       opts?.uid ?? null,
      message,
      meta:      opts?.meta ?? {},
      createdAt: Timestamp.now(),
    });
    console.log(`[${type}] ${message}`, opts?.meta ?? '');
  } catch (err) {
    console.error('Failed to write log', err);
  }
}
