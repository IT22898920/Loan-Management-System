'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createStaffAction } from '@/app/actions/auth';

export default function NewStaffPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const result = await createStaffAction(fd);
    setSaving(false);

    if (result?.error) { toast.error(result.error); return; }
    toast.success('Staff account created! They can now log in.');
    router.push('/admin/staff');
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white px-4 md:px-8 py-6 md:py-8">
        <Link href="/admin/staff" className="inline-flex items-center gap-2 text-blue-200 hover:text-white text-sm mb-3 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Staff
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold">Add Staff Member</h1>
        <p className="text-blue-200 text-sm mt-1">Create a new field staff account</p>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-lg">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
              <UserCog className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Staff Account Details</h2>
              <p className="text-xs text-muted-foreground mt-0.5">They can change their password from their profile.</p>
            </div>
          </div>

          <div className="border-t border-gray-100 mt-4 pt-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input id="full_name" name="full_name" required placeholder="e.g. Kamal Perera" className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email Address *</Label>
                <Input id="email" name="email" type="email" required placeholder="staff@example.com" className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Initial Password *</Label>
                <Input id="password" name="password" type="password" required placeholder="Min. 8 characters" minLength={8} className="rounded-xl" />
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={saving} className="rounded-xl">
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating...</> : 'Create Account'}
                </Button>
                <Button type="button" variant="outline" className="rounded-xl" asChild>
                  <Link href="/admin/staff">Cancel</Link>
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
