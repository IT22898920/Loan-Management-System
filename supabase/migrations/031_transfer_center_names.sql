-- 031: Denormalize center names onto member_transfers.
-- The profile badge joins centers through RLS — staff only see their own
-- assigned centers, so the "previously CENTER" name came back NULL whenever
-- the old center wasn't theirs (the common case). Storing the names at
-- transfer time is RLS-independent and stays historically accurate even if
-- a center is later renamed or deleted.

ALTER TABLE public.member_transfers
  ADD COLUMN IF NOT EXISTS from_center_name text,
  ADD COLUMN IF NOT EXISTS to_center_name text;

-- Backfill existing rows from the live centers table.
UPDATE public.member_transfers t
   SET from_center_name = COALESCE(t.from_center_name, fc.name),
       to_center_name   = COALESCE(t.to_center_name, tc.name)
  FROM public.member_transfers t2
  LEFT JOIN public.centers fc ON fc.id = t2.from_center_id
  LEFT JOIN public.centers tc ON tc.id = t2.to_center_id
 WHERE t.id = t2.id
   AND (t.from_center_name IS NULL OR t.to_center_name IS NULL);

CREATE OR REPLACE FUNCTION public.transfer_member(
  p_member_id    uuid,
  p_to_center_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller         uuid;
  v_from_center_id uuid;
  v_from_name      text;
  v_to_name        text;
  v_member_number  text;
  v_full_name      text;
  v_active_count   integer;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL OR get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0302';
  END IF;

  SELECT center_id, member_number, full_name
    INTO v_from_center_id, v_member_number, v_full_name
    FROM public.members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEMBER_NOT_FOUND' USING ERRCODE = 'P0303';
  END IF;

  SELECT name INTO v_to_name FROM public.centers WHERE id = p_to_center_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CENTER_NOT_FOUND' USING ERRCODE = 'P0303';
  END IF;

  IF v_from_center_id = p_to_center_id THEN
    RAISE EXCEPTION 'SAME_CENTER' USING ERRCODE = 'P0307';
  END IF;

  SELECT COUNT(*) INTO v_active_count
    FROM public.loans WHERE member_id = p_member_id AND status = 'active';
  IF v_active_count > 0 THEN
    RAISE EXCEPTION 'ACTIVE_LOAN_BLOCKS_TRANSFER' USING ERRCODE = 'P0304';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.members
     WHERE upper(member_number) = upper(v_member_number)
       AND lower(full_name) = lower(v_full_name)
       AND center_id = p_to_center_id
       AND archived_at IS NULL
       AND id <> p_member_id
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_IN_TARGET' USING ERRCODE = 'P0305';
  END IF;

  SELECT name INTO v_from_name FROM public.centers WHERE id = v_from_center_id;

  INSERT INTO public.member_transfers
    (member_id, from_center_id, to_center_id, from_center_name, to_center_name, transferred_by)
  VALUES
    (p_member_id, v_from_center_id, p_to_center_id, v_from_name, v_to_name, v_caller);

  UPDATE public.members SET center_id = p_to_center_id WHERE id = p_member_id;

  RETURN jsonb_build_object(
    'from_center_id', v_from_center_id, 'to_center_id', p_to_center_id,
    'from_center_name', v_from_name, 'to_center_name', v_to_name
  );
END;
$$;
