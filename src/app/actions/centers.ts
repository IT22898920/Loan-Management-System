'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-guard';
import { z } from 'zod';

const centerSchema = z.object({
  name: z.string().min(1, 'Center name is required'),
  center_number: z.coerce.number().int().positive('Center number must be positive'),
});

export async function createCenterAction(formData: FormData) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const supabase = await createClient();

  const parsed = centerSchema.safeParse({
    name: formData.get('name'),
    center_number: formData.get('center_number'),
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const { error } = await supabase.from('centers').insert(parsed.data);

  if (error) return { error: error.message };

  revalidatePath('/admin/centers');
  return { success: true };
}

export async function updateCenterAction(id: string, formData: FormData) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const supabase = await createClient();

  const parsed = centerSchema.safeParse({
    name: formData.get('name'),
    center_number: formData.get('center_number'),
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const { error } = await supabase.from('centers').update(parsed.data).eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/admin/centers');
  return { success: true };
}

export async function deleteCenterAction(id: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const supabase = await createClient();
  const { error } = await supabase.from('centers').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/centers');
  return { success: true };
}
