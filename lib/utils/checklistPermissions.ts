import type { SessionUser } from '@/types';
import { namesEqual } from './names';
import { indiaTodayKey, indiaDayOffset } from './indiaDate';

type Period = { userId: string; userName: string; department: string; category: string; periodKey: string; dueDate?: string | null };

export function checklistPermissions(session: SessionUser, row: Period) {
  const mine = Boolean((row.userId && row.userId === session.uid) || namesEqual(row.userName, session.name));
  const team = session.role === 'leader' && Boolean(session.department?.trim()) &&
    session.department.trim().toLowerCase() === row.department.trim().toLowerCase();
  const elevated = session.role === 'admin' || team;
  const date = (row.dueDate || row.periodKey).slice(0, 10);
  const today = indiaTodayKey();
  const cat = (row.category || '').toLowerCase();

  // 1-day buffer for Daily tasks: can be completed next day and still counts as on-time.
  // Mark complete late only triggers after the buffer day (indiaDayOffset < -1, i.e. 2+ days late).
  const isPast = cat === 'monthly'
    ? date.slice(0, 7) < today.slice(0, 7)
    : cat === 'daily'
      ? indiaDayOffset(today, date) < -1
      : date < today;

  // Members can view and complete their own tasks even if past (it will just be marked late)
  return { mine, isPast, canView: mine || elevated, canChange: elevated || mine, canVerify: false };
}
