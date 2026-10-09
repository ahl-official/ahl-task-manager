import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { hasCloudflareApi } from '@/lib/cloudflare/api';
import {
  completeRecurringTask,
  getRecurringChecklist,
} from '@/lib/cloudflare/recurring';
import { namesEqual } from '@/lib/utils/names';
import { indiaTodayKey } from '@/lib/utils/indiaDate';

const CATEGORIES = ['Daily', 'Weekly', 'Monthly'];

function isPastPeriodKey(periodKey?: string | null, dueDate?: string | null, cat?: string) {
  const today = indiaTodayKey();
  const key = periodKey || dueDate;
  if (!key) return false;
  if (cat?.toLowerCase() === 'monthly') {
    return key.slice(0, 7) < today.slice(0, 7);
  }
  return key < today;
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

    const rows = (d1Items || []).map(row => {
      const mine = namesEqual(row.userName, session.name);
      const isPast = isPastPeriodKey(row.periodKey, row.dueDate, row.category);

      // Members and interns are blocked from marking incomplete tasks for past dates
      // Admins (and leaders for their team) can complete past tasks
      const canComplete = row.completed
        ? false
        : isAdmin
          ? true
          : elevated
            ? !isPast || mine
            : mine && !isPast;

      return {
        ...row,
        mine,
        isPast,
        canComplete,
        canManage: elevated || mine,
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
    const { taskId, title, description, department, assignedTo, assignedToName, category, periodKey, action = 'complete', remark = '' } = await req.json();
    if (!taskId || !periodKey || !CATEGORIES.includes(category)) {
      throw new Error('Task id, category, and period are required');
    }

    const isAdmin = session.role === 'admin';
    const elevated = session.role === 'admin' || session.role === 'leader';
    const isPast = isPastPeriodKey(periodKey, null, category);

    // Block non-admin/non-leader from completing past tasks
    if (action === 'complete' && isPast && !elevated) {
      return NextResponse.json({
        success: false,
        error: 'Only administrators can mark past checklist tasks complete.',
      }, { status: 403 });
    }

    if (!hasCloudflareApi()) {
      throw new Error('Cloudflare D1 is not configured');
    }

    const result = await completeRecurringTask({
      templateId: taskId,
      title: title || description,
      description: description || title,
      department: department || '',
      uid: assignedTo || session.uid,
      userName: assignedToName || session.name,
      category,
      periodKey,
      action,
      isAdmin,
      remark,
      remarkBy: session.name,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message ?? 'Failed to update checklist task in Cloudflare D1',
    }, { status: 400 });
  }
}


