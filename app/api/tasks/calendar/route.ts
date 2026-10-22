import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { cfApi } from '@/lib/cloudflare/api';
import { cfTask } from '@/lib/cloudflare/models';
import { serializeTask } from '@/lib/firebase/tasks';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'admin') return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  const params = req.nextUrl.searchParams;
  const department = params.get('department') || '';
  const month = params.get('month') || '';
  if (!department || !/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ success: false, error: 'Invalid calendar filter' }, { status: 400 });
  try {
    const rows = await cfApi<any[]>(`/tasks/calendar?${new URLSearchParams({ department, month })}`);
    return NextResponse.json({ success: true, data: rows.map(cfTask).filter(Boolean).map(task => serializeTask(task!)) });
  } catch {
    return NextResponse.json({ success: false, error: 'Calendar tasks could not be loaded' }, { status: 500 });
  }
}
