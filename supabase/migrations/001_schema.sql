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
