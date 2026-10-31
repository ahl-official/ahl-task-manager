import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  query, where, orderBy, limit, runTransaction,
} from 'firebase/firestore';
import { Timestamp as AdminTimestamp, type Query } from 'firebase-admin/firestore';
import { db } from './client';
import { adminDb } from './admin';
import type { Task, TaskSerialized, TaskStatus, CreateTaskInput } from '@/types';
import { adminGetUserByUid } from './users';
import { handleFirestoreReadError } from './errors';
import {
  cachedFirestoreRead,
  clearFirestoreReadCache,
  addTaskToReadCache,
  updateTaskInReadCache,
  removeTaskFromReadCache,
  LONG_READ_CACHE_TTL_MS,
} from './readCache';
import { cfApi, hasCloudflareApi } from '@/lib/cloudflare/api';
import { cfTask, cfTimestampFields } from '@/lib/cloudflare/models';

const COL      = 'tasks';
const COUNTERS = 'counters';
const DEFAULT_TASK_READ_LIMIT = 100;
const MAX_TASK_READ_LIMIT = 100;
const MAX_SEARCH_READ_LIMIT = 5000;
const REMINDER_TASK_READ_LIMIT = 500;
const ACTIVE_TASK_STATUSES: TaskStatus[] = ['Pending Accept', 'In Progress', 'Delay Requested', 'Overdue'];
const DAY_MS = 24 * 60 * 60 * 1000;

