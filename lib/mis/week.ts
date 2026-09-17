import { indiaDateKey, INDIA_TIMEZONE } from '@/lib/utils/indiaDate';

const DAY_MS = 86_400_000;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Parse yyyy-mm-dd as a UTC noon anchor for day arithmetic. */
export function dateKeyToUtc(dateKey: string) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

export function addDaysKey(dateKey: string, days: number) {
  const date = dateKeyToUtc(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function compareDateKeys(a: string, b: string) {
  return a.localeCompare(b);
}

export function dateKeyInRange(dateKey: string, start: string, end: string) {
  return compareDateKeys(dateKey, start) >= 0 && compareDateKeys(dateKey, end) <= 0;
}

/**
 * Business week used by MIS / portal scores: Wednesday → Tuesday (IST).
 * Matches lib/firebase/tasks getBusinessWeekPeriod.
 */
export function getMisWeekPeriod(anchor: Date | string = new Date()) {
  const key = typeof anchor === 'string' ? indiaDateKey(anchor) : indiaDateKey(anchor);
  const date = dateKeyToUtc(key);
  const day = date.getUTCDay(); // 0 Sun .. 3 Wed
  const daysSinceWednesday = (day - 3 + 7) % 7;
  const weekStart = addDaysKey(key, -daysSinceWednesday);
  const weekEnd = addDaysKey(weekStart, 6);

  const year = Number(weekStart.slice(0, 4));
  const jan1Key = `${year}-01-01`;
  const jan1 = dateKeyToUtc(jan1Key);
  const jan1Dow = jan1.getUTCDay();
  const firstWeekStart = addDaysKey(jan1Key, -((jan1Dow - 3 + 7) % 7));
  const weekNumber =
    Math.floor((dateKeyToUtc(weekStart).getTime() - dateKeyToUtc(firstWeekStart).getTime()) / (7 * DAY_MS)) + 1;

  return {
    weekKey: `${year}-W${String(weekNumber).padStart(2, '0')}`,
    weekStart,
    weekEnd,
    weekNumber,
    monthName: new Intl.DateTimeFormat('en-US', { timeZone: INDIA_TIMEZONE, month: 'long' }).format(
      dateKeyToUtc(weekEnd),
    ),
    year: Number(weekEnd.slice(0, 4)),
  };
}

/** Previous completed business week relative to `now` (the week that ended most recently on/before today). */
export function getPreviousMisWeekPeriod(now = new Date()) {
  const current = getMisWeekPeriod(now);
  return getMisWeekPeriod(addDaysKey(current.weekStart, -1));
}

/** Weeks whose week-end date falls in the given calendar month (MIS Data month column). */
export function getMonthWeekSlots(year: number, monthIndex0: number) {
  const monthStart = `${year}-${pad(monthIndex0 + 1)}-01`;
  const nextMonth = monthIndex0 === 11 ? `${year + 1}-01-01` : `${year}-${pad(monthIndex0 + 2)}-01`;
  const monthEnd = addDaysKey(nextMonth, -1);
  const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(dateKeyToUtc(monthStart));

  const byKey = new Map<string, ReturnType<typeof getMisWeekPeriod>>();
  let cursor = monthStart;
  while (compareDateKeys(cursor, monthEnd) <= 0) {
    const week = getMisWeekPeriod(cursor);
    if (week.weekEnd.startsWith(`${year}-${pad(monthIndex0 + 1)}`)) {
      byKey.set(week.weekKey, week);
    }
    cursor = addDaysKey(cursor, 1);
  }

  return Array.from(byKey.values())
    .sort((a, b) => compareDateKeys(a.weekStart, b.weekStart))
    .slice(0, 5)
    .map((week, index) => ({ ...week, slot: (index + 1) as 1 | 2 | 3 | 4 | 5, monthName }));
}

export function formatWeekLabel(weekStart: string, weekEnd: string) {
  const [sy, sm, sd] = weekStart.split('-');
  const [ey, em, ed] = weekEnd.split('-');
  return `${sd}/${sm}/${sy} - ${ed}/${em}/${ey}`;
}

/** Recent MIS business weeks for admin week filter (newest first). */
export function listRecentMisWeeks(count = 16, anchor: Date | string = new Date()) {
  const weeks: ReturnType<typeof getMisWeekPeriod>[] = [];
  let cursor = typeof anchor === 'string' ? anchor : indiaDateKey(anchor);
  for (let i = 0; i < count; i++) {
    const week = getMisWeekPeriod(cursor);
    weeks.push(week);
    cursor = addDaysKey(week.weekStart, -1);
  }
  return weeks;
}
