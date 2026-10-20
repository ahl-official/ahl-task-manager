import type { SessionUser } from '@/types';
import { namesEqual } from './names';
import { indiaTodayKey } from './indiaDate';

type Period = { userId: string; userName: string; department: string; category: string; periodKey: string; dueDate?: string | null };

export function checklistPermissions(session: SessionUser, row: Period) {
  const mine = row.userId ? row.userId === session.uid : namesEqual(row.userName, session.name);
  const team = session.role === 'leader' && Boolean(session.department?.trim()) &&
    session.department.trim().toLowerCase() === row.department.trim().toLowerCase();
  const elevated = session.role === 'admin' || team;
  const date = (row.dueDate || row.periodKey).slice(0, 10);
  const today = indiaTodayKey();
  const isPast = row.category.toLowerCase() === 'monthly' ? date.slice(0, 7) < today.slice(0, 7) : date < today;
  return { mine, isPast, canView: mine || elevated, canChange: elevated || (mine && !isPast), canVerify: elevated };
}
