-- Create loan_plans table
CREATE TABLE IF NOT EXISTS public.loan_plans (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  principal       numeric(12,2) NOT NULL CHECK (principal > 0),
  interest        numeric(12,2) NOT NULL CHECK (interest >= 0),
  total_balance   numeric(12,2) NOT NULL CHECK (total_balance > 0),
  weekly_payment  numeric(12,2) NOT NULL CHECK (weekly_payment > 0),
  duration_weeks  integer NOT NULL CHECK (duration_weeks > 0),
  member_type     text NOT NULL CHECK (member_type IN ('new', 'returning', 'both')),
  category        text NOT NULL CHECK (category IN ('small', 'medium', 'large')),
  is_active       boolean NOT NULL DEFAULT true,
  display_order   integer NOT NULL DEFAULT 0,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loan_plans_active_order ON public.loan_plans(display_order) WHERE is_active = true;

-- RLS
ALTER TABLE public.loan_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active loan plans"
  ON public.loan_plans FOR SELECT
  USING (auth.role() = 'authenticated' AND is_active = true);
CREATE POLICY "Admin can manage loan plans"
  ON public.loan_plans FOR ALL
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

-- Seed the 12 plans (per client provided table)
INSERT INTO public.loan_plans (principal, interest, total_balance, weekly_payment, duration_weeks, member_type, category, display_order) VALUES
  (5000,    1000,   6000,  600, 10, 'both',      'small',  1),
  (10000,   2500,  12500, 1000, 13, 'returning', 'small',  2),
  (10000,   3000,  13000, 1000, 13, 'new',       'small',  3),
  (20000,   5000,  25000, 2000, 13, 'returning', 'small',  4),
  (20000,   6000,  26000, 2000, 13, 'new',       'small',  5),
  (50000,  14000,  64000, 3200, 20, 'both',      'medium', 6),
  (75000,  25000, 100000, 4000, 25, 'both',      'medium', 7),
  (100000, 30000, 130000, 6500, 20, 'both',      'medium', 8),
  (60000,  18000,  78000, 1625, 48, 'both',      'large',  9),
  (175000, 55000, 230000, 4750, 48, 'both',      'large', 10),
  (200000, 60000, 260000, 4333, 60, 'both',      'large', 11),
  (250000, 75000, 325000, 5250, 62, 'both',      'large', 12)
ON CONFLICT DO NOTHING;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_loan_plans_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_loan_plans_updated_at ON public.loan_plans;
CREATE TRIGGER trg_loan_plans_updated_at
  BEFORE UPDATE ON public.loan_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_loan_plans_updated_at();
