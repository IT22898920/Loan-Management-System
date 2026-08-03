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
    .trim()
    .min(1, 'Member number is required')
    .max(30, 'Member number is too long')
    .regex(/^[A-Za-z0-9/-]+$/, 'Member number can only contain letters, numbers, "-" and "/" (no spaces)'),
  full_name: z
    .string()
    .trim()
    .min(1, 'Full name is required')
    .transform((s) => s.replace(/\s+/g, ' ')),
  center_id: z.string().uuid('Invalid center'),
});

/** Escape ilike pattern metacharacters so a typed name is matched literally. */
function likeLiteral(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}

/**
 * True when another ACTIVE member in the SAME CENTER already uses this
 * number + name pair. Center-scoped because legacy books legitimately carry
 * the same member across two centers (191 such active pairs in production).
 * Number compared case-insensitively (charset has no wildcard chars); name
 * pattern is escaped so % and _ in typed input match literally.
 */
async function activeDuplicateExists(
  supabase: Awaited<ReturnType<typeof createClient>>,
  member_number: string,
  full_name: string,
  center_id: string,
  excludeId?: string
): Promise<boolean> {
  let q = supabase
    .from('members')
    .select('id')
    .ilike('member_number', member_number)
    .ilike('full_name', likeLiteral(full_name))
    .eq('center_id', center_id)
    .is('archived_at', null)
    .limit(1);
  if (excludeId) q = q.neq('id', excludeId);
  const { data } = await q.maybeSingle();
  return !!data;
}

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
  if (await activeDuplicateExists(supabase, parsed.data.member_number, parsed.data.full_name, parsed.data.center_id)) {
    return {
      error: `A member named "${parsed.data.full_name}" with number ${parsed.data.member_number} already exists in this center.`,
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

  if (error) {
    // 23505 = the partial unique index caught a concurrent duplicate insert
    // that raced past the pre-check.
    if ((error as { code?: string }).code === '23505') {
      return {
        error: `A member named "${parsed.data.full_name}" with number ${parsed.data.member_number} already exists.`,
      };
    }
    return { error: safeError(error, 'Could not add member.') };
  }

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

  // Renaming/renumbering into an existing active pair recreates the duplicate
  // the create form blocks — guard the edit path with the same check.
  if (await activeDuplicateExists(supabase, parsed.data.member_number, parsed.data.full_name, parsed.data.center_id, id)) {
    return {
      error: `Another member named "${parsed.data.full_name}" with number ${parsed.data.member_number} already exists in this center.`,
    };
  }

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
