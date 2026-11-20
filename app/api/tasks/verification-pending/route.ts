import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { cfApi } from '@/lib/cloudflare/api';
import { cfTask } from '@/lib/cloudflare/models';
import { serializeTask } from '@/lib/firebase/tasks';

// Scope every page using the authenticated viewer, never a client-supplied user ID.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const params = new URLSearchParams();
  if (session.role !== 'admin') params.set('handoffUid', session.uid);
  const cursor = req.nextUrl.searchParams.get('cursor');
  if (cursor) {
    if (cursor.length > 1000) return NextResponse.json({ success: false, error: 'Invalid cursor' }, { status: 400 });
    params.set('cursor', cursor);
  }
  try {
    const page = await cfApi<{ items: any[]; hasMore: boolean; nextCursor: string | null }>(`/tasks/verification-pending?${params}`);
    const items = page.items.map(cfTask).filter((task): task is NonNullable<typeof task> => task !== null).map(serializeTask);
    return NextResponse.json({ success: true, data: { ...page, items } }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load verification queue' }, { status: 500 });
  }
}