function sortNewestFirst(tasks: Task[]) {
  return tasks.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatMonthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

function getBusinessWeekPeriod(dateInput: Date) {
  const date = startOfUtcDay(dateInput);
  const day = date.getUTCDay();
  const daysSinceWednesday = (day - 3 + 7) % 7;
  const weekStart = addDays(date, -daysSinceWednesday);
  const weekEnd = addDays(weekStart, 6);
  const year = weekStart.getUTCFullYear();
  const jan1 = startOfUtcDay(new Date(Date.UTC(year, 0, 1)));
  const firstWeekStart = addDays(jan1, -((jan1.getUTCDay() - 3 + 7) % 7));
  const weekNumber = Math.floor((weekStart.getTime() - firstWeekStart.getTime()) / (7 * DAY_MS)) + 1;

  return {
    weekKey: `${year}-W${String(weekNumber).padStart(2, '0')}`,
    weekStart,
    weekEnd,
  };
}

function periodFieldsForDate(dateInput: Date) {
  const date = startOfUtcDay(dateInput);
  const week = getBusinessWeekPeriod(date);
  return {
    dayKey: formatDateKey(date),
    weekKey: week.weekKey,
    weekStart: AdminTimestamp.fromDate(week.weekStart),
    weekEnd: AdminTimestamp.fromDate(week.weekEnd),
    monthKey: formatMonthKey(date),
  };
}

function taskPeriodFields(endDate: AdminTimestamp | null, completedAt: AdminTimestamp | null, startDate: AdminTimestamp | null, createdAt: AdminTimestamp) {
  const periodDate = endDate?.toDate() ?? completedAt?.toDate() ?? startDate?.toDate() ?? createdAt.toDate();
  return periodFieldsForDate(periodDate);
}

function normalizeKey(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function fieldKey(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameAliases(value: unknown) {
  const raw = String(value ?? '').trim();
  const lower = raw.toLowerCase();
  const title = lower.replace(/\b\w/g, char => char.toUpperCase());
  const first = raw.split(/[\s_-]+/).find(Boolean) ?? '';
  const firstLower = first.toLowerCase();
  const firstTitle = firstLower.replace(/\b\w/g, char => char.toUpperCase());
  return Array.from(new Set([raw, lower, title, first, firstLower, firstTitle].filter(Boolean)));
}

function pick(data: Record<string, any>, keys: string[]) {
  const normalized = new Map<string, any>();
  for (const [key, value] of Object.entries(data)) {
    normalized.set(fieldKey(key), value);
  }

  for (const key of keys) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') return data[key];
    const value = normalized.get(fieldKey(key));
    if (value !== undefined && value !== null && value !== '') return value;
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
  if (text.startsWith('shifted')) {
    if (text.includes('completed')) return 'Shifted (Completed)';
    if (text.includes('verified')) return 'Shifted (Verified)';
    if (text.includes('in progress') || text.includes('in-progress')) return 'Shifted (In Progress)';
    if (text.includes('pending')) return 'Shifted (Pending Accept)';
    if (text.includes('overdue')) return 'Shifted (Overdue)';
    if (text.includes('delay')) return 'Shifted (Delay Requested)';
    return 'Shifted';
  }
  if (text === 'completed' || text === 'complete' || text === 'done') return 'Completed';
  if (text === 'verified') return 'Verified';
  if (text === 'overdue') return 'Overdue';
  if (text === 'dead') return 'Dead';
  if (text === 'in progress' || text === 'in-progress') return 'In Progress';
  if (text === 'delay requested') return 'Delay Requested';
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
  const assigneeName = String(pick(data, ['assignedToName', 'name', 'Name', 'name ', 'To', 'Person Name', 'Doer Name']) ?? 'Unassigned').trim();
  const assigneeUid = String(pick(data, ['assignedTo', 'assignedToUid', 'uid', 'toUid']) ?? `import-user-${normalizeKey(assigneeName)}`);
  const handoffName = String(pick(data, ['handoffName', 'checkerName', 'Checked By Auditor', 'createdByName', 'From']) ?? data.createdByName ?? 'Admin').trim();
  const taskId = String(pick(data, ['taskId', 'Task ID', 'TaskID']) ?? id);
  const createdAt = toTimestamp(pick(data, ['createdAt', 'Task Assgined Date', 'Task Assigned Date', 'Task Date', 'First Date', 'firstDate'])) ?? AdminTimestamp.now();
  const endDate = toTimestamp(pick(data, ['endDate', 'Final Date', 'Target Date', 'First Comitted Date', 'finalDate']));
  const startDate = toTimestamp(pick(data, ['startDate', 'Acutal Start Date', 'Actual Start Date', 'Task Date', 'First Date', 'firstDate']));

  return {
    taskId,
    description: String(pick(data, ['description', 'Task', 'Task Description', 'task']) ?? '').trim(),
    assignedTo: assigneeUid,
    assignedToName: assigneeName,
    assignedToWa: String(pick(data, ['assignedToWa', 'waNumber', 'Mobile No', 'Phone No', 'Contact no', 'Contact No']) ?? ''),
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
    delayedDate: toTimestamp(pick(data, ['delayedDate', 'Revision 2', 'Revision 1'])),
    delayReason: pick(data, ['delayReason', 'Remarks']) ? String(pick(data, ['delayReason', 'Remarks'])) : null,
    revisionStatus: data.revisionStatus ?? 'none',
    notes: pick(data, ['notes', 'NOTES ', 'NOTES', 'Remarks', 'Date remark']) ? String(pick(data, ['notes', 'NOTES ', 'NOTES', 'Remarks', 'Date remark'])) : null,
    acceptedAt: toTimestamp(data.acceptedAt),
    completedAt: toTimestamp(data.completedAt),
    verifiedAt: toTimestamp(data.verifiedAt),
    createdAt,
    updatedAt: toTimestamp(data.updatedAt) ?? createdAt,
    isShifted: Boolean(data.isShifted),
    parentTaskId: data.parentTaskId ? String(data.parentTaskId) : undefined,
    childTaskId: data.childTaskId ? String(data.childTaskId) : undefined,
    shiftedToUid: data.shiftedToUid ? String(data.shiftedToUid) : undefined,
    shiftedToName: data.shiftedToName ? String(data.shiftedToName) : undefined,
    shiftedByUid: data.shiftedByUid ? String(data.shiftedByUid) : undefined,
    shiftedByName: data.shiftedByName ? String(data.shiftedByName) : undefined,
    shiftedNote: data.shiftedNote ? String(data.shiftedNote) : undefined,
    shiftedAt: toTimestamp(data.shiftedAt),
    ...taskPeriodFields(
      endDate,
      toTimestamp(data.completedAt),
      startDate,
      createdAt,
    ),
  };
}

// ─── ID generation ───────────────────────────────────────────────────────────

export async function generateTaskId(): Promise<string> {
  if (hasCloudflareApi()) {
    try {
      const res = await cfApi<{ taskId: string }>('/tasks/next-id');
      if (res?.taskId) return res.taskId;
    } catch {
      // Fallback: derive from latest task in Cloudflare D1
      try {
        const tasks = await adminGetAllTasks({ limit: 1 });
        const latestTask = tasks[0];
        const match = latestTask?.taskId?.match(/^T-(\d+)$/);
        const currentNum = match ? parseInt(match[1], 10) : 0;
        const nextNum = (Number.isFinite(currentNum) && currentNum > 0 ? currentNum : 6644) + 1;
        return `T-${String(nextNum).padStart(4, '0')}`;
      } catch {
        return `T-${Date.now().toString().slice(-4)}`;
      }
    }
  }

  const counterRef = adminDb.collection(COUNTERS).doc('tasks');
  let newId = 1;

  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(counterRef);
      newId = snap.exists ? (snap.data()!.current as number) + 1 : 1;
      tx.set(counterRef, { current: newId });
    });
    return `T-${String(newId).padStart(4, '0')}`;
  } catch (err) {
    console.warn('[generateTaskId] Transaction read failed (possibly read limit), generating fallback ID', err);
    return `T-${Date.now().toString().slice(-4)}`;
  }
}

