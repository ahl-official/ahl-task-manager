import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { getRecurringTemplates, createRecurringTemplate } from '@/lib/cloudflare/recurring';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') || undefined;
  const assignedToName = searchParams.get('assignedToName') || undefined;
  const isActive = searchParams.get('isActive') || undefined;

  try {
    const templates = await getRecurringTemplates({ category, assignedToName, isActive });
    return NextResponse.json({ success: true, data: templates });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Failed to fetch recurring templates' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  if (session.role !== 'admin' && session.role !== 'leader') {
    return NextResponse.json({ success: false, error: 'Forbidden: Admin or leader access required' }, { status: 403 });
  }

  try {
    const body = await req.json();
    if (!body.title || !body.assignedToName) {
      return NextResponse.json({ success: false, error: 'Title and Assignee are required' }, { status: 400 });
    }

    const template = await createRecurringTemplate({
      ...body,
      category: body.category || 'Daily',
      frequency: body.frequency || body.category || 'Daily',
      isActive: body.isActive !== false,
    });

    return NextResponse.json({ success: true, data: template }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Failed to create recurring template' }, { status: 500 });
  }
}
