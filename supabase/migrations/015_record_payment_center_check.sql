-- Migration 015: record_payment RPC — center authorization check
-- Problem: record_payment is SECURITY DEFINER, so RLS doesn't check whether
-- the staff member is actually assigned to the loan's center TODAY. Any staff
-- with a known loan UUID could record/preempt payments for any center on any day.
-- Fix: enforce join loans → members → staff_center_assignments at top of RPC.

CREATE OR REPLACE FUNCTION public.record_payment(
  p_loan_id uuid,
  p_amount numeric,
  p_is_not_paid boolean,
  p_gps_lat numeric,
  p_gps_lng numeric,
  p_gps_address text,
  p_payment_date date
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_role text := public.get_my_role();
  v_loan public.loans%ROWTYPE;
  v_amount numeric;
  v_shortfall numeric;
  v_new_balance numeric;
  v_completed boolean;
  v_pid uuid;
  v_today_dow text;
BEGIN
  IF v_uid IS NULL OR v_role NOT IN ('staff', 'admin') THEN
    RETURN json_build_object('error', 'Unauthorized');
  END IF;

  v_today_dow := lower(trim(to_char(now() AT TIME ZONE 'Asia/Colombo', 'FMDay')));

  -- Center authorization (staff only — admins always allowed)
  IF v_role = 'staff' THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.loans l
        JOIN public.members m ON m.id = l.member_id
        JOIN public.staff_center_assignments sca ON sca.center_id = m.center_id
       WHERE l.id = p_loan_id
         AND sca.staff_id = v_uid
         AND sca.day_of_week = v_today_dow
    ) THEN
      RETURN json_build_object('error',
        'Not authorized: this loan''s center is not assigned to you today.');
    END IF;
  END IF;

  -- Lock the loan row so concurrent payments serialize
  SELECT * INTO v_loan FROM public.loans WHERE id = p_loan_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Loan not found.'); END IF;
  IF v_loan.status = 'completed' THEN
    RETURN json_build_object('error', 'Loan is already completed.');
  END IF;

  v_amount := CASE WHEN p_is_not_paid THEN 0 ELSE COALESCE(p_amount, 0) END;
  IF NOT p_is_not_paid AND v_amount > v_loan.loan_balance THEN
    RETURN json_build_object('error',
      'Payment amount exceeds loan balance (Rs. ' || v_loan.loan_balance || ').');
  END IF;

  IF p_is_not_paid THEN
    v_shortfall := v_loan.weekly_payment;
    v_new_balance := v_loan.loan_balance;
  ELSE
    v_shortfall := greatest(0, v_loan.weekly_payment - v_amount);
    v_new_balance := greatest(0, v_loan.loan_balance - v_amount);
  END IF;
  v_completed := (NOT p_is_not_paid) AND v_new_balance <= 0;

  INSERT INTO public.payments
    (loan_id, member_id, staff_id, amount_paid, is_not_paid, shortfall,
     payment_date, gps_lat, gps_lng, gps_address, source)
  VALUES
    (p_loan_id, v_loan.member_id, v_uid, v_amount, p_is_not_paid, v_shortfall,
     p_payment_date, p_gps_lat, p_gps_lng, p_gps_address, 'app')
  ON CONFLICT (loan_id, payment_date) WHERE source IS DISTINCT FROM 'import'
  DO NOTHING
  RETURNING id INTO v_pid;

  IF v_pid IS NULL THEN
    RETURN json_build_object('duplicate', true,
      'message', 'A payment for this loan today is already recorded.');
  END IF;

  UPDATE public.loans
     SET loan_balance = v_new_balance,
         status = CASE WHEN v_completed THEN 'completed' ELSE 'active' END
   WHERE id = p_loan_id;

  RETURN json_build_object('success', true, 'is_completed', v_completed, 'payment_id', v_pid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_payment(uuid, numeric, boolean, numeric, numeric, text, date) TO authenticated;
