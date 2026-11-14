import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { batchDeleteChecklistTasks } from '@/lib/cloudflare/recurring';
import { adminLog } from '@/lib/firebase/scores';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Forbidden: Only admin can delete checklist tasks' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode as 'day' | 'whole';
    if (mode !== 'day' && mode !== 'whole') {
      return NextResponse.json({ success: false, error: 'Invalid delete mode. Expected "day" or "whole"' }, { status: 400 });
    }

    const ids = Array.isArray(body.ids) ? body.ids.filter((id: unknown): id is string => typeof id === 'string' && Boolean(id.trim())) : [];
    const templateIds = Array.isArray(body.templateIds) ? body.templateIds.filter((id: unknown): id is string => typeof id === 'string' && Boolean(id.trim())) : [];

    if (mode === 'day' && ids.length === 0) {
      return NextResponse.json({ success: false, error: 'No items selected for deletion' }, { status: 400 });
    }

    if (mode === 'whole' && templateIds.length === 0) {
      return NextResponse.json({ success: false, error: 'No templates selected for deletion' }, { status: 400 });
    }

    const remark = typeof body.remark === 'string' ? body.remark.trim() : '';

    const result = await batchDeleteChecklistTasks({
      mode,
      ids: mode === 'day' ? ids : undefined,
      templateIds: mode === 'whole' ? templateIds : undefined,
    });

    await adminLog('TASK_DELETED', `Admin batch deleted ${result.deleted} checklist task(s) (mode: ${mode}${remark ? `, reason: ${remark}` : ''})`, {
      uid: session.uid,
      meta: {
        mode,
        remark: remark || undefined,
        deletedCount: result.deleted,
        ids: mode === 'day' ? ids.slice(0, 50) : undefined,
        templateIds: mode === 'whole' ? templateIds.slice(0, 50) : undefined,
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Checklist batch delete error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete checklist tasks' },
      { status: 500 }
    );
  }
}

