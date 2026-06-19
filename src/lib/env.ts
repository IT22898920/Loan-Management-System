import { z } from 'zod';

// Zod-validated environment. Throws at module load if a required variable is
// missing or malformed — fails LOUD at startup instead of a silent null deref
// at first request.

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),
  // Service role key only needed server-side (createAdminClient).
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  // Cloudinary — used for profile photo CDN hosting. Both public values.
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET: z.string().min(1).optional(),
  NEXT_PUBLIC_CLOUDINARY_MEMBER_UPLOAD_PRESET: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET: process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET,
  NEXT_PUBLIC_CLOUDINARY_MEMBER_UPLOAD_PRESET: process.env.NEXT_PUBLIC_CLOUDINARY_MEMBER_UPLOAD_PRESET,
});

if (!parsed.success) {
  const issues = parsed.error.errors.map((e) => '  - ' + e.path.join('.') + ': ' + e.message).join('\n');
  throw new Error('Environment validation failed:\n' + issues);
}

export const env = parsed.data;

export function requireServiceRoleKey(): string {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required for this operation but is not configured.',
    );
  }
  return env.SUPABASE_SERVICE_ROLE_KEY;
}
