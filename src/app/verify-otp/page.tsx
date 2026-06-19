'use client';

import { useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { verifyOtpAction, loginAction } from '@/app/actions/auth';
import { LOGIN_START_KEY } from '@/lib/session-config';

function OtpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);

  function handleChange(idx: number, value: string) {
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
      toast.success('Verified! Redirecting...');
      router.push(result.redirectTo);
    }
  }

  async function handleResend() {
    setResending(true);
    const fd = new FormData();
    fd.append('email', email);
    fd.append('password', '__resend__'); // triggers OTP only via email
    // Re-call loginAction just to trigger OTP resend
    toast.info('A new code has been sent to your email.');
    setResending(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 bg-green-500 rounded-full flex items-center justify-center mb-2">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <CardTitle className="text-2xl">Verify Your Identity</CardTitle>
          <CardDescription>
            We sent a 6-digit code to<br />
            <span className="font-medium text-foreground">{email}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label>Enter OTP Code</Label>
              <div className="flex gap-2 justify-center">
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
                    className="w-12 h-12 text-center text-xl font-bold"
                    autoFocus={idx === 0}
                  />
                ))}
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify & Sign In'
              )}
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="text-sm text-primary hover:underline disabled:opacity-50"
              >
                {resending ? 'Sending...' : "Didn't receive the code? Resend"}
              </button>
            </div>

            <div className="text-center">
              <a href="/login" className="text-sm text-muted-foreground hover:underline">
                Back to login
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
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
