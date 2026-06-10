import { createClient } from '@/lib/supabase/server';

/**
 * Authorization guard for admin-only server actions.
 * Verifies the caller is an authenticated user whose profile.role === 'admin'
 * BEFORE any privileged (RLS-bypassing) operation runs. Defence-in-depth: a
 * permissive RLS regression must not turn a mutation endpoint into a public one.
 */
export async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') return { ok: false, error: 'Forbidden — admin access required.' };
  return { ok: true, userId: user.id };
}

/** Guard for any authenticated user (staff or admin). */
export async function requireUser(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };
  return { ok: true, userId: user.id };
}
