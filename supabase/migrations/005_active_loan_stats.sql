-- Migration 005 — correct dashboard active-loan stats (1000-row cap bug)
create or replace function public.active_loan_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'outstanding', coalesce(sum(loan_balance), 0),
    'small',  count(*) filter (where principal <= 10000),
    'medium', count(*) filter (where principal > 10000 and principal <= 25000),
    'large',  count(*) filter (where principal > 25000),
    'total',  count(*)
  ) from public.loans where status = 'active';
$$;
