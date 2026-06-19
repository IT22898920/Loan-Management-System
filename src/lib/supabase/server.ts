import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { env, requireServiceRoleKey } from '@/lib/env';
import { resilientFetch } from './resilient-fetch';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { fetch: resilientFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component context — cookies cannot be set, ignore
          }
        },
      },
    }
  );
}

// Uses service_role key directly — fully bypasses RLS for admin operations.
// requireServiceRoleKey() throws a clear error if the env is missing.
export async function createAdminClient() {
  return createSupabaseClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    requireServiceRoleKey(),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: resilientFetch },
    }
  );
}
