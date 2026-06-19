-- ============================================================
-- Migration 010 — GPS mandatory for app-recorded payments (client requirement)
-- Historical imports (source 'import' / 'import-view') predate GPS and are exempt.
-- App payments (source='app', created via record_payment) MUST carry coordinates.
-- ============================================================

-- DB-level guarantee: an app payment can never be stored without GPS.
alter table public.payments drop constraint if exists payments_app_requires_gps;
alter table public.payments add constraint payments_app_requires_gps
  check (source <> 'app' or (gps_lat is not null and gps_lng is not null));

-- RPC-level guard: reject before insert so the staff gets a clear error.
create or replace function public.record_payment(
  p_loan_id uuid,
  p_amount numeric,
  p_is_not_paid boolean,
  p_gps_lat numeric,
  p_gps_lng numeric,
  p_gps_address text,
  p_payment_date date
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text := public.get_my_role();
  v_loan public.loans%rowtype;
  v_amount numeric;
  v_shortfall numeric;
  v_new_balance numeric;
  v_completed boolean;
  v_pid uuid;
begin
  if v_uid is null or v_role not in ('staff', 'admin') then
    return json_build_object('error', 'Unauthorized');
  end if;

  -- GPS is mandatory for field collections (client requirement)
  if p_gps_lat is null or p_gps_lng is null then
    return json_build_object('error', 'GPS location is required to record a payment.');
  end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if not found then return json_build_object('error', 'Loan not found.'); end if;
  if v_loan.status = 'completed' then
    return json_build_object('error', 'Loan is already completed.');
  end if;

  v_amount := case when p_is_not_paid then 0 else coalesce(p_amount, 0) end;
  if not p_is_not_paid and v_amount > v_loan.loan_balance then
    return json_build_object('error',
      'Payment amount exceeds loan balance (Rs. ' || v_loan.loan_balance || ').');
  end if;

  if p_is_not_paid then
    v_shortfall := v_loan.weekly_payment;
    v_new_balance := v_loan.loan_balance;
  else
    v_shortfall := greatest(0, v_loan.weekly_payment - v_amount);
    v_new_balance := greatest(0, v_loan.loan_balance - v_amount);
  end if;
  v_completed := (not p_is_not_paid) and v_new_balance <= 0;

  insert into public.payments
    (loan_id, member_id, staff_id, amount_paid, is_not_paid, shortfall,
     payment_date, gps_lat, gps_lng, gps_address, source)
  values
    (p_loan_id, v_loan.member_id, v_uid, v_amount, p_is_not_paid, v_shortfall,
     p_payment_date, p_gps_lat, p_gps_lng, p_gps_address, 'app')
  on conflict (loan_id, payment_date) where source is distinct from 'import'
  do nothing
  returning id into v_pid;

  if v_pid is null then
    return json_build_object('duplicate', true,
      'message', 'A payment for this loan today is already recorded.');
  end if;

  update public.loans
    set loan_balance = v_new_balance,
        status = case when v_completed then 'completed' else 'active' end
  where id = p_loan_id;

  return json_build_object('success', true, 'is_completed', v_completed, 'payment_id', v_pid);
end;
$$;

grant execute on function public.record_payment(uuid, numeric, boolean, numeric, numeric, text, date) to authenticated;
