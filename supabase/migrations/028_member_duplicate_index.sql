-- 028: Backstop for the app-level duplicate-member guard (QA 86eydenvg).
-- Scope is (number, name, CENTER): the legacy books legitimately carry the
-- same member number + name in two centers (191 active cross-center pairs,
-- e.g. GIRAGAMA / GIRAGAMA TWO splits, each side with its own loan history),
-- so uniqueness only holds within a center — which is exactly the QA repro.
-- Verified 2026-08-03: zero same-center violations in production.
-- Apply via Audit/apply-member-dup-index.mjs.

create unique index if not exists uniq_member_no_name_center_active
  on public.members (upper(member_number), lower(full_name), center_id)
  where archived_at is null;
