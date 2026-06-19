'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { safeError } from '@/lib/safe-error';
import { z } from 'zod';

// Photo URL must come from Cloudinary's CDN — never a raw user-controlled URL.
// We accept any cloud name to avoid coupling env to this validation, but require
// the cloudinary.com host so a malicious caller can't store an attacker-hosted
// image URL on the profile (which would be rendered directly across the app).
const photoUrlSchema = z
  .string()
  .url('Invalid photo URL.')
  .refine((u) => {
    try {
      const host = new URL(u).hostname;
      return host === 'res.cloudinary.com' || host.endsWith('.cloudinary.com');
    } catch {
      return false;
    }
  }, 'Photo URL must be a Cloudinary CDN URL.');

export async function updateProfilePhotoAction(photoUrl: string) {
  const parsed = photoUrlSchema.safeParse(photoUrl);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const { error } = await supabase
    .from('profiles')
    .update({ photo_url: parsed.data })
    .eq('id', user.id);

  if (error) {
    console.error('[updateProfilePhotoAction] update failed', {
      userId: user.id,
      message: error.message,
    });
    return { error: safeError(error, 'Could not save photo.') };
  }

  revalidatePath('/profile');
  revalidatePath('/admin/staff');
  revalidatePath('/admin/dashboard');
  revalidatePath('/staff/dashboard');
  return { success: true, photoUrl: parsed.data };
}

export async function removeProfilePhotoAction() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const { error } = await supabase
    .from('profiles')
    .update({ photo_url: null })
    .eq('id', user.id);

  if (error) {
    console.error('[removeProfilePhotoAction] update failed', {
      userId: user.id,
      message: error.message,
    });
    return { error: safeError(error, 'Could not remove photo.') };
  }

  revalidatePath('/profile');
  return { success: true };
}
