-- ============================================================
-- Migration 012 — make payments_filtered fast for the unfiltered default
-- The previous version joined 5 tables BEFORE the LIMIT, taking ~12s over 319k
-- rows (PostgREST 500). Now: filter+sort+limit on the payments table alone
-- (pure index scan via idx_payments_date_id), THEN join only the page's rows.
-- ============================================================

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
  with base as (
    select p.id, p.loan_id, p.member_id, p.staff_id, p.payment_date,
           p.amount_paid, p.is_not_paid, p.shortfall, p.gps_lat, p.gps_lng, p.gps_address
    from public.payments p
    where public.get_my_role() = 'admin'
      and (p_from is null or p.payment_date >= p_from)
      and (p_to is null or p.payment_date <= p_to)
      and (p_status is null or p_status = 'all'
           or (p_status = 'paid' and not p.is_not_paid and p.shortfall = 0)
           or (p_status = 'np' and p.is_not_paid)
           or (p_status = 'shortfall' and not p.is_not_paid and p.shortfall > 0))
      and (p_center is null or p.member_id in (
            select mm.id from public.members mm where mm.center_id = p_center))
      and (p_search is null or p_search = ''
           or p.member_id in (
            select mm.id from public.members mm
            where mm.full_name ilike '%' || p_search || '%'
               or mm.member_number ilike '%' || p_search || '%')
           or p.staff_id in (
            select pr.id from public.profiles pr where pr.full_name ilike '%' || p_search || '%'))
    order by p.payment_date desc, p.id desc
    limit greatest(0, least(p_limit, 100000)) offset greatest(0, p_offset)
  )
  select base.id, base.payment_date, base.amount_paid, base.is_not_paid, base.shortfall,
         base.gps_lat, base.gps_lng, base.gps_address,
         m.full_name, m.member_number, m.center_id, c.name, c.center_number,
         l.principal, s.full_name
  from base
  left join public.members m on m.id = base.member_id
  left join public.centers c on c.id = m.center_id
  left join public.loans l on l.id = base.loan_id
  left join public.profiles s on s.id = base.staff_id
  order by base.payment_date desc, base.id desc;
$$;

grant execute on function public.payments_filtered(date,date,uuid,text,text,int,int) to authenticated;
