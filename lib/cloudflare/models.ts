import type { AHLUser, Task, UserScore, RevisionLog } from '@/types';
import { nowTimestamp, timestamp } from './timestamp';
import type { Department } from '@/lib/firebase/departments';

export function cfUser(row: any): AHLUser | null {
  if (!row) return null;
  return {
    uid: row.uid,
    name: row.name,
    waNumber: row.waNumber,
    waNumberLast10: row.waNumberLast10,
    role: row.role,
    department: row.department ?? '',
    isActive: row.isActive !== false,
    createdAt: timestamp(row.createdAt)!,
    updatedAt: timestamp(row.updatedAt)!,
  };
}

export function cfTask(row: any): Task | null {
  if (!row) return null;
  let category = row.category;
  if (!category || category.toLowerCase() === 'one-time' || category.toLowerCase() === 'onetime' || category.toLowerCase() === 'delegation') {
    category = 'One Time';
  }
  let handoffName = String(row.handoffName || row.handoff_name || '').trim();
  if (!handoffName || handoffName.toLowerCase().includes('newdelegation') || handoffName.toLowerCase().includes('import') || handoffName.toLowerCase() === 'import-checker') {
    handoffName = 'Admin';
  }

  let parentTaskId = row.parentTaskId || row.parent_task_id || undefined;
  let childTaskId = row.childTaskId || row.child_task_id || undefined;
  const notesStr = String(row.notes || '');

  if (!parentTaskId) {
    const parentMatch = notesStr.match(/\[Shifted\s+by\s+.*?\s+from\s+(T-\d+)/i) || notesStr.match(/parentTaskId:\s*(T-\d+)/i);
    if (parentMatch) parentTaskId = parentMatch[1];
  }
  if (!childTaskId) {
    const childMatch = notesStr.match(/to\s+(T-\d+)\]/i) || notesStr.match(/childTaskId:\s*(T-\d+)/i);
    if (childMatch) childTaskId = childMatch[1];
  }
  const isShifted = Boolean(row.isShifted || row.is_shifted || parentTaskId || childTaskId || String(row.status || '').startsWith('Shifted'));

  return {
    ...row,
    category,
    handoffName,
    parentTaskId,
    childTaskId,
    isShifted,
    startDate: timestamp(row.startDate),
    endDate: timestamp(row.endDate),
    delayedDate: timestamp(row.delayedDate),
    acceptedAt: timestamp(row.acceptedAt),
    completedAt: timestamp(row.completedAt),
    verifiedAt: timestamp(row.verifiedAt),
    createdAt: timestamp(row.createdAt)!,
    updatedAt: timestamp(row.updatedAt)!,
    weekStart: timestamp(row.weekStart) ?? undefined,
    weekEnd: timestamp(row.weekEnd) ?? undefined,
    shiftedAt: timestamp(row.shiftedAt) ?? undefined,
  };
}

export function cfScore(row: any): UserScore | null {
  if (!row) return null;
  return {
    ...row,
    lastUpdated: timestamp(row.lastUpdated) ?? nowTimestamp(),
  };
}

export function cfDepartment(row: any): Department | null {
  if (!row) return null;
  return {
    ...row,
    createdAt: timestamp(row.createdAt)!,
    updatedAt: timestamp(row.updatedAt)!,
  };
}

export function cfRevision(row: any): RevisionLog | null {
  if (!row) return null;
  return {
    ...row,
    requestedDate: timestamp(row.requestedDate)!,
    decidedAt: timestamp(row.decidedAt),
    createdAt: timestamp(row.createdAt)!,
  };
}

export function cfTimestampFields<T extends Record<string, any>>(data: T): T {
  const copy: Record<string, any> = { ...data };
  for (const key of Object.keys(copy)) {
    const value = copy[key];
    if (value && typeof value === 'object' && typeof value.toDate === 'function') {
      copy[key] = value.toDate().toISOString();
    }
  }
  return copy as T;
}
