import { NextRequest, NextResponse } from 'next/server';
import { isCronOrAdmin } from '@/lib/utils/cronAuth';
import { cfApi } from '@/lib/cloudflare/api';
import { clearFirestoreReadCache } from '@/lib/firebase/readCache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!await isCronOrAdmin(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const days = Math.max(1, Number(searchParams.get('days')) || 60);

  try {
    const result = await cfApi<Record<string, any>>(`/trash/purge?days=${days}`, { method: 'POST' });
    clearFirestoreReadCache('tasks:');
    return NextResponse.json({ success: true, ...(result || {}) });
  } catch (err: any) {
    console.error('Purge deleted tasks error:', err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
