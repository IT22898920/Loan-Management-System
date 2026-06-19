-- Migration 019: storage member-photos — scope reads to admin or today-assigned staff
-- Problem: existing storage SELECT policy lets every authenticated user read
-- every member photo. This is inconsistent with the day-bound RLS used everywhere
-- else in the system (centers, members, loans).
-- Fix: only admin or staff assigned to the member's center TODAY can read.

DROP POLICY IF EXISTS "Authenticated users can view member photos" ON storage.objects;

CREATE POLICY "Scoped member photo read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'member-photos'
    AND (
      get_my_role() = 'admin'
      OR EXISTS (
        SELECT 1
          FROM public.members m
          JOIN public.staff_center_assignments sca ON sca.center_id = m.center_id
         WHERE m.photo_url LIKE '%' || storage.objects.name
           AND sca.staff_id = auth.uid()
           AND sca.day_of_week = public.today_day_of_week()
      )
    )
  );
