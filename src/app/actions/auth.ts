'use server';

import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-guard';
import { z } from 'zod';

const staffSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  full_name: z.string().min(1, 'Full name is required'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: 'Invalid email or password format.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return { error: 'Invalid email or password.' };
  }

  // Get role for redirect
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single();

  return {
    success: true,
    redirectTo: profile?.role === 'admin' ? '/admin/dashboard' : '/staff/dashboard',
  };
}

export async function verifyOtpAction(formData: FormData) {
  const email = formData.get('email') as string;
  const token = formData.get('token') as string;

  if (!email || !token) {
    return { error: 'Invalid request.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });

  if (error || !data.user) {
    return { error: 'Invalid or expired OTP. Please try again.' };
  }

  // Get role for redirect
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single();

  return {
    success: true,
    redirectTo: profile?.role === 'admin' ? '/admin/dashboard' : '/staff/dashboard',
  };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function changePasswordAction(formData: FormData) {
  const password = formData.get('password') as string;
  const confirm = formData.get('confirm') as string;

  if (!password || password.length < 8) {
    return { error: 'Password must be at least 8 characters.' };
  }
  if (password !== confirm) {
    return { error: 'Passwords do not match.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: error.message };
  return { success: true };
}

export async function createStaffAction(formData: FormData) {
  // SECURITY: only an authenticated admin may mint accounts (this uses the
  // service-role admin client which bypasses RLS).
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const parsed = staffSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    full_name: formData.get('full_name'),
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createAdminClient();

  const { data, error } = await supabase.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { role: 'staff', full_name: parsed.data.full_name },
  });

  if (error) return { error: error.message };
  return { success: true, userId: data.user?.id };
}

const updateStaffSchema = z.object({
  full_name: z.string().min(1, 'Full name is required'),
  email: z.string().email('Valid email required'),
});

export async function updateStaffAction(staffId: string, formData: FormData) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const parsed = updateStaffSchema.safeParse({
    full_name: formData.get('full_name'),
    email: formData.get('email'),
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createAdminClient();

  // Update auth user email + metadata
  const { error: authErr } = await supabase.auth.admin.updateUserById(staffId, {
    email: parsed.data.email,
    email_confirm: true,
    user_metadata: { role: 'staff', full_name: parsed.data.full_name },
  });
  if (authErr) return { error: authErr.message };

  // Update profile table
  const { error: profErr } = await supabase
    .from('profiles')
    .update({ full_name: parsed.data.full_name, email: parsed.data.email })
    .eq('id', staffId);
  if (profErr) return { error: profErr.message };

  return { success: true };
}

export async function resetStaffPasswordAction(staffId: string, newPassword: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  if (!newPassword || newPassword.length < 8) {
    return { error: 'Password must be at least 8 characters.' };
  }

  const supabase = await createAdminClient();
  const { error } = await supabase.auth.admin.updateUserById(staffId, {
    password: newPassword,
  });
  if (error) return { error: error.message };
  return { success: true };
}

export async function deleteStaffAction(staffId: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createAdminClient();

  // Safety: confirm target is staff (not admin)
  const { data: target } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', staffId)
    .single();
  if (!target) return { error: 'Staff member not found.' };
  if (target.role !== 'staff') return { error: 'Cannot delete non-staff account.' };

  // Remove assignments first (FK safety)
  await supabase.from('staff_center_assignments').delete().eq('staff_id', staffId);

  // Delete auth user (cascades to profile via FK)
  const { error } = await supabase.auth.admin.deleteUser(staffId);
  if (error) return { error: error.message };

  return { success: true };
}
