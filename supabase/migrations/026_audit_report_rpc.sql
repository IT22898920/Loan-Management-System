-- 026: Audit report RPC functions (admin-only, read-only).
-- Server-side JSON aggregation so the admin audit page can pull large datasets
-- in few round-trips instead of thousands of paginated PostgREST requests.
-- SECURITY DEFINER bypasses RLS for speed; every function hard-guards on the
-- caller being an authenticated admin.

create or replace function audit_guard()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or get_my_role() <> 'admin' then
    raise exception 'audit reports are admin-only';
  end if;
end;
$$;

-- All loans with member + center context, one JSON payload (~5k rows).
create or replace function audit_loans_json()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform audit_guard();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', l.id,
      'principal', l.principal,
      'interest', l.interest,
      'issued_date', l.issued_date,
      'status', l.status,
      'is_first_loan', l.is_first_loan,
      'cycle_no', l.cycle_no,
      'weekly_payment', l.weekly_payment,
      'member_no', coalesce(m.member_number, '?'),
      'client', coalesce(m.full_name, 'UNKNOWN'),
      'center', coalesce(c.name, 'UNASSIGNED')
    ) order by l.issued_date, l.created_at)
    from loans l
    left join members m on m.id = l.member_id
    left join centers c on c.id = m.center_id
  ), '[]'::jsonb);
end;
$$;

-- Cumulative amount paid per loan up to and including a cutoff date.
create or replace function audit_cum_paid_json(cutoff date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform audit_guard();
  return coalesce((
    select jsonb_object_agg(t.loan_id, t.paid)
    from (
      select p.loan_id, sum(p.amount_paid) as paid
      from payments p
      where p.payment_date <= cutoff
      group by p.loan_id
    ) t
  ), '{}'::jsonb);
end;
$$;

-- Payment rows in a window, paginated (order stable), joined to loan context.
create or replace function audit_collections_json(
  fy_start date, fy_end date, p_offset integer, p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform audit_guard();
  if p_limit is null or p_limit < 1 or p_limit > 20000 then
    raise exception 'p_limit must be between 1 and 20000';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'd', t.payment_date,
      'amt', t.amount_paid,
      'np', t.is_not_paid,
      'sf', t.shortfall,
      'loan_id', t.loan_id
    ) order by t.payment_date, t.rn)
    from (
      select p.payment_date, p.amount_paid, p.is_not_paid, p.shortfall, p.loan_id,
             row_number() over (order by p.payment_date, p.id) as rn
      from payments p
      where p.payment_date between fy_start and fy_end
      order by p.payment_date, p.id
      offset p_offset limit p_limit
    ) t
  ), '[]'::jsonb);
end;
$$;

-- Row count for the pagination loop.
create or replace function audit_collections_count(fy_start date, fy_end date)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare n bigint;
begin
  perform audit_guard();
  select count(*) into n from payments where payment_date between fy_start and fy_end;
  return n;
end;
$$;

revoke all on function audit_guard() from public, anon;
revoke all on function audit_loans_json() from public, anon;
revoke all on function audit_cum_paid_json(date) from public, anon;
revoke all on function audit_collections_json(date, date, integer, integer) from public, anon;
revoke all on function audit_collections_count(date, date) from public, anon;
grant execute on function audit_guard() to authenticated;
grant execute on function audit_loans_json() to authenticated;
grant execute on function audit_cum_paid_json(date) to authenticated;
grant execute on function audit_collections_json(date, date, integer, integer) to authenticated;
grant execute on function audit_collections_count(date, date) to authenticated;
