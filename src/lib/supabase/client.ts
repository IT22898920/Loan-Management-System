import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/lib/env';
import { resilientFetch } from './resilient-fetch';

export function createClient() {
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { fetch: resilientFetch } }
  );
}
