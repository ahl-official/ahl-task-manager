import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './admin';
import { adminGetUserByUid } from './users';
import type { AHLUser } from '@/types';

const COL = 'otpSessions';
const OTP_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;

function getOtpSecret(): string {
  return process.env.OTP_SECRET ?? process.env.CRON_SECRET ?? process.env.FIREBASE_PRIVATE_KEY ?? 'ahl-task-manager';
}

function hashOtp(sessionId: string, otp: string): string {
  return createHash('sha256')
    .update(`${sessionId}:${otp}:${getOtpSecret()}`)
    .digest('hex');
}

function signPayload(payload: string): string {
  return createHmac('sha256', getOtpSecret()).update(payload).digest('base64url');
}

function verifySignature(payload: string, signature: string): boolean {
  const expected = signPayload(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function generateOtp(): string {
  return String(randomInt(100000, 1000000));
}

export async function createOtpSession(user: AHLUser, otp: string): Promise<{ sessionId: string; expiresAt: string }> {
  const sessionId = randomBytes(24).toString('hex');
  const expiresAtDate = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  const ref = adminDb.collection(COL).doc(sessionId);

  await ref.set({
    id: sessionId,
    uid: user.uid,
    waNumber: user.waNumber,
    waNumberLast10: user.waNumberLast10,
    otpHash: hashOtp(sessionId, otp),
    attempts: 0,
    used: false,
    expiresAt: Timestamp.fromDate(expiresAtDate),
    createdAt: Timestamp.now(),
  });

  return { sessionId, expiresAt: expiresAtDate.toISOString() };
}

export function createStatelessOtpSession(user: AHLUser, otp: string): { sessionId: string; expiresAt: string } {
  const sessionId = randomBytes(24).toString('hex');
  const expiresAtDate = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  const payload = Buffer.from(JSON.stringify({
    id: sessionId,
    uid: user.uid,
    name: user.name,
    role: user.role,
    department: user.department,
    waNumber: user.waNumber,
    waNumberLast10: user.waNumberLast10,
    otpHash: hashOtp(sessionId, otp),
    expiresAt: expiresAtDate.toISOString(),
  })).toString('base64url');

  return {
    sessionId: `stateless.${payload}.${signPayload(payload)}`,
    expiresAt: expiresAtDate.toISOString(),
  };
}

export function verifyStatelessOtpSession(sessionToken: string, otp: string): AHLUser | null {
  const [, payload, signature] = sessionToken.split('.');
  if (!payload || !signature || !verifySignature(payload, signature)) return null;

  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (new Date(data.expiresAt).getTime() < Date.now()) {
    throw new Error('OTP expired. Please request a new code.');
  }

  if (data.otpHash !== hashOtp(data.id, otp)) {
    throw new Error('Invalid OTP.');
  }

  return {
    uid: data.uid,
    name: data.name,
    role: data.role,
    department: data.department,
    waNumber: data.waNumber,
    waNumberLast10: data.waNumberLast10,
    isActive: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
}

export async function verifyOtpSession(sessionId: string, otp: string): Promise<AHLUser> {
  if (sessionId.startsWith('stateless.')) {
    const user = verifyStatelessOtpSession(sessionId, otp);
    if (!user) throw new Error('Invalid OTP session. Please request a new code.');
    return user;
  }

  const ref = adminDb.collection(COL).doc(sessionId);
  const snap = await ref.get();

  if (!snap.exists) {
    throw new Error('OTP session not found. Please request a new code.');
  }

  const data = snap.data()!;

  if (data.used) {
    throw new Error('This OTP has already been used. Please request a new code.');
  }

  if ((data.attempts ?? 0) >= MAX_ATTEMPTS) {
    throw new Error('Too many incorrect attempts. Please request a new code.');
  }

  if (data.expiresAt.toMillis() < Date.now()) {
    throw new Error('OTP expired. Please request a new code.');
  }

  if (data.otpHash !== hashOtp(sessionId, otp)) {
    await ref.update({
      attempts: FieldValue.increment(1),
      updatedAt: Timestamp.now(),
    });
    throw new Error('Invalid OTP.');
  }

  await ref.update({
    used: true,
    verifiedAt: Timestamp.now(),
  });

  const user = await adminGetUserByUid(data.uid);
  if (!user || !user.isActive) {
    throw new Error('User not found or inactive.');
  }

  return user;
}
