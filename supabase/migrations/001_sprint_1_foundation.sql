-- =============================================================================
-- Sprint 1 — Foundation schema
-- On-Demand STR Turnover Dispatch
--
-- Creates the three profile tables, an updated_at trigger, indexes, and
-- owner-scoped Row Level Security. Apply this in the Supabase SQL editor (or via
-- the Supabase CLI) before testing auth/profile flows in the app.
-- =============================================================================

-- gen_random_uuid() lives in the pgcrypto extension.
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- updated_at trigger function (shared by all tables)
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- user_profiles — one row per auth user; holds role + shared profile fields
-- -----------------------------------------------------------------------------
create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('host', 'cleaner')),
  display_name text,
  phone_number text,
  profile_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- host_profiles — host-specific details
-- -----------------------------------------------------------------------------
create table if not exists public.host_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  poster_type text check (poster_type in ('str_host', 'co_host', 'property_manager')),
  service_area_zip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists host_profiles_user_id_idx on public.host_profiles (user_id);

-- -----------------------------------------------------------------------------
-- cleaner_profiles — cleaner-specific details + system-managed status fields
-- -----------------------------------------------------------------------------
create table if not exists public.cleaner_profiles (
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

create index if not exists cleaner_profiles_user_id_idx on public.cleaner_profiles (user_id);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
drop trigger if exists set_user_profiles_updated_at on public.user_profiles;
create trigger set_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_host_profiles_updated_at on public.host_profiles;
create trigger set_host_profiles_updated_at
  before update on public.host_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_cleaner_profiles_updated_at on public.cleaner_profiles;
create trigger set_cleaner_profiles_updated_at
  before update on public.cleaner_profiles
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Row Level Security — every table owner-scoped to the authenticated user.
-- No public read/write. No admin policies in Sprint 1.
-- =============================================================================

alter table public.user_profiles enable row level security;
alter table public.host_profiles enable row level security;
alter table public.cleaner_profiles enable row level security;

-- user_profiles: the row id IS the auth user id.
drop policy if exists "user_profiles_select_own" on public.user_profiles;
create policy "user_profiles_select_own"
  on public.user_profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own"
  on public.user_profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own"
  on public.user_profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- host_profiles: owned via user_id.
drop policy if exists "host_profiles_select_own" on public.host_profiles;
create policy "host_profiles_select_own"
  on public.host_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "host_profiles_insert_own" on public.host_profiles;
create policy "host_profiles_insert_own"
  on public.host_profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "host_profiles_update_own" on public.host_profiles;
create policy "host_profiles_update_own"
  on public.host_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- cleaner_profiles: owned via user_id.
drop policy if exists "cleaner_profiles_select_own" on public.cleaner_profiles;
create policy "cleaner_profiles_select_own"
  on public.cleaner_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "cleaner_profiles_insert_own" on public.cleaner_profiles;
create policy "cleaner_profiles_insert_own"
  on public.cleaner_profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "cleaner_profiles_update_own" on public.cleaner_profiles;
create policy "cleaner_profiles_update_own"
  on public.cleaner_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
