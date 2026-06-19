-- Migration 016: today_day_of_week() — return un-padded lowercase day name
-- Problem: to_char(..., 'Day') without the FM modifier returns space-padded
-- text like 'monday   ' (9 chars). Day comparisons against staff_center_assignments
-- (which stores 'monday') silently fail. Currently the helper is unused in RLS
-- (each policy inlines a trim()-wrapped expression) but it is a latent landmine —
-- any DRY refactor that calls this helper would block ALL staff data access.

CREATE OR REPLACE FUNCTION public.today_day_of_week()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  -- FM = fill mode (no padding), then trim/lower for defense in depth
  SELECT lower(trim(to_char(now() AT TIME ZONE 'Asia/Colombo', 'FMDay')));
$$;
