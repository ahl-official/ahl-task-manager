import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { cfApi } from '@/lib/cloudflare/api';
import { clearFirestoreReadCache } from '@/lib/firebase/readCache';

export const dynamic = 'force-dynamic';

async function adminSession() {
  const session = await getSession();
  return session?.role === 'admin';
}

export async function GET(req: NextRequest) {
  if (!await adminSession()) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  const kind = new URL(req.url).searchParams.get('kind') || 'all';
  const cursor = new URL(req.url).searchParams.get('cursor');
  if (!['all', 'one-time', 'recurring'].includes(kind)) return NextResponse.json({ success: false, error: 'Invalid type' }, { status: 400 });
  try {
    const data = await cfApi(`/trash?kind=${encodeURIComponent(kind)}&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!await adminSession()) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  try {
    const payload = await req.json();
    if (!['one-time', 'recurring-day', 'recurring-whole'].includes(payload?.kind) || typeof payload?.id !== 'string' || !payload.id) {
      return NextResponse.json({ success: false, error: 'Invalid restore request' }, { status: 400 });
    }
    const data = await cfApi('/trash/restore', { method: 'POST', body: JSON.stringify({ id: payload.id, kind: payload.kind }) });
    clearFirestoreReadCache('tasks:');
    clearFirestoreReadCache('scores:');
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
