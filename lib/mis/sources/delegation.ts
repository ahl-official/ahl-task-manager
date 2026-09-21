import { adminGetAllTasks } from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import { emptyBucket, type MisBucket } from '@/lib/mis/sheetFormula';
import { dateKeyInRange } from '@/lib/mis/week';
import { indiaDateKey } from '@/lib/utils/indiaDate';
import { normalizePersonName } from '@/lib/utils/names';
import { isOneTimeCategory } from '@/lib/utils/timelyDashboard';
import type { Task } from '@/types';

function parseTaskDate(val: unknown): Date | null {
  if (!val) return null;
  if (typeof val === 'object' && val) {
    if (typeof (val as { toDate?: () => Date }).toDate === 'function') {
      try {
        return (val as { toDate: () => Date }).toDate();
      } catch {
        // ignore
      }
    }
  }
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Sheet Delegation Scoring uses Final Date (col F).
 * Uses effective due date (delayedDate ?? endDate).
 * Completed tasks without due date fallback to completedAt.
 */
function taskDateKey(task: Task) {
  const due = parseTaskDate(task.delayedDate ?? task.endDate);
  if (due) return indiaDateKey(due);
  const completed = parseTaskDate(task.completedAt);
  if (completed) return indiaDateKey(completed);
  return '';
}

/** Sheet status: Done | Not On-Time | Pending */
function sheetDelegationStatus(task: Task): 'Done' | 'Not On-Time' | 'Pending' {
  if (
    task.status !== 'Completed' &&
    task.status !== 'Verified' &&
    task.status !== 'Shifted (Completed)' &&
    task.status !== 'Shifted (Verified)'
  ) {
    return 'Pending';
  }
  const completed = parseTaskDate(task.completedAt);
  if (!completed) return 'Done';
  const due = parseTaskDate(task.delayedDate ?? task.endDate);
  if (!due) return 'Done';
  return indiaDateKey(completed).localeCompare(indiaDateKey(due)) <= 0 ? 'Done' : 'Not On-Time';
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
    const [tasks, users] = await Promise.all([
      adminGetAllTasks({ limit: null }),
      adminGetAllUsers().catch(() => []),
    ]);
    const userByUid = new Map(users.map(u => [u.uid, u]));

    for (const task of tasks) {
      if (!isOneTimeCategory(task.category)) continue;
      if (task.status === 'Dead') continue;
      const keyDate = taskDateKey(task);
      if (!keyDate || !dateKeyInRange(keyDate, weekStart, weekEnd)) continue;

      const registeredUser = task.assignedTo ? userByUid.get(task.assignedTo) : undefined;
      const name = registeredUser?.name || task.assignedToName || task.assignedTo;
      const key = normalizePersonName(name);
      if (!key) continue;

      const row = byName.get(key) ?? {
        name: registeredUser?.name || name,
        department: registeredUser?.department || task.department || '',
        uid: task.assignedTo,
        waNumber: registeredUser?.waNumber || task.assignedToWa || '',
        ...emptyBucket(),
      };
      row.planned += 1;
      const status = sheetDelegationStatus(task);
      if (status === 'Done' || status === 'Not On-Time') {
        row.done += 1;
        if (status === 'Done') row.onTime += 1;
      }
      if (!row.uid && task.assignedTo) row.uid = task.assignedTo;
      if (!row.waNumber && (registeredUser?.waNumber || task.assignedToWa)) {
        row.waNumber = registeredUser?.waNumber || task.assignedToWa || '';
      }
      if (!row.department && (registeredUser?.department || task.department)) {
        row.department = registeredUser?.department || task.department || '';
      }
      byName.set(key, row);
    }
  } catch (err) {
    console.error('MIS delegation source failed', err);
  }

  return byName;
}
