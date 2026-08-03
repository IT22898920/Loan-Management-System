'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Lock, Mail } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginAction } from '@/app/actions/auth';
import { LOGIN_START_KEY } from '@/lib/session-config';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const result = await loginAction(formData);
    setLoading(false);
    if (result?.error) { toast.error(result.error); return; }
    if (result?.success) {
      // Admin 2FA path: password verified, OTP sent to email — go enter it.
      if (result?.requiresOtp) {
        toast.success('Verification code sent to your email.');
        router.push(result.redirectTo);
        return;
      }
      // Staff: fully logged in by password
      try {
        localStorage.setItem(LOGIN_START_KEY, Date.now().toString());
      } catch {}
      router.push(result.redirectTo);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 p-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-green-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative">
        {/* Logo card */}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-white rounded-3xl p-4 shadow-2xl shadow-black/40 mb-5">
            <Image
              src="/logo.jpg"
              alt="DIRIYALANKA Logo"
              width={80}
              height={80}
              className="object-contain"
              priority
            />
          </div>
          <h1 className="text-3xl font-black text-white tracking-wide">DIRIYALANKA</h1>
          <p className="text-cyan-400 text-xs font-medium tracking-[0.25em] uppercase mt-1">Encourage Your Life</p>
        </div>

        {/* Login form card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
          <h2 className="text-white font-semibold text-center mb-1">Welcome Back</h2>
          <p className="text-white/40 text-xs text-center mb-6">Sign in to your account</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-white/70 text-xs font-medium">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  className="login-input-dark pl-10 bg-white/10 border-white/10 text-white placeholder:text-white/20 rounded-xl focus:ring-cyan-500/50 focus:border-cyan-500/50"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-white/70 text-xs font-medium">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  className="login-input-dark pl-10 bg-white/10 border-white/10 text-white placeholder:text-white/20 rounded-xl focus:ring-cyan-500/50 focus:border-cyan-500/50"
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full mt-2 h-11 rounded-xl font-semibold text-sm bg-gradient-to-r from-cyan-500 to-green-500 hover:from-cyan-400 hover:to-green-400 border-0 text-white shadow-lg shadow-green-900/30"
            >
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in...</>
              ) : 'Sign In'}
            </Button>
          </form>
        </div>

        <p className="text-center text-white/20 text-xs mt-6">
          Loan Management System &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
