import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  query, where, orderBy, limit, runTransaction,
} from 'firebase/firestore';
import { Timestamp as AdminTimestamp, type Query } from 'firebase-admin/firestore';
import { db } from './client';
import { adminDb } from './admin';
import type { Task, TaskStatus, CreateTaskInput } from '@/types';
import { adminGetUserByUid } from './users';
import { handleFirestoreReadError } from './errors';

const COL      = 'tasks';
const COUNTERS = 'counters';
const DEFAULT_TASK_READ_LIMIT = 750;

function sortNewestFirst(tasks: Task[]) {
  return tasks.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
}

function normalizeKey(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function nameVariants(value: unknown) {
  const raw = String(value ?? '').trim();
  const lower = raw.toLowerCase();
  const title = lower.replace(/\b\w/g, char => char.toUpperCase());
  return Array.from(new Set([raw, lower, title].filter(Boolean)));
}

function pick(data: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') return data[key];
  }
  return null;
}

function toTimestamp(value: any): AdminTimestamp | null {
  if (!value) return null;
  if (value.toDate && value.toMillis) return value as AdminTimestamp;
  if (value instanceof Date) return AdminTimestamp.fromDate(value);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : AdminTimestamp.fromDate(date);
}

function normalizeStatus(value: unknown): TaskStatus {
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'completed' || text === 'complete' || text === 'done') return 'Completed';
  if (text === 'verified') return 'Verified';
  if (text === 'overdue') return 'Overdue';
  if (text === 'in progress' || text === 'in-progress') return 'In Progress';
  if (text === 'delay requested' || text === 'shifted') return 'Delay Requested';
  return 'Pending Accept';
}

function normalizePriority(value: unknown): Task['priority'] {
  const text = String(value ?? '').toLowerCase();
  if (text.includes('high') || text.includes('red')) return 'High';
  if (text.includes('low') || text.includes('green')) return 'Low';
  return 'Medium';
}

function normalizeCategory(value: unknown): Task['category'] {
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'daily') return 'Daily';
  if (text === 'weekly') return 'Weekly';
  if (text === 'monthly') return 'Monthly';
  return 'One Time';
}

function normalizeTaskDoc(id: string, data: Record<string, any>): Task {
  const assigneeName = String(pick(data, ['assignedToName', 'name', 'Name', 'name ']) ?? 'Unassigned').trim();
  const assigneeUid = String(pick(data, ['assignedTo', 'assignedToUid', 'uid']) ?? `import-user-${normalizeKey(assigneeName)}`);
  const handoffName = String(pick(data, ['handoffName', 'checkerName', 'Checked By Auditor', 'createdByName']) ?? data.createdByName ?? 'Admin').trim();
  const taskId = String(pick(data, ['taskId', 'Task ID', 'TaskID']) ?? id);
  const createdAt = toTimestamp(pick(data, ['createdAt', 'Task Assgined Date', 'Task Assigned Date', 'First Date', 'firstDate'])) ?? AdminTimestamp.now();
  const endDate = toTimestamp(pick(data, ['endDate', 'Final Date', 'Target Date', 'finalDate']));
  const startDate = toTimestamp(pick(data, ['startDate', 'Acutal Start Date', 'Actual Start Date', 'First Date', 'firstDate']));

  return {
    taskId,
    description: String(pick(data, ['description', 'Task', 'Task Description', 'task']) ?? '').trim(),
    assignedTo: assigneeUid,
    assignedToName: assigneeName,
    assignedToWa: String(pick(data, ['assignedToWa', 'waNumber', 'Mobile No']) ?? ''),
    createdBy: String(pick(data, ['createdBy', 'fromUid']) ?? 'import'),
    createdByName: String(pick(data, ['createdByName', 'From']) ?? 'Import'),
    handoffUid: String(pick(data, ['handoffUid', 'checkerUid']) ?? 'import-checker'),
    handoffName,
    handoffWa: String(pick(data, ['handoffWa', 'checkerWa']) ?? ''),
    category: normalizeCategory(pick(data, ['category', 'Category'])),
    priority: normalizePriority(pick(data, ['priority', 'Priority', 'Priority '])),
    status: normalizeStatus(pick(data, ['status', 'Status', 'Status of Tasks'])),
    department: String(pick(data, ['department', 'Department']) ?? ''),
    startDate,
    endDate,
    delayedDate: toTimestamp(pick(data, ['delayedDate', 'Revision 1', 'Revision 2'])),
    delayReason: pick(data, ['delayReason', 'Remarks']) ? String(pick(data, ['delayReason', 'Remarks'])) : null,
    revisionStatus: data.revisionStatus ?? 'none',
    notes: pick(data, ['notes', 'NOTES ', 'NOTES', 'Remarks']) ? String(pick(data, ['notes', 'NOTES ', 'NOTES', 'Remarks'])) : null,
    acceptedAt: toTimestamp(data.acceptedAt),
    completedAt: toTimestamp(data.completedAt),
    verifiedAt: toTimestamp(data.verifiedAt),
    createdAt,
    updatedAt: toTimestamp(data.updatedAt) ?? createdAt,
  };
}

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
  creatorFallback?: { name: string; waNumber?: string; department?: string },
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

  const fallbackHandoff = input.handoffUid === creatorUid && creatorFallback
    ? {
      uid: creatorUid,
      name: creatorFallback.name,
      waNumber: creatorFallback.waNumber ?? '',
      department: creatorFallback.department ?? '',
    }
    : null;
  const handoffUser = handoff ?? (input.handoffUid === creatorUid ? creator : null) ?? fallbackHandoff;

  if (!handoffUser) {
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
    handoffUid:     handoffUser.uid,
    handoffName:    handoffUser.name,
    handoffWa:      handoffUser.waNumber,
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
  return snap.exists ? normalizeTaskDoc(snap.id, snap.data() as Record<string, any>) : null;
}

