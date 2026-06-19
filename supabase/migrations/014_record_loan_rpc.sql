-- Migration 014: record_loan RPC (SECURITY DEFINER)
-- Problem: staff cannot see completed loans via RLS, so cycle_no = COUNT(...)+1
-- from the staff side returns 0 for returning members → unique constraint
-- (uniq_loan_member_cycle) violates on the 2nd loan insert.
-- Fix: a SECURITY DEFINER RPC computes cycle_no with max()+1, bypassing RLS.

CREATE OR REPLACE FUNCTION public.record_loan(
  p_member_id      uuid,
  p_principal      numeric,
  p_interest       numeric,
  p_weekly_payment numeric,
  p_issued_date    date,
  p_product_type   integer,
  p_created_by     uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle_no        integer;
  v_is_first_loan   boolean;
  v_balance         numeric(12,2);
  v_loan_id         uuid;
BEGIN
  -- Compute next cycle_no across ALL loans for this member (RLS bypassed)
  SELECT COALESCE(MAX(cycle_no), 0) + 1
    INTO v_cycle_no
    FROM public.loans
   WHERE member_id = p_member_id;

  v_is_first_loan := (v_cycle_no = 1);
  v_balance := p_principal + p_interest;

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

  RETURN v_loan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_loan(uuid, numeric, numeric, numeric, date, integer, uuid) TO authenticated;