// ─── Serialize Timestamps for client ────────────────────────────────────────

export function serializeTask(task: Task): TaskSerialized {
  const tsToIso = (ts: { toDate: () => Date } | null | undefined) => {
    if (!ts || typeof ts.toDate !== 'function') return null;
    try {
      return ts.toDate().toISOString();
    } catch {
      return null;
    }
  };
  return {
    ...task,
    startDate:   tsToIso(task.startDate),
    endDate:     tsToIso(task.endDate),
    delayedDate: tsToIso(task.delayedDate),
    acceptedAt:  tsToIso(task.acceptedAt),
    completedAt: tsToIso(task.completedAt),
    verifiedAt:  tsToIso(task.verifiedAt),
    createdAt:   tsToIso(task.createdAt) ?? new Date().toISOString(),
    updatedAt:   tsToIso(task.updatedAt) ?? new Date().toISOString(),
    weekStart:   tsToIso(task.weekStart ?? null),
    weekEnd:     tsToIso(task.weekEnd ?? null),
    shiftedAt:   tsToIso(task.shiftedAt ?? null),
  };
}

// ─── Admin SDK writes ────────────────────────────────────────────────────────

export async function adminCreateTask(
  input: CreateTaskInput,
  creatorUid: string,
  creatorFallback?: { name: string; waNumber?: string; department?: string },
  options?: { skipAcceptance?: boolean },
): Promise<Task> {
  if (hasCloudflareApi()) {
    try {
      const created = cfTask(await cfApi('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          ...input,
          creatorUid,
          creatorFallback,
          skipAcceptance: options?.skipAcceptance ?? false,
        }),
      }));
      if (created) {
        addTaskToReadCache(created);
        clearFirestoreReadCache('scores:');
        return created;
      }
      throw new Error('Task creation returned no response');
    } catch (cfErr: any) {
      console.error('[Task creation] Cloudflare write failed or limit reached:', cfErr);
      throw new Error(`Cloudflare database limit reached. Task could not be created: ${cfErr?.message || String(cfErr)}`);
    }
  }

  const [taskId, creator, assignee, handoff] = await Promise.all([
    generateTaskId().catch(() => `T-${Date.now().toString().slice(-4)}`),
    adminGetUserByUid(creatorUid).catch(() => null),
    adminGetUserByUid(input.assignedTo).catch(() => null),
    adminGetUserByUid(input.handoffUid).catch(() => null),
  ]);

  const rawInput = input as any;
  const assigneeUser = assignee ?? (input.assignedTo ? {
    uid: input.assignedTo,
    name: rawInput.assignedToName || 'Assigned User',
    department: input.department || '',
    waNumber: rawInput.assignedToWa || '',
    role: 'member' as const,
    isActive: true,
    createdAt: AdminTimestamp.now(),
    updatedAt: AdminTimestamp.now(),
  } : null);

  if (!assigneeUser) {
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
  const handoffUser = handoff ?? (input.handoffUid === creatorUid ? creator : null) ?? fallbackHandoff ?? (input.handoffUid ? {
    uid: input.handoffUid,
    name: rawInput.handoffName || 'Checker',
    waNumber: rawInput.handoffWa || '',
    department: '',
  } : null);

  if (!handoffUser) {
    throw new Error(`Selected checker was not found: ${input.handoffUid}`);
  }

  const now = AdminTimestamp.now();
  const creatorName = creator?.name ?? creatorFallback?.name ?? 'Admin';
  const startDate = input.startDate ? AdminTimestamp.fromDate(new Date(input.startDate)) : null;
  const endDate = input.endDate ? AdminTimestamp.fromDate(new Date(input.endDate)) : null;
  const skipAcceptance = options?.skipAcceptance ?? false;
  const periodFields = taskPeriodFields(endDate, null, startDate, now);
  const task: Task = {
    taskId,
    description:    input.description,
    assignedTo:     assigneeUser.uid,
    assignedToName: assigneeUser.name,
    assignedToWa:   assigneeUser.waNumber,
    createdBy:      creator?.uid ?? creatorUid,
    createdByName:  creatorName,
    handoffUid:     handoffUser.uid,
    handoffName:    handoffUser.name,
    handoffWa:      handoffUser.waNumber,
    category:       input.category,
    priority:       input.priority,
    status:         skipAcceptance ? 'In Progress' : 'Pending Accept',
    department:     assigneeUser.department,
    startDate,
    endDate,
    delayedDate:    null,
    delayReason:    null,
    revisionStatus: 'none',
    notes:          input.notes ?? null,
    acceptedAt:     skipAcceptance ? now : null,
    completedAt:    null,
    verifiedAt:     null,
    createdAt:      now,
    updatedAt:      now,
    ...periodFields,
  };

  await adminDb.collection(COL).doc(taskId).set(task);
  clearFirestoreReadCache('tasks:');
  clearFirestoreReadCache('scores:');
  return task;
}

