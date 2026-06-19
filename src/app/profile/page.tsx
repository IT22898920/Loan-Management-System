'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Loader2, Lock, ArrowLeft, User, Mail, ShieldCheck,
  Eye, EyeOff, CheckCircle2, Sparkles, Calendar, KeyRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changePasswordAction } from '@/app/actions/auth';
import { createClient } from '@/lib/supabase/client';
import ProfilePhotoUpload from '@/components/ProfilePhotoUpload';

interface UserProfile {
  full_name: string;
  email: string;
  role: string;
  photo_url: string | null;
  created_at: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('full_name, role, photo_url, created_at')
        .eq('id', user.id)
        .single();
      if (data) {
        setProfile({
          full_name: data.full_name,
          email: user.email ?? '',
          role: data.role,
          photo_url: data.photo_url ?? null,
          created_at: data.created_at,
        });
      }
    }
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (newPwd !== confirmPwd) {
      toast.error('Passwords do not match.');
      return;
    }

    setSaving(true);
    const fd = new FormData();
    fd.append('password', newPwd);
    fd.append('confirm', confirmPwd);
    const result = await changePasswordAction(fd);
    setSaving(false);

    if (result?.error) { toast.error(result.error); return; }
    toast.success('Password changed successfully!');
    setNewPwd('');
    setConfirmPwd('');
  }

  const isAdmin = profile?.role === 'admin';
  const backHref = isAdmin ? '/admin/dashboard' : '/staff/dashboard';
  const initials = profile?.full_name?.charAt(0).toUpperCase() ?? '?';
  const joined = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', {
        month: 'short', year: 'numeric',
      })
    : '...';

  // Password strength meter (visual only; server enforces real policy)
  const pwdScore = (() => {
    let s = 0;
    if (newPwd.length >= 8) s++;
    if (newPwd.length >= 12) s++;
    if (/[a-z]/.test(newPwd) && /[A-Z]/.test(newPwd)) s++;
    if (/\d/.test(newPwd)) s++;
    if (/[^A-Za-z0-9]/.test(newPwd)) s++;
    return s; // 0..5
  })();
  const pwdLabel = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'][pwdScore];
  const pwdColor = ['bg-gray-200', 'bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-emerald-400', 'bg-emerald-500'][pwdScore];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* HERO HEADER */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-700 to-purple-800">
        {/* Decorative blurs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -right-24 w-72 h-72 bg-cyan-400/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-pink-400/20 rounded-full blur-3xl" />
        </div>

        <div className="relative px-4 pt-4 pb-12 max-w-2xl mx-auto">
          <button
            onClick={() => router.push(backHref)}
            className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm mb-6 transition-colors group"
          >
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
            Back to Dashboard
          </button>

          <div className="flex flex-col sm:flex-row sm:items-end gap-5">
            {/* Big avatar */}
            <div className="relative shrink-0">
              {profile?.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.photo_url}
                  alt={profile.full_name + ' photo'}
                  className="w-28 h-28 rounded-3xl object-cover border-4 border-white/30 shadow-2xl shadow-black/30"
                />
              ) : (
                <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-cyan-400 to-blue-500 border-4 border-white/30 shadow-2xl shadow-black/30 flex items-center justify-center text-5xl font-black text-white">
                  {initials}
                </div>
              )}
              {/* Role badge */}
              <div
                className={`absolute -bottom-1.5 -right-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider shadow-lg border-2 border-white ${
                  isAdmin
                    ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-white'
                    : 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white'
                }`}
              >
                {profile?.role ?? '...'}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight truncate">
                {profile?.full_name ?? '...'}
              </h1>
              <p className="text-white/70 text-sm mt-1 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                <span className="truncate">{profile?.email ?? '...'}</span>
              </p>
            </div>
          </div>

          {/* Stat pills */}
          <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl px-3 py-3 border border-white/15">
              <div className="flex items-center gap-1.5 text-white/60 text-[10px] uppercase tracking-wider font-semibold mb-1">
                <ShieldCheck className="h-3 w-3" /> Role
              </div>
              <p className="text-white font-bold text-sm capitalize truncate">{profile?.role ?? '...'}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-2xl px-3 py-3 border border-white/15">
              <div className="flex items-center gap-1.5 text-white/60 text-[10px] uppercase tracking-wider font-semibold mb-1">
                <Calendar className="h-3 w-3" /> Joined
              </div>
              <p className="text-white font-bold text-sm truncate">{joined}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-2xl px-3 py-3 border border-white/15">
              <div className="flex items-center gap-1.5 text-white/60 text-[10px] uppercase tracking-wider font-semibold mb-1">
                <CheckCircle2 className="h-3 w-3" /> Status
              </div>
              <p className="text-emerald-300 font-bold text-sm flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CONTENT — overlapping card layout */}
      <div className="px-4 -mt-6 pb-12 max-w-2xl mx-auto space-y-4 relative">
        {/* Profile Photo Card */}
        <div className="bg-white rounded-3xl shadow-xl shadow-blue-900/5 border border-gray-100 overflow-hidden hover:shadow-2xl hover:shadow-blue-900/10 transition-shadow">
          <div className="px-6 py-5 border-b border-gray-50 flex items-center gap-3 bg-gradient-to-r from-violet-50/50 to-transparent">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-200">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">Profile Photo</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Shown across the system to identify you
              </p>
            </div>
          </div>
          <div className="p-6">
            {profile && (
              <ProfilePhotoUpload
                initialPhotoUrl={profile.photo_url}
                fullName={profile.full_name}
              />
            )}
          </div>
        </div>

        {/* Password Change Card */}
        <div className="bg-white rounded-3xl shadow-xl shadow-blue-900/5 border border-gray-100 overflow-hidden hover:shadow-2xl hover:shadow-blue-900/10 transition-shadow">
          <div className="px-6 py-5 border-b border-gray-50 flex items-center gap-3 bg-gradient-to-r from-blue-50/50 to-transparent">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-blue-200">
              <KeyRound className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">Change Password</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Use at least 8 characters
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-700">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                <Input
                  type={showNew ? 'text' : 'password'}
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Min. 8 characters"
                  className="pl-10 pr-10 rounded-xl h-11"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                  aria-label={showNew ? 'Hide password' : 'Show password'}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Strength meter */}
              {newPwd.length > 0 && (
                <div className="pt-1.5">
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden flex gap-0.5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`flex-1 transition-all ${i < pwdScore ? pwdColor : 'bg-gray-100'}`}
                      />
                    ))}
                  </div>
                  <p className="text-[10px] font-medium text-gray-500 mt-1 uppercase tracking-wider">
                    {pwdLabel || 'Enter password'}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-700">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                <Input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Repeat your password"
                  className="pl-10 pr-10 rounded-xl h-11"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPwd.length > 0 && (
                <p className={`text-[11px] font-medium pt-0.5 ${
                  newPwd === confirmPwd ? 'text-emerald-600' : 'text-red-500'
                }`}>
                  {newPwd === confirmPwd ? '✓ Passwords match' : '✗ Passwords do not match'}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full rounded-xl h-12 font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-200"
              disabled={saving || newPwd.length < 8 || newPwd !== confirmPwd}
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Updating…</>
              ) : (
                <><KeyRound className="h-4 w-4 mr-2" />Update Password</>
              )}
            </Button>
          </form>
        </div>

        {/* Account Info Card */}
        <div className="bg-white rounded-3xl shadow-xl shadow-blue-900/5 border border-gray-100 overflow-hidden hover:shadow-2xl hover:shadow-blue-900/10 transition-shadow">
          <div className="px-6 py-5 border-b border-gray-50 flex items-center gap-3 bg-gradient-to-r from-emerald-50/50 to-transparent">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-200">
              <User className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">Account Information</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Read-only — contact admin to make changes
              </p>
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {[
              { label: 'Full Name', value: profile?.full_name, icon: User, color: 'text-blue-500' },
              { label: 'Email Address', value: profile?.email, icon: Mail, color: 'text-violet-500' },
              {
                label: 'Role',
                value: profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : undefined,
                icon: ShieldCheck,
                color: isAdmin ? 'text-amber-500' : 'text-cyan-500',
              },
              { label: 'Member Since', value: joined, icon: Calendar, color: 'text-emerald-500' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="px-6 py-4 flex items-center justify-between gap-3 hover:bg-gray-50/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`h-4 w-4 ${color} shrink-0`} />
                  <span className="text-sm text-gray-500">{label}</span>
                </div>
                <span className="text-sm font-semibold text-gray-900 text-right truncate max-w-[60%]">
                  {value ?? '...'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Tip card */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-blue-900">Security tip</p>
            <p className="text-xs text-blue-700 mt-0.5 leading-relaxed">
              Use a unique password you don't use elsewhere. Admins receive an OTP on every login for extra protection.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
