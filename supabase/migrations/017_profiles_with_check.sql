-- Migration 017: profiles UPDATE policy — add WITH CHECK + self-lockout guard
-- Problem: existing "Admin can update profiles" policy has USING but no WITH
-- CHECK. An admin could (accidentally or maliciously) demote themselves to
-- staff and lock the entire admin role out.
-- Fix: add WITH CHECK enforcing role enum + preventing admin self-demotion.

DROP POLICY IF EXISTS "Admin can update profiles" ON public.profiles;

CREATE POLICY "Admin can update profiles"
  ON public.profiles
  FOR UPDATE
  USING (get_my_role() = 'admin')
  WITH CHECK (
    get_my_role() = 'admin'
    AND role IN ('admin', 'staff')
    -- Either editing someone else, or keeping our own role as admin
    AND (id <> auth.uid() OR role = 'admin')
  );