export async function adminUpdateTaskStatus(
  taskId: string,
  status: TaskStatus,
  extra?: Partial<Task>,
): Promise<Task | null> {
  if (hasCloudflareApi()) {
    const updated = cfTask(await cfApi(`/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      body: JSON.stringify(cfTimestampFields({ status, ...(extra ?? {}) })),
    }));
    updateTaskInReadCache(taskId, { status, ...extra, ...(updated || {}) });
    clearFirestoreReadCache('scores:');
    return updated;
  }

  await adminDb.collection(COL).doc(taskId).update({
    status,
    updatedAt: AdminTimestamp.now(),
    ...extra,
  });
  const task = await adminGetTask(taskId);
  updateTaskInReadCache(taskId, { status, ...extra, ...(task || {}) });
  clearFirestoreReadCache('scores:');
  return task;
}

export async function adminDeleteTask(taskId: string): Promise<boolean> {
  if (hasCloudflareApi()) {
    await cfApi(`/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
    removeTaskFromReadCache(taskId);
    clearFirestoreReadCache('revisions:');
    clearFirestoreReadCache('scores:');
    return true;
  }

  const ref = adminDb.collection(COL).doc(taskId);
  const snap = await ref.get();
  if (!snap.exists) return false;

  const revisionSnap = await adminDb.collection('revisions').where('taskId', '==', taskId).get();
  const batch = adminDb.batch();
  revisionSnap.docs.forEach(doc => batch.delete(doc.ref));
  batch.delete(ref);
  await batch.commit();
  removeTaskFromReadCache(taskId);
  clearFirestoreReadCache('revisions:');
  clearFirestoreReadCache('scores:');
  return true;
}

export async function adminGetTask(taskId: string): Promise<Task | null> {
  return cachedFirestoreRead(`tasks:single:${taskId}`, LONG_READ_CACHE_TTL_MS, async () => {
    if (hasCloudflareApi()) {
      try {
        return cfTask(await cfApi(`/tasks/${encodeURIComponent(taskId)}`));
      } catch (err) {
        console.warn(`[adminGetTask] Cloudflare read failed for ${taskId}:`, err);
        return null;
      }
    }

    try {
      const snap = await adminDb.collection(COL).doc(taskId).get();
      return snap.exists ? normalizeTaskDoc(snap.id, snap.data() as Record<string, any>) : null;
    } catch (err) {
      handleFirestoreReadError(`adminGetTask(${taskId})`, err);
      return null;
    }
  });
}

export async function adminGetTasksByIds(taskIds: string[]): Promise<Task[]> {
  const ids = Array.from(new Set(taskIds.filter(Boolean)));
  if (!ids.length) return [];
  if (hasCloudflareApi()) {
    const batches: Task[][] = [];
    for (let offset = 0; offset < ids.length; offset += 100) {
      const params = new URLSearchParams();
      ids.slice(offset, offset + 100).forEach(id => params.append('id', id));
      const rows = await cfApi<any[]>(`/tasks/by-ids?${params}`);
      batches.push(rows.map(cfTask).filter(Boolean) as Task[]);
    }
    return batches.flat();
  }
  const rows = await Promise.all(ids.map(id => adminDb.collection(COL).doc(id).get()));
  return rows.filter(row => row.exists).map(row => normalizeTaskDoc(row.id, row.data()!));
}

export async function adminGetTasksByAssignee(uid: string): Promise<Task[]> {
  if (hasCloudflareApi()) {
    const key = `tasks:assignee:${uid}`;
    return cachedFirestoreRead(key, LONG_READ_CACHE_TTL_MS, async () => {
      try {
        const tasks = await cfApi<any[]>(`/tasks?scope=mine&uid=${encodeURIComponent(uid)}&limit=${MAX_TASK_READ_LIMIT}`);
        return sortNewestFirst(tasks.map(cfTask).filter(Boolean) as Task[]);
      } catch (err) {
        handleFirestoreReadError(`adminGetTasksByAssignee_cf(${uid})`, err);
        return [];
      }
    });
  }

  try {
    return await cachedFirestoreRead(`tasks:assignee:${uid}`, LONG_READ_CACHE_TTL_MS, async () => {
      const user = await adminGetUserByUid(uid);
      const queries: Query[] = [
        adminDb.collection(COL).where('assignedTo', '==', uid).orderBy('createdAt', 'desc').limit(MAX_TASK_READ_LIMIT),
      ];

      if (user?.name) {
        for (const name of nameAliases(user.name)) {
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

      return sortNewestFirst(Array.from(byId.values()));
    });
  } catch (err) {
    handleFirestoreReadError(`adminGetTasksByAssignee(${uid})`, err);
    return [];
  }
}

export async function adminGetTasksByHandoff(uid: string, status?: TaskStatus): Promise<Task[]> {
  if (hasCloudflareApi()) {
    const params = new URLSearchParams({ scope: 'handoff', uid });
    if (status) params.set('status', status);
    params.set('limit', String(MAX_TASK_READ_LIMIT));
    const key = `tasks:handoff:${uid}:${status ?? 'any'}`;
    return cachedFirestoreRead(key, LONG_READ_CACHE_TTL_MS, async () => {
      try {
        const tasks = await cfApi<any[]>(`/tasks?${params.toString()}`);
        return sortNewestFirst(tasks.map(cfTask).filter(Boolean) as Task[]);
      } catch (err) {
        handleFirestoreReadError(`adminGetTasksByHandoff_cf(${uid})`, err);
        return [];
      }
    });
  }

  try {
    const key = `tasks:handoff:${uid}:${status ?? 'any'}`;
    return await cachedFirestoreRead(key, LONG_READ_CACHE_TTL_MS, async () => {
      let ref: Query = adminDb
        .collection(COL)
        .where('handoffUid', '==', uid);
      if (status) {
        ref = ref.where('status', '==', status);
      }
      ref = ref.orderBy('createdAt', 'desc').limit(MAX_TASK_READ_LIMIT);
      const snap = await ref.get();
      return sortNewestFirst(snap.docs.map(d => normalizeTaskDoc(d.id, d.data())));
    });
  } catch (err) {
    handleFirestoreReadError(`adminGetTasksByHandoff(${uid})`, err);
    return [];
  }
}

export async function adminGetAllTasks(filters?: {
  status?: TaskStatus | 'open' | 'all';
  department?: string;
  limit?: number | null;
  fresh?: boolean;
  includeCompleted?: boolean;
}): Promise<Task[]> {
  if (filters?.fresh) {
    clearFirestoreReadCache('tasks:');
    clearFirestoreReadCache('scores:');
  }

  const effectiveStatus = filters?.status ?? (filters?.includeCompleted ? undefined : 'open');

  if (hasCloudflareApi()) {
    const params = new URLSearchParams({ scope: 'all' });
    if (effectiveStatus) params.set('status', effectiveStatus);
    if (filters?.includeCompleted) params.set('includeCompleted', 'true');
    if (filters?.department) params.set('department', filters.department);
    params.set('limit', String(Math.min(Math.max(Number(filters?.limit) || DEFAULT_TASK_READ_LIMIT, 1), MAX_TASK_READ_LIMIT)));
    const limitKey = params.get('limit');
    const key = `tasks:all:${filters?.department ?? 'any'}:${effectiveStatus ?? 'any'}:${limitKey}`;
    return cachedFirestoreRead(key, LONG_READ_CACHE_TTL_MS, async () => {
      try {
        const tasks = await cfApi<any[]>(`/tasks?${params.toString()}`);
        return sortNewestFirst(tasks.map(cfTask).filter(Boolean) as Task[]);
      } catch (err) {
        handleFirestoreReadError('adminGetAllTasks_cf', err);
        return [];
      }
    });
  }

  try {
    const readLimit = Math.min(Math.max(Number(filters?.limit) || DEFAULT_TASK_READ_LIMIT, 1), MAX_TASK_READ_LIMIT);
    const key = `tasks:all:${filters?.department ?? 'any'}:${effectiveStatus ?? 'any'}:${readLimit}`;

    return await cachedFirestoreRead(key, LONG_READ_CACHE_TTL_MS, async () => {
      let ref: Query = adminDb.collection(COL);

      if (filters?.department) {
        ref = ref.where('department', '==', filters.department);
      }

      if (effectiveStatus === 'open') {
        ref = ref.where('status', 'in', ['Pending Accept', 'In Progress', 'Delay Requested', 'Overdue']);
      } else if (effectiveStatus && effectiveStatus !== 'all') {
        ref = ref.where('status', '==', effectiveStatus);
      }

      ref = ref.orderBy('createdAt', 'desc');

      if (readLimit) {
        ref = ref.limit(readLimit);
      }

      const snap = await ref.get();
      let tasks = sortNewestFirst(snap.docs.map(d => normalizeTaskDoc(d.id, d.data())));
      if (readLimit && (filters?.department || effectiveStatus)) {
        tasks = tasks.slice(0, readLimit);
      }
      return tasks;
    });
  } catch (err) {
    handleFirestoreReadError('adminGetAllTasks', err);
    return [];
  }
}

export interface TaskAggregateCounts {
  total: number;
  pending: number;
  inProgress: number;
  delayRequested: number;
  overdue: number;
  completed: number;
  verified: number;
  dead: number;
  active?: number;
  byUser?: Record<string, TaskAggregateCounts>;
  byDepartment?: Record<string, TaskAggregateCounts>;
}

export interface TaskReadScope {
  scope?: 'all' | 'mine' | 'handoff' | 'visible'; uid?: string; status?: string;
  fresh?: boolean;
  assignedTo?: string; category?: string; priority?: string;
  excludeRecurring?: boolean; includeChecklist?: boolean; verificationPending?: boolean;
  weekStart?: string; weekEnd?: string;
}

function taskScopeParams(department?: string, options: TaskReadScope = {}) {
  const params = new URLSearchParams();
  if (department) params.set('department', department);
  for (const [key, value] of Object.entries(options)) if (value) params.set(key, String(value));
  return params;
}

export async function adminGetTaskCounts(department?: string, options: TaskReadScope = {}): Promise<TaskAggregateCounts> {
  const { fresh, ...scope } = options;
  if (options.fresh) clearFirestoreReadCache('tasks:counts:');
  const params = taskScopeParams(department, scope);
  const requestParams = new URLSearchParams(params);
  if (fresh) requestParams.set('fresh', 'true');
  return cachedFirestoreRead('tasks:counts:' + params.toString(), LONG_READ_CACHE_TTL_MS, async () => {
    if (hasCloudflareApi()) {
      try {
        return await cfApi<TaskAggregateCounts>('/tasks/counts?' + requestParams);
      } catch (err) {
        console.warn('[Read budget] Cloudflare task counts failed or quota reached, showing loaded metrics without scanning DB', err);
      }
    }
    return {
      total: 0,
      pending: 0,
      inProgress: 0,
      delayRequested: 0,
      overdue: 0,
      completed: 0,
      verified: 0,
      dead: 0,
      active: 0,
    };
  });
}

export async function adminSearchTasks(queryText: string, options: TaskReadScope & { department?: string; limit?: number } = {}): Promise<Task[]> {
  if (!hasCloudflareApi()) throw new Error('Server search requires Cloudflare');
  const { department, limit, ...scope } = options;
  const params = taskScopeParams(department, scope);
  params.set('q', queryText.trim());
  params.set('limit', String(Math.min(Math.max(limit || 2000, 1), MAX_SEARCH_READ_LIMIT)));
  return cachedFirestoreRead('tasks:search:' + params.toString(), 5 * 60 * 1000, async () => {
    try {
      const rows = await cfApi<any[]>('/tasks/search?' + params);
      return rows.map(cfTask).filter(Boolean) as Task[];
    } catch (err) {
      handleFirestoreReadError('adminSearchTasks_cf', err);
      return [];
    }
  });
}

export async function adminGetReminderTasks(mode: 'due' | 'recent' | 'high' | 'priority' | 'open', day: string, uid?: string): Promise<Task[]> {
  if (!hasCloudflareApi()) throw new Error('Filtered reminder task reads require Cloudflare');
  const tasks: Task[] = [];
  let after = '';
  for (;;) {
    const params = new URLSearchParams({ mode, day });
    if (uid) params.set('uid', uid);
    if (after) params.set('after', after);
    const page = await cfApi<any[]>(`/tasks/reminders?${params}`);
    tasks.push(...page.map(cfTask).filter(Boolean) as Task[]);
    if (page.length < 100) return tasks;
    const next = String(page[page.length - 1]?.taskId || '');
    if (!next || next === after) throw new Error('Reminder task pagination did not advance');
    after = next;
  }
}

export async function adminGetOverdueTasks(): Promise<Task[]> {
  if (hasCloudflareApi()) {
    try {
      const tasks = await cfApi<any[]>('/tasks/overdue');
      return tasks.map(cfTask).filter(Boolean) as Task[];
    } catch (err) {
      handleFirestoreReadError('adminGetOverdueTasks_cf', err);
      return [];
    }
  }

  const now = AdminTimestamp.now();
  const snaps = await Promise.all(
    ['Pending Accept', 'In Progress'].map(status =>
      adminDb
        .collection(COL)
        .where('status', '==', status)
        .where('endDate', '<', now)
        .limit(REMINDER_TASK_READ_LIMIT)
        .get()
    )
  );

  const byId = new Map<string, Task>();
  snaps.forEach(snap => {
    snap.docs.forEach(doc => byId.set(doc.id, normalizeTaskDoc(doc.id, doc.data())));
  });
  return Array.from(byId.values()).filter(t => t.endDate);
}

export async function adminGetTasksDueWithinHours(hours: number): Promise<Task[]> {
  if (hasCloudflareApi()) {
    try {
      const tasks = await cfApi<any[]>(`/tasks/due-within?hours=${encodeURIComponent(String(hours))}`);
      return tasks.map(cfTask).filter(Boolean) as Task[];
    } catch (err) {
      handleFirestoreReadError('adminGetTasksDueWithinHours_cf', err);
      return [];
    }
  }

  const now  = new Date();
  const from = AdminTimestamp.fromDate(now);
  const to   = AdminTimestamp.fromDate(new Date(now.getTime() + hours * 60 * 60 * 1000));

  const snaps = await Promise.all(
    ['Pending Accept', 'In Progress'].map(status =>
      adminDb
        .collection(COL)
        .where('status', '==', status)
        .where('endDate', '>=', from)
        .where('endDate', '<=', to)
        .limit(REMINDER_TASK_READ_LIMIT)
        .get()
    )
  );

  const byId = new Map<string, Task>();
  snaps.forEach(snap => {
    snap.docs.forEach(doc => byId.set(doc.id, normalizeTaskDoc(doc.id, doc.data())));
  });
  return Array.from(byId.values()).filter(t => t.endDate);
}

export async function adminGetActiveTasks(limitCount = DEFAULT_TASK_READ_LIMIT): Promise<Task[]> {
  if (hasCloudflareApi()) {
    const readLimit = Math.min(Math.max(limitCount, 1), MAX_TASK_READ_LIMIT);
    try {
      const tasks = await cfApi<any[]>(`/tasks/active?limit=${readLimit}`);
      return tasks.map(cfTask).filter(Boolean) as Task[];
    } catch (err) {
      handleFirestoreReadError('adminGetActiveTasks_cf', err);
      return [];
    }
  }

  const readLimit = Math.min(Math.max(limitCount, 1), MAX_TASK_READ_LIMIT);
  const snaps = await Promise.all(
    ACTIVE_TASK_STATUSES.map(status =>
      adminDb
        .collection(COL)
        .where('status', '==', status)
        .orderBy('createdAt', 'desc')
        .limit(readLimit)
        .get()
    )
  );

  const byId = new Map<string, Task>();
  snaps.forEach(snap => {
    snap.docs.forEach(doc => byId.set(doc.id, normalizeTaskDoc(doc.id, doc.data())));
  });
  return sortNewestFirst(Array.from(byId.values())).slice(0, readLimit);
}

// ─── Client SDK reads ────────────────────────────────────────────────────────

export async function getMyTasks(uid: string): Promise<Task[]> {
  const q = query(
    collection(db, COL),
    where('assignedTo', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(MAX_TASK_READ_LIMIT),
  );
  const snap = await getDocs(q);
  return sortNewestFirst(snap.docs.map(d => normalizeTaskDoc(d.id, d.data())));
}

export async function getDepartmentTasks(department: string): Promise<Task[]> {
  const q = query(
    collection(db, COL),
    where('department', '==', department),
    orderBy('createdAt', 'desc'),
    limit(MAX_TASK_READ_LIMIT),
  );
  const snap = await getDocs(q);
  return sortNewestFirst(snap.docs.map(d => normalizeTaskDoc(d.id, d.data())));
}

export async function getHandoffTasks(uid: string): Promise<Task[]> {
  const q = query(
    collection(db, COL),
    where('handoffUid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(MAX_TASK_READ_LIMIT),
  );
  const snap = await getDocs(q);
  return sortNewestFirst(snap.docs.map(d => normalizeTaskDoc(d.id, d.data())));
}
