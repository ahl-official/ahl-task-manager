import { getAllTimelyChecklistData, type SheetChecklistTask } from '@/lib/google/sheets';
import { emptyBucket, type MisBucket } from '@/lib/mis/sheetFormula';
import { dateKeyInRange } from '@/lib/mis/week';
import { indiaDateKey } from '@/lib/utils/indiaDate';
import { normalizePersonName } from '@/lib/utils/names';

export const CHECKLIST_PARAM_LABELS: Record<string, string> = {
  office: 'Office Daily',
  salon: 'Salon Daily',
  weekly: 'Weekly & Monthly',
};

function taskInWeek(task: SheetChecklistTask, weekStart: string, weekEnd: string) {
  const due = task.dueDate || task.periodEnd || task.periodStart;
  if (!due) return false;
  return dateKeyInRange(due, weekStart, weekEnd);
}

function isOnTime(task: SheetChecklistTask) {
  if (!task.completed) return false;
  if (!task.completedAt || !task.dueDate) return true;
  return compareKeys(task.completedAt, task.dueDate) <= 0;
}

function compareKeys(a: string, b: string) {
  return indiaDateKey(a).localeCompare(indiaDateKey(b));
}

function sourceKeyOf(task: SheetChecklistTask) {
  if (task.sourceKey) return task.sourceKey;
  const match = String(task.taskId || '').match(/^(office|salon|weekly)-/i);
  return match ? match[1].toLowerCase() : 'office';
}

export type ChecklistPersonBucket = MisBucket & { name: string; department: string };

export interface ChecklistParamCount {
  id: string;
  label: string;
  byName: Map<string, ChecklistPersonBucket>;
}

/**
 * Checklist bucket (E7/F7) + per-source parameters (Office / Salon / Weekly).
 * Reads timely Masters with includeAllPeriods so past weeks work for MIS.
 */
export async function getChecklistDetailedCounts(weekStart: string, weekEnd: string) {
  const byName = new Map<string, ChecklistPersonBucket>();
  const paramCounts: ChecklistParamCount[] = Object.entries(CHECKLIST_PARAM_LABELS).map(([id, label]) => ({
    id,
    label,
    byName: new Map<string, ChecklistPersonBucket>(),
  }));
  const paramById = new Map(paramCounts.map(row => [row.id, row]));

  try {
    const data = await getAllTimelyChecklistData(true, { includeAllPeriods: true });
    for (const task of data.tasks) {
      if (!task.active || !taskInWeek(task, weekStart, weekEnd)) continue;
      const key = normalizePersonName(task.userName);
      if (!key) continue;

      const ensure = (map: Map<string, ChecklistPersonBucket>) => {
        const existing = map.get(key);
        if (existing) return existing;
        const created: ChecklistPersonBucket = {
          name: task.userName,
          department: task.department || '',
          ...emptyBucket(),
        };
        map.set(key, created);
        return created;
      };

      const total = ensure(byName);
      const sourceKey = sourceKeyOf(task);
      const param = paramById.get(sourceKey);
      const paramRow = param ? ensure(param.byName) : null;

      total.planned += 1;
      if (paramRow) paramRow.planned += 1;
      if (task.completed) {
        total.done += 1;
        if (paramRow) paramRow.done += 1;
        if (isOnTime(task)) {
          total.onTime += 1;
          if (paramRow) paramRow.onTime += 1;
        }
      }
      if (!total.department && task.department) total.department = task.department;
      if (paramRow && !paramRow.department && task.department) paramRow.department = task.department;
    }
  } catch (err) {
    console.error('MIS checklist source failed', err);
  }

  return { byName, paramCounts };
}

export async function getChecklistBuckets(weekStart: string, weekEnd: string) {
  const { byName } = await getChecklistDetailedCounts(weekStart, weekEnd);
  return byName;
}
