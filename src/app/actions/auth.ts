'use server';

import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { z } from 'zod';

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
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const fullName = formData.get('full_name') as string;

  if (!email || !password || !fullName) {
    return { error: 'All fields are required.' };
  }

  const supabase = await createAdminClient();

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'staff', full_name: fullName },
  });

  if (error) return { error: error.message };
  return { success: true, userId: data.user?.id };
}
