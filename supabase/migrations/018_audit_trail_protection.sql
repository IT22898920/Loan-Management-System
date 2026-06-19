-- Migration 018: audit trail protection
-- Problem: loans, payments use ON DELETE CASCADE referencing members. A bug or
-- buggy cleanup could erase years of payment audit trail. For a microfinance
-- business this is a regulatory red flag.
-- Fix: switch to ON DELETE RESTRICT. Add members.archived_at for soft-delete.

-- loans.member_id
ALTER TABLE public.loans DROP CONSTRAINT IF EXISTS loans_member_id_fkey;
ALTER TABLE public.loans
  ADD CONSTRAINT loans_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE RESTRICT;

-- payments.loan_id
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_loan_id_fkey;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_loan_id_fkey
  FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE RESTRICT;

-- payments.member_id
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_member_id_fkey;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE RESTRICT;

-- members.archived_at — soft delete column
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Partial index — speeds up active-member lookups
CREATE INDEX IF NOT EXISTS idx_members_archived
  ON public.members (archived_at)
  WHERE archived_at IS NULL;
