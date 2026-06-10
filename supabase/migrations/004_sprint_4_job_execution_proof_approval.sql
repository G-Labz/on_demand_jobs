-- =============================================================================
-- Sprint 4 — Job execution, proof photos, requester approval
-- On Demand Jobs
--
-- 1. Job execution timestamp columns + approver.
-- 2. job_checklist_items / job_proof_photos / job_status_events tables
--    (SELECT-only RLS for the assigned worker + owning requester; ALL writes
--    go through security-definer RPCs — no direct client writes).
-- 3. Private storage bucket `job-proof-photos` + scoped storage policies.
-- 4. Status-transition RPCs (strictly ordered, race-safe conditional UPDATEs):
--    ensure_job_checklist, set_job_en_route, check_in_job, start_job_work,
--    complete_checklist_item, add_job_proof_photo, submit_job_proof,
--    approve_job_completion.
-- 5. accept_job re-created with a one-active-job limit (Sprint 3 validations
--    preserved; migration 003 file untouched).
--
-- Idempotent and data-preserving — safe to re-run. Apply in the SQL editor.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Job execution columns
-- -----------------------------------------------------------------------------
alter table public.jobs add column if not exists en_route_at timestamptz;
alter table public.jobs add column if not exists checked_in_at timestamptz;
alter table public.jobs add column if not exists started_at timestamptz;
alter table public.jobs add column if not exists proof_submitted_at timestamptz;
alter table public.jobs add column if not exists approved_at timestamptz;
alter table public.jobs add column if not exists completed_at timestamptz;
alter table public.jobs add column if not exists approved_by_requester_user_id uuid
  references auth.users (id) on delete set null;

-- -----------------------------------------------------------------------------
-- 2. Checklist instance, proof photos, status events
-- -----------------------------------------------------------------------------
create table if not exists public.job_checklist_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  template_id uuid references public.cleaning_checklist_templates (id),
  room_name text not null,
  task_label text not null,
  requires_photo boolean not null default false,
  sort_order integer not null,
  completed_at timestamptz,
  completed_by_worker_user_id uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists job_checklist_items_job_id_idx
  on public.job_checklist_items (job_id);
-- Makes checklist generation idempotent even under concurrent opens.
create unique index if not exists job_checklist_items_job_template_uniq
  on public.job_checklist_items (job_id, template_id);

create table if not exists public.job_proof_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  checklist_item_id uuid references public.job_checklist_items (id) on delete set null,
  uploaded_by_worker_user_id uuid not null references auth.users (id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists job_proof_photos_job_id_idx
  on public.job_proof_photos (job_id);

create table if not exists public.job_status_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  actor_user_id uuid references auth.users (id),
  from_status text,
  to_status text not null,
  event_label text not null,
  created_at timestamptz not null default now()
);

create index if not exists job_status_events_job_id_idx
  on public.job_status_events (job_id);

-- RLS: participants (assigned worker / owning requester) can SELECT.
-- No INSERT/UPDATE/DELETE policies — writes happen only inside the RPCs below.
alter table public.job_checklist_items enable row level security;
alter table public.job_proof_photos enable row level security;
alter table public.job_status_events enable row level security;

drop policy if exists "job_checklist_items_select_participants" on public.job_checklist_items;
create policy "job_checklist_items_select_participants" on public.job_checklist_items
  for select to authenticated
  using (exists (
    select 1 from public.jobs j
    where j.id = job_checklist_items.job_id
      and (j.assigned_worker_user_id = auth.uid() or j.requester_user_id = auth.uid())
  ));

drop policy if exists "job_proof_photos_select_participants" on public.job_proof_photos;
create policy "job_proof_photos_select_participants" on public.job_proof_photos
  for select to authenticated
  using (exists (
    select 1 from public.jobs j
    where j.id = job_proof_photos.job_id
      and (j.assigned_worker_user_id = auth.uid() or j.requester_user_id = auth.uid())
  ));

drop policy if exists "job_status_events_select_participants" on public.job_status_events;
create policy "job_status_events_select_participants" on public.job_status_events
  for select to authenticated
  using (exists (
    select 1 from public.jobs j
    where j.id = job_status_events.job_id
      and (j.assigned_worker_user_id = auth.uid() or j.requester_user_id = auth.uid())
  ));