export async function adminGetTasksByAssignee(uid: string): Promise<Task[]> {
  try {
    const user = await adminGetUserByUid(uid);
    const queries: Query[] = [
      adminDb.collection(COL).where('assignedTo', '==', uid).limit(DEFAULT_TASK_READ_LIMIT),
    ];

    if (user?.name) {
      for (const name of nameVariants(user.name)) {
        queries.push(
          adminDb.collection(COL).where('assignedToName', '==', name).limit(DEFAULT_TASK_READ_LIMIT),
          adminDb.collection(COL).where('name', '==', name).limit(DEFAULT_TASK_READ_LIMIT),
          adminDb.collection(COL).where('Name', '==', name).limit(DEFAULT_TASK_READ_LIMIT),
          adminDb.collection(COL).where('name ', '==', name).limit(DEFAULT_TASK_READ_LIMIT),
        );
      }
    }

    const snaps = await Promise.all(queries.map(ref => ref.get()));
    const byId = new Map<string, Task>();
    snaps.forEach(snap => {
      snap.docs.forEach(doc => byId.set(doc.id, normalizeTaskDoc(doc.id, doc.data())));
    });

    return sortNewestFirst(Array.from(byId.values())).slice(0, DEFAULT_TASK_READ_LIMIT);
  } catch (err) {
    handleFirestoreReadError(`adminGetTasksByAssignee(${uid})`, err);
    return [];
  }
}

export async function adminGetTasksByHandoff(uid: string): Promise<Task[]> {
  try {
    const snap = await adminDb
      .collection(COL)
      .where('handoffUid', '==', uid)
      .limit(DEFAULT_TASK_READ_LIMIT)
      .get();
    return sortNewestFirst(snap.docs.map(d => normalizeTaskDoc(d.id, d.data())));
  } catch (err) {
    handleFirestoreReadError(`adminGetTasksByHandoff(${uid})`, err);
    return [];
  }
}

export async function adminGetAllTasks(filters?: {
  status?: TaskStatus;
  department?: string;
  limit?: number;
}): Promise<Task[]> {
  try {
    const readLimit = filters?.limit ?? DEFAULT_TASK_READ_LIMIT;
    let ref: Query = adminDb.collection(COL);

    if (filters?.department) {
      ref = ref.where('department', '==', filters.department);
    }

    if (filters?.status) {
      ref = ref.where('status', '==', filters.status);
    }

    if (!filters?.department && !filters?.status) {
      ref = ref.limit(readLimit);
    }

    const snap = await ref.get();
    let tasks = sortNewestFirst(snap.docs.map(d => normalizeTaskDoc(d.id, d.data())));
    if (filters?.department || filters?.status) {
      tasks = tasks.slice(0, readLimit);
    }
    return tasks;
  } catch (err) {
    handleFirestoreReadError('adminGetAllTasks', err);
    return [];
  }
}

export async function adminGetOverdueTasks(): Promise<Task[]> {
  const now = AdminTimestamp.now();
  const snap = await adminDb
    .collection(COL)
    .orderBy('endDate', 'asc')
    .get();
  return snap.docs
    .map(d => normalizeTaskDoc(d.id, d.data()))
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
    .map(d => normalizeTaskDoc(d.id, d.data()))
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
    where('assignedTo', '==', uid),
  );
  const snap = await getDocs(q);
  return sortNewestFirst(snap.docs.map(d => normalizeTaskDoc(d.id, d.data())));
}

export async function getDepartmentTasks(department: string): Promise<Task[]> {
  const q = query(
    collection(db, COL),
    where('department', '==', department),
  );
  const snap = await getDocs(q);
  return sortNewestFirst(snap.docs.map(d => normalizeTaskDoc(d.id, d.data())));
}

export async function getHandoffTasks(uid: string): Promise<Task[]> {
  const q = query(
    collection(db, COL),
    where('handoffUid', '==', uid),
  );
  const snap = await getDocs(q);
  return sortNewestFirst(snap.docs.map(d => normalizeTaskDoc(d.id, d.data())));
}
