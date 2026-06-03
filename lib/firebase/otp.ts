import { createHash, randomBytes, randomInt } from 'crypto';
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

export async function verifyOtpSession(sessionId: string, otp: string): Promise<AHLUser> {
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

