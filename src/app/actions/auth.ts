'use server';

import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-guard';
import { safeError } from '@/lib/safe-error';
import { z } from 'zod';

// Strong password policy: 12+ chars with mixed case, digit, and symbol.
// Microfinance handles real money — weak passwords are a CBSL audit finding.
const STRONG_PASSWORD = z
  .string()
  .min(12, 'Password must be at least 12 characters.')
  .regex(/[a-z]/, 'Password must contain a lowercase letter.')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter.')
  .regex(/\d/, 'Password must contain a digit.')
  .regex(/[^A-Za-z0-9]/, 'Password must contain a symbol.');

const staffSchema = z.object({
  email: z.string().email('Valid email required'),
  password: STRONG_PASSWORD,
  full_name: z.string().min(1, 'Full name is required'),
});

// Login schema deliberately permissive on password (existence-only) so we
// never leak the policy at the login screen. Errors are always generic.
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const otpSchema = z.object({
  email: z.string().email(),
  token: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits.'),
});

// In-memory throttle (per-process). For a multi-instance deploy, swap to a
// DB table or Redis. Vercel single-region default is fine for v1.
const loginAttempts = new Map<string, { count: number; firstAt: number; blockUntil: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;

function recordLoginAttempt(email: string, success: boolean) {
  const now = Date.now();
  const key = email.toLowerCase();
  const e = loginAttempts.get(key);
  if (success) {
    loginAttempts.delete(key);
    return { blocked: false };
  }
  if (!e || now - e.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAt: now, blockUntil: 0 });
    return { blocked: false };
  }
  e.count++;
  if (e.count >= LOGIN_MAX_ATTEMPTS) {
    e.blockUntil = now + LOGIN_BLOCK_MS;
  }
  loginAttempts.set(key, e);
  return { blocked: e.blockUntil > now };
}

function isBlocked(email: string): boolean {
  const e = loginAttempts.get(email.toLowerCase());
  return !!e && e.blockUntil > Date.now();
}

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: 'Invalid email or password.' };
  }

  if (isBlocked(parsed.data.email)) {
    return { error: 'Too many login attempts. Try again in 15 minutes.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    const r = recordLoginAttempt(parsed.data.email, false);
    if (r.blocked) {
      return { error: 'Too many login attempts. Try again in 15 minutes.' };
    }
    return { error: 'Invalid email or password.' };
  }

  recordLoginAttempt(parsed.data.email, true);

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single();

  // Admin accounts require email OTP 2FA — password alone is not enough.
  // 1. Sign out the password session immediately (don't leave a half-authed cookie)
  // 2. Send a 6-digit OTP to the same email
  // 3. Redirect to /verify-otp where the OTP completes the login
  if (profile?.role === 'admin') {
    await supabase.auth.signOut();

    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: { shouldCreateUser: false },
    });
    if (otpErr) {
      console.error('[loginAction] OTP send failed', {
        email: parsed.data.email,
        message: otpErr.message,
      });
      return { error: 'Could not send verification code. Please try again.' };
    }

    return {
      success: true,
      requiresOtp: true,
      email: parsed.data.email,
      redirectTo: '/verify-otp?email=' + encodeURIComponent(parsed.data.email),
    };
  }

  // Staff: password is sufficient, session already created.
  return {
    success: true,
    redirectTo: '/staff/dashboard',
  };
}

// OTP throttle — same shape as login
const otpAttempts = new Map<string, { count: number; firstAt: number; blockUntil: number }>();
const OTP_WINDOW_MS = 15 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_BLOCK_MS = 15 * 60 * 1000;

function recordOtpAttempt(email: string, success: boolean) {
  const now = Date.now();
  const key = email.toLowerCase();
  const e = otpAttempts.get(key);
  if (success) {
    otpAttempts.delete(key);
    return { blocked: false };
  }
  if (!e || now - e.firstAt > OTP_WINDOW_MS) {
    otpAttempts.set(key, { count: 1, firstAt: now, blockUntil: 0 });
    return { blocked: false };
  }
  e.count++;
  if (e.count >= OTP_MAX_ATTEMPTS) {
    e.blockUntil = now + OTP_BLOCK_MS;
  }
  otpAttempts.set(key, e);
  return { blocked: e.blockUntil > now };
}

function isOtpBlocked(email: string): boolean {
  const e = otpAttempts.get(email.toLowerCase());
  return !!e && e.blockUntil > Date.now();
}

