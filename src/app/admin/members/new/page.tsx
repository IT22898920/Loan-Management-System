'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Upload, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';
import { Center } from '@/types';
import { createMemberAction } from '@/app/actions/members';
import Image from 'next/image';

export default function NewMemberPage() {
  const router = useRouter();
  const [centers, setCenters] = useState<Center[]>([]);
  const [saving, setSaving] = useState(false);
  const [centerId, setCenterId] = useState('');
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.from('centers').select('*').order('center_number').then(({ data }) => setCenters(data ?? []));
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!centerId) { toast.error('Please select a center.'); return; }
    setSaving(true);

    const fd = new FormData(e.currentTarget);
    fd.set('center_id', centerId);

    const result = await createMemberAction(fd);
    setSaving(false);

    if (result?.error) { toast.error(result.error); return; }

    toast.success('Member created successfully!');
    router.push('/admin/members');
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setPreview(URL.createObjectURL(file));
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white px-4 md:px-8 py-6 md:py-8">
        <Link href="/admin/members" className="inline-flex items-center gap-2 text-blue-200 hover:text-white text-sm mb-3 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Members
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold">Add New Member</h1>
        <p className="text-blue-200 text-sm mt-1">Register a new loan member</p>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-2xl">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <UserPlus className="h-5 w-5 text-blue-600" />
            </div>
            <h2 className="font-semibold text-gray-900">Member Details</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Photo upload */}
            <div className="flex justify-center">
              <label className="cursor-pointer group">
                <div className="w-28 h-28 rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden group-hover:border-primary transition-colors">
                  {preview ? (
                    <Image src={preview} alt="Preview" width={112} height={112} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <Upload className="h-7 w-7 text-gray-300" />
                      <span className="text-xs text-gray-400">Photo</span>
                    </div>
                  )}
                </div>
                <input type="file" name="photo" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                <p className="text-xs text-center text-muted-foreground mt-2">Upload Photo (optional)</p>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="member_number">Member Number *</Label>
                <Input id="member_number" name="member_number" required placeholder="e.g. 001" className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input id="full_name" name="full_name" required placeholder="Full name" className="rounded-xl" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Center *</Label>
              <Select onValueChange={setCenterId} required>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Select a center" />
                </SelectTrigger>
                <SelectContent>
                  {centers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      #{c.center_number} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving} className="rounded-xl">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</> : 'Create Member'}
              </Button>
              <Button type="button" variant="outline" className="rounded-xl" asChild>
                <Link href="/admin/members">Cancel</Link>
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
