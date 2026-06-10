-- =============================================================================
-- Sprint 3 — Worker feed + race-safe job acceptance
-- On Demand Jobs
--
-- 1. Adds job assignment columns (assigned_worker_user_id, accepted_at).
-- 2. Hardens worker_profiles so workers cannot self-upgrade verification/tier.
-- 3. Adds security-definer RPCs: set_worker_online_status, the worker feed,
--    worker job detail, and atomic accept_job.
-- 4. Adds assigned-worker SELECT policies on jobs + service_locations.
--
-- Idempotent and data-preserving — safe to re-run. Migrations 001/002 untouched.
-- Apply in the Supabase SQL editor (or CLI).
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Job assignment columns + indexes
-- -----------------------------------------------------------------------------
-- on delete set null: deleting a worker account must not delete the requester's job.
alter table public.jobs
  add column if not exists assigned_worker_user_id uuid references auth.users (id) on delete set null;
alter table public.jobs
  add column if not exists accepted_at timestamptz;

create index if not exists jobs_assigned_worker_user_id_idx
  on public.jobs (assigned_worker_user_id);
-- Re-stated from migration 002 (no-ops there, listed for completeness):
create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_job_type_slug_idx on public.jobs (job_type_slug);
create index if not exists jobs_deadline_at_idx on public.jobs (deadline_at);

-- -----------------------------------------------------------------------------
-- 2. Worker self-upgrade hardening
--
-- Migration 002's broad update policy let a worker UPDATE their entire own row,
-- including verification_status / worker_tier — which would defeat accept-job
-- eligibility. The app never updates worker_profiles directly, so:
--   (a) remove direct client UPDATE entirely (no replacement policy);
--   (b) trigger guard: authenticated INSERTs get forced system defaults, and
--       authenticated UPDATEs may not change verification_status / worker_tier;
--   (c) is_online changes flow only through the set_worker_online_status RPC.
-- Admin/manual SQL (dashboard editor, service role) has auth.uid() IS NULL and
-- is exempt — that is the documented Sprint 3 promotion path.
-- -----------------------------------------------------------------------------
drop policy if exists "worker_profiles_update_own" on public.worker_profiles;

create or replace function public.worker_profiles_protect_system_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- auth.uid() is null for dashboard SQL / service-role sessions (admin paths).
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      -- Clients cannot smuggle elevated values into the initial insert.
      new.verification_status := 'pending';
      new.worker_tier := 'L1';
      new.is_online := false;
    elsif tg_op = 'UPDATE' then
      if new.verification_status is distinct from old.verification_status
         or new.worker_tier is distinct from old.worker_tier then
        raise exception 'PROTECTED_FIELD';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_worker_profile_system_fields on public.worker_profiles;
create trigger protect_worker_profile_system_fields
  before insert or update on public.worker_profiles
  for each row execute function public.worker_profiles_protect_system_fields();

-- -----------------------------------------------------------------------------
-- Tier ranking helper (explicit mapping — no lexicographic tricks).
-- -----------------------------------------------------------------------------
create or replace function public.worker_tier_rank(p_tier text)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_tier when 'L1' then 1 when 'L2' then 2 when 'L3' then 3 else 0 end;
$$;

