-- ============================================================
-- Migration 004 — performance for real-data volume (318k payments)
-- ============================================================

-- Payments admin page orders by created_at desc, limit 1000.
-- Without this index a full sort of 318k rows times out PostgREST (500).
create index if not exists idx_payments_created on public.payments (created_at desc);

-- All-time collected total for the admin dashboard.
-- Client-side sum was capped at PostgREST's 1000-row default → wrong total.
create or replace function public.total_collected()
returns numeric
language sql
stable
security definer set search_path = public
as $$
  select coalesce(sum(amount_paid), 0) from public.payments where is_not_paid = false;
$$;
