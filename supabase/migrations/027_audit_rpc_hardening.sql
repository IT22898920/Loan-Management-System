-- 027: Audit RPC hardening (review findings from pre-staging adversarial review).
--  1. Keyset pagination for audit_collections_json — offset pagination across
--     separate stateless RPC calls could duplicate boundary rows if a payment
--     was inserted mid-generation (current-FY report during Mon-Thu field
--     collections). Cursor on (payment_date, id) makes concurrent inserts
--     append-only relative to already-fetched keys.
--  2. search_path = public, pg_temp on all SECURITY DEFINER functions
--     (temp-table shadowing hardening).
--  3. audit_guard() execute revoked from authenticated — it is an internal
--     helper called by the definer functions, never directly by clients.

alter function audit_guard() set search_path = public, pg_temp;
alter function audit_loans_json() set search_path = public, pg_temp;
alter function audit_cum_paid_json(date) set search_path = public, pg_temp;
alter function audit_collections_count(date, date) set search_path = public, pg_temp;

revoke all on function audit_guard() from authenticated;

drop function if exists audit_collections_json(date, date, integer, integer);

create or replace function audit_collections_json(
  fy_start date, fy_end date, p_after_date date, p_after_id uuid, p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform audit_guard();
  if p_limit is null or p_limit < 1 or p_limit > 20000 then
    raise exception 'p_limit must be between 1 and 20000';
  end if;
  if (p_after_date is null) <> (p_after_id is null) then
    raise exception 'cursor parts must be provided together';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id,
      'd', t.payment_date,
      'amt', t.amount_paid,
      'np', t.is_not_paid,
      'sf', t.shortfall,
      'loan_id', t.loan_id
    ) order by t.payment_date, t.id)
    from (
      select p.id, p.payment_date, p.amount_paid, p.is_not_paid, p.shortfall, p.loan_id
      from payments p
      where p.payment_date between fy_start and fy_end
        and (p_after_date is null or (p.payment_date, p.id) > (p_after_date, p_after_id))
      order by p.payment_date, p.id
      limit p_limit
    ) t
  ), '[]'::jsonb);
end;
$$;

revoke all on function audit_collections_json(date, date, date, uuid, integer) from public, anon;
grant execute on function audit_collections_json(date, date, date, uuid, integer) to authenticated;
