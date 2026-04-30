-- ============================================================
-- Loan Management System — Database Schema
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('admin', 'staff')),
  full_name  text not null,
  email      text not null,
  created_at timestamptz not null default now()
);

-- Auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'staff'),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- CENTERS
-- ============================================================
create table public.centers (
  id             uuid primary key default uuid_generate_v4(),
  name           text not null,
  center_number  integer not null unique,
  created_at     timestamptz not null default now()
);

-- ============================================================
-- STAFF CENTER ASSIGNMENTS
-- ============================================================
create table public.staff_center_assignments (
  id           uuid primary key default uuid_generate_v4(),
  staff_id     uuid not null references public.profiles(id) on delete cascade,
  center_id    uuid not null references public.centers(id) on delete cascade,
  day_of_week  text not null check (day_of_week in ('monday','tuesday','wednesday','thursday')),
  unique (staff_id, center_id, day_of_week)
);

create index idx_sca_staff_day on public.staff_center_assignments(staff_id, day_of_week);
create index idx_sca_center on public.staff_center_assignments(center_id);

-- ============================================================
-- MEMBERS
-- ============================================================
create table public.members (
  id             uuid primary key default uuid_generate_v4(),
  member_number  text not null unique,
  full_name      text not null,
  photo_url      text,
  center_id      uuid not null references public.centers(id) on delete restrict,
  created_by     uuid not null references public.profiles(id),
  created_at     timestamptz not null default now()
);

create index idx_members_center on public.members(center_id);
create index idx_members_number on public.members(member_number);

-- ============================================================
-- LOANS
-- ============================================================
create table public.loans (
  id              uuid primary key default uuid_generate_v4(),
  member_id       uuid not null references public.members(id) on delete cascade,
  loan_plan       integer not null check (loan_plan in (5000, 10000, 20000)),
  loan_balance    decimal(12,2) not null check (loan_balance >= 0),
  weekly_payment  decimal(12,2) not null,
  issued_date     date not null,
  status          text not null default 'active' check (status in ('active','completed')),
  is_first_loan   boolean not null default false,
  created_by      uuid not null references public.profiles(id),
  created_at      timestamptz not null default now()
);

create index idx_loans_member on public.loans(member_id);
create index idx_loans_status on public.loans(status);

-- ============================================================
-- PAYMENTS
-- ============================================================
create table public.payments (
  id            uuid primary key default uuid_generate_v4(),
  loan_id       uuid not null references public.loans(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  staff_id      uuid not null references public.profiles(id),
  amount_paid   decimal(12,2) not null default 0 check (amount_paid >= 0),
  is_not_paid   boolean not null default false,
  shortfall     decimal(12,2) not null default 0 check (shortfall >= 0),
  payment_date  date not null,
  gps_lat       decimal(10,7),
  gps_lng       decimal(10,7),
  gps_address   text,
  created_at    timestamptz not null default now()
);

create index idx_payments_loan on public.payments(loan_id);
create index idx_payments_member on public.payments(member_id);
create index idx_payments_staff_date on public.payments(staff_id, payment_date);
create index idx_payments_date on public.payments(payment_date);

-- ============================================================
-- DAILY REPORTS
-- ============================================================
create table public.daily_reports (
  id            uuid primary key default uuid_generate_v4(),
  staff_id      uuid not null references public.profiles(id),
  report_date   date not null,
  cash_issued   decimal(12,2) not null default 0,
  loan_issued   decimal(12,2) not null default 0,
  submitted_at  timestamptz,
  unique (staff_id, report_date)
);

create index idx_reports_staff_date on public.daily_reports(staff_id, report_date);

-- ============================================================
-- STORAGE BUCKET for member photos
-- ============================================================
insert into storage.buckets (id, name, public)
values ('member-photos', 'member-photos', false)
on conflict (id) do nothing;
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
