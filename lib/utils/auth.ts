import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase/admin';
import type { SessionUser, UserRole } from '@/types';

const SESSION_COOKIE = 'ahl_session';
const SESSION_EXPIRY = 60 * 60 * 24 * 7 * 1000; // 7 days in ms

export async function createSessionCookie(idToken: string): Promise<string> {
  const expiresIn = SESSION_EXPIRY;
  return adminAuth.createSessionCookie(idToken, { expiresIn });
}

export async function verifySessionCookie(sessionCookie: string): Promise<SessionUser | null> {
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    return {
      uid:        decoded.uid,
      name:       decoded.name as string ?? '',
      role:       decoded.role as UserRole ?? 'intern',
      department: decoded.department as string ?? '',
      waNumber:   decoded.waNumber as string ?? '',
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);
  if (!cookie) return null;
  return verifySessionCookie(cookie.value);
}

export function setSessionCookieHeaders(sessionCookie: string) {
  return {
    'Set-Cookie': `${SESSION_COOKIE}=${sessionCookie}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_EXPIRY / 1000}`,
  };
}

export function clearSessionCookieHeaders() {
  return {
    'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  };
}
