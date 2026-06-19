/**
 * Return a generic, user-safe error message while logging full details server-side.
 *
 * Server actions that bubble raw Supabase errors leak table names, column
 * names, RLS policy names, and constraint identifiers to anyone probing
 * endpoints. Use this helper at the boundary of every server action:
 *
 *   const { error } = await supabase.from('loans').insert(...);
 *   if (error) return { error: safeError(error, 'Could not save the loan.') };
 */
export function safeError(err: unknown, fallback: string): string {
  if (typeof window === 'undefined') {
    console.error('[safeError]', err);
  }
  return fallback;
}
