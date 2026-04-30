'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const memberSchema = z.object({
  member_number: z.string().min(1, 'Member number is required'),
  full_name: z.string().min(1, 'Full name is required'),
  center_id: z.string().uuid('Invalid center'),
});

export async function createMemberAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const parsed = memberSchema.safeParse({
    member_number: formData.get('member_number'),
    full_name: formData.get('full_name'),
    center_id: formData.get('center_id'),
  });

  if (!parsed.success) return { error: parsed.error.errors[0].message };

  let photo_url: string | null = null;
  const photoFile = formData.get('photo') as File | null;

  if (photoFile && photoFile.size > 0) {
    const ext = photoFile.name.split('.').pop();
    const fileName = `${parsed.data.member_number}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('member-photos')
      .upload(fileName, photoFile, { contentType: photoFile.type, upsert: true });

    if (uploadError) return { error: `Photo upload failed: ${uploadError.message}` };
    photo_url = fileName;
  }

  const { error } = await supabase.from('members').insert({
    ...parsed.data,
    photo_url,
    created_by: user.id,
  });

  if (error) return { error: error.message };

  revalidatePath('/admin/members');
  return { success: true };
}

export async function updateMemberAction(id: string, formData: FormData) {
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

    if (uploadError) return { error: `Photo upload failed: ${uploadError.message}` };
    photo_url = fileName;
  }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (photo_url) updateData.photo_url = photo_url;

  const { error } = await supabase.from('members').update(updateData).eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/admin/members');
  revalidatePath(`/admin/members/${id}`);
  return { success: true };
}
