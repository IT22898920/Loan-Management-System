-- Migration 023: add photo_url to profiles
-- Stores the Cloudinary secure_url for the user's profile photo.
-- Photos are hosted on Cloudinary CDN; only the URL lives in Supabase.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS photo_url text;

COMMENT ON COLUMN public.profiles.photo_url IS
  'Cloudinary secure_url for the user''s profile photo. Always https://res.cloudinary.com/<cloud>/image/upload/... — validated at the action boundary.';
