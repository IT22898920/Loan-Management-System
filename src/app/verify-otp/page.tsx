'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, ShieldCheck, ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { verifyOtpAction, resendOtpAction } from '@/app/actions/auth';
import { LOGIN_START_KEY } from '@/lib/session-config';

const RESEND_COOLDOWN_S = 60;

function OtpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);

  // Tick down the resend cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function handleChange(idx: number, value: string) {
    // Allow pasting the full 6-digit code into any input
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 6).split('');
      if (digits.length === 6) {
        setOtp(digits);
        inputsRef.current[5]?.focus();
        return;
      }
    }
    if (!/^\d?$/.test(value)) return;
    const next = [...otp];
    next[idx] = value;
    setOtp(next);
    if (value && idx < 5) {
      inputsRef.current[idx + 1]?.focus();
    }
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = otp.join('');
    if (token.length !== 6) {
      toast.error('Please enter the complete 6-digit code.');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('email', email);
    formData.append('token', token);

    const result = await verifyOtpAction(formData);
    setLoading(false);

    if (result?.error) {
      toast.error(result.error);
      setOtp(['', '', '', '', '', '']);
      inputsRef.current[0]?.focus();
      return;
    }

    if (result?.success) {
      try {
        localStorage.setItem(LOGIN_START_KEY, Date.now().toString());
      } catch {}
      toast.success('Verified! Redirecting…');
      router.push(result.redirectTo);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || resending) return;
    setResending(true);
    const result = await resendOtpAction(email);
    setResending(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success('A new code has been sent to your email.');
    setCooldown(RESEND_COOLDOWN_S);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-green-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative">
        <div className="flex flex-col items-center mb-6">
          <div className="bg-white rounded-3xl p-4 shadow-2xl shadow-black/40 mb-5">
            <Image src="/logo.jpg" alt="DIRIYALANKA Logo" width={80} height={80} className="object-contain" priority />
          </div>
          <h1 className="text-3xl font-black text-white tracking-wide">DIRIYALANKA</h1>
          <p className="text-cyan-400 text-xs font-medium tracking-[0.25em] uppercase mt-1">Encourage Your Life</p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-green-500 flex items-center justify-center shadow-lg shadow-cyan-900/40">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
          </div>
          <h2 className="text-white font-semibold text-center mb-1">Verify Your Identity</h2>
          <p className="text-white/40 text-xs text-center mb-6">
            We sent a 6-digit code to<br />
            <span className="font-medium text-cyan-300">{email || 'your email'}</span>
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex gap-2 justify-center" onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              if (/^\d{6}$/.test(text.trim())) {
                e.preventDefault();
                setOtp(text.trim().split(''));
                inputsRef.current[5]?.focus();
              }
            }}>
              {otp.map((digit, idx) => (
                <Input
                  key={idx}
                  ref={(el) => { inputsRef.current[idx] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  className="w-11 h-12 text-center text-xl font-bold bg-white/10 border-white/10 text-white rounded-xl focus:ring-cyan-500/50 focus:border-cyan-500/50"
                  autoFocus={idx === 0}
                  autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                />
              ))}
            </div>

            <Button
              type="submit"
              disabled={loading || otp.join('').length !== 6}
              className="w-full h-11 rounded-xl font-semibold text-sm bg-gradient-to-r from-cyan-500 to-green-500 hover:from-cyan-400 hover:to-green-400 border-0 text-white shadow-lg shadow-green-900/30 disabled:opacity-50"
            >
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying…</>
              ) : 'Verify & Sign In'}
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={handleResend}
                disabled={resending || cooldown > 0}
                className="text-xs text-cyan-300 hover:text-cyan-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {resending
                  ? 'Sending…'
                  : cooldown > 0
                    ? `Resend code in ${cooldown}s`
                    : "Didn't receive the code? Resend"}
              </button>
            </div>
          </form>
        </div>

        <div className="text-center mt-4">
          <a href="/login" className="inline-flex items-center gap-1 text-xs text-white/30 hover:text-white/60">
            <ArrowLeft className="h-3 w-3" /> Back to login
          </a>
        </div>

        <p className="text-center text-white/20 text-xs mt-6">
          Loan Management System &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense>
      <OtpForm />
    </Suspense>
  );
}
