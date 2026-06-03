'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { toast } from 'sonner';
import { Phone, ArrowRight, Loader2, ShieldCheck, RotateCcw } from 'lucide-react';

export default function LoginPage() {
  const [waNumber, setWaNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSessionId, setOtpSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function requestOtp(e?: React.FormEvent) {
    e?.preventDefault();
    if (!waNumber.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waNumber: waNumber.trim() }),
      });

      const data = await res.json();
      if (!data.success) {
        toast.error(data.error ?? 'Failed to send OTP');
        return;
      }

      setOtpSessionId(data.data.sessionId);
      setOtp('');
      toast.success('OTP sent on WhatsApp');
    } catch (err) {
      console.error(err);
      toast.error('Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!otpSessionId || otp.length !== 6) return;

    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: otpSessionId, otp }),
      });

      const data = await res.json();
      if (!data.success) {
        toast.error(data.error ?? 'OTP verification failed');
        return;
      }

      const credential = await signInWithCustomToken(auth, data.data.customToken);
      const idToken = await credential.user.getIdToken();
      const sessionRes = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      const sessionData = await sessionRes.json();
      if (!sessionData.success) {
        toast.error('Session creation failed');
        return;
      }

      const role = data.data.user.role;
      toast.success(`Welcome, ${data.data.user.name}!`);
      router.push(role === 'admin' ? '/admin' : '/portal');
    } catch (err) {
      console.error(err);
      toast.error('OTP verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-600 text-white text-2xl font-bold mb-4 shadow-lg">
            AHL
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Task Manager</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in with a WhatsApp OTP</p>
        </div>

        <div className="card p-8">
          <form onSubmit={otpSessionId ? verifyOtp : requestOtp} className="space-y-5">
            <div>
              <label className="label">WhatsApp Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="tel"
                  placeholder="919876543210"
                  value={waNumber}
                  onChange={e => setWaNumber(e.target.value)}
                  className="input pl-9"
                  disabled={loading || !!otpSessionId}
                  autoComplete="tel"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Enter with country code (e.g. 919876543210)</p>
            </div>

            {otpSessionId && (
              <div>
                <label className="label">OTP Code</label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="6-digit code"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="input pl-9 tracking-widest"
                    disabled={loading}
                    autoComplete="one-time-code"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => requestOtp()}
                  disabled={loading}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
                >
                  <RotateCcw size={12} /> Resend OTP
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !waNumber.trim() || (!!otpSessionId && otp.length !== 6)}
              className="btn-primary w-full justify-center py-3"
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /> Please wait...</>
              ) : otpSessionId ? (
                <>Verify & Sign In <ArrowRight size={16} /></>
              ) : (
                <>Send OTP <ArrowRight size={16} /></>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Contact admin if you don't have access
        </p>
      </div>
    </div>
  );
}
