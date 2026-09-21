import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatIndiaDate, formatIndiaDateTime, indiaDateKey, indiaDayOffset, indiaTodayKey } from '@/lib/utils/indiaDate';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string | null | undefined): string {
  return formatIndiaDate(iso);
}

export function formatDateTime(iso: string | null | undefined): string {
  return formatIndiaDateTime(iso);
}

export function getDueBadge(endDate: string | null | undefined, status?: string): {
  label: string;
  color: string;
} {
  if (!endDate) return { label: 'Date pending', color: 'bg-gray-100 text-gray-600' };
  if (status === 'Completed' || status === 'Verified') {
    return { label: formatDate(endDate), color: STATUS_COLORS[status] || 'bg-gray-100 text-gray-600' };
  }
  const dueKey = indiaDateKey(endDate);
  const todayKey = indiaTodayKey();
  if (!dueKey) return { label: 'Date pending', color: 'bg-gray-100 text-gray-600' };
  const days = indiaDayOffset(todayKey, dueKey);
  if (days < 0) {
    if (status && status !== 'Pending Accept' && status !== 'In Progress' && status !== 'Delay Requested' && status !== 'Overdue') {
      return { label: formatDate(endDate), color: STATUS_COLORS[status] || 'bg-gray-100 text-gray-600' };
    }
    return { label: 'Overdue', color: 'bg-red-100 text-red-700' };
  }
  if (days === 0) return { label: 'Due Today', color: 'bg-orange-100 text-orange-700' };
  if (days === 1) return { label: 'Due Tomorrow', color: 'bg-yellow-100 text-yellow-700' };
  if (days <= 3) return { label: `${days}d left`, color: 'bg-yellow-50 text-yellow-600' };
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
  'Pending Accept':          'bg-gray-100 text-gray-600',
  'In Progress':             'bg-blue-100 text-blue-700',
  'Delay Requested':         'bg-orange-100 text-orange-700',
  'Overdue':                 'bg-red-100 text-red-700',
  'Dead':                    'bg-red-600 text-white',
  'Completed':               'bg-green-100 text-green-700',
  'Verified':                'bg-brand-100 text-brand-700',
  'Shifted':                 'bg-purple-100 text-purple-700',
  'Shifted (Pending Accept)': 'bg-purple-100 text-purple-700',
  'Shifted (In Progress)':   'bg-blue-100 text-blue-700',
  'Shifted (Delay Requested)':'bg-orange-100 text-orange-700',
  'Shifted (Overdue)':       'bg-red-100 text-red-700',
  'Shifted (Completed)':     'bg-green-100 text-green-700',
  'Shifted (Verified)':      'bg-brand-100 text-brand-700',
};

export function normalizeBaseStatus(status: string | null | undefined): string {
  if (!status) return '';
  if (status.startsWith('Shifted (')) {
    return status.slice(9, -1);
  }
  if (status === 'Shifted') return 'In Progress';
  return status;
}

export function isCompletedOrVerified(status: string | null | undefined): boolean {
  const norm = normalizeBaseStatus(status);
  return norm === 'Completed' || norm === 'Verified';
}

export function canUserShiftTask(
  user: { uid: string; role: string; department?: string } | null | undefined,
  task: { assignedTo: string; status: string; category?: string; isShifted?: boolean; childTaskId?: string } | null | undefined,
): boolean {
  if (!user || !task) return false;
  if (user.role === 'intern') return false;

  // Shifting only works on One Time tasks (not recurring checklist tasks like Daily, Weekly, Monthly)
  const category = (task.category || '').toLowerCase();
  if (category !== 'one time' && category !== 'delegation' && category !== 'one-time') {
    return false;
  }

  if (task.isShifted || task.childTaskId || task.status.startsWith('Shifted')) return false;
  if (task.status === 'Completed' || task.status === 'Verified' || task.status === 'Dead') return false;
  if (user.role === 'admin') return true;
  return task.assignedTo === user.uid;
}

export function normalizeWa(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
