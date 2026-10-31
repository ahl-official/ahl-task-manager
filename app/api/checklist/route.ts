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
  const exactDate = searchParams.get('exactDate') === 'true' || Boolean(dateParam);
  const cursor = searchParams.get('cursor') || undefined;
  const rawSearch = (searchParams.get('search') || '').trim();
  const search = rawSearch.replace(/[^a-zA-Z0-9\s\-_.:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  const userNameParam = searchParams.get('userName') || searchParams.get('assignedToName') || searchParams.get('individual') || undefined;
  const mineParam = searchParams.get('mine') === 'true';
  const today = indiaTodayKey();

  if (!hasCloudflareApi()) {
    return NextResponse.json({
      success: false,
      error: 'Cloudflare D1 is not configured. Please check CLOUDFLARE_API_URL.',
    }, { status: 503 });
  }

  try {
    const page = await getRecurringChecklistPage({
      category,
      date: dateParam,
      exactDate,
      cursor,
      search: search.length >= 2 ? search : undefined,
      uid: mineParam ? session.uid : (searchParams.get('assignedTo') || session.uid),
      userName: mineParam ? session.name : (userNameParam || session.name),
      scopeUser: Boolean(mineParam || userNameParam),
      department: session.role === 'leader' ? session.department : (searchParams.get('department') || undefined),
      isAdmin: isAdmin && !mineParam && !userNameParam,
    });

    const rows = page.items
      .filter(row => checklistPermissions(session, row).canView)
      .filter(row => {
        if (!dateParam) return true;
        const rowDate = (row.dueDate || row.periodKey || '').slice(0, 10);
        if (rowDate === dateParam) return true;
        if (category === 'Weekly') {
          const rowWeek = getWeekMonday(row.periodKey || row.dueDate || '');
          const targetWeek = getWeekMonday(dateParam);
          return Boolean(rowWeek && targetWeek && rowWeek === targetWeek);
        }
        if (category === 'Monthly') {
          return (row.periodKey || row.dueDate || '').slice(0, 7) === dateParam.slice(0, 7);
        }
        return false;
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
          canComplete: !row.completed && !row.dead && !isFuture && permissions.canChange,
          canUncomplete: row.completed && !row.dead && permissions.canChange,
          canManage: isAdmin,
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
    if (row.category !== category || !permissions.canChange || (action === 'verify' && !permissions.canVerify)) {
      return NextResponse.json({ success: false, error: 'Forbidden for this checklist period' }, { status: 403 });
    }
    if (action === 'skip_day' && session.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Forbidden: Only admin can delete checklist tasks' }, { status: 403 });
    }
    const result = await completeRecurringTask({
      templateId: row.templateId, periodKey: row.periodKey,
      title: row.title, description: row.description, department: row.department,
      uid: row.userId, userName: row.userName, category: row.category,
      action, isAdmin: session.role === 'admin',
      remark: String(remark).trim(), remarkBy: session.name,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Checklist update failed' }, { status: error.status === 404 ? 404 : 400 });
  }
}
