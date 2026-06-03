import { NextRequest, NextResponse } from 'next/server';
import { createSessionCookie, setSessionCookieHeaders, verifySessionCookie, clearSessionCookieHeaders } from '@/lib/utils/auth';

// POST /api/auth/session — exchange Firebase ID token for session cookie
export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();
    if (!idToken) return NextResponse.json({ success: false, error: 'No token' }, { status: 400 });

    const sessionCookie = await createSessionCookie(idToken);
    const headers = setSessionCookieHeaders(sessionCookie);

    const res = NextResponse.json({ success: true });
    res.headers.set('Set-Cookie', headers['Set-Cookie']);
    return res;
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Session creation failed' }, { status: 401 });
  }
}

// DELETE /api/auth/session — logout
export async function DELETE() {
  const headers = clearSessionCookieHeaders();
  const res = NextResponse.json({ success: true });
  res.headers.set('Set-Cookie', headers['Set-Cookie']);
  return res;
}
