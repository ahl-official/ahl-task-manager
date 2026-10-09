import type { Task } from '@/types';
import { indiaDateKey, indiaTodayKey, INDIA_TIMEZONE } from '@/lib/utils/indiaDate';

export const ONE_TIME_OPEN_STATUSES = new Set([
  'Pending Accept',
  'In Progress',
  'Delay Requested',
  'Overdue',
  'pending accept',
  'in progress',
  'delay requested',
  'overdue',
  'pending',
]);

export function isOneTimeTask(task: Task | any) {
  if (!task) return false;
  const cat = String(task.category || '').trim().toLowerCase();
  return !cat || cat === 'one time' || cat === 'one-time';
}

export function isOpenTask(task: Task | any): boolean {
  if (!task) return false;
  const s = String(task.status || '').trim().toLowerCase();
  if (['completed', 'verified', 'dead', 'cancelled', 'done'].includes(s)) {
    return false;
  }
  return true;
}

export function isOpenOneTimeTask(task: Task | any) {
  return isOneTimeTask(task) && isOpenTask(task);
}

export function isHighPriorityTask(task: Task | any): boolean {
  if (!task) return false;
  const p = String(task.priority || '').trim().toLowerCase();
  return p === 'high' || p === 'urgent' || p.includes('🔴') || p.includes('red');
}

export function taskEndDateKey(task: Task | any): string {
  if (!task?.endDate) return '';
  if (typeof task.endDate === 'string') {
    const s = task.endDate.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      return s.slice(0, 10);
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) return indiaDateKey(d);
    return '';
  }
  if (task.endDate instanceof Date) {
    return indiaDateKey(task.endDate);
  }
  const end = task.endDate?.toDate?.() ?? null;
  return end ? indiaDateKey(end) : '';
}

/** Open One Time tasks due on a given IST day (default: today). */
export function oneTimeDueOnDay(tasks: (Task | any)[], dayKey = indiaTodayKey()) {
  return tasks.filter(task => isOpenOneTimeTask(task) && taskEndDateKey(task) === dayKey);
}

/** Open High priority tasks across all categories and dates (Red Ball style). */
export function oneTimeHighPriority(tasks: (Task | any)[]) {
  return tasks.filter(task => isOpenTask(task) && isHighPriorityTask(task));
}

/** All open high priority tasks (alias for clarity). */
export function allPendingHighPriorityTasks(tasks: (Task | any)[]) {
  return tasks.filter(task => isOpenTask(task) && isHighPriorityTask(task));
}

/** IST hour 0–23 for cron guards (e.g. Red Ball 11–19). */
export function indiaHourNow(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: INDIA_TIMEZONE,
      hour: 'numeric',
      hour12: false,
    }).format(now),
  );
  return Number.isFinite(hour) ? hour % 24 : now.getUTCHours();
}

export function formatDdMmYyyy(task: Task | any) {
  const key = taskEndDateKey(task);
  if (!key) return 'N/A';
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}