export async function verifyOtpAction(formData: FormData) {
  const parsed = otpSchema.safeParse({
    email: formData.get('email'),
    token: formData.get('token'),
  });
  if (!parsed.success) {
    return { error: 'Invalid OTP format.' };
  }

  if (isOtpBlocked(parsed.data.email)) {
    return { error: 'Too many OTP attempts. Try again in 15 minutes.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: 'email',
  });

  if (error || !data.user) {
    const r = recordOtpAttempt(parsed.data.email, false);
    if (r.blocked) {
      return { error: 'Too many OTP attempts. Try again in 15 minutes.' };
    }
    return { error: 'Invalid or expired OTP. Please try again.' };
  }

  recordOtpAttempt(parsed.data.email, true);

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

// Resend OTP — only re-issues a code for an email that already exists. We never
// reveal whether the email is registered, to prevent enumeration.
const resendThrottle = new Map<string, number>();
const RESEND_COOLDOWN_MS = 60 * 1000; // 60s between resends per email

export async function resendOtpAction(email: string) {
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: 'Invalid email.' };
  }

  const key = email.toLowerCase();
  const now = Date.now();
  const last = resendThrottle.get(key) ?? 0;
  if (now - last < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - last)) / 1000);
    return { error: 'Please wait ' + wait + ' seconds before requesting a new code.' };
  }
  resendThrottle.set(key, now);

  const supabase = await createClient();
  // shouldCreateUser:false — never create a new account from a resend request.
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) {
    console.error('[resendOtpAction] OTP resend failed', { email, message: error.message });
    // Generic success — don't leak whether the email is registered
  }
  return { success: true };
}

export async function changePasswordAction(formData: FormData) {
  const password = formData.get('password') as string;
  const confirm = formData.get('confirm') as string;

  const passwordCheck = STRONG_PASSWORD.safeParse(password);
  if (!passwordCheck.success) {
    return { error: passwordCheck.error.errors[0].message };
  }
  if (password !== confirm) {
    return { error: 'Passwords do not match.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: safeError(error, 'Could not update password.') };
  return { success: true };
}

export async function createStaffAction(formData: FormData) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const parsed = staffSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    full_name: formData.get('full_name'),
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createAdminClient();

  // handle_new_user trigger defaults role to 'staff' when user_metadata.role
  // is absent — so we don't need to set it here. Asymmetric metadata between
  // create and update was the source of admin/staff drift in the audit.
  const { data, error } = await supabase.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name },
  });

  if (error) return { error: safeError(error, 'Could not create staff account.') };
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

  const { data: target } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', staffId)
    .single();
  if (!target) return { error: 'Staff member not found.' };
  if (target.role !== 'staff') return { error: 'Cannot modify non-staff account.' };

  const { error: authErr } = await supabase.auth.admin.updateUserById(staffId, {
    email: parsed.data.email,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name },
  });
  if (authErr) return { error: safeError(authErr, 'Could not update staff details.') };

  const { error: profErr } = await supabase
    .from('profiles')
    .update({ full_name: parsed.data.full_name, email: parsed.data.email })
    .eq('id', staffId);
  if (profErr) return { error: safeError(profErr, 'Could not update profile.') };

  return { success: true };
}

export async function resetStaffPasswordAction(staffId: string, newPassword: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const passwordCheck = STRONG_PASSWORD.safeParse(newPassword);
  if (!passwordCheck.success) {
    return { error: passwordCheck.error.errors[0].message };
  }

  const supabase = await createAdminClient();

  const { data: target } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', staffId)
    .single();
  if (!target) return { error: 'Staff member not found.' };
  if (target.role !== 'staff') return { error: 'Cannot modify non-staff account.' };

  const { error } = await supabase.auth.admin.updateUserById(staffId, {
    password: newPassword,
  });
  if (error) return { error: safeError(error, 'Could not reset password.') };
  return { success: true };
}

export async function deleteStaffAction(staffId: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createAdminClient();

  const { data: target } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', staffId)
    .single();
  if (!target) return { error: 'Staff member not found.' };
  if (target.role !== 'staff') return { error: 'Cannot delete non-staff account.' };

  await supabase.from('staff_center_assignments').delete().eq('staff_id', staffId);

  const { error } = await supabase.auth.admin.deleteUser(staffId);
  if (error) return { error: safeError(error, 'Could not delete staff account.') };

  return { success: true };
}
