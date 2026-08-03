'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-guard';
import { safeError } from '@/lib/safe-error';
import { z } from 'zod';

// Member numbers are alphanumeric by design — real books use formats like
// DLK0796, MBR-017 and D/107/001, so numeric-only validation would reject
// existing numbering schemes (QA 86eyezphc). Allowed: letters, digits, - and /.
const memberSchema = z.object({
  member_number: z
    .string()
    .min(1, 'Member number is required')
    .max(30, 'Member number is too long')
    .regex(/^[A-Za-z0-9/-]+$/, 'Member number can only contain letters, numbers, "-" and "/" (no spaces)'),
  full_name: z.string().min(1, 'Full name is required'),
  center_id: z.string().uuid('Invalid center'),
});

export async function createMemberAction(formData: FormData) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const supabase = await createClient();

  const parsed = memberSchema.safeParse({
    member_number: formData.get('member_number'),
    full_name: formData.get('full_name'),
    center_id: formData.get('center_id'),
  });

  if (!parsed.success) return { error: parsed.error.errors[0].message };

  // Block exact duplicates (same member number AND same name, not archived).
  // member_number alone is deliberately NOT unique — legacy books reuse
  // numbers across centers — so only the exact pair is rejected (QA 86eydenvg).
  const { data: dup } = await supabase
    .from('members')
    .select('id')
    .eq('member_number', parsed.data.member_number)
    .ilike('full_name', parsed.data.full_name)
    .is('archived_at', null)
    .limit(1)
    .maybeSingle();
  if (dup) {
    return {
      error: `A member named "${parsed.data.full_name}" with number ${parsed.data.member_number} already exists.`,
    };
  }

  let photo_url: string | null = null;
  const photoFile = formData.get('photo') as File | null;

  if (photoFile && photoFile.size > 0) {
    const ext = photoFile.name.split('.').pop();
    const fileName = `${parsed.data.member_number}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('member-photos')
      .upload(fileName, photoFile, { contentType: photoFile.type, upsert: true });

    if (uploadError) return { error: safeError(uploadError, 'Photo upload failed.') };
    photo_url = fileName;
  }

  const { data, error } = await supabase
    .from('members')
    .insert({
      ...parsed.data,
      photo_url,
      created_by: auth.userId,
    })
    .select('id')
    .single();

  if (error) return { error: safeError(error, 'Could not add member.') };

  revalidatePath('/admin/members');
  return { success: true, memberId: data.id };
}

export async function updateMemberAction(id: string, formData: FormData) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const supabase = await createClient();

  const parsed = memberSchema.safeParse({
    member_number: formData.get('member_number'),
    full_name: formData.get('full_name'),
    center_id: formData.get('center_id'),
  });

  if (!parsed.success) return { error: parsed.error.errors[0].message };

  let photo_url: string | undefined;
  const photoFile = formData.get('photo') as File | null;

  if (photoFile && photoFile.size > 0) {
    const ext = photoFile.name.split('.').pop();
    const fileName = `${parsed.data.member_number}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('member-photos')
      .upload(fileName, photoFile, { contentType: photoFile.type, upsert: true });

    if (uploadError) return { error: safeError(uploadError, 'Photo upload failed.') };
    photo_url = fileName;
  }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (photo_url) updateData.photo_url = photo_url;

  const { error } = await supabase.from('members').update(updateData).eq('id', id);

  if (error) return { error: safeError(error, 'Could not update member.') };

  revalidatePath('/admin/members');
  revalidatePath(`/admin/members/${id}`);
  return { success: true };
}
