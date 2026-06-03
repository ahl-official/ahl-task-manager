import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { verifyOtpSession } from '@/lib/firebase/otp';
import { adminLog } from '@/lib/firebase/scores';

// POST /api/auth/verify-otp
// Body: { sessionId: string, otp: string }
// Returns Firebase custom token + user info
export async function POST(req: NextRequest) {
  try {
    const { sessionId, otp } = await req.json();

    if (!sessionId || !otp) {
      return NextResponse.json({ success: false, error: 'OTP session and code are required' }, { status: 400 });
    }

    const normalizedOtp = String(otp).replace(/\D/g, '');
    if (normalizedOtp.length !== 6) {
      return NextResponse.json({ success: false, error: 'Enter the 6-digit OTP' }, { status: 400 });
    }

    const user = await verifyOtpSession(sessionId, normalizedOtp);

    const customToken = await adminAuth.createCustomToken(user.uid, {
      role:       user.role,
      department: user.department,
      waNumber:   user.waNumber,
      name:       user.name,
    });

    await adminLog('INBOUND_WA', `OTP login verified: ${user.name}`, { uid: user.uid });

    return NextResponse.json({
      success: true,
      data: {
        customToken,
        user: {
          uid:        user.uid,
          name:       user.name,
          role:       user.role,
          department: user.department,
          waNumber:   user.waNumber,
        },
      },
    });
  } catch (err: any) {
    console.error('Verify OTP error', err);
    return NextResponse.json({ success: false, error: err.message ?? 'OTP verification failed' }, { status: 401 });
  }
}

