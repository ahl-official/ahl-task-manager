import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './admin';
import { adminGetActiveTasks, adminGetTasksByAssignee } from './tasks';
import type { Task, TaskCategory } from '@/types';
import { cfApi, hasCloudflareApi } from '@/lib/cloudflare/api';
import { timestamp } from '@/lib/cloudflare/timestamp';

const COL = 'checklistCompletions';
const RECURRING_CATEGORIES: TaskCategory[] = ['Daily', 'Weekly', 'Monthly'];
const OPEN_STATUSES = new Set(['In Progress', 'Delay Requested', 'Overdue']);

export interface ChecklistCompletion {
  id: string;
  taskId: string;
  uid: string;
  category: TaskCategory;
  periodKey: string;
  completedAt: Timestamp;
}

function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function getChecklistPeriodKey(category: TaskCategory, date = new Date()): string {
  if (category === 'Daily') {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  if (category === 'Weekly') {
    const weekStart = startOfWeek(date);
    return `${weekStart.getFullYear()}-${pad(weekStart.getMonth() + 1)}-${pad(weekStart.getDate())}`;
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function isRecurringCategory(category: string): category is TaskCategory {
  return RECURRING_CATEGORIES.includes(category as TaskCategory);
}

export function getCategoryLabel(category: string): string {
  if (category === 'Daily') return 'Daily Task';
  if (category === 'Weekly') return 'Weekly Task';
  if (category === 'Monthly') return 'Monthly Task';
  if (category === 'One Time') return 'One Time Task';
  return category;
}

export async function adminGetChecklistTasksForUser(uid: string, category?: TaskCategory) {
  const tasks = await adminGetTasksByAssignee(uid);
  const recurring = tasks.filter(task =>
    isRecurringCategory(task.category) &&
    (!category || task.category === category) &&
    OPEN_STATUSES.has(task.status)
  );

  return hydrateChecklistTasks(uid, recurring);
}

export async function adminGetChecklistTasksForCategory(category: TaskCategory) {
  const tasks = await adminGetActiveTasks(1000);
  const recurring = tasks.filter(task =>
    task.category === category &&
    OPEN_STATUSES.has(task.status)
  );

  return adminGetChecklistRowsForTasks(recurring);
}

export async function adminGetChecklistRowsForTasks(tasks: Task[]) {
  const byUid = new Map<string, Task[]>();
  tasks
    .filter(task => isRecurringCategory(task.category) && OPEN_STATUSES.has(task.status))
    .forEach(task => {
    const existing = byUid.get(task.assignedTo) ?? [];
    existing.push(task);
    byUid.set(task.assignedTo, existing);
  });

  const results = [];
  for (const [uid, userTasks] of Array.from(byUid.entries())) {
    results.push({ uid, tasks: await hydrateChecklistTasks(uid, userTasks) });
  }
  return results;
}

async function hydrateChecklistTasks(uid: string, tasks: Task[]) {
  const periodKeys = new Set(tasks.map(task => getChecklistPeriodKey(task.category)));
  if (hasCloudflareApi()) {
    const params = new URLSearchParams({ uid });
    Array.from(periodKeys).forEach(periodKey => params.append('periodKey', periodKey));
    const rows = await cfApi<any[]>(`/checklist/completions?${params.toString()}`);
    const completed = new Set(
      rows
        .map(row => `${row.taskId}:${row.periodKey}`)
    );

    return tasks.map(task => {
      const periodKey = getChecklistPeriodKey(task.category);
      return {
        task,
        periodKey,
        completed: completed.has(`${task.taskId}:${periodKey}`),
      };
    });
  }

  const snap = await adminDb
    .collection(COL)
    .where('uid', '==', uid)
    .get();

  const completed = new Set(
    snap.docs
      .map(doc => doc.data() as ChecklistCompletion)
      .filter(row => periodKeys.has(row.periodKey))
      .map(row => `${row.taskId}:${row.periodKey}`)
  );

  return tasks.map(task => {
    const periodKey = getChecklistPeriodKey(task.category);
    return {
      task,
      periodKey,
      completed: completed.has(`${task.taskId}:${periodKey}`),
    };
  });
}

export async function adminCompleteChecklistTask(task: Task, uid: string): Promise<ChecklistCompletion> {
  if (!isRecurringCategory(task.category)) throw new Error('Only daily, weekly, and monthly tasks can be checked off');
  if (task.assignedTo !== uid) throw new Error('This checklist task is not assigned to you');
  if (!OPEN_STATUSES.has(task.status)) throw new Error('Task must be accepted before it can be checked off');

  const periodKey = getChecklistPeriodKey(task.category);
  const id = `${task.taskId}_${uid}_${periodKey}`;
  if (hasCloudflareApi()) {
    const params = new URLSearchParams({ uid, taskId: task.taskId, periodKey });
    const existingRows = await cfApi<any[]>(`/checklist/completions?${params.toString()}`);
    if (existingRows.length > 0) {
      throw new Error(`${getCategoryLabel(task.category)} is already completed for this period`);
    }
    const row = await cfApi<any>('/checklist/completions', {
      method: 'POST',
      body: JSON.stringify({ id, taskId: task.taskId, uid, category: task.category, periodKey }),
    });
    return {
      id,
      taskId: task.taskId,
      uid,
      category: task.category,
      periodKey,
      completedAt: timestamp(row.completedAt)! as Timestamp,
    };
  }

  const ref = adminDb.collection(COL).doc(id);
  const existing = await ref.get();
  if (existing.exists) throw new Error(`${getCategoryLabel(task.category)} is already completed for this period`);

  const completion: ChecklistCompletion = {
    id,
    taskId: task.taskId,
    uid,
    category: task.category,
    periodKey,
    completedAt: Timestamp.now(),
  };

  await ref.set(completion);
  return completion;
}
