import { NextRequest, NextResponse } from 'next/server';
import { adminGetUserByWa } from '@/lib/firebase/users';
import { adminLog } from '@/lib/firebase/scores';
import { createOtpSession, createStatelessOtpSession, generateOtp } from '@/lib/firebase/otp';
import { sendWhatsApp, msgLoginOtp } from '@/lib/waha';
import { isFirestoreQuotaError } from '@/lib/firebase/errors';
import { adminAuth } from '@/lib/firebase/admin';
import type { AHLUser } from '@/types';

function normalizeWa(raw: string) {
  return raw.replace(/\D/g, '');
}

function waLast10(raw: string) {
  return normalizeWa(raw).slice(-10);
}

function firstValidPhone(...values: unknown[]) {
  return values
    .map(value => normalizeWa(String(value ?? '')))
    .find(value => value.length >= 10) ?? '';
}

async function findAuthUserByWa(waNumber: string): Promise<AHLUser | null> {
  const targetLast10 = waLast10(waNumber);
  let nextPageToken: string | undefined;

  do {
    const page = await adminAuth.listUsers(1000, nextPageToken);
    const match = page.users.find(user => {
      const claims = user.customClaims ?? {};
      const candidates = [
        claims.waNumber,
        claims.waNumberLast10,
        user.phoneNumber,
        user.displayName,
      ];
      return candidates.some(value => {
        const normalized = normalizeWa(String(value ?? ''));
        return normalized.length >= 10
          ? normalized.slice(-10) === targetLast10
          : normalized === targetLast10;
      });
    });

    if (match) {
      const claims = match.customClaims ?? {};
      const matchedWaNumber = firstValidPhone(claims.waNumber, match.phoneNumber, match.displayName, waNumber);
      return {
        uid: match.uid,
        name: String(claims.name ?? match.displayName ?? ''),
        role: (claims.role as AHLUser['role']) ?? 'intern',
        department: String(claims.department ?? ''),
        waNumber: matchedWaNumber,
        waNumberLast10: targetLast10,
        isActive: true,
        createdAt: { toDate: () => new Date() } as AHLUser['createdAt'],
        updatedAt: { toDate: () => new Date() } as AHLUser['updatedAt'],
      };
    }

    nextPageToken = page.pageToken;
  } while (nextPageToken);

  return null;
}

async function sendOtpResponse(user: AHLUser, useStateless: boolean) {
  const otp = generateOtp();
  const otpSession = useStateless
    ? createStatelessOtpSession(user, otp)
    : await createOtpSession(user, otp);

  await sendWhatsApp(user.waNumber, msgLoginOtp(otp));
  if (!useStateless) {
    await adminLog('INBOUND_WA', `OTP login requested: ${user.name}`, { uid: user.uid });
  }

  return NextResponse.json({
    success: true,
    data: {
      sessionId: otpSession.sessionId,
      expiresAt: otpSession.expiresAt,
    },
  });
}

// POST /api/auth/login
// Body: { waNumber: string }
// Sends WhatsApp OTP and returns an OTP session id
export async function POST(req: NextRequest) {
  let requestedWaNumber = '';
  try {
    const { waNumber } = await req.json();
    requestedWaNumber = waNumber;

    if (!waNumber) {
      return NextResponse.json({ success: false, error: 'WhatsApp number required' }, { status: 400 });
    }

    const user = await adminGetUserByWa(waNumber);
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found or inactive' }, { status: 401 });
    }

    return sendOtpResponse(user, false);
  } catch (err) {
    console.error('Login error', err);
    if (isFirestoreQuotaError(err)) {
      const fallbackUser = requestedWaNumber ? await findAuthUserByWa(requestedWaNumber) : null;
      if (fallbackUser) return sendOtpResponse(fallbackUser, true);

      return NextResponse.json({
        success: false,
        error: 'Firebase quota is exhausted right now, and this number could not be matched from Firebase Auth. Please try again after quota resets or billing is enabled.',
      }, { status: 503 });
    }
    return NextResponse.json({ success: false, error: 'Login failed' }, { status: 500 });
  }
}
