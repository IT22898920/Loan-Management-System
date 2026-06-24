-- Migration: Track who set cash_issued on daily_reports
-- Adds audit columns to record which admin set the cash_issued value and when.
-- No data backfill — both columns are nullable.

ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS cash_issued_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cash_issued_at timestamptz;

COMMENT ON COLUMN public.daily_reports.cash_issued_by IS 'Admin profile who set the cash_issued value';
COMMENT ON COLUMN public.daily_reports.cash_issued_at IS 'Timestamp when the cash_issued value was set by an admin';