-- -----------------------------------------------------------------------------
-- 3. Private proof-photo bucket + storage policies
--
-- Paths are `{job_id}/{checklist_item_id}/{worker_user_id}/{file}` — the first
-- segment is the job id, which every policy keys on. No public access; viewing
-- is via signed URLs created by authenticated participants only.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('job-proof-photos', 'job-proof-photos', false)
on conflict (id) do nothing;

drop policy if exists "job_proof_photos_upload_assigned_worker" on storage.objects;
create policy "job_proof_photos_upload_assigned_worker" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'job-proof-photos'
    and exists (
      select 1 from public.jobs j
      where j.id::text = (storage.foldername(name))[1]
        and j.assigned_worker_user_id = auth.uid()
        and j.status = 'in_progress'
    )
  );

drop policy if exists "job_proof_photos_read_participants" on storage.objects;
create policy "job_proof_photos_read_participants" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'job-proof-photos'
    and exists (
      select 1 from public.jobs j
      where j.id::text = (storage.foldername(name))[1]
        and (j.assigned_worker_user_id = auth.uid() or j.requester_user_id = auth.uid())
    )
  );
-- No UPDATE/DELETE policies: proof photos are immutable in Sprint 4.

-- -----------------------------------------------------------------------------
-- 4a. ensure_job_checklist — generate the per-job checklist from templates.
-- Idempotent: unique (job_id, template_id) + on conflict do nothing.
-- -----------------------------------------------------------------------------
create or replace function public.ensure_job_checklist(p_job_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.jobs%rowtype;
  v_count integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_job from public.jobs j where j.id = p_job_id;
  if not found then raise exception 'JOB_NOT_FOUND'; end if;
  if v_job.assigned_worker_user_id is distinct from v_uid then
    raise exception 'NOT_ASSIGNED_WORKER';
  end if;
  if v_job.status not in ('accepted', 'en_route', 'checked_in', 'in_progress') then
    raise exception 'INVALID_STATUS';
  end if;

  insert into public.job_checklist_items
    (job_id, template_id, room_name, task_label, requires_photo, sort_order)
  select p_job_id, t.id, t.room_name, t.task_label, t.requires_photo, t.sort_order
  from public.cleaning_checklist_templates t
  where t.job_type_slug = v_job.job_type_slug
  on conflict (job_id, template_id) do nothing;

  select count(*) into v_count from public.job_checklist_items i where i.job_id = p_job_id;
  return v_count;
end;
$$;

revoke execute on function public.ensure_job_checklist(uuid) from public, anon;
grant execute on function public.ensure_job_checklist(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4b. Worker status transitions (strict order, race-safe).
-- -----------------------------------------------------------------------------
create or replace function public.set_job_en_route(p_job_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.jobs%rowtype;
  v_now timestamptz := now();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_job from public.jobs j where j.id = p_job_id;
  if not found then raise exception 'JOB_NOT_FOUND'; end if;
  if v_job.assigned_worker_user_id is distinct from v_uid then
    raise exception 'NOT_ASSIGNED_WORKER';
  end if;

  update public.jobs
     set status = 'en_route', en_route_at = v_now
   where id = p_job_id and status = 'accepted' and assigned_worker_user_id = v_uid;
  if not found then raise exception 'INVALID_STATUS'; end if;

  insert into public.job_status_events (job_id, actor_user_id, from_status, to_status, event_label)
  values (p_job_id, v_uid, 'accepted', 'en_route', 'Worker marked En Route');
  return v_now;
end;
$$;

revoke execute on function public.set_job_en_route(uuid) from public, anon;
grant execute on function public.set_job_en_route(uuid) to authenticated;

-- Check In is a worker action button in Sprint 4 — no GPS/location verification.
create or replace function public.check_in_job(p_job_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.jobs%rowtype;
  v_now timestamptz := now();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_job from public.jobs j where j.id = p_job_id;
  if not found then raise exception 'JOB_NOT_FOUND'; end if;
  if v_job.assigned_worker_user_id is distinct from v_uid then
    raise exception 'NOT_ASSIGNED_WORKER';
  end if;

  update public.jobs
     set status = 'checked_in', checked_in_at = v_now
   where id = p_job_id and status = 'en_route' and assigned_worker_user_id = v_uid;
  if not found then raise exception 'INVALID_STATUS'; end if;

  insert into public.job_status_events (job_id, actor_user_id, from_status, to_status, event_label)
  values (p_job_id, v_uid, 'en_route', 'checked_in', 'Worker checked in');
  return v_now;
end;
$$;

revoke execute on function public.check_in_job(uuid) from public, anon;
grant execute on function public.check_in_job(uuid) to authenticated;

create or replace function public.start_job_work(p_job_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.jobs%rowtype;
  v_now timestamptz := now();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_job from public.jobs j where j.id = p_job_id;
  if not found then raise exception 'JOB_NOT_FOUND'; end if;
  if v_job.assigned_worker_user_id is distinct from v_uid then
    raise exception 'NOT_ASSIGNED_WORKER';
  end if;

  update public.jobs
     set status = 'in_progress', started_at = v_now
   where id = p_job_id and status = 'checked_in' and assigned_worker_user_id = v_uid;
  if not found then raise exception 'INVALID_STATUS'; end if;

  -- Make sure the checklist exists once work begins.
  insert into public.job_checklist_items
    (job_id, template_id, room_name, task_label, requires_photo, sort_order)
  select p_job_id, t.id, t.room_name, t.task_label, t.requires_photo, t.sort_order
  from public.cleaning_checklist_templates t
  where t.job_type_slug = v_job.job_type_slug
  on conflict (job_id, template_id) do nothing;

  insert into public.job_status_events (job_id, actor_user_id, from_status, to_status, event_label)
  values (p_job_id, v_uid, 'checked_in', 'in_progress', 'Worker started work');
  return v_now;
end;
$$;

revoke execute on function public.start_job_work(uuid) from public, anon;
grant execute on function public.start_job_work(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4c. complete_checklist_item — one-way completion by the assigned worker.
-- -----------------------------------------------------------------------------
create or replace function public.complete_checklist_item(p_item_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.job_checklist_items%rowtype;
  v_job public.jobs%rowtype;
  v_now timestamptz := now();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_item from public.job_checklist_items i where i.id = p_item_id;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;

  select * into v_job from public.jobs j where j.id = v_item.job_id;
  if not found then raise exception 'JOB_NOT_FOUND'; end if;
  if v_job.assigned_worker_user_id is distinct from v_uid then
    raise exception 'NOT_ASSIGNED_WORKER';
  end if;
  if v_job.status <> 'in_progress' then
    raise exception 'INVALID_STATUS';
  end if;

  update public.job_checklist_items
     set completed_at = v_now, completed_by_worker_user_id = v_uid
   where id = p_item_id and completed_at is null;
  if not found then raise exception 'ITEM_ALREADY_COMPLETED'; end if;

  return v_now;
end;
$$;

revoke execute on function public.complete_checklist_item(uuid) from public, anon;
grant execute on function public.complete_checklist_item(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4d. add_job_proof_photo — metadata row for an uploaded proof photo.
-- Storage RLS already restricts the actual upload; this validates the linkage.
-- -----------------------------------------------------------------------------
create or replace function public.add_job_proof_photo(
  p_job_id uuid,
  p_checklist_item_id uuid,
  p_storage_path text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.jobs%rowtype;
  v_photo_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_job from public.jobs j where j.id = p_job_id;
  if not found then raise exception 'JOB_NOT_FOUND'; end if;
  if v_job.assigned_worker_user_id is distinct from v_uid then
    raise exception 'NOT_ASSIGNED_WORKER';
  end if;
  if v_job.status <> 'in_progress' then
    raise exception 'INVALID_STATUS';
  end if;

  if p_checklist_item_id is not null and not exists (
    select 1 from public.job_checklist_items i
    where i.id = p_checklist_item_id and i.job_id = p_job_id
  ) then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  -- Path must live under this job's folder (matches the storage policies).
  if p_storage_path not like (p_job_id::text || '/%') then
    raise exception 'INVALID_STORAGE_PATH';
  end if;

  insert into public.job_proof_photos
    (job_id, checklist_item_id, uploaded_by_worker_user_id, storage_bucket, storage_path)
  values
    (p_job_id, p_checklist_item_id, v_uid, 'job-proof-photos', p_storage_path)
  returning id into v_photo_id;

  return v_photo_id;
end;
$$;

revoke execute on function public.add_job_proof_photo(uuid, uuid, text) from public, anon;
grant execute on function public.add_job_proof_photo(uuid, uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4e. submit_job_proof — all checklist items complete + every requires_photo
-- item has at least one proof photo. in_progress → awaiting_approval.
-- (The schema has no optional-task concept: every checklist item is required.)
-- -----------------------------------------------------------------------------
create or replace function public.submit_job_proof(p_job_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.jobs%rowtype;
  v_total integer;
  v_incomplete integer;
  v_missing_photos integer;
  v_now timestamptz := now();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_job from public.jobs j where j.id = p_job_id;
  if not found then raise exception 'JOB_NOT_FOUND'; end if;
  if v_job.assigned_worker_user_id is distinct from v_uid then
    raise exception 'NOT_ASSIGNED_WORKER';
  end if;
  if v_job.status <> 'in_progress' then
    raise exception 'INVALID_STATUS';
  end if;

  select count(*) into v_total
    from public.job_checklist_items i where i.job_id = p_job_id;
  if v_total = 0 then raise exception 'CHECKLIST_EMPTY'; end if;

  select count(*) into v_incomplete
    from public.job_checklist_items i
   where i.job_id = p_job_id and i.completed_at is null;
  if v_incomplete > 0 then raise exception 'CHECKLIST_INCOMPLETE'; end if;

  select count(*) into v_missing_photos
    from public.job_checklist_items i
   where i.job_id = p_job_id
     and i.requires_photo
     and not exists (
       select 1 from public.job_proof_photos p
       where p.checklist_item_id = i.id
     );
  if v_missing_photos > 0 then raise exception 'PROOF_PHOTO_MISSING'; end if;

  update public.jobs
     set status = 'awaiting_approval', proof_submitted_at = v_now
   where id = p_job_id and status = 'in_progress' and assigned_worker_user_id = v_uid;
  if not found then raise exception 'INVALID_STATUS'; end if;

  insert into public.job_status_events (job_id, actor_user_id, from_status, to_status, event_label)
  values (p_job_id, v_uid, 'in_progress', 'awaiting_approval', 'Worker submitted proof');
  return v_now;
end;
$$;

revoke execute on function public.submit_job_proof(uuid) from public, anon;
grant execute on function public.submit_job_proof(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4f. approve_job_completion — requester-owned approval. awaiting_approval →
-- completed. No payment release in Sprint 4.
-- -----------------------------------------------------------------------------
create or replace function public.approve_job_completion(p_job_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_job public.jobs%rowtype;
  v_now timestamptz := now();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select up.role into v_role from public.user_profiles up where up.id = v_uid;
  if v_role is distinct from 'requester' then raise exception 'NOT_A_REQUESTER'; end if;

  select * into v_job from public.jobs j where j.id = p_job_id;
  if not found then raise exception 'JOB_NOT_FOUND'; end if;
  if v_job.requester_user_id is distinct from v_uid then
    raise exception 'NOT_JOB_OWNER';
  end if;

  update public.jobs
     set status = 'completed',
         approved_at = v_now,
         completed_at = v_now,
         approved_by_requester_user_id = v_uid
   where id = p_job_id and status = 'awaiting_approval' and requester_user_id = v_uid;
  if not found then raise exception 'INVALID_STATUS'; end if;

  insert into public.job_status_events (job_id, actor_user_id, from_status, to_status, event_label)
  values (p_job_id, v_uid, 'awaiting_approval', 'completed', 'Requester approved completion');
  return v_now;
end;
$$;

revoke execute on function public.approve_job_completion(uuid) from public, anon;
grant execute on function public.approve_job_completion(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. accept_job — re-created with a one-active-job limit. All Sprint 3
-- validations and the atomic conditional-UPDATE race guard are preserved.
-- (`awaiting_approval` does NOT block accepting — that work is already done.)
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

  -- Sprint 4: one active job at a time.
  if exists (
    select 1 from public.jobs aj
    where aj.assigned_worker_user_id = v_uid
      and aj.status in ('accepted', 'en_route', 'checked_in', 'in_progress')
  ) then
    raise exception 'WORKER_HAS_ACTIVE_JOB';
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

  insert into public.job_status_events (job_id, actor_user_id, from_status, to_status, event_label)
  values (p_job_id, v_uid, 'posted', 'accepted', 'Worker accepted job');

  return v_accepted_at;
end;
$$;

revoke execute on function public.accept_job(uuid) from public, anon;
grant execute on function public.accept_job(uuid) to authenticated;
