'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-guard';
import { safeError } from '@/lib/safe-error';
import { z } from 'zod';

const centerSchema = z.object({
  // Trim first so a name of only spaces fails min(1) (QA 86eyrc4ph);
  // collapse internal runs of spaces for consistent duplicate matching.
  name: z
    .string()
    .trim()
    .min(1, 'Center name is required')
    .max(60, 'Center name is too long')
    .transform((s) => s.replace(/\s+/g, ' ')),
  center_number: z.coerce.number().int().positive('Center number must be positive'),
});

/** Case-insensitive duplicate-name check (QA 86eyrc5yp). */
async function centerNameTaken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: string,
  excludeId?: string
): Promise<boolean> {
  let q = supabase
    .from('centers')
    .select('id')
    .ilike('name', name.replace(/[%_\\]/g, '\\$&'))
    .limit(1);
  if (excludeId) q = q.neq('id', excludeId);
  const { data } = await q.maybeSingle();
  return !!data;
}

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

  if (await centerNameTaken(supabase, parsed.data.name)) {
    return { error: `A center named "${parsed.data.name}" already exists.` };
  }

  const { error } = await supabase.from('centers').insert(parsed.data);

  if (error) return { error: safeError(error, 'Could not create center.') };

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

  if (await centerNameTaken(supabase, parsed.data.name, id)) {
    return { error: `Another center named "${parsed.data.name}" already exists.` };
  }

  const { error } = await supabase.from('centers').update(parsed.data).eq('id', id);

  if (error) return { error: safeError(error, 'Could not update center.') };

  revalidatePath('/admin/centers');
  return { success: true };
}

export async function deleteCenterAction(id: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const supabase = await createClient();
  const { error } = await supabase.from('centers').delete().eq('id', id);
  if (error) return { error: safeError(error, 'Could not delete center.') };
  revalidatePath('/admin/centers');
  return { success: true };
}
