import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { adminGetUserByUid } from '@/lib/firebase/users';
import { createSessionCookie, setSessionCookieHeaders, clearSessionCookieHeaders } from '@/lib/utils/auth';
import type { SessionUser, UserRole } from '@/types';

// POST /api/auth/session — exchange Firebase ID token or user payload for session cookie
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let sessionUser: SessionUser | null = null;

    if (body.user && body.user.uid) {
      sessionUser = {
        uid: body.user.uid,
        name: body.user.name || '',
        role: (body.user.role || 'intern') as UserRole,
        department: body.user.department || '',
        waNumber: body.user.waNumber || '',
      };
    } else if (body.idToken) {
      const decoded = await adminAuth.verifyIdToken(body.idToken);
      const user = await adminGetUserByUid(decoded.uid).catch(() => null);
      sessionUser = {
        uid: decoded.uid,
        name: user?.name || (decoded.name as string) || '',
        role: (user?.role || decoded.role || 'intern') as UserRole,
        department: user?.department || (decoded.department as string) || '',
        waNumber: user?.waNumber || (decoded.waNumber as string) || '',
      };
    }

    if (!sessionUser || !sessionUser.uid) {
      return NextResponse.json({ success: false, error: 'Invalid user or token' }, { status: 400 });
    }

    const sessionCookie = await createSessionCookie(sessionUser);
    const headers = setSessionCookieHeaders(sessionCookie);

    const res = NextResponse.json({ success: true, data: { user: sessionUser } });
    res.headers.set('Set-Cookie', headers['Set-Cookie']);
    return res;
  } catch (err: any) {
    console.error('Session creation failed', err);
    return NextResponse.json({ success: false, error: err.message || 'Session creation failed' }, { status: 401 });
  }
}

// DELETE /api/auth/session — logout
export async function DELETE() {
  const headers = clearSessionCookieHeaders();
  const res = NextResponse.json({ success: true });
  res.headers.set('Set-Cookie', headers['Set-Cookie']);
  return res;
}
