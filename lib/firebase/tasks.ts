import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  query, where, orderBy, limit, runTransaction,
} from 'firebase/firestore';
import { Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { db } from './client';
import { adminDb } from './admin';
import type { Task, TaskStatus, CreateTaskInput } from '@/types';
import { adminGetUserByUid } from './users';

const COL      = 'tasks';
const COUNTERS = 'counters';

// ─── ID generation ───────────────────────────────────────────────────────────

export async function generateTaskId(): Promise<string> {
  const counterRef = adminDb.collection(COUNTERS).doc('tasks');
  let newId = 1;

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    newId = snap.exists ? (snap.data()!.current as number) + 1 : 1;
    tx.set(counterRef, { current: newId });
  });

  return `T-${String(newId).padStart(4, '0')}`;
}

// ─── Serialize Timestamps for client ────────────────────────────────────────

export function serializeTask(task: Task): Record<string, unknown> {
  const tsToIso = (ts: { toDate: () => Date } | null) => ts ? ts.toDate().toISOString() : null;
  return {
    ...task,
    startDate:   tsToIso(task.startDate),
    endDate:     tsToIso(task.endDate),
    delayedDate: tsToIso(task.delayedDate),
    acceptedAt:  tsToIso(task.acceptedAt),
    completedAt: tsToIso(task.completedAt),
    verifiedAt:  tsToIso(task.verifiedAt),
    createdAt:   task.createdAt.toDate().toISOString(),
    updatedAt:   task.updatedAt.toDate().toISOString(),
  };
}

// ─── Admin SDK writes ────────────────────────────────────────────────────────

export async function adminCreateTask(
  input: CreateTaskInput,
  creatorUid: string,
  creatorFallback?: { name: string },
): Promise<Task> {
  const [taskId, creator, assignee, handoff] = await Promise.all([
    generateTaskId(),
    adminGetUserByUid(creatorUid),
    adminGetUserByUid(input.assignedTo),
    adminGetUserByUid(input.handoffUid),
  ]);

  if (!assignee) {
    throw new Error(`Selected assignee was not found: ${input.assignedTo}`);
  }

  if (!handoff) {
    throw new Error(`Selected checker was not found: ${input.handoffUid}`);
  }

  const now = AdminTimestamp.now();
  const creatorName = creator?.name ?? creatorFallback?.name ?? 'Admin';
  const task: Task = {
    taskId,
    description:    input.description,
    assignedTo:     assignee.uid,
    assignedToName: assignee.name,
    assignedToWa:   assignee.waNumber,
    createdBy:      creator?.uid ?? creatorUid,
    createdByName:  creatorName,
    handoffUid:     handoff.uid,
    handoffName:    handoff.name,
    handoffWa:      handoff.waNumber,
    category:       input.category,
    priority:       input.priority,
    status:         'Pending Accept',
    department:     assignee.department,
    startDate:      input.startDate ? AdminTimestamp.fromDate(new Date(input.startDate)) : null,
    endDate:        input.endDate ? AdminTimestamp.fromDate(new Date(input.endDate)) : null,
    delayedDate:    null,
    delayReason:    null,
    revisionStatus: 'none',
    notes:          input.notes ?? null,
    acceptedAt:     null,
    completedAt:    null,
    verifiedAt:     null,
    createdAt:      now,
    updatedAt:      now,
  };

  await adminDb.collection(COL).doc(taskId).set(task);
  return task;
}

export async function adminUpdateTaskStatus(
  taskId: string,
  status: TaskStatus,
  extra?: Partial<Task>,
): Promise<void> {
  await adminDb.collection(COL).doc(taskId).update({
    status,
    updatedAt: AdminTimestamp.now(),
    ...extra,
  });
}

export async function adminGetTask(taskId: string): Promise<Task | null> {
  const snap = await adminDb.collection(COL).doc(taskId).get();
  return snap.exists ? (snap.data() as Task) : null;
}

export async function adminGetTasksByAssignee(uid: string): Promise<Task[]> {
  const snap = await adminDb
    .collection(COL)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs
    .map(d => d.data() as Task)
    .filter(t => t.assignedTo === uid);
}

export async function adminGetTasksByHandoff(uid: string): Promise<Task[]> {
  const snap = await adminDb
    .collection(COL)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs
    .map(d => d.data() as Task)
    .filter(t => t.handoffUid === uid);
}

export async function adminGetAllTasks(filters?: {
  status?: TaskStatus;
  department?: string;
}): Promise<Task[]> {
  const snap = await adminDb.collection(COL).orderBy('createdAt', 'desc').get();
  let tasks = snap.docs.map(d => d.data() as Task);

  if (filters?.status) {
    tasks = tasks.filter(t => t.status === filters.status);
  }

  if (filters?.department) {
    tasks = tasks.filter(t => t.department === filters.department);
  }

  return tasks;
}

export async function adminGetOverdueTasks(): Promise<Task[]> {
  const now = AdminTimestamp.now();
  const snap = await adminDb
    .collection(COL)
    .orderBy('endDate', 'asc')
    .get();
  return snap.docs
    .map(d => d.data() as Task)
    .filter(t =>
      t.endDate &&
      t.endDate.toMillis() < now.toMillis() &&
      ['Pending Accept', 'In Progress'].includes(t.status)
    );
}

export async function adminGetTasksDueWithinHours(hours: number): Promise<Task[]> {
  const now  = new Date();
  const from = AdminTimestamp.fromDate(now);
  const to   = AdminTimestamp.fromDate(new Date(now.getTime() + hours * 60 * 60 * 1000));

  const snap = await adminDb
    .collection(COL)
    .orderBy('endDate', 'asc')
    .get();
  return snap.docs
    .map(d => d.data() as Task)
    .filter(t =>
      t.endDate &&
      t.endDate.toMillis() >= from.toMillis() &&
      t.endDate.toMillis() <= to.toMillis() &&
      ['Pending Accept', 'In Progress'].includes(t.status)
    );
}

// ─── Client SDK reads ────────────────────────────────────────────────────────

export async function getMyTasks(uid: string): Promise<Task[]> {
  const q = query(
    collection(db, COL),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as Task).filter(t => t.assignedTo === uid);
}

export async function getDepartmentTasks(department: string): Promise<Task[]> {
  const q = query(
    collection(db, COL),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as Task).filter(t => t.department === department);
}

export async function getHandoffTasks(uid: string): Promise<Task[]> {
  const q = query(
    collection(db, COL),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as Task).filter(t => t.handoffUid === uid);
}
