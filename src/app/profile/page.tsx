'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Lock, ArrowLeft, User, Mail, ShieldCheck } from 'lucide-react';
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
}

export default function ProfilePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('full_name, role, photo_url')
        .eq('id', user.id)
        .single();
      if (data) {
        setProfile({
          full_name: data.full_name,
          email: user.email ?? '',
          role: data.role,
          photo_url: data.photo_url ?? null,
        });
      }
    }
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = fd.get('password') as string;
    const confirm = fd.get('confirm') as string;

    if (password !== confirm) {
      toast.error('Passwords do not match.');
      return;
    }

    setSaving(true);
    const result = await changePasswordAction(fd);
    setSaving(false);

    if (result?.error) { toast.error(result.error); return; }
    toast.success('Password changed successfully!');
    (e.target as HTMLFormElement).reset();
  }

  const isAdmin = profile?.role === 'admin';
  const backHref = isAdmin ? '/admin/dashboard' : '/staff/dashboard';

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Gradient Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white px-4 pt-4 pb-8">
        <button
          onClick={() => router.push(backHref)}
          className="inline-flex items-center gap-2 text-blue-200 hover:text-white text-sm mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </button>

        <div className="flex items-center gap-4 mb-5">
          {profile?.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.photo_url}
              alt={profile.full_name + ' photo'}
              className="w-14 h-14 rounded-2xl object-cover border border-white/30"
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center text-2xl font-bold">
              {profile?.full_name?.charAt(0).toUpperCase() ?? '?'}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold">{profile?.full_name ?? '...'}</h1>
            <p className="text-blue-200 text-sm">{profile?.email}</p>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-white/20 flex items-center gap-2">
            <Mail className="h-4 w-4 text-blue-200" />
            <div>
              <p className="text-[10px] text-blue-200">Email</p>
              <p className="font-medium text-sm truncate max-w-[150px]">{profile?.email ?? '...'}</p>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-white/20 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-blue-200" />
            <div>
              <p className="text-[10px] text-blue-200">Role</p>
              <p className="font-medium text-sm capitalize">{profile?.role ?? '...'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 max-w-lg mx-auto space-y-4">
        {/* Profile Photo Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center">
              <User className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Profile Photo</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Shown across the system to identify you.</p>
            </div>
          </div>
          <div className="p-5">
            {profile && (
              <ProfilePhotoUpload
                initialPhotoUrl={profile.photo_url}
                fullName={profile.full_name}
              />
            )}
          </div>
        </div>

        {/* Password Change Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Lock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Change Password</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Min. 8 characters required</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">New Password</Label>
              <Input
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="Min. 8 characters"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Confirm Password</Label>
              <Input
                name="confirm"
                type="password"
                required
                minLength={8}
                placeholder="Repeat your password"
                className="rounded-xl"
              />
            </div>
            <Button type="submit" className="w-full rounded-xl h-11" disabled={saving}>
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Updating...</>
              ) : (
                <><Lock className="h-4 w-4 mr-2" />Update Password</>
              )}
            </Button>
          </form>
        </div>

        {/* Account info card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center">
              <User className="h-5 w-5 text-gray-500" />
            </div>
            <h2 className="font-semibold text-gray-900">Account Info</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {[
              { label: 'Full Name', value: profile?.full_name },
              { label: 'Email', value: profile?.email },
              { label: 'Role', value: profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : undefined },
            ].map(({ label, value }) => (
              <div key={label} className="px-5 py-3.5 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className="text-sm font-medium text-gray-800">{value ?? '...'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
