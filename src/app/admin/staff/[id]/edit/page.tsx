'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, UserCog, KeyRound, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import {
  updateStaffAction,
  resetStaffPasswordAction,
  deleteStaffAction,
} from '@/app/actions/auth';

export default function EditStaffPage() {
  const router = useRouter();
  const params = useParams();
  const staffId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resettingPw, setResettingPw] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [assignmentCount, setAssignmentCount] = useState(0);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const [{ data: profile }, { count }] = await Promise.all([
        supabase.from('profiles').select('full_name, email, role').eq('id', staffId).single(),
        supabase
          .from('staff_center_assignments')
          .select('id', { count: 'exact', head: true })
          .eq('staff_id', staffId),
      ]);

      if (!profile || profile.role !== 'staff') {
        toast.error('Staff member not found.');
        router.push('/admin/staff');
        return;
      }
      setFullName(profile.full_name ?? '');
      setEmail(profile.email ?? '');
      setAssignmentCount(count ?? 0);
      setLoading(false);
    }
    load();
  }, [staffId, router]);

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData();
    fd.append('full_name', fullName);
    fd.append('email', email);
    const result = await updateStaffAction(staffId, fd);
    setSaving(false);
    if (result?.error) { toast.error(result.error); return; }
    toast.success('Staff details updated.');
  }

  async function handleResetPassword() {
    if (!newPassword || newPassword.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    setResettingPw(true);
    const result = await resetStaffPasswordAction(staffId, newPassword);
    setResettingPw(false);
    if (result?.error) { toast.error(result.error); return; }
    toast.success('Password reset successfully.');
    setNewPassword('');
  }

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteStaffAction(staffId);
    setDeleting(false);
    if (result?.error) { toast.error(result.error); return; }
    toast.success('Staff member deleted.');
    router.push('/admin/staff');
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white px-4 md:px-8 py-6 md:py-8">
        <Link href="/admin/staff" className="inline-flex items-center gap-2 text-blue-200 hover:text-white text-sm mb-3 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Staff
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center text-xl font-bold">
            {fullName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Edit Staff Member</h1>
            <p className="text-blue-200 text-sm mt-0.5">{fullName}</p>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-2xl space-y-5">
        {/* Details */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
              <UserCog className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Account Details</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Name and email can be updated.</p>
            </div>
          </div>

          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full Name *</Label>
              <Input
                id="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="rounded-xl"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving} className="rounded-xl">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</> : 'Save Changes'}
              </Button>
              <Button type="button" variant="outline" className="rounded-xl" asChild>
                <Link href="/admin/staff">Cancel</Link>
              </Button>
            </div>
          </form>
        </div>

        {/* Password reset */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <KeyRound className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Reset Password</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Set a new password for this staff member.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new_password">New Password</Label>
              <Input
                id="new_password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                minLength={8}
                className="rounded-xl"
              />
            </div>
            <Button
              type="button"
              onClick={handleResetPassword}
              disabled={resettingPw || !newPassword}
              variant="outline"
              className="rounded-xl border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              {resettingPw ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Resetting...</> : 'Reset Password'}
            </Button>
          </div>
        </div>

        {/* Danger zone — Delete */}
        <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
              <Trash2 className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h2 className="font-semibold text-red-700">Danger Zone</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Permanently delete this staff account.</p>
            </div>
          </div>

          {!showDeleteConfirm ? (
            <Button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              variant="outline"
              className="rounded-xl border-red-300 text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete Staff Member
            </Button>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                <div className="text-sm text-red-800">
                  <p className="font-semibold">Are you sure you want to delete <strong>{fullName}</strong>?</p>
                  <ul className="mt-2 text-xs text-red-700 list-disc list-inside space-y-1">
                    <li>The staff login account will be permanently removed.</li>
                    {assignmentCount > 0 && (
                      <li><strong>{assignmentCount} center assignment{assignmentCount !== 1 ? 's' : ''}</strong> will be removed.</li>
                    )}
                    <li>Historical payment records will be kept (for audit purposes).</li>
                    <li>This action cannot be undone.</li>
                  </ul>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-xl bg-red-600 hover:bg-red-700 text-white"
                >
                  {deleting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Deleting...</> : 'Yes, Delete'}
                </Button>
                <Button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  variant="outline"
                  className="rounded-xl"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
