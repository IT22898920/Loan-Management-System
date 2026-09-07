-- 030: Member transfers between centers (client requirement, Sep 2026).
-- Admin-only; blocked while the member has an ACTIVE loan (must settle first).
-- Full history kept in member_transfers (audit trail); profiles show the
-- latest previous center. Atomic via SECURITY DEFINER RPC with member lock.
-- Structured SQLSTATEs (match by error.code):
--   P0302 UNAUTHORIZED · P0303 NOT_FOUND · P0304 ACTIVE_LOAN_BLOCKS_TRANSFER
--   P0305 DUPLICATE_IN_TARGET · P0307 SAME_CENTER

CREATE TABLE IF NOT EXISTS public.member_transfers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  from_center_id uuid REFERENCES public.centers(id) ON DELETE SET NULL,
  to_center_id uuid REFERENCES public.centers(id) ON DELETE SET NULL,
  transferred_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  transferred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_transfers_member
  ON public.member_transfers(member_id, transferred_at DESC);

ALTER TABLE public.member_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read transfers" ON public.member_transfers;
CREATE POLICY "Authenticated can read transfers" ON public.member_transfers
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admin can manage transfers" ON public.member_transfers;
CREATE POLICY "Admin can manage transfers" ON public.member_transfers
  FOR ALL USING (get_my_role() = 'admin');

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
  v_member_number  text;
  v_full_name      text;
  v_active_count   integer;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL OR get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0302';
  END IF;

  -- Lock the member row: serializes concurrent transfers and freezes the
  -- active-loan check against a simultaneous loan issue (record_loan also
  -- locks this row, so the two operations cannot interleave).
  SELECT center_id, member_number, full_name
    INTO v_from_center_id, v_member_number, v_full_name
    FROM public.members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEMBER_NOT_FOUND' USING ERRCODE = 'P0303';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.centers WHERE id = p_to_center_id) THEN
    RAISE EXCEPTION 'CENTER_NOT_FOUND' USING ERRCODE = 'P0303';
  END IF;

  IF v_from_center_id = p_to_center_id THEN
    RAISE EXCEPTION 'SAME_CENTER' USING ERRCODE = 'P0307';
  END IF;

  -- Client rule: a member may only be transferred once their loan is settled.
  SELECT COUNT(*) INTO v_active_count
    FROM public.loans WHERE member_id = p_member_id AND status = 'active';
  IF v_active_count > 0 THEN
    RAISE EXCEPTION 'ACTIVE_LOAN_BLOCKS_TRANSFER' USING ERRCODE = 'P0304';
  END IF;

  -- Same (number, name) pair must not already exist in the target center
  -- (mirrors uniq_member_no_name_center_active; friendly error before 23505).
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

  INSERT INTO public.member_transfers (member_id, from_center_id, to_center_id, transferred_by)
  VALUES (p_member_id, v_from_center_id, p_to_center_id, v_caller);

  UPDATE public.members SET center_id = p_to_center_id WHERE id = p_member_id;

  RETURN jsonb_build_object('from_center_id', v_from_center_id, 'to_center_id', p_to_center_id);
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_member(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.transfer_member(uuid, uuid) TO authenticated;
