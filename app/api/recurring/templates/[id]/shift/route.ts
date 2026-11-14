import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { adminGetUserByUid } from '@/lib/firebase/users';
import { shiftRecurringTemplate } from '@/lib/cloudflare/recurring';
import { adminLog } from '@/lib/firebase/scores';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Forbidden: Only admin can shift recurring tasks' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const targetUid = String(body.targetUid || '').trim();
    if (!targetUid) {
      return NextResponse.json({ success: false, error: 'Target user is required' }, { status: 400 });
    }

    const targetUser = await adminGetUserByUid(targetUid);
    if (!targetUser || targetUser.isActive === false) {
      return NextResponse.json({ success: false, error: 'Target user not found or inactive' }, { status: 400 });
    }

    const result = await shiftRecurringTemplate(params.id, {
      targetUid: targetUser.uid,
      targetName: targetUser.name,
      targetDepartment: targetUser.department || '',
      fromDate: body.fromDate,
    });

    await adminLog('TASK_SHIFTED', `Recurring task ${params.id} shifted to ${targetUser.name}`, {
      taskId: params.id,
      uid: session.uid,
      meta: {
        templateId: params.id,
        shiftedToUid: targetUser.uid,
        shiftedToName: targetUser.name,
        shiftedPeriodsCount: result.shiftedPeriodsCount,
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to shift recurring task' },
      { status: 500 }
    );
  }
}

