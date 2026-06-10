-- ============================================================
-- Migration 008 — per-loan alert/critical flags for the admin Members page
-- Fixes: alert detection previously read only the global last 600 payments
-- (≈ one collection day at 319k scale), so most loans could never be flagged.
-- This computes each ACTIVE loan's status from its OWN most-recent 3 payments.
-- ============================================================

create or replace function public.member_loan_flags()
returns table (loan_id uuid, alert text, critical boolean)
language sql stable security definer set search_path = public as $$
  with ranked as (
    select p.loan_id, p.is_not_paid, p.shortfall,
           row_number() over (partition by p.loan_id
                              order by p.payment_date desc, p.id desc) as rn
    from public.payments p
    join public.loans l on l.id = p.loan_id and l.status = 'active'
    where public.get_my_role() = 'admin'
  )
  select
    loan_id,
    -- alert = status of the single most-recent payment (null if clean)
    max(case when rn = 1 then
      case when is_not_paid then 'np'
           when shortfall > 0 then 'shortfall'
           else null end
    end) as alert,
    -- critical = the last 3 payments ALL N/P or shortfall
    (count(*) filter (where rn <= 3) = 3
     and bool_and(is_not_paid or shortfall > 0)) as critical
  from ranked
  where rn <= 3
  group by loan_id;
$$;

grant execute on function public.member_loan_flags() to authenticated;
