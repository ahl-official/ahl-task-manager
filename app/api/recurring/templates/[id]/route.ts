import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { adminGetUserByUid } from '@/lib/firebase/users';
import { updateRecurringTemplate, deleteRecurringTemplate, getRecurringTemplate } from '@/lib/cloudflare/recurring';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  if (session.role !== 'admin' && session.role !== 'leader') {
    return NextResponse.json({ success: false, error: 'Forbidden: Admin or leader access required' }, { status: 403 });
  }

  try {
    const existing=await getRecurringTemplate(params.id);
    if(session.role==='leader' && (!session.department || existing.department!==session.department))return NextResponse.json({success:false,error:'Forbidden for this department'},{status:403});
    const body = await req.json();
    if(session.role==='leader'){
      const assignee=body.assignedTo ? await adminGetUserByUid(body.assignedTo) : null;
      if((body.department && body.department!==session.department)||(body.assignedTo && (!assignee || assignee.department!==session.department)))return NextResponse.json({success:false,error:'Assignee must be in your department'},{status:403});
    }
    const updated = await updateRecurringTemplate(params.id, body);
    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Failed to update recurring template' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  if (session.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden: Only admin can delete recurring task templates' }, { status: 403 });
  }

  try {
    const result = await deleteRecurringTemplate(params.id);
    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Failed to permanently delete recurring template' }, { status: 500 });
  }
}
