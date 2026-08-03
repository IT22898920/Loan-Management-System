-- 028: Backstop for the app-level duplicate-member guard (QA 86eydenvg).
-- Partial unique index on ACTIVE members' (number, name) pair so a
-- double-submit/race cannot insert what the pre-check just missed.
-- NOTE: apply via Audit/apply-member-dup-index.mjs — it first checks for
-- pre-existing legacy violations and reports them instead of failing.

create unique index if not exists uniq_member_no_name_active
  on public.members (upper(member_number), lower(full_name))
  where archived_at is null;
