import { adminGetAllTasks } from '@/lib/firebase/tasks';
import { emptyBucket, type MisBucket } from '@/lib/mis/sheetFormula';
import { dateKeyInRange } from '@/lib/mis/week';
import { indiaDateKey } from '@/lib/utils/indiaDate';
import { normalizePersonName } from '@/lib/utils/names';
import type { Task } from '@/types';

/**
 * Sheet Delegation Scoring uses Final Date (col F).
 * Prefer endDate, then delayedDate, then completed/start/created.
 */
function taskDateKey(task: Task) {
  const end = task.endDate?.toDate?.() ?? null;
  const delayed = task.delayedDate?.toDate?.() ?? null;
  const completed = task.completedAt?.toDate?.() ?? null;
  const start = task.startDate?.toDate?.() ?? null;
  const created = task.createdAt?.toDate?.() ?? null;
  const date = end ?? delayed ?? completed ?? start ?? created;
  return date ? indiaDateKey(date) : '';
}

/** Sheet status: Done | Not On-Time | Pending */
function sheetDelegationStatus(task: Task): 'Done' | 'Not On-Time' | 'Pending' {
  if (task.status !== 'Completed' && task.status !== 'Verified') return 'Pending';
  if (!task.completedAt) return 'Done';
  const due = task.delayedDate ?? task.endDate;
  if (!due) return 'Done';
  return task.completedAt.toMillis() <= due.toMillis() ? 'Done' : 'Not On-Time';
}

/**
 * Delegation bucket (E17/F17): Cloudflare / portal One Time tasks.
 * Matches sheet Delegation Scoring:
 * - planned = Final Date in week
 * - done = Done + Not On-Time
 * - onTime = Done only
 */
export async function getDelegationBuckets(weekStart: string, weekEnd: string) {
  const byName = new Map<string, MisBucket & { name: string; department: string; uid: string; waNumber: string }>();

  try {
    const tasks = await adminGetAllTasks({ limit: null });
    for (const task of tasks) {
      if (task.category && task.category !== 'One Time') continue;
      const keyDate = taskDateKey(task);
      if (!keyDate || !dateKeyInRange(keyDate, weekStart, weekEnd)) continue;

      const name = task.assignedToName || task.assignedTo;
      const key = normalizePersonName(name);
      if (!key) continue;

      const row = byName.get(key) ?? {
        name,
        department: task.department || '',
        uid: task.assignedTo,
        waNumber: task.assignedToWa || '',
        ...emptyBucket(),
      };
      row.planned += 1;
      const status = sheetDelegationStatus(task);
      if (status === 'Done' || status === 'Not On-Time') {
        row.done += 1;
        if (status === 'Done') row.onTime += 1;
      }
      if (!row.uid && task.assignedTo) row.uid = task.assignedTo;
      if (!row.waNumber && task.assignedToWa) row.waNumber = task.assignedToWa;
      if (!row.department && task.department) row.department = task.department;
      byName.set(key, row);
    }
  } catch (err) {
    console.error('MIS delegation source failed', err);
  }

  return byName;
}
