export const INDIA_TIMEZONE = 'Asia/Kolkata';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function indiaTodayKey(date = new Date()) {
  return indiaDateKey(date);
}

export function indiaDateKey(value: Date | string) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: INDIA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatDmy(isoDate: string) {
  const key = indiaDateKey(isoDate);
  const [year, month, day] = key.split('-');
  if (!year || !month || !day) return '';
  return `${day}/${month}/${year}`;
}

export function sheetDateFormula(isoDate: string) {
  const key = indiaDateKey(isoDate);
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return '';
  return `=DATE(${year},${month},${day})`;
}

export function parseSheetDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return indiaDateKey(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const utc = Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000;
    return indiaDateKey(new Date(utc));
  }

  const text = String(value ?? '').trim();
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}T/.test(text) || /(?:z|[+-]\d{2}:\d{2})$/i.test(text)) {
    return indiaDateKey(new Date(text));
  }

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const numbered = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (numbered) {
    const first = Number(numbered[1]);
    const second = Number(numbered[2]);
    const year = numbered[3];
    if (first > 12 && second <= 12) return `${year}-${pad(second)}-${pad(first)}`;
    if (second > 12 && first <= 12) return `${year}-${pad(first)}-${pad(second)}`;
    return `${year}-${pad(second)}-${pad(first)}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return indiaDateKey(parsed);
}

export function indiaNoonIso(isoDate: string) {
  const key = indiaDateKey(isoDate);
  return key ? `${key}T12:00:00+05:30` : '';
}

export function formatIndiaDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const key = indiaDateKey(iso);
  if (!key) return '—';
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 6, 30, 0));
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: INDIA_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatIndiaDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return formatIndiaDate(iso);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: INDIA_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function indiaDayOffset(fromIso: string, toIso: string) {
  const from = indiaDateKey(fromIso);
  const to = indiaDateKey(toIso);
  if (!from || !to) return 0;
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const start = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  return Math.round((end - start) / 86_400_000);
}
