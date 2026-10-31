import { NextRequest, NextResponse } from 'next/server';
import { clearFirestoreReadCache } from '@/lib/firebase/readCache';
import { getSession } from '@/lib/utils/auth';
import { isReadLimitHit } from '@/lib/firebase/errors';
import { TASK_REFRESH_COOKIE } from '@/lib/utils/taskRefresh';
import { adminGetAllTasks, adminGetTaskCounts, adminGetTasksByAssignee } from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import { adminGetDepartments } from '@/lib/firebase/departments';
import { adminGetAllScores } from '@/lib/firebase/scores';
import { adminGetAllRevisions, adminGetRevisionsForUser } from '@/lib/firebase/revisions';

export const dynamic = 'force-dynamic';

type Session = { uid: string; role: string };

// After clearing a scope's cache, actually perform a representative read for it so
// isReadLimitHit() reflects THIS attempt — not a stale flag from some unrelated read
// up to 60s ago. Without this, the toast could say "refreshed" a moment before the
// real page re-render (router.refresh()) hits the same quota and fails.
//
// Must match what the CALLING page actually reads, not just the admin shape — a member
// on /portal/revisions reads adminGetRevisionsForUser(uid), not adminGetAllRevisions();
// a member on /portal reads adminGetTasksByAssignee(uid), not adminGetAllTasks(). Probing
// the wrong shape wastes a read without even warming the cache key the page needs.
async function probeScope(scope: string, session: Session) {
  const isAdminOrLeader = session.role === 'admin' || session.role === 'leader';
  try {
    if (scope === 'scores') {
      // A member's own "My Score" reads live MIS snapshots directly, not through this
      // cache layer at all — nothing here to usefully probe for them.
      if (isAdminOrLeader) await adminGetAllScores();
    } else if (scope === 'tasks') {
      if (session.role === 'admin') {
        await Promise.all([adminGetAllTasks({ limit: 100 }), adminGetTaskCounts()]);
      } else {
        await Promise.all([
          adminGetTasksByAssignee(session.uid),
          adminGetTaskCounts(undefined, { scope: 'mine', uid: session.uid, excludeRecurring: true }),
        ]);
      }
    } else if (scope === 'users') {
      // Same shape for every role.
      await Promise.all([adminGetAllUsers(), adminGetDepartments()]);
    } else if (scope === 'revisions') {
      if (isAdminOrLeader) await adminGetAllRevisions();
      else await adminGetRevisionsForUser(session.uid);
    } else if (scope === 'calendar') {
      await adminGetAllUsers();
    } else if (scope === 'all') {
      // Catch-all path with no single known shape — keep it to the one universally
      // correct, cheap read rather than guessing a scope-specific shape that may be wrong.
      await adminGetAllUsers();
    }
    // 'checklist' / 'fms' aren't backed by this cache layer — nothing to probe.
  } catch {
    // Loaders already degrade to [] / cached fallback internally and record the quota
    // hit via handleFirestoreReadError; nothing further to do here.
  }
}

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

  await probeScope(scope, session);
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
