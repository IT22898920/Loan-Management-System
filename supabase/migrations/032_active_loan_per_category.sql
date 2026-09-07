-- 032: Loan rule change (client, Sep 2026) — one active loan PER CATEGORY.
-- Supersedes 029's blanket one-active-loan rule: a member may hold several
-- active loans of DIFFERENT amounts (e.g. 20,000 + 10,000 + 30,000), but not
-- two active loans of the SAME principal amount. "Category" = principal.
-- Everything else from 029 stays: in-RPC authorization, member row lock,
-- NULL-aware cycle allocation, jsonb return, SQLSTATEs
-- (P0301 now means SAME-CATEGORY active loan exists).

-- Return type changes from uuid (014) to jsonb, so the old function must be
-- dropped first (CREATE OR REPLACE cannot change a return type). NOTE: 029
-- was never applied to the live DBs — this migration supersedes it entirely.
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
  v_same_cat_count  integer;
  v_cycle_no        integer;
  v_is_first_loan   boolean;
  v_balance         numeric(12,2);
  v_loan_id         uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL OR p_created_by IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0302';
  END IF;

  v_role := get_my_role();
  IF v_role NOT IN ('staff', 'admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0302';
  END IF;

  SELECT center_id INTO v_center_id
    FROM public.members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEMBER_NOT_FOUND' USING ERRCODE = 'P0303';
  END IF;

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

  -- Rule + cycle allocation in one scan: block only a SAME-PRINCIPAL active
  -- loan; different amounts may run concurrently.
  SELECT COUNT(*),
         COALESCE(MAX(cycle_no), 0),
         COUNT(*) FILTER (WHERE status = 'active' AND principal = p_principal)
    INTO v_loan_count, v_max_cycle, v_same_cat_count
    FROM public.loans
   WHERE member_id = p_member_id;

  IF v_same_cat_count > 0 THEN
    RAISE EXCEPTION 'ACTIVE_LOAN_EXISTS' USING ERRCODE = 'P0301';
  END IF;

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


REVOKE ALL ON FUNCTION public.record_loan(uuid, numeric, numeric, numeric, date, integer, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_loan(uuid, numeric, numeric, numeric, date, integer, uuid) TO authenticated;
