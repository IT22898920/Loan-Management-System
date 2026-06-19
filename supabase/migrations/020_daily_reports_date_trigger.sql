-- Migration 020: daily_reports — DB-level today-only enforcement
-- Problem: nothing prevents staff from back/forward dating reports via the API.
-- CHECK constraints can't reference non-immutable now(), so use a trigger.

CREATE OR REPLACE FUNCTION public.enforce_today_report_date()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.report_date <> (now() AT TIME ZONE 'Asia/Colombo')::date THEN
    RAISE EXCEPTION 'Report date must be today (Asia/Colombo). Got %, expected %.',
      NEW.report_date,
      (now() AT TIME ZONE 'Asia/Colombo')::date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_daily_reports_today ON public.daily_reports;
CREATE TRIGGER trg_daily_reports_today
  BEFORE INSERT OR UPDATE OF report_date ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_today_report_date();
