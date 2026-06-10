-- ============================================================
-- Migration 007 — server-side payments filtering/aggregation (admin)
-- Fixes the 1000-row cap on the admin Payments page: correct Total Collected,
-- working date/center/status/search filters, and full (un-truncated) exports.
-- ============================================================

-- Accurate aggregates over the FULL filtered set (not a 1000-row slice).
create or replace function public.payments_summary(
  p_from date default null,
  p_to date default null,
  p_center uuid default null,
  p_status text default null,
  p_search text default null
) returns json
language sql stable security definer set search_path = public as $$
  with f as (
    select p.amount_paid, p.is_not_paid, p.shortfall
    from public.payments p
    join public.members m on m.id = p.member_id
    left join public.profiles s on s.id = p.staff_id
    where public.get_my_role() = 'admin'
      and (p_from is null or p.payment_date >= p_from)
      and (p_to is null or p.payment_date <= p_to)
      and (p_center is null or m.center_id = p_center)
      and (p_status is null or p_status = 'all'
           or (p_status = 'paid' and not p.is_not_paid and p.shortfall = 0)
           or (p_status = 'np' and p.is_not_paid)
           or (p_status = 'shortfall' and not p.is_not_paid and p.shortfall > 0))
      and (p_search is null or p_search = ''
           or m.full_name ilike '%' || p_search || '%'
           or m.member_number ilike '%' || p_search || '%'
           or s.full_name ilike '%' || p_search || '%')
  )
  select json_build_object(
    'total', count(*),
    'total_collected', coalesce(sum(case when is_not_paid then 0 else amount_paid end), 0),
    'paid', count(*) filter (where not is_not_paid and shortfall = 0),
    'np', count(*) filter (where is_not_paid),
    'shortfall', count(*) filter (where not is_not_paid and shortfall > 0)
  ) from f;
$$;

-- Paginated filtered rows (flat shape for the table + exports).
create or replace function public.payments_filtered(
  p_from date default null,
  p_to date default null,
  p_center uuid default null,
  p_status text default null,
  p_search text default null,
  p_limit int default 200,
  p_offset int default 0
) returns table (
  id uuid, payment_date date, amount_paid numeric, is_not_paid boolean, shortfall numeric,
  gps_lat numeric, gps_lng numeric, gps_address text,
  member_name text, member_number text, center_id uuid, center_name text, center_number int,
  principal numeric, staff_name text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.payment_date, p.amount_paid, p.is_not_paid, p.shortfall,
         p.gps_lat, p.gps_lng, p.gps_address,
         m.full_name, m.member_number, m.center_id, c.name, c.center_number,
         l.principal, s.full_name
  from public.payments p
  join public.members m on m.id = p.member_id
  left join public.centers c on c.id = m.center_id
  left join public.loans l on l.id = p.loan_id
  left join public.profiles s on s.id = p.staff_id
  where public.get_my_role() = 'admin'
    and (p_from is null or p.payment_date >= p_from)
    and (p_to is null or p.payment_date <= p_to)
    and (p_center is null or m.center_id = p_center)
    and (p_status is null or p_status = 'all'
         or (p_status = 'paid' and not p.is_not_paid and p.shortfall = 0)
         or (p_status = 'np' and p.is_not_paid)
         or (p_status = 'shortfall' and not p.is_not_paid and p.shortfall > 0))
    and (p_search is null or p_search = ''
         or m.full_name ilike '%' || p_search || '%'
         or m.member_number ilike '%' || p_search || '%'
         or s.full_name ilike '%' || p_search || '%')
  order by p.payment_date desc, p.id desc
  limit greatest(0, least(p_limit, 100000)) offset greatest(0, p_offset);
$$;

grant execute on function public.payments_summary(date,date,uuid,text,text) to authenticated;
grant execute on function public.payments_filtered(date,date,uuid,text,text,int,int) to authenticated;
