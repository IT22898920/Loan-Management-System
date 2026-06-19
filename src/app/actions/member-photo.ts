'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { safeError } from '@/lib/safe-error';
import { TODAY_DAY_OF_WEEK } from '@/types';
import { z } from 'zod';

// Photo URL must come from Cloudinary's CDN — never a raw user-controlled URL.
// We accept any cloud name to avoid coupling env to this validation, but require
// the cloudinary.com host so a malicious caller can't store an attacker-hosted
// image URL on the member (which would be rendered directly across the app).
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

const memberIdSchema = z.string().uuid();

export async function updateMemberPhotoAction(memberId: string, photoUrl: string) {
  const idParsed = memberIdSchema.safeParse(memberId);
  if (!idParsed.success) {
    console.error('[updateMemberPhotoAction] invalid memberId', {
      memberId,
      message: idParsed.error.errors[0].message,
    });
    return { error: idParsed.error.errors[0].message };
  }

  const urlParsed = photoUrlSchema.safeParse(photoUrl);
  if (!urlParsed.success) {
    console.error('[updateMemberPhotoAction] invalid photoUrl', {
      memberId: idParsed.data,
      message: urlParsed.error.errors[0].message,
    });
    return { error: urlParsed.error.errors[0].message };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('[updateMemberPhotoAction] not authenticated', {
      memberId: idParsed.data,
    });
    return { error: 'Not authenticated.' };
  }

  // Look up the caller's role — staff are constrained to their today-assigned
  // center, admins can update any member's photo.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    console.error('[updateMemberPhotoAction] profile lookup failed', {
      userId: user.id,
      memberId: idParsed.data,
      message: profileError?.message,
    });
    return { error: safeError(profileError, 'Could not verify your account.') };
  }

  if (profile.role === 'staff') {
    const todayDay = TODAY_DAY_OF_WEEK();
    if (!todayDay) {
      console.error('[updateMemberPhotoAction] not a working day', {
        userId: user.id,
        memberId: idParsed.data,
      });
      return { error: 'Today is not a working day.' };
    }

    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('center_id')
      .eq('id', idParsed.data)
      .single();

    if (memberError || !member) {
      console.error('[updateMemberPhotoAction] member lookup failed', {
        userId: user.id,
        memberId: idParsed.data,
        message: memberError?.message,
      });
      return { error: safeError(memberError, 'Could not find the member.') };
    }

    const { data: assignment, error: assignmentError } = await supabase
      .from('staff_center_assignments')
      .select('id')
      .eq('staff_id', user.id)
      .eq('center_id', member.center_id)
      .eq('day_of_week', todayDay)
      .maybeSingle();

    if (assignmentError) {
      console.error('[updateMemberPhotoAction] assignment lookup failed', {
        userId: user.id,
        memberId: idParsed.data,
        centerId: member.center_id,
        day: todayDay,
        message: assignmentError.message,
      });
      return { error: safeError(assignmentError, 'Could not verify center assignment.') };
    }

    if (!assignment) {
      console.error('[updateMemberPhotoAction] no assignment for today', {
        userId: user.id,
        memberId: idParsed.data,
        centerId: member.center_id,
        day: todayDay,
      });
      return { error: 'You are not assigned to this member\'s center today.' };
    }
  }

  // RLS on `members` restricts UPDATE to admin role, but staff users must also
  // be able to update photos for members in their today-assigned center. We've
  // already authenticated + center-day-gated above, and we constrain the update
  // to the validated memberId with a Cloudinary-validated photo_url, so it's
  // safe to bypass RLS here via the admin client.
  const adminClient = await createAdminClient();
  const { error } = await adminClient
    .from('members')
    .update({ photo_url: urlParsed.data })
    .eq('id', idParsed.data);

  if (error) {
    console.error('[updateMemberPhotoAction] update failed', {
      userId: user.id,
      memberId: idParsed.data,
      message: error.message,
    });
    return { error: safeError(error, 'Could not save photo.') };
  }

  revalidatePath(`/staff/members/${idParsed.data}`);
  revalidatePath('/staff/centers', 'layout');
  revalidatePath('/admin/members');
  revalidatePath(`/admin/members/${idParsed.data}`);

  return { success: true, photoUrl: urlParsed.data };
}

export async function removeMemberPhotoAction(memberId: string) {
  const idParsed = memberIdSchema.safeParse(memberId);
  if (!idParsed.success) {
    console.error('[removeMemberPhotoAction] invalid memberId', {
      memberId,
      message: idParsed.error.errors[0].message,
    });
    return { error: idParsed.error.errors[0].message };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('[removeMemberPhotoAction] not authenticated', {
      memberId: idParsed.data,
    });
    return { error: 'Not authenticated.' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    console.error('[removeMemberPhotoAction] profile lookup failed', {
      userId: user.id,
      memberId: idParsed.data,
      message: profileError?.message,
    });
    return { error: safeError(profileError, 'Could not verify your account.') };
  }

  if (profile.role === 'staff') {
    const todayDay = TODAY_DAY_OF_WEEK();
    if (!todayDay) {
      console.error('[removeMemberPhotoAction] not a working day', {
        userId: user.id,
        memberId: idParsed.data,
      });
      return { error: 'Today is not a working day.' };
    }

    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('center_id')
      .eq('id', idParsed.data)
      .single();

    if (memberError || !member) {
      console.error('[removeMemberPhotoAction] member lookup failed', {
        userId: user.id,
        memberId: idParsed.data,
        message: memberError?.message,
      });
      return { error: safeError(memberError, 'Could not find the member.') };
    }

    const { data: assignment, error: assignmentError } = await supabase
      .from('staff_center_assignments')
      .select('id')
      .eq('staff_id', user.id)
      .eq('center_id', member.center_id)
      .eq('day_of_week', todayDay)
      .maybeSingle();

    if (assignmentError) {
      console.error('[removeMemberPhotoAction] assignment lookup failed', {
        userId: user.id,
        memberId: idParsed.data,
        centerId: member.center_id,
        day: todayDay,
        message: assignmentError.message,
      });
      return { error: safeError(assignmentError, 'Could not verify center assignment.') };
    }

    if (!assignment) {
      console.error('[removeMemberPhotoAction] no assignment for today', {
        userId: user.id,
        memberId: idParsed.data,
        centerId: member.center_id,
        day: todayDay,
      });
      return { error: 'You are not assigned to this member\'s center today.' };
    }
  }

  const adminClient = await createAdminClient();
  const { error } = await adminClient
    .from('members')
    .update({ photo_url: null })
    .eq('id', idParsed.data);

  if (error) {
    console.error('[removeMemberPhotoAction] update failed', {
      userId: user.id,
      memberId: idParsed.data,
      message: error.message,
    });
    return { error: safeError(error, 'Could not remove photo.') };
  }

  revalidatePath(`/staff/members/${idParsed.data}`);
  revalidatePath('/staff/centers', 'layout');
  revalidatePath('/admin/members');
  revalidatePath(`/admin/members/${idParsed.data}`);

  return { success: true };
}
