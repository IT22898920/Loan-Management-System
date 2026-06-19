-- Migration 011 — composite index so the admin Payments default sort
-- (payment_date desc, id desc) is a pure index scan, not a 319k-row sort.
create index if not exists idx_payments_date_id on public.payments (payment_date desc, id desc);
