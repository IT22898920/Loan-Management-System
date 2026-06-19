-- Migration 022: audit_log — immutable change history (CBSL regulatory compliance)
-- Every INSERT/UPDATE/DELETE on key tables is logged with actor, old/new data,
-- and timestamp. Admin-only RLS. No UPDATE/DELETE policies — append-only.

CREATE TABLE IF NOT EXISTS public.audit_log (
  id          bigserial primary key,
  table_name  text not null,
  row_id      text not null,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id    uuid,
  actor_role  text,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_row
  ON public.audit_log(table_name, row_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor
  ON public.audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created
  ON public.audit_log(created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Admin-only read. No INSERT policy = nobody can insert directly
-- (only the trigger function with SECURITY DEFINER can). No UPDATE/DELETE
-- policies = append-only by design.
CREATE POLICY "Admin can read audit log"
  ON public.audit_log FOR SELECT
  USING (get_my_role() = 'admin');

-- Generic logging trigger function
CREATE OR REPLACE FUNCTION public.log_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row_id text;
  v_actor_role text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row_id := OLD.id::text;
  ELSE
    v_row_id := NEW.id::text;
  END IF;

  -- get_my_role() may be null in service-role contexts
  BEGIN
    v_actor_role := get_my_role();
  EXCEPTION WHEN OTHERS THEN
    v_actor_role := NULL;
  END;

  INSERT INTO public.audit_log
    (table_name, row_id, action, actor_id, actor_role, old_data, new_data)
  VALUES (
    TG_TABLE_NAME,
    v_row_id,
    TG_OP,
    auth.uid(),
    v_actor_role,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach to financial / identity tables
CREATE TRIGGER trg_audit_loans
  AFTER INSERT OR UPDATE OR DELETE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION log_change();

CREATE TRIGGER trg_audit_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION log_change();

CREATE TRIGGER trg_audit_members
  AFTER INSERT OR UPDATE OR DELETE ON public.members
  FOR EACH ROW EXECUTE FUNCTION log_change();

CREATE TRIGGER trg_audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION log_change();

CREATE TRIGGER trg_audit_assignments
  AFTER INSERT OR UPDATE OR DELETE ON public.staff_center_assignments
  FOR EACH ROW EXECUTE FUNCTION log_change();

CREATE TRIGGER trg_audit_daily_reports
  AFTER INSERT OR UPDATE OR DELETE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION log_change();

COMMENT ON TABLE public.audit_log IS
  'Immutable change history for CBSL regulatory compliance. Append-only — RLS has no UPDATE/DELETE policies.';
