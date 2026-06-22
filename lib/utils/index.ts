import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, isToday, isTomorrow, isPast, differenceInDays } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'dd MMM yyyy');
  } catch {
    return '—';
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'dd MMM yyyy, h:mm a');
  } catch {
    return '—';
  }
}

export function getDueBadge(endDate: string | null | undefined): {
  label: string;
  color: string;
} {
  if (!endDate) return { label: 'Date pending', color: 'bg-gray-100 text-gray-600' };
  const d = new Date(endDate);
  if (isPast(d) && !isToday(d)) return { label: 'Overdue', color: 'bg-red-100 text-red-700' };
  if (isToday(d))                return { label: 'Due Today', color: 'bg-orange-100 text-orange-700' };
  if (isTomorrow(d))             return { label: 'Due Tomorrow', color: 'bg-yellow-100 text-yellow-700' };
  const days = differenceInDays(d, new Date());
  if (days <= 3)                 return { label: `${days}d left`, color: 'bg-yellow-50 text-yellow-600' };
  return { label: formatDate(endDate), color: 'bg-gray-100 text-gray-600' };
}

export const PRIORITY_COLORS: Record<string, string> = {
  High:   'bg-red-100 text-red-700 border-red-200',
  Medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  Low:    'bg-green-100 text-green-700 border-green-200',
};

export const PRIORITY_DOT: Record<string, string> = {
  High:   'bg-red-500',
  Medium: 'bg-yellow-500',
  Low:    'bg-green-500',
};

export const STATUS_COLORS: Record<string, string> = {
  'Pending Accept': 'bg-gray-100 text-gray-600',
  'In Progress':    'bg-blue-100 text-blue-700',
  'Delay Requested':'bg-orange-100 text-orange-700',
  'Overdue':        'bg-red-100 text-red-700',
  'Dead':           'bg-red-600 text-white',
  'Completed':      'bg-green-100 text-green-700',
  'Verified':       'bg-brand-100 text-brand-700',
};

export function normalizeWa(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
