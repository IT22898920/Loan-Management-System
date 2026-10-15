-- 033: A center belongs to exactly ONE staff member (client rule, Oct 2026).
-- Before this, the only rule was "one staff per center per DAY", so the same
-- center could sit with Chamal on Monday and Amila on Tuesday. Now assigning a
-- center to a staff member MOVES it: every other staff member's slots for that
-- center are removed in the same transaction.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Refuse to add the constraint over existing double-staffed centers instead of
-- silently choosing a winner (none exist on staging/prod at time of writing).
DO $$
DECLARE v_bad integer;
BEGIN
  SELECT COUNT(*) INTO v_bad FROM (
    SELECT center_id FROM public.staff_center_assignments
     GROUP BY center_id HAVING COUNT(DISTINCT staff_id) > 1
  ) x;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '% center(s) are assigned to more than one staff member — resolve them first', v_bad;
  END IF;
END $$;

-- Database-level guarantee: two rows for the same center must have the same staff.
ALTER TABLE public.staff_center_assignments
  DROP CONSTRAINT IF EXISTS staff_center_assignments_one_staff_per_center;
ALTER TABLE public.staff_center_assignments
  ADD CONSTRAINT staff_center_assignments_one_staff_per_center
  EXCLUDE USING gist (center_id WITH =, staff_id WITH <>);

-- Replace a staff member's whole schedule atomically. p_assignments is a JSON
-- array of {"center_id": uuid, "day": "monday".."thursday"}. Centers held by
-- other staff are moved to p_staff_id. Returns what moved, for the UI message.
CREATE OR REPLACE FUNCTION public.set_staff_assignments(
  p_staff_id    uuid,
  p_assignments jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_centers uuid[];
  v_moved   jsonb;
  v_count   integer;
BEGIN
  IF auth.uid() IS NULL OR get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0302';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_staff_id AND role = 'staff') THEN
    RAISE EXCEPTION 'STAFF_NOT_FOUND' USING ERRCODE = 'P0303';
  END IF;
  IF jsonb_typeof(COALESCE(p_assignments, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'BAD_ASSIGNMENTS' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT (e->>'center_id')::uuid), '{}')
    INTO v_centers
    FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) e;

  -- Serialise concurrent edits that touch the same centers.
  PERFORM 1 FROM public.centers WHERE id = ANY (v_centers) ORDER BY id FOR UPDATE;

  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
           'center_id', a.center_id, 'center_name', c.name,
           'from_staff_id', a.staff_id, 'from_staff_name', p.full_name)), '[]'::jsonb)
    INTO v_moved
    FROM public.staff_center_assignments a
    JOIN public.centers c ON c.id = a.center_id
    LEFT JOIN public.profiles p ON p.id = a.staff_id
   WHERE a.center_id = ANY (v_centers) AND a.staff_id <> p_staff_id;

  DELETE FROM public.staff_center_assignments WHERE staff_id = p_staff_id;
  DELETE FROM public.staff_center_assignments
   WHERE center_id = ANY (v_centers) AND staff_id <> p_staff_id;

  INSERT INTO public.staff_center_assignments (staff_id, center_id, day_of_week)
  SELECT DISTINCT p_staff_id, (e->>'center_id')::uuid, lower(e->>'day')
    FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) e;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('assigned', v_count, 'moved', v_moved);
END;
$$;

REVOKE ALL ON FUNCTION public.set_staff_assignments(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_staff_assignments(uuid, jsonb) TO authenticated;
