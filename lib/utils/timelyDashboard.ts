import type { SessionUser, Task } from '@/types';
import { timestamp } from '@/lib/cloudflare/timestamp';
import { indiaNoonIso } from '@/lib/utils/indiaDate';
import {
  findChecklistSheetUser,
  getAllTimelyChecklistData,
  hasChecklistBackend,
  isTimelySheetTaskId,
  taskBelongsToSession,
  type SheetChecklistTask,
} from '@/lib/google/sheets';

function toAppTask(row: SheetChecklistTask, session: SessionUser): Task {
  const due = timestamp(indiaNoonIso(row.dueDate))!;
  const done = row.completed ? timestamp(indiaNoonIso(row.completedAt || row.dueDate)) : null;
  return {
    taskId: row.taskId,
    description: row.task,
    assignedTo: session.uid,
    assignedToName: session.name,
    assignedToWa: session.waNumber,
    createdBy: 'timely-sheet',
    createdByName: 'Timely Sheet',
    handoffUid: session.uid,
    handoffName: session.name,
    handoffWa: session.waNumber,
    category: row.category || 'Daily',
    priority: 'Medium',
    status: row.completed ? 'Completed' : 'In Progress',
    department: session.department || row.department,
    startDate: due,
    endDate: due,
    delayedDate: null,
    delayReason: null,
    revisionStatus: 'none',
    notes: null,
    acceptedAt: due,
    completedAt: done,
    verifiedAt: null,
    createdAt: due,
    updatedAt: done || due,
    dayKey: row.dueDate,
    monthKey: row.dueDate.slice(0, 7),
  };
}

export async function getPersonalTimelyTasks(session: SessionUser): Promise<Task[]> {
  if (!hasChecklistBackend()) return [];
  const data = await getAllTimelyChecklistData();
  const sheetUser = findChecklistSheetUser(data.users, session);
  return data.tasks
    .filter(row => taskBelongsToSession(row, session, sheetUser))
    .map(row => toAppTask(row, session));
}

export function mergePersonalDashboardTasks(databaseTasks: Task[], timelyTasks: Task[]) {
  const delegated = databaseTasks.filter(task => task.category === 'One Time');
  return [...timelyTasks, ...delegated].sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
}

export async function getTimelyTaskForSession(session: SessionUser, taskId: string, force = false) {
  if (!hasChecklistBackend() || !isTimelySheetTaskId(taskId)) return null;
  const data = await getAllTimelyChecklistData(force);
  const row = data.tasks.find(task => task.taskId === taskId);
  if (!row) return null;
  const sheetUser = findChecklistSheetUser(data.users, session);
  const isOwner = taskBelongsToSession(row, session, sheetUser);
  if (session.role !== 'admin' && !isOwner) return null;
  return toAppTask(row, session);
}

export async function getPersonalTimelyTask(session: SessionUser, taskId: string) {
  return getTimelyTaskForSession(session, taskId);
}
