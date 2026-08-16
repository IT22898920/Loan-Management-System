-- 029 v2: One active loan per member + hardened record_loan (client rule, Aug 2026).
-- A new loan may only be issued once the member's previous loan is completed.
--
-- Review findings addressed in v2:
--  * Authorization now lives INSIDE the SECURITY DEFINER function — previously
--    any authenticated user could call record_loan directly and bypass the
--    role/center-day checks that only existed in the server action.
--  * Returns jsonb {loan_id, cycle_no} so the app can show the human ref
--    (DLG0005B) without a second RLS-dependent query that could silently
--    return the wrong letter near the Asia/Colombo day boundary.
--  * Cycle allocation is NULL-aware: legacy xlsx-UI imports may carry NULL
--    cycle_no (allowed by 009), so both COUNT(*) and MAX(cycle_no) feed the
--    next cycle; is_first_loan derives from the total count, not the cycle.
--  * Errors use structured SQLSTATEs (matched by code, not message text):
--      P0301 ACTIVE_LOAN_EXISTS · P0302 UNAUTHORIZED · P0303 MEMBER_NOT_FOUND
--  * Single aggregate scan replaces separate EXISTS + MAX queries.
--
-- NOTE: live DBs' staff members-SELECT policy is center-scoped WITHOUT an
-- active-loan clause (repo file 002 is stale on this), so staff can find a
-- settled member to issue the renewal — verified on production 2026-08-08.
-- Legacy data: 2 members hold >1 active loan; the rule simply blocks their
-- NEXT loan until those are settled. Historical imports don't use this RPC.

DROP FUNCTION IF EXISTS public.record_loan(uuid, numeric, numeric, numeric, date, integer, uuid);

CREATE FUNCTION public.record_loan(
  p_member_id      uuid,
  p_principal      numeric,
  p_interest       numeric,
  p_weekly_payment numeric,
  p_issued_date    date,
  p_product_type   integer,
  p_created_by     uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller          uuid;
  v_role            text;
  v_center_id       uuid;
  v_today           text;
  v_loan_count      integer;
  v_max_cycle       integer;
  v_active_count    integer;
  v_cycle_no        integer;
  v_is_first_loan   boolean;
  v_balance         numeric(12,2);
  v_loan_id         uuid;
BEGIN
  -- ── Authorization (SECURITY DEFINER: never trust the caller's claims) ──
  v_caller := auth.uid();
  IF v_caller IS NULL OR p_created_by IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0302';
  END IF;

  v_role := get_my_role();
  IF v_role NOT IN ('staff', 'admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0302';
  END IF;

  -- Serialize per member (also validates the member exists) + grab center.
  SELECT center_id INTO v_center_id
    FROM public.members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEMBER_NOT_FOUND' USING ERRCODE = 'P0303';
  END IF;

  -- Staff may only issue to members of centers assigned to them TODAY
  -- (same Asia/Colombo day expression the RLS policies use). Admins exempt.
  IF v_role = 'staff' THEN
    v_today := trim(both from lower(to_char((now() AT TIME ZONE 'Asia/Colombo'), 'Day')));
    IF NOT EXISTS (
      SELECT 1 FROM public.staff_center_assignments
       WHERE staff_id = v_caller
         AND center_id = v_center_id
         AND day_of_week = v_today
    ) THEN
      RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0302';
    END IF;
  END IF;

  -- ── Business rule + cycle allocation, one scan ────────────────────────
  SELECT COUNT(*),
         COALESCE(MAX(cycle_no), 0),
         COUNT(*) FILTER (WHERE status = 'active')
    INTO v_loan_count, v_max_cycle, v_active_count
    FROM public.loans
   WHERE member_id = p_member_id;

  IF v_active_count > 0 THEN
    RAISE EXCEPTION 'ACTIVE_LOAN_EXISTS' USING ERRCODE = 'P0301';
  END IF;

  -- NULL-cycle legacy rows still advance the letter via the row count.
  v_cycle_no      := GREATEST(v_max_cycle, v_loan_count) + 1;
  v_is_first_loan := (v_loan_count = 0);
  v_balance       := p_principal + p_interest;

  INSERT INTO public.loans (
    member_id, loan_plan,
    principal, interest, original_balance, product_type,
    cycle_no, source,
    loan_balance, weekly_payment, issued_date,
    status, is_first_loan, created_by
  ) VALUES (
    p_member_id, NULL,
    p_principal, p_interest, v_balance, p_product_type,
    v_cycle_no, 'app',
    v_balance, p_weekly_payment, p_issued_date,
    'active', v_is_first_loan, p_created_by
  ) RETURNING id INTO v_loan_id;

  RETURN jsonb_build_object('loan_id', v_loan_id, 'cycle_no', v_cycle_no);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_loan(uuid, numeric, numeric, numeric, date, integer, uuid) TO authenticated;
