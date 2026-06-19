-- Migration 013: Staff offboarding FK fix
-- Problem: payments.staff_id FK has no ON DELETE rule, so deleting a staff
-- member with recorded payments fails with FK violation. Same for daily_reports.
-- Fix: ON DELETE SET NULL preserves the audit trail while allowing offboarding.

-- daily_reports.staff_id: drop NOT NULL first so SET NULL is valid
ALTER TABLE daily_reports ALTER COLUMN staff_id DROP NOT NULL;

-- payments.staff_id FK
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_staff_id_fkey;
ALTER TABLE payments
  ADD CONSTRAINT payments_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- daily_reports.staff_id FK
ALTER TABLE daily_reports DROP CONSTRAINT IF EXISTS daily_reports_staff_id_fkey;
ALTER TABLE daily_reports
  ADD CONSTRAINT daily_reports_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES profiles(id) ON DELETE SET NULL;
