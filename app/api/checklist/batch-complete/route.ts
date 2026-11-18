import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { completeRecurringTasksBatch } from '@/lib/cloudflare/recurring';

// Authenticate the caller and forward a bounded batch with server-derived identity for authorization.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length || items.length > 100 || items.some((item: any) =>
      typeof item?.templateId !== 'string' || !item.templateId.trim() ||
      typeof item?.periodKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.periodKey))) {
      return NextResponse.json({ success: false, error: 'Select between 1 and 100 valid checklist periods' }, { status: 400 });
    }

    const data = await completeRecurringTasksBatch({
      items: items.map((item: any) => ({ templateId: item.templateId.trim(), periodKey: item.periodKey })),
      actor: { uid: session.uid, name: session.name, role: session.role, department: session.department },
    });
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
    return NextResponse.json({ success: false, error: error.message || 'Failed to complete selected checklist tasks' }, { status });
  }
}
