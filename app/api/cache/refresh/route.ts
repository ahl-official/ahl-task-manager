import { NextRequest, NextResponse } from 'next/server';
import { clearFirestoreReadCache } from '@/lib/firebase/readCache';
import { getSession } from '@/lib/utils/auth';
import { isReadLimitHit } from '@/lib/firebase/errors';
import { TASK_REFRESH_COOKIE } from '@/lib/utils/taskRefresh';

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

  const limitReached = isReadLimitHit();

  const response = NextResponse.json({
    success: true,
    scope,
    readLimitReached: limitReached,
    message: limitReached
      ? `Server limit reached for ${scope}. Task creation remains active.`
      : `Cache cleared for ${scope} and timers restarted`,
    timestamp: Date.now(),
  });
  if (scope === 'tasks' || scope === 'all') {
    response.cookies.set(TASK_REFRESH_COOKIE, String(Date.now()), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30,
      path: '/',
    });
  }
  return response;
}
