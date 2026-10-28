import { NextRequest, NextResponse } from 'next/server';
import { clearFirestoreReadCache } from '@/lib/firebase/readCache';
import { getSession } from '@/lib/utils/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const scope = searchParams.get('scope') || 'all';

  if (scope === 'scores') {
    clearFirestoreReadCache('scores:');
  } else if (scope === 'tasks') {
    clearFirestoreReadCache('tasks:');
  } else if (scope === 'users') {
    clearFirestoreReadCache('users:');
    clearFirestoreReadCache('departments:');
  } else if (scope === 'revisions') {
    clearFirestoreReadCache('revisions:');
  } else if (scope === 'calendar') {
    clearFirestoreReadCache('users:');
  } else if (scope === 'all') {
    clearFirestoreReadCache();
  }

  return NextResponse.json({
    success: true,
    scope,
    message: `Cache cleared for ${scope} and timers restarted`,
    timestamp: Date.now(),
  });
}
