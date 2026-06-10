-- Migration 009 — prevent duplicate loan cycle numbers per member (integrity guard).
-- NULL cycle_no (legacy xlsx-UI imports) stays allowed (NULLs are distinct).
create unique index if not exists uniq_loan_member_cycle
  on public.loans (member_id, cycle_no)
  where cycle_no is not null;
