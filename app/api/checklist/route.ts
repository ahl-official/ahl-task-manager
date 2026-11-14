import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { hasCloudflareApi } from '@/lib/cloudflare/api';
import {
  completeRecurringTask,
  getRecurringChecklistPage,
  getRecurringPeriod,
} from '@/lib/cloudflare/recurring';
import { checklistPermissions } from '@/lib/utils/checklistPermissions';
import { indiaTodayKey } from '@/lib/utils/indiaDate';
import { addDaysKey } from '@/lib/mis/week';
import { notifyTaskUpdated } from '@/lib/events/taskEvents';

const CATEGORIES = ['Daily', 'Weekly', 'Monthly'];

function getWeekMonday(dateStr: string) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return dateStr.slice(0, 10);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = dt.getUTCDay();
  const diff = (dow === 0 ? -6 : 1) - dow;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') ?? 'Daily';
  if (!CATEGORIES.includes(category)) {
    return NextResponse.json({ success: false, error: 'Invalid checklist category' }, { status: 400 });
  }

  const isAdmin = session.role === 'admin';
  const elevated = session.role === 'admin' || session.role === 'leader';
  const dateParam = searchParams.get('date') || undefined;
  const startDateParam = searchParams.get('startDate') || undefined;
  const endDateParam = searchParams.get('endDate') || undefined;
  const exactDate = searchParams.get('exactDate') === 'true' || Boolean(dateParam);
  const cursor = searchParams.get('cursor') || undefined;
  const rawSearch = (searchParams.get('search') || '').trim();
  const search = rawSearch.replace(/[^a-zA-Z0-9\s\-_.:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  const userNameParam = searchParams.get('userName') || searchParams.get('assignedToName') || searchParams.get('individual') || undefined;
  const usersParam = searchParams.get('users') || undefined;
  const mineParam = searchParams.get('mine') === 'true';
  const today = indiaTodayKey();

  if (!hasCloudflareApi()) {
    return NextResponse.json({
      success: false,
      error: 'Cloudflare D1 is not configured. Please check CLOUDFLARE_API_URL.',
    }, { status: 503 });
  }

  try {
    const targetUid = mineParam ? session.uid : (searchParams.get('assignedTo') || (userNameParam ? '' : session.uid));
    const targetUserName = mineParam ? session.name : (userNameParam || session.name);

    // When fetching for a specific user (mine or individual filter), include all periods
    // (past, current, future) so they can see their full history. Only skip this when
    // an explicit date filter is applied (in which case exactDate restricts it for them).
    const isScopedUser = Boolean(mineParam || userNameParam);
    const includeAllPeriods = isScopedUser && !dateParam && !startDateParam;

    // Calculate a broad startDate to fetch past 6 months of history when showing all periods
    const pastStartDate = includeAllPeriods ? (() => {
      const d = new Date();
      d.setMonth(d.getMonth() - 6);
      return d.toISOString().slice(0, 10);
    })() : undefined;

    const effectiveStartDate = startDateParam || pastStartDate;
    const effectiveEndDate = endDateParam || undefined;

    const page = await getRecurringChecklistPage({
      category,
      date: (startDateParam && endDateParam) ? undefined : dateParam,
      exactDate: Boolean(dateParam && !startDateParam), // only exact-filter when date is explicitly chosen
      cursor,
      search: search.length >= 2 ? search : undefined,
      uid: targetUid,
      userName: targetUserName,
      scopeUser: isScopedUser,
      department: mineParam ? undefined : (session.role === 'leader' ? session.department : (searchParams.get('department') || undefined)),
      isAdmin: isAdmin && !mineParam && !userNameParam,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      includeAllPeriods,
    });

    const targetUsersList = usersParam
      ? usersParam.split(',').map(u => u.trim().toLowerCase()).filter(Boolean)
      : [];

    const rows = page.items
      .filter(row => {
        const permissions = checklistPermissions(session, row);
        // Always show: mine (owner), elevated (admin/leader), or if it belongs to the scoped user
        if (permissions.canView) return true;
        // Also show rows belonging to the explicitly requested user even if not "mine" by session
        if (isScopedUser && userNameParam) {
          const rowName = (row.userName || '').toLowerCase().trim();
          const reqName = userNameParam.toLowerCase().trim();
          if (rowName === reqName || rowName.startsWith(reqName) || reqName.startsWith(rowName)) return true;
        }
        return false;
      })
      .filter(row => {
        if (targetUsersList.length > 0) {
          const rowName = (row.userName || '').toLowerCase().trim();
          const matched = targetUsersList.some(u => rowName === u || rowName.startsWith(u) || u.startsWith(rowName));
          if (!matched) return false;
        }
        return true;
      })
      .filter(row => {
        const rowDate = (row.dueDate || row.periodKey || '').slice(0, 10);
        if (startDateParam && endDateParam) {
          return rowDate >= startDateParam && rowDate <= endDateParam;
        }
        if (!dateParam) return true;
        return rowDate === dateParam;
      })
      .map(row => {
        const permissions = checklistPermissions(session, row);
        const rowDate = (row.dueDate || row.periodKey || '').slice(0, 10);
        const isFuture = Boolean(rowDate && rowDate > today);
        return {
          ...row,
          mine: permissions.mine,
          isPast: permissions.isPast,
          isFuture,
          // Past tasks: completable by members (marked late when completed). Admin can complete any task.
          canComplete: !row.completed && !row.dead && (isAdmin || (!isFuture && permissions.canChange)),
          canUncomplete: row.completed && !row.dead && (isAdmin || permissions.canChange),
          canManage: isAdmin || permissions.canChange,
        };
      });

    return NextResponse.json({
      success: true,
      meta: {
        currentUserName: session.name,
        currentUserId: session.uid,
        elevated,
        isAdmin,
        source: 'cloudflare_d1',
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
      },
      data: rows,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err: any) {
    console.error('Cloudflare D1 recurring checklist fetch error', err);
    // If a search query caused an execution error/timeout in D1, return empty results gracefully
    if (search.length >= 2) {
      return NextResponse.json({
        success: true,
        meta: {
          currentUserName: session.name,
          currentUserId: session.uid,
          elevated,
          isAdmin,
          source: 'cloudflare_d1',
          hasMore: false,
          nextCursor: null,
        },
        data: [],
      });
    }
    return NextResponse.json({
      success: false,
      error: err.message || 'Failed to fetch checklist from Cloudflare D1',
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const { taskId, category, periodKey, action = 'complete', remark = '' } = await req.json();
    if (typeof taskId !== 'string' || typeof periodKey !== 'string' || !CATEGORIES.includes(category) ||
        !['complete', 'uncomplete', 'skip_day', 'dead', 'remark', 'verify', 'revive'].includes(action)) {
      return NextResponse.json({ success: false, error: 'Invalid checklist task, period or action' }, { status: 400 });
    }
    if (!hasCloudflareApi()) throw new Error('Cloudflare D1 is not configured');
    // Resolve the persisted assignee; never authorize against client-provided names or IDs.
    const row = await getRecurringPeriod(taskId, periodKey);
    const permissions = checklistPermissions(session, row);
    const isAdmin = session.role === 'admin';
    if (row.category !== category) {
      return NextResponse.json({ success: false, error: 'Forbidden for this checklist period' }, { status: 403 });
    }
    // Allow all users to add remarks; other actions (complete, uncomplete, dead, revive) require change permission
    if (action !== 'remark' && !isAdmin && !permissions.canChange) {
      return NextResponse.json({ success: false, error: 'Forbidden for this checklist period' }, { status: 403 });
    }
    if (action === 'skip_day' && !isAdmin) {
      return NextResponse.json({ success: false, error: 'Forbidden: Only admin can delete checklist tasks' }, { status: 403 });
    }
    const resolvedAction = action === 'verify' ? 'complete' : action;
    const result = await completeRecurringTask({
      templateId: row.templateId, periodKey: row.periodKey,
      title: row.title, description: row.description, department: row.department,
      uid: row.userId, userName: row.userName, category: row.category,
      action: resolvedAction, isAdmin: session.role === 'admin',
      remark: String(remark).trim(), remarkBy: session.name,
    });
    notifyTaskUpdated();
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Checklist update failed' }, { status: error.status === 404 ? 404 : 400 });
  }
}
