-- =============================================================================
-- Sprint 2 — Requester/Worker refactor + Cleaning job posting
-- On Demand Jobs
--
-- Two parts:
--   1. Refactor Sprint 1 host/cleaner roles + profiles into requester/worker.
--   2. Add the Cleaning job posting schema (locations, categories, job types,
--      jobs, checklist templates).
--
-- Safe to run on a Sprint 1 database (renames + preserves data) OR a fresh
-- database (creates tables). Defensive and idempotent — safe to re-run. Apply
-- in the Supabase SQL editor (or CLI). Do NOT edit migration 001.
-- =============================================================================

create extension if not exists "pgcrypto";

-- Shared updated_at trigger function (idempotent; also covers a fresh DB).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- PART 1 — Role + profile refactor (host → requester, cleaner → worker)
-- =============================================================================

-- 1a. user_profiles.role values + check constraint.
-- Drop the constraint first so the data UPDATE can move to the new values.
alter table public.user_profiles drop constraint if exists user_profiles_role_check;
update public.user_profiles set role = 'requester' where role = 'host';
update public.user_profiles set role = 'worker' where role = 'cleaner';
alter table public.user_profiles
  add constraint user_profiles_role_check check (role in ('requester', 'worker'));

-- 1b. host_profiles → requester_profiles (rename if present, else create fresh).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'host_profiles'
  ) then
    alter table public.host_profiles rename to requester_profiles;
  elsif not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'requester_profiles'
  ) then
    create table public.requester_profiles (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null unique references auth.users (id) on delete cascade,
      requester_type text,
      service_area_zip text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  end if;

  -- Rename the legacy column if it still exists (RENAME COLUMN has no IF EXISTS).
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'requester_profiles'
      and column_name = 'poster_type'
  ) then
    alter table public.requester_profiles rename column poster_type to requester_type;
  end if;
end
$$;

-- requester_type check: drop legacy + any prior, then add the expanded set.
alter table public.requester_profiles
  drop constraint if exists host_profiles_poster_type_check;
alter table public.requester_profiles
  drop constraint if exists requester_profiles_requester_type_check;
alter table public.requester_profiles
  add constraint requester_profiles_requester_type_check
  check (requester_type in
    ('homeowner', 'str_host', 'co_host', 'property_manager', 'small_business'));

drop index if exists host_profiles_user_id_idx;
create index if not exists requester_profiles_user_id_idx
  on public.requester_profiles (user_id);

drop trigger if exists set_host_profiles_updated_at on public.requester_profiles;
drop trigger if exists set_requester_profiles_updated_at on public.requester_profiles;
create trigger set_requester_profiles_updated_at
  before update on public.requester_profiles
  for each row execute function public.set_updated_at();

alter table public.requester_profiles enable row level security;
drop policy if exists "host_profiles_select_own" on public.requester_profiles;
drop policy if exists "host_profiles_insert_own" on public.requester_profiles;
drop policy if exists "host_profiles_update_own" on public.requester_profiles;
drop policy if exists "requester_profiles_select_own" on public.requester_profiles;
drop policy if exists "requester_profiles_insert_own" on public.requester_profiles;
drop policy if exists "requester_profiles_update_own" on public.requester_profiles;
create policy "requester_profiles_select_own" on public.requester_profiles
  for select to authenticated using (auth.uid() = user_id);
create policy "requester_profiles_insert_own" on public.requester_profiles
  for insert to authenticated with check (auth.uid() = user_id);
