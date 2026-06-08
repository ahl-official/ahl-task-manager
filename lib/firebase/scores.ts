import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './admin';
import type { AHLUser, UserScore, AppLog, LogType } from '@/types';
import { handleFirestoreReadError } from './errors';
import { cachedFirestoreRead, clearFirestoreReadCache } from './readCache';
import { adminGetAllUsers } from './users';

// ─── Scores ─────────────────────────────────────────────────────────────────

const SCORES = 'scores';

function blankScoreForUser(user: AHLUser): UserScore {
  return {
    uid: user.uid,
    name: user.name,
    department: user.department,
    waNumber: user.waNumber,
    tasksAssigned: 0,
    tasksCompleted: 0,
    onTimeCount: 0,
    lateCount: 0,
    monthlyScore: 0,
    lastUpdated: Timestamp.now(),
  };
}

function normalizeScore(score: Partial<UserScore>, user?: AHLUser): UserScore {
  const tasksAssigned = Number(score.tasksAssigned ?? 0);
  const onTimeCount = Number(score.onTimeCount ?? 0);
  const denominator = Math.max(tasksAssigned, 1);
  const monthlyScore = Math.min(100, Math.max(0, Math.round((onTimeCount / denominator) * 100)));

  return {
    uid: score.uid ?? user?.uid ?? '',
    name: user?.name ?? score.name ?? '',
    department: user?.department ?? score.department ?? '',
    waNumber: user?.waNumber ?? score.waNumber ?? '',
    tasksAssigned,
    tasksCompleted: Number(score.tasksCompleted ?? 0),
    onTimeCount,
    lateCount: Number(score.lateCount ?? 0),
    monthlyScore,
    lastUpdated: score.lastUpdated ?? Timestamp.now(),
  };
}

export async function adminIncrementScore(
  uid: string,
  field: 'tasksAssigned' | 'tasksCompleted' | 'onTimeCount' | 'lateCount',
): Promise<void> {
  const ref = adminDb.collection(SCORES).doc(uid);
  const snap = await ref.get();

  const userSnap = await adminDb.collection('users').doc(uid).get();
  const user = userSnap.data() as AHLUser | undefined;

  if (!snap.exists && user) await ref.set(blankScoreForUser(user));
  if (!snap.exists && !user) {
    await ref.set({
      uid,
      name: '',
      department: '',
      waNumber: '',
      tasksAssigned: 0,
      tasksCompleted: 0,
      onTimeCount: 0,
      lateCount: 0,
      monthlyScore: 0,
      lastUpdated: Timestamp.now(),
    });
  }

  await ref.update({
    [field]:     FieldValue.increment(1),
    ...(user ? {
      name: user.name,
      department: user.department,
      waNumber: user.waNumber,
    } : {}),
    lastUpdated: Timestamp.now(),
  });

  // Recalculate monthlyScore
  const updated = await ref.get();
  const data = updated.data()!;
  const assigned = Math.max(Number(data.tasksAssigned ?? 0), 1);
  const onTime = Number(data.onTimeCount ?? 0);
  const score = Math.min(100, Math.max(0, Math.round((onTime / assigned) * 100)));

  await ref.update({ monthlyScore: score });
  clearFirestoreReadCache('scores:');
}

export async function adminGetAllScores(): Promise<UserScore[]> {
  try {
    return await cachedFirestoreRead('scores:all', 2 * 60 * 1000, async () => {
      const [scoreSnap, users] = await Promise.all([
        adminDb.collection(SCORES).get(),
        adminGetAllUsers(),
      ]);
      const usersByUid = new Map(users.map(user => [user.uid, user]));
      const scoresByUid = new Map(scoreSnap.docs.map(doc => [doc.id, doc.data() as UserScore]));

      const hydrated = users
        .filter(user => user.isActive)
        .map(user => normalizeScore(scoresByUid.get(user.uid) ?? { uid: user.uid }, user));

      scoreSnap.docs.forEach(doc => {
        if (!usersByUid.has(doc.id)) hydrated.push(normalizeScore(doc.data() as UserScore));
      });

      return hydrated.sort((a, b) => b.monthlyScore - a.monthlyScore);
    });
  } catch (err) {
    handleFirestoreReadError('adminGetAllScores', err);
    return [];
  }
}

export async function adminGetScore(uid: string): Promise<UserScore | null> {
  try {
    return await cachedFirestoreRead(`scores:user:${uid}`, 2 * 60 * 1000, async () => {
      const [scoreSnap, userSnap] = await Promise.all([
        adminDb.collection(SCORES).doc(uid).get(),
        adminDb.collection('users').doc(uid).get(),
      ]);
      const user = userSnap.exists ? userSnap.data() as AHLUser : undefined;
      if (scoreSnap.exists) return normalizeScore(scoreSnap.data() as UserScore, user);
      return user ? blankScoreForUser(user) : null;
    });
  } catch (err) {
    handleFirestoreReadError(`adminGetScore(${uid})`, err);
    return null;
  }
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