-- -----------------------------------------------------------------------------
-- 3a. set_worker_online_status — the ONLY client write path to worker_profiles.
-- -----------------------------------------------------------------------------
create or replace function public.set_worker_online_status(p_is_online boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select up.role into v_role from public.user_profiles up where up.id = v_uid;
  if v_role is distinct from 'worker' then
    raise exception 'NOT_A_WORKER';
  end if;

  update public.worker_profiles
     set is_online = p_is_online
   where user_id = v_uid;
  if not found then
    raise exception 'WORKER_PROFILE_MISSING';
  end if;

  return p_is_online;
end;
$$;

revoke execute on function public.set_worker_online_status(boolean) from public, anon;
grant execute on function public.set_worker_online_status(boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 3b. get_available_jobs_for_worker — safe-field feed of posted Cleaning jobs.
--
-- TEMPORARY Sprint 3 matching rule (not distance matching, no GPS/geocoding):
-- 3-digit ZIP prefix match between the job's service location and the worker's
-- home_base_zip. Northeast Ohio ZIPs share prefixes 440–445, so this approximates
-- "same metro area" for testing. Exact-ZIP matches are a subset of this rule.
-- Sprint 4+ replaces it with real distance matching.
--
-- Deliberately EXCLUDED before acceptance: address_line1/2, access_notes,
-- parking_notes, restock_notes, special_instructions, requester identity.
-- -----------------------------------------------------------------------------
create or replace function public.get_available_jobs_for_worker()
returns table (
  id uuid,
  job_type_slug text,
  title text,
  status text,
  payout_cents integer,
  deadline_at timestamptz,
  requested_start_at timestamptz,
  estimated_hours numeric,
  bedrooms integer,
  bathrooms numeric,
  laundry_required boolean,
  restocking_required boolean,
  trash_removal_required boolean,
  cleaning_scope text,
  city text,
  state text,
  zip_code text,
  location_type text,
  required_worker_tier text,
  is_eligible boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_worker public.worker_profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  select up.role into v_role from public.user_profiles up where up.id = v_uid;
  if v_role is distinct from 'worker' then
    raise exception 'NOT_A_WORKER';
  end if;
  select * into v_worker from public.worker_profiles wp where wp.user_id = v_uid;
  if not found then
    raise exception 'WORKER_PROFILE_MISSING';
  end if;

  return query
  select
    j.id, j.job_type_slug, j.title, j.status, j.payout_cents, j.deadline_at,
    j.requested_start_at, j.estimated_hours, j.bedrooms, j.bathrooms,
    j.laundry_required, j.restocking_required, j.trash_removal_required,
    j.cleaning_scope,
    sl.city, sl.state, sl.zip_code, sl.location_type,
    jt.required_worker_tier,
    (v_worker.verification_status = 'verified'
      and public.worker_tier_rank(v_worker.worker_tier)
          >= public.worker_tier_rank(jt.required_worker_tier)) as is_eligible,
    j.created_at
  from public.jobs j
  join public.service_locations sl on sl.id = j.service_location_id
  join public.job_types jt on jt.slug = j.job_type_slug
  where j.status = 'posted'
    and j.assigned_worker_user_id is null
    and j.category_slug = 'cleaning'
    and j.deadline_at > now()
    and left(sl.zip_code, 3) = left(coalesce(v_worker.home_base_zip, ''), 3)
  order by j.deadline_at asc;
end;
$$;

revoke execute on function public.get_available_jobs_for_worker() from public, anon;
grant execute on function public.get_available_jobs_for_worker() to authenticated;

-- -----------------------------------------------------------------------------
-- 3c. get_worker_job_detail — single-job version of the feed (same predicates,
-- same safe fields). Empty result = job taken / expired / out of match area.
-- -----------------------------------------------------------------------------
create or replace function public.get_worker_job_detail(p_job_id uuid)
returns table (
  id uuid,
  job_type_slug text,
  title text,
  status text,
  payout_cents integer,
  deadline_at timestamptz,
  requested_start_at timestamptz,
  estimated_hours numeric,
  bedrooms integer,
  bathrooms numeric,
  laundry_required boolean,
  restocking_required boolean,
  trash_removal_required boolean,
  cleaning_scope text,
  city text,
  state text,
  zip_code text,
  location_type text,
  required_worker_tier text,
  is_eligible boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_worker public.worker_profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  select up.role into v_role from public.user_profiles up where up.id = v_uid;
  if v_role is distinct from 'worker' then
    raise exception 'NOT_A_WORKER';
  end if;
  select * into v_worker from public.worker_profiles wp where wp.user_id = v_uid;
  if not found then
    raise exception 'WORKER_PROFILE_MISSING';
  end if;

  return query
  select
    j.id, j.job_type_slug, j.title, j.status, j.payout_cents, j.deadline_at,
    j.requested_start_at, j.estimated_hours, j.bedrooms, j.bathrooms,
    j.laundry_required, j.restocking_required, j.trash_removal_required,
    j.cleaning_scope,
    sl.city, sl.state, sl.zip_code, sl.location_type,
    jt.required_worker_tier,
    (v_worker.verification_status = 'verified'
      and public.worker_tier_rank(v_worker.worker_tier)
          >= public.worker_tier_rank(jt.required_worker_tier)) as is_eligible,
    j.created_at
  from public.jobs j
  join public.service_locations sl on sl.id = j.service_location_id
  join public.job_types jt on jt.slug = j.job_type_slug
  where j.id = p_job_id
    and j.status = 'posted'
    and j.assigned_worker_user_id is null
    and j.category_slug = 'cleaning'
    and j.deadline_at > now()
    and left(sl.zip_code, 3) = left(coalesce(v_worker.home_base_zip, ''), 3);
end;
$$;

revoke execute on function public.get_worker_job_detail(uuid) from public, anon;
grant execute on function public.get_worker_job_detail(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3d. accept_job — validated, ATOMIC acceptance.
--
-- The conditional UPDATE is the race guard: of two concurrent accepts, the
-- second blocks on the row lock, re-evaluates the WHERE after the first commits,
-- matches 0 rows, and gets JOB_ALREADY_TAKEN. Workers have no UPDATE policy on
-- jobs, so this RPC is the only way a worker can change a job.
-- -----------------------------------------------------------------------------
create or replace function public.accept_job(p_job_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_worker public.worker_profiles%rowtype;
  v_job public.jobs%rowtype;
  v_required_tier text;
  v_accepted_at timestamptz := now();
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select up.role into v_role from public.user_profiles up where up.id = v_uid;
  if v_role is distinct from 'worker' then
    raise exception 'NOT_A_WORKER';
  end if;

  select * into v_worker from public.worker_profiles wp where wp.user_id = v_uid;
  if not found then
    raise exception 'WORKER_PROFILE_MISSING';
  end if;
  if not v_worker.is_online then
    raise exception 'WORKER_OFFLINE';
  end if;
  if v_worker.verification_status <> 'verified' then
    raise exception 'VERIFICATION_REQUIRED';
  end if;

  select * into v_job from public.jobs j where j.id = p_job_id;
  if not found then
    raise exception 'JOB_NOT_FOUND';
  end if;
  if v_job.category_slug <> 'cleaning' then
    raise exception 'INVALID_CATEGORY';
  end if;

  select jt.required_worker_tier into v_required_tier
    from public.job_types jt
   where jt.slug = v_job.job_type_slug
     and jt.category_slug = 'cleaning'
     and jt.is_active;
  if not found then
    raise exception 'INVALID_JOB_TYPE';
  end if;
  if public.worker_tier_rank(v_worker.worker_tier)
       < public.worker_tier_rank(v_required_tier) then
    raise exception 'TIER_TOO_LOW';
  end if;

  -- Atomic claim: succeeds for exactly one worker.
  update public.jobs
     set status = 'accepted',
         assigned_worker_user_id = v_uid,
         accepted_at = v_accepted_at
   where id = p_job_id
     and status = 'posted'
     and assigned_worker_user_id is null;
  if not found then
    raise exception 'JOB_ALREADY_TAKEN';
  end if;

  return v_accepted_at;
end;
$$;

revoke execute on function public.accept_job(uuid) from public, anon;
grant execute on function public.accept_job(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Post-acceptance visibility (assigned worker only)
-- -----------------------------------------------------------------------------
drop policy if exists "jobs_select_assigned_worker" on public.jobs;
create policy "jobs_select_assigned_worker" on public.jobs
  for select to authenticated
  using (assigned_worker_user_id = auth.uid());

drop policy if exists "service_locations_select_assigned_worker" on public.service_locations;
create policy "service_locations_select_assigned_worker" on public.service_locations
  for select to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.service_location_id = service_locations.id
        and j.assigned_worker_user_id = auth.uid()
    )
  );
