-- ============================================================
-- Loan Management System — Row Level Security Policies
-- Run AFTER 001_schema.sql
-- ============================================================

-- Helper function: get current user role
create or replace function public.get_my_role()
returns text
language sql
stable
security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Helper function: get today's day of week string
create or replace function public.today_day_of_week()
returns text
language sql
stable
as $$
  select lower(to_char(now() at time zone 'Asia/Colombo', 'Day'))::text;
$$;

-- ============================================================
-- PROFILES
-- ============================================================
alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Admin can view all profiles"
  on public.profiles for select
  using (get_my_role() = 'admin');

create policy "Admin can update profiles"
  on public.profiles for update
  using (get_my_role() = 'admin');

-- ============================================================
-- CENTERS
-- ============================================================
alter table public.centers enable row level security;

create policy "Admin full access to centers"
  on public.centers for all
  using (get_my_role() = 'admin');

create policy "Staff can view today assigned centers"
  on public.centers for select
  using (
    get_my_role() = 'staff' and
    id in (
      select center_id from public.staff_center_assignments
      where staff_id = auth.uid()
        and day_of_week = trim(lower(to_char(now() at time zone 'Asia/Colombo', 'Day')))
    )
  );

-- ============================================================
-- STAFF CENTER ASSIGNMENTS
-- ============================================================
alter table public.staff_center_assignments enable row level security;

create policy "Admin full access to assignments"
  on public.staff_center_assignments for all
  using (get_my_role() = 'admin');

create policy "Staff can view own assignments"
  on public.staff_center_assignments for select
  using (get_my_role() = 'staff' and staff_id = auth.uid());

-- ============================================================
-- MEMBERS
-- ============================================================
alter table public.members enable row level security;

create policy "Admin full access to members"
  on public.members for all
  using (get_my_role() = 'admin');

create policy "Staff can view active-loan members in today centers"
  on public.members for select
  using (
    get_my_role() = 'staff' and
    center_id in (
      select center_id from public.staff_center_assignments
      where staff_id = auth.uid()
        and day_of_week = trim(lower(to_char(now() at time zone 'Asia/Colombo', 'Day')))
    ) and
    id in (
      select member_id from public.loans where status = 'active'
    )
  );

-- ============================================================
-- LOANS
-- ============================================================
alter table public.loans enable row level security;

create policy "Admin full access to loans"
  on public.loans for all
  using (get_my_role() = 'admin');

create policy "Staff can view active loans for today's center members"
  on public.loans for select
  using (
    get_my_role() = 'staff' and
    status = 'active' and
    member_id in (
      select m.id from public.members m
      inner join public.staff_center_assignments sca on sca.center_id = m.center_id
      where sca.staff_id = auth.uid()
        and sca.day_of_week = trim(lower(to_char(now() at time zone 'Asia/Colombo', 'Day')))
    )
  );

create policy "Staff can insert new loans"
  on public.loans for insert
  with check (get_my_role() = 'staff' and created_by = auth.uid());

create policy "Admin can update loans"
  on public.loans for update
  using (get_my_role() = 'admin');

-- ============================================================
-- PAYMENTS
-- ============================================================
alter table public.payments enable row level security;

create policy "Admin can view all payments"
  on public.payments for all
  using (get_my_role() = 'admin');

create policy "Staff can insert own payments"
  on public.payments for insert
  with check (get_my_role() = 'staff' and staff_id = auth.uid());

create policy "Staff can view own payments"
  on public.payments for select
  using (get_my_role() = 'staff' and staff_id = auth.uid());

-- ============================================================
-- DAILY REPORTS
-- ============================================================
alter table public.daily_reports enable row level security;

create policy "Admin can view all reports"
  on public.daily_reports for all
  using (get_my_role() = 'admin');

create policy "Staff full access to own reports"
  on public.daily_reports for all
  using (get_my_role() = 'staff' and staff_id = auth.uid())
  with check (get_my_role() = 'staff' and staff_id = auth.uid());

-- ============================================================
-- STORAGE RLS for member-photos bucket
-- ============================================================
create policy "Admin can upload member photos"
  on storage.objects for insert
  with check (
    bucket_id = 'member-photos' and
    get_my_role() = 'admin'
  );

create policy "Authenticated users can view member photos"
  on storage.objects for select
  using (
    bucket_id = 'member-photos' and
    auth.role() = 'authenticated'
  );

create policy "Admin can delete member photos"
  on storage.objects for delete
  using (
    bucket_id = 'member-photos' and
    get_my_role() = 'admin'
  );
