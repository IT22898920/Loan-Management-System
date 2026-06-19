-- Migration 021: payment_attempts — forensic trail for every payment attempt
-- Problem: when record_payment fails (RPC error, network, etc.) the field
-- staff already has the cash. No DB row. No log. Money silently disappears.
-- Fix: always insert into payment_attempts BEFORE calling the RPC, and stamp
-- success/failure after. Admin can reconcile against daily reports.

CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id              uuid primary key default uuid_generate_v4(),
  loan_id         uuid not null references public.loans(id) on delete restrict,
  member_id       uuid references public.members(id) on delete set null,
  staff_id        uuid references public.profiles(id) on delete set null,
  amount_paid     numeric(12,2) not null default 0,
  is_not_paid     boolean not null default false,
  gps_lat         numeric(10,7),
  gps_lng         numeric(10,7),
  gps_address     text,
  payment_date    date not null,
  status          text not null check (status in ('pending','success','failed','duplicate')),
  error_message   text,
  payment_id      uuid references public.payments(id) on delete set null,
  user_agent      text,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_staff_date
  ON public.payment_attempts(staff_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_status
  ON public.payment_attempts(status)
  WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_payment_attempts_loan
  ON public.payment_attempts(loan_id);

ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view all payment attempts"
  ON public.payment_attempts FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "Staff can insert own payment attempts"
  ON public.payment_attempts FOR INSERT
  WITH CHECK (
    get_my_role() = 'staff'
    AND staff_id = auth.uid()
  );

CREATE POLICY "Staff can view own payment attempts"
  ON public.payment_attempts FOR SELECT
  USING (
    get_my_role() = 'staff'
    AND staff_id = auth.uid()
  );

CREATE POLICY "Staff can update own pending attempts"
  ON public.payment_attempts FOR UPDATE
  USING (
    get_my_role() = 'staff'
    AND staff_id = auth.uid()
    AND status = 'pending'
  )
  WITH CHECK (staff_id = auth.uid());

COMMENT ON TABLE public.payment_attempts IS
  'Forensic trail: every payment attempt logged before/after record_payment RPC. Reconciles staff daily reports against actual collections.';
