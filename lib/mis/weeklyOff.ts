import { normalizePersonName } from '../utils/names';

/**
 * Salon Daily "Working Day Calender" (1 Sep 2026–1 Nov 2026) omits every Monday.
 * Office Daily and Weekly & Monthly calendars include every date in that range,
 * so those tasks have no weekly off.
 * Nobody is on both the salon and office task lists.
 */
const SALON_DAILY_DOERS = new Set([
  'aditi',
  'anita',
  'aparna',
  'arantxa',
  'azhar',
  'bindu',
  'daizy',
  'divya',
  'elma',
  'gauri',
  'jagruti',
  'jaieza',
  'jitu',
  'khushi',
  'mehjabeen',
  'mohit',
  'niddhi',
  'ninsi',
  'parth',
  'pooja',
  'rahul',
  'rahul singh',
  'ramesh',
  'sejal',
  'susmita',
  'tuba',
  'vishakha',
]);

export function isSalonDailyDoer(name: unknown) {
  const key = normalizePersonName(name);
  return Boolean(key && SALON_DAILY_DOERS.has(key));
}

/** 1 = Monday … 7 = Sunday, from a YYYY-MM-DD key. */
export function isoWeekday(dateStr: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!match) return 0;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

/** Salon daily tasks are off every Monday. Office daily tasks are not. */
export function isDailyWeeklyOff(dateStr: string, personName: unknown) {
  return isoWeekday(dateStr) === 1 && isSalonDailyDoer(personName);
}
