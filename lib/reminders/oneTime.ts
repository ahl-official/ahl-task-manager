import type { Task } from '@/types';
import { indiaDateKey, indiaTodayKey, INDIA_TIMEZONE } from '@/lib/utils/indiaDate';

export const ONE_TIME_OPEN_STATUSES = new Set([
  'Pending Accept',
  'In Progress',
  'Delay Requested',
  'Overdue',
]);

export function isOneTimeTask(task: Task) {
  return !task.category || task.category === 'One Time';
}

export function isOpenOneTimeTask(task: Task) {
  return isOneTimeTask(task) && ONE_TIME_OPEN_STATUSES.has(task.status);
}

export function taskEndDateKey(task: Task) {
  const end = task.endDate?.toDate?.() ?? null;
  return end ? indiaDateKey(end) : '';
}

/** Open One Time tasks due on a given IST day (default: today). */
export function oneTimeDueOnDay(tasks: Task[], dayKey = indiaTodayKey()) {
  return tasks.filter(task => isOpenOneTimeTask(task) && taskEndDateKey(task) === dayKey);
}

/** Open One Time High priority (Red Ball style). */
export function oneTimeHighPriority(tasks: Task[]) {
  return tasks.filter(task => isOpenOneTimeTask(task) && task.priority === 'High');
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

export function formatDdMmYyyy(task: Task) {
  const key = taskEndDateKey(task);
  if (!key) return 'N/A';
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}
