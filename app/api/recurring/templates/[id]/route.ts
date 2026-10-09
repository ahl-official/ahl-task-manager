import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { updateRecurringTemplate, deleteRecurringTemplate } from '@/lib/cloudflare/recurring';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  if (session.role !== 'admin' && session.role !== 'leader') {
    return NextResponse.json({ success: false, error: 'Forbidden: Admin or leader access required' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const updated = await updateRecurringTemplate(params.id, body);
    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Failed to update recurring template' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  if (session.role !== 'admin' && session.role !== 'leader') {
    return NextResponse.json({ success: false, error: 'Forbidden: Admin or leader access required' }, { status: 403 });
  }

  try {
    const result = await deleteRecurringTemplate(params.id);
    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Failed to permanently delete recurring template' }, { status: 500 });
  }
}
