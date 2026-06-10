-- ============================================================
-- Migration 003 — Adapt schema for real DIRIYALANKA data
-- Generalizes the prototype's fixed 3-plan model to real loans:
-- arbitrary principal + interest, multi-cycle history, reused
-- member numbers, per-center collection day/manager, payment markers.
-- Additive & non-destructive to structure (only relaxes constraints).
-- ============================================================

-- ---------- MEMBERS ----------
-- member_number is NOT a unique person key (reused across centers) -> drop global unique.
alter table public.members drop constraint if exists members_member_number_key;
alter table public.members add column if not exists phone text;
-- (non-unique idx_members_number already exists for lookups)

-- ---------- CENTERS ----------
alter table public.centers add column if not exists collection_day text;
alter table public.centers add column if not exists manager_name text;

-- ---------- LOANS ----------
-- Real loans have arbitrary principal (Rs 5k–150k+) and explicit interest.
alter table public.loans drop constraint if exists loans_loan_plan_check;
alter table public.loans alter column loan_plan drop not null;
alter table public.loans add column if not exists principal        numeric(12,2);
alter table public.loans add column if not exists interest         numeric(12,2);
alter table public.loans add column if not exists original_balance numeric(12,2);
alter table public.loans add column if not exists product_type     integer;     -- source "Type" 1..5
alter table public.loans add column if not exists cycle_no         integer;     -- 1 = first loan, ascending per member
alter table public.loans add column if not exists source           text;        -- 'import' for migrated rows
create index if not exists idx_loans_member_cycle on public.loans(member_id, cycle_no);

-- ---------- PAYMENTS ----------
-- Historical payments predate staff user accounts -> staff_id nullable; add marker.
alter table public.payments alter column staff_id drop not null;
alter table public.payments add column if not exists marker text;   -- 'N/P','NEW','N/A', etc.
alter table public.payments add column if not exists source text;   -- 'import'
create index if not exists idx_payments_marker on public.payments(marker);
