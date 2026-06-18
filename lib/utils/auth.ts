import { cookies } from 'next/headers';
import type { SessionUser, UserRole } from '@/types';

const SESSION_COOKIE = 'ahl_session';
const SESSION_EXPIRY = 60 * 60 * 24 * 7 * 1000; // 7 days in ms
const encoder = new TextEncoder();

function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? encoder.encode(input) : new Uint8Array(input);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return Buffer.from(binary, 'binary').toString('base64url');
}

function fromBase64url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

async function sign(value: string): Promise<string> {
  const secret = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || process.env.CLOUDFLARE_API_SECRET || 'ahl-dev-session-secret';
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return base64url(signature);
}

export async function createSessionCookie(user: SessionUser): Promise<string> {
  const payload = base64url(JSON.stringify({
    ...user,
    exp: Date.now() + SESSION_EXPIRY,
  }));
  return `${payload}.${await sign(payload)}`;
}

export async function verifySessionCookie(sessionCookie: string): Promise<SessionUser | null> {
  try {
    const [payload, signature] = sessionCookie.split('.');
    if (!payload || !signature || signature !== await sign(payload)) return null;
    const decoded = JSON.parse(fromBase64url(payload));
    if (!decoded.exp || decoded.exp < Date.now()) return null;
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