create policy "requester_profiles_update_own" on public.requester_profiles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 1c. cleaner_profiles → worker_profiles (rename if present, else create fresh).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'cleaner_profiles'
  ) then
    alter table public.cleaner_profiles rename to worker_profiles;
  elsif not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'worker_profiles'
  ) then
    create table public.worker_profiles (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null unique references auth.users (id) on delete cascade,
      home_base_zip text,
      service_radius_miles integer not null default 10,
      experience_years integer not null default 0,
      worker_tier text not null default 'L1' check (worker_tier in ('L1', 'L2', 'L3')),
      verification_status text not null default 'pending'
        check (verification_status in ('pending', 'verified', 'rejected')),
      is_online boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  end if;
end
$$;

drop index if exists cleaner_profiles_user_id_idx;
create index if not exists worker_profiles_user_id_idx
  on public.worker_profiles (user_id);

drop trigger if exists set_cleaner_profiles_updated_at on public.worker_profiles;
drop trigger if exists set_worker_profiles_updated_at on public.worker_profiles;
create trigger set_worker_profiles_updated_at
  before update on public.worker_profiles
  for each row execute function public.set_updated_at();

alter table public.worker_profiles enable row level security;
drop policy if exists "cleaner_profiles_select_own" on public.worker_profiles;
drop policy if exists "cleaner_profiles_insert_own" on public.worker_profiles;
drop policy if exists "cleaner_profiles_update_own" on public.worker_profiles;
drop policy if exists "worker_profiles_select_own" on public.worker_profiles;
drop policy if exists "worker_profiles_insert_own" on public.worker_profiles;
drop policy if exists "worker_profiles_update_own" on public.worker_profiles;
create policy "worker_profiles_select_own" on public.worker_profiles
  for select to authenticated using (auth.uid() = user_id);
create policy "worker_profiles_insert_own" on public.worker_profiles
  for insert to authenticated with check (auth.uid() = user_id);
create policy "worker_profiles_update_own" on public.worker_profiles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =============================================================================
-- PART 2 — Cleaning job posting schema
-- =============================================================================

-- 2a. service_locations — a saved place a requester needs work done.
create table if not exists public.service_locations (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users (id) on delete cascade,
  nickname text not null,
  location_type text not null check (location_type in
    ('home', 'str_property', 'apartment', 'condo', 'townhouse', 'small_business', 'other')),
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null default 'OH',
  zip_code text not null,
  bedrooms integer,
  bathrooms numeric(3, 1),
  sleeps integer,
  laundry_on_site boolean default true,
  typical_laundry_loads integer default 1,
  supplies_provided boolean default true,
  parking_notes text,
  access_notes text,
  restock_notes text,
  default_cleaning_payout_cents integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2b. service_categories — top-level labor categories (Cleaning is the first).
create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.service_categories (slug, display_name)
values ('cleaning', 'Cleaning')
on conflict (slug) do nothing;

-- 2c. job_types — first-class job types within a category.
create table if not exists public.job_types (
  id uuid primary key default gen_random_uuid(),
  category_slug text not null default 'cleaning',
  slug text not null unique,
  display_name text not null,
  required_worker_tier text not null default 'L2'
    check (required_worker_tier in ('L1', 'L2', 'L3')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.job_types (slug, display_name, category_slug, required_worker_tier)
values
  ('str_turnover', 'STR Turnover Cleaning', 'cleaning', 'L2'),
  ('home_cleaning', 'Home Cleaning', 'cleaning', 'L2')
on conflict (slug) do nothing;

-- 2d. jobs — a posted (or draft) cleaning job for a location.
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users (id) on delete cascade,
  service_location_id uuid not null references public.service_locations (id) on delete cascade,
  category_slug text not null default 'cleaning',
  job_type_slug text not null check (job_type_slug in ('str_turnover', 'home_cleaning')),
  title text not null,
  status text not null default 'draft' check (status in
    ('draft', 'posted', 'accepted', 'en_route', 'checked_in', 'in_progress',
     'proof_submitted', 'awaiting_approval', 'completed', 'payment_released',
     'disputed', 'cancelled', 'no_show')),
  requested_start_at timestamptz,
  deadline_at timestamptz not null,
  payout_cents integer not null,
  platform_fee_cents integer not null default 0,
  worker_net_payout_cents integer,
  bedrooms integer,
  bathrooms numeric(3, 1),
  estimated_hours numeric(3, 1),
  laundry_required boolean default true,
  restocking_required boolean default false,
  trash_removal_required boolean default true,
  -- Home Cleaning rooms/areas/scope; null for STR Turnover. Lean free text, not a builder.
  cleaning_scope text,
  special_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2e. cleaning_checklist_templates — seeded proof checklist (no upload in Sprint 2).
create table if not exists public.cleaning_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  job_type_slug text not null check (job_type_slug in ('str_turnover', 'home_cleaning')),
  room_name text not null,
  task_label text not null,
  requires_photo boolean not null default false,
  sort_order integer not null,
  created_at timestamptz not null default now()
);

-- STR Turnover checklist seed (guarded so re-runs don't duplicate).
insert into public.cleaning_checklist_templates
  (job_type_slug, room_name, task_label, requires_photo, sort_order)
select v.job_type_slug, v.room_name, v.task_label, v.requires_photo, v.sort_order
from (values
  ('str_turnover', 'Kitchen', 'Clean counters, sink, and appliances', true, 10),
  ('str_turnover', 'Kitchen', 'Empty fridge and remove guest leftovers', false, 11),
  ('str_turnover', 'Bathrooms', 'Scrub toilet, shower, and sink', false, 20),
  ('str_turnover', 'Bathrooms', 'Restock toilet paper and fresh towels', false, 21),
  ('str_turnover', 'Bathrooms', 'Photo: bathroom guest-ready', true, 22),
  ('str_turnover', 'Bedrooms', 'Strip and remake beds with fresh linens', false, 30),
  ('str_turnover', 'Bedrooms', 'Photo: bed styled and guest-ready', true, 31),
  ('str_turnover', 'Living Areas', 'Dust, tidy, and reset furniture', false, 40),
  ('str_turnover', 'Living Areas', 'Vacuum and mop floors', false, 41),
  ('str_turnover', 'Laundry', 'Wash, dry, and fold all linens and towels', false, 50),
  ('str_turnover', 'Entry / Exterior', 'Sweep entry and remove all trash', false, 60),
  ('str_turnover', 'Final Walkthrough', 'Confirm staging matches the listing photos', false, 70),
  ('str_turnover', 'Final Walkthrough', 'Photo: final whole-space walkthrough', true, 71)
) as v(job_type_slug, room_name, task_label, requires_photo, sort_order)
where not exists (
  select 1 from public.cleaning_checklist_templates where job_type_slug = 'str_turnover'
);

-- Home Cleaning checklist seed (guarded so re-runs don't duplicate).
insert into public.cleaning_checklist_templates
  (job_type_slug, room_name, task_label, requires_photo, sort_order)
select v.job_type_slug, v.room_name, v.task_label, v.requires_photo, v.sort_order
from (values
  ('home_cleaning', 'Kitchen', 'Clean counters, sink, and stovetop', false, 10),
  ('home_cleaning', 'Kitchen', 'Wipe down the exterior of appliances', false, 11),
  ('home_cleaning', 'Bathrooms', 'Scrub toilet, shower, sink, and mirror', false, 20),
  ('home_cleaning', 'Bathrooms', 'Photo: bathroom cleaned', true, 21),
  ('home_cleaning', 'Bedrooms', 'Make beds and tidy surfaces', false, 30),
  ('home_cleaning', 'Living Areas', 'Tidy and wipe down surfaces', false, 40),
  ('home_cleaning', 'Floors', 'Vacuum carpets and mop hard floors', false, 50),
  ('home_cleaning', 'Dusting', 'Dust surfaces, sills, and fixtures', false, 60),
  ('home_cleaning', 'Final Walkthrough', 'Confirm all requested rooms are cleaned', false, 70),
  ('home_cleaning', 'Final Walkthrough', 'Photo: final walkthrough', true, 71)
) as v(job_type_slug, room_name, task_label, requires_photo, sort_order)
where not exists (
  select 1 from public.cleaning_checklist_templates where job_type_slug = 'home_cleaning'
);

-- 2f. updated_at triggers
drop trigger if exists set_service_locations_updated_at on public.service_locations;
create trigger set_service_locations_updated_at
  before update on public.service_locations
  for each row execute function public.set_updated_at();

drop trigger if exists set_jobs_updated_at on public.jobs;
create trigger set_jobs_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- 2g. indexes
create index if not exists service_locations_requester_user_id_idx
  on public.service_locations (requester_user_id);
create index if not exists service_locations_zip_code_idx
  on public.service_locations (zip_code);
create index if not exists jobs_requester_user_id_idx on public.jobs (requester_user_id);
create index if not exists jobs_service_location_id_idx on public.jobs (service_location_id);
create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_deadline_at_idx on public.jobs (deadline_at);
create index if not exists jobs_job_type_slug_idx on public.jobs (job_type_slug);
create index if not exists cleaning_checklist_templates_job_type_slug_idx
  on public.cleaning_checklist_templates (job_type_slug);

-- =============================================================================
-- PART 3 — Row Level Security for the new tables
-- =============================================================================

alter table public.service_locations enable row level security;
alter table public.service_categories enable row level security;
alter table public.job_types enable row level security;
alter table public.jobs enable row level security;
alter table public.cleaning_checklist_templates enable row level security;

-- service_locations: owner-scoped (requester only). No worker access in Sprint 2.
drop policy if exists "service_locations_select_own" on public.service_locations;
create policy "service_locations_select_own" on public.service_locations
  for select to authenticated using (auth.uid() = requester_user_id);
drop policy if exists "service_locations_insert_own" on public.service_locations;
create policy "service_locations_insert_own" on public.service_locations
  for insert to authenticated with check (auth.uid() = requester_user_id);
drop policy if exists "service_locations_update_own" on public.service_locations;
create policy "service_locations_update_own" on public.service_locations
  for update to authenticated
  using (auth.uid() = requester_user_id)
  with check (auth.uid() = requester_user_id);

-- jobs: owner-scoped (requester only). Worker read policies arrive in Sprint 3.
drop policy if exists "jobs_select_own" on public.jobs;
create policy "jobs_select_own" on public.jobs
  for select to authenticated using (auth.uid() = requester_user_id);
drop policy if exists "jobs_insert_own" on public.jobs;
create policy "jobs_insert_own" on public.jobs
  for insert to authenticated with check (auth.uid() = requester_user_id);
drop policy if exists "jobs_update_own" on public.jobs;
create policy "jobs_update_own" on public.jobs
  for update to authenticated
  using (auth.uid() = requester_user_id)
  with check (auth.uid() = requester_user_id);

-- service_categories: read-only catalog for authenticated users (active rows only).
drop policy if exists "service_categories_select_active" on public.service_categories;
create policy "service_categories_select_active" on public.service_categories
  for select to authenticated using (is_active = true);

-- job_types: read-only catalog for authenticated users (active rows only).
drop policy if exists "job_types_select_active" on public.job_types;
create policy "job_types_select_active" on public.job_types
  for select to authenticated using (is_active = true);

-- cleaning_checklist_templates: read-only for authenticated users.
drop policy if exists "cleaning_checklist_templates_select_all" on public.cleaning_checklist_templates;
create policy "cleaning_checklist_templates_select_all" on public.cleaning_checklist_templates
  for select to authenticated using (true);
