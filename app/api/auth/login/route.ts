import { NextRequest, NextResponse } from 'next/server';
import { adminGetUserByWa } from '@/lib/firebase/users';
import { adminLog } from '@/lib/firebase/scores';
import { createOtpSession, generateOtp } from '@/lib/firebase/otp';
import { sendWhatsApp, msgLoginOtp } from '@/lib/waha';

// POST /api/auth/login
// Body: { waNumber: string }
// Sends WhatsApp OTP and returns an OTP session id
export async function POST(req: NextRequest) {
  try {
    const { waNumber } = await req.json();

    if (!waNumber) {
      return NextResponse.json({ success: false, error: 'WhatsApp number required' }, { status: 400 });
    }

    const user = await adminGetUserByWa(waNumber);
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found or inactive' }, { status: 401 });
    }

    const otp = generateOtp();
    const otpSession = await createOtpSession(user, otp);

    await sendWhatsApp(user.waNumber, msgLoginOtp(otp));
    await adminLog('INBOUND_WA', `OTP login requested: ${user.name}`, { uid: user.uid });

    return NextResponse.json({
      success: true,
      data: {
        sessionId: otpSession.sessionId,
        expiresAt: otpSession.expiresAt,
      },
    });
  } catch (err) {
    console.error('Login error', err);
    return NextResponse.json({ success: false, error: 'Login failed' }, { status: 500 });
  }
}
