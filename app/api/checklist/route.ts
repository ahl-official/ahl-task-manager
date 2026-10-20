import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { hasCloudflareApi } from '@/lib/cloudflare/api';
import {
  completeRecurringTask,
  getRecurringChecklist,
  getRecurringPeriod,
} from '@/lib/cloudflare/recurring';
import { checklistPermissions } from '@/lib/utils/checklistPermissions';
import { indiaTodayKey } from '@/lib/utils/indiaDate';

const CATEGORIES = ['Daily', 'Weekly', 'Monthly'];

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

  const today = indiaTodayKey();
  if (dateParam && dateParam > today) {
    return NextResponse.json({
      success: true,
      meta: {
        currentUserName: session.name,
        currentUserId: session.uid,
        elevated,
        isAdmin,
        source: 'cloudflare_d1',
      },
      data: [],
    });
  }

  if (!hasCloudflareApi()) {
    return NextResponse.json({
      success: false,
      error: 'Cloudflare D1 is not configured. Please check CLOUDFLARE_API_URL.',
    }, { status: 503 });
  }

  try {
    const d1Items = await getRecurringChecklist({
      category,
      date: dateParam,
      userName: elevated ? undefined : session.name,
    });

    const rows = (d1Items || []).filter(row => checklistPermissions(session, row).canView).map(row => {
      const permissions = checklistPermissions(session, row);
      return { ...row, mine: permissions.mine, isPast: permissions.isPast,
        canComplete: !row.completed && !row.dead && permissions.canChange,
        canUncomplete: row.completed && !row.dead && permissions.canChange,
        canManage: permissions.canChange };
    });

    return NextResponse.json({
      success: true,
      meta: {
        currentUserName: session.name,
        currentUserId: session.uid,
        elevated,
        isAdmin,
        source: 'cloudflare_d1',
      },
      data: rows,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err: any) {
    console.error('Cloudflare D1 recurring checklist fetch error', err);
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
