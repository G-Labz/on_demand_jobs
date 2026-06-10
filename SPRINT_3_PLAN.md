# Sprint 3 — Worker Live Job Loop (Feed + Accept)

## Mission

Make the marketplace feel alive on the Worker side, disciplined and lean:

**Worker goes online → sees eligible posted Cleaning jobs → opens job detail → accepts
(race-safe) → requester sees the job flip to Accepted.**

Plus one cleanup block: stale Host/Cleaner landing copy updated to Requester/Worker +
Cleaning language. No GPS, maps, payments, proof, messaging, or completion flow.

## What was built

### Worker Go Online (real state)
- `worker_profiles.is_online` is read on the Worker Dashboard and toggled through the
  `set_worker_online_status(p_is_online)` RPC — the **only** client write path to
  `worker_profiles` (it updates `is_online` and nothing else).
- Offline → "Go online to see available cleaning jobs." Online → the Available Jobs feed.
- Status is always visible: Online/Offline dot, Verified / Verification Pending badge,
  Worker Tier badge. Online does **not** mean GPS tracking — no location is collected.

### Worker feed + matching rule (TEMPORARY, documented)
- `get_available_jobs_for_worker()` (security definer RPC) returns posted, unassigned,
  unexpired Cleaning jobs where the service location ZIP shares its **first 3 digits** with
  the worker's `home_base_zip` (NE Ohio prefixes 440–445), ordered by deadline.
- This is ZIP-area test matching, **not** distance matching; Sprint 4+ replaces it.
- Safe preview fields only: id, type, title, status, payout, deadline, requested start,
  estimated hours, beds/baths, laundry/restock/trash flags, cleaning scope (Home Cleaning),
  city/state/zip, location type, required tier, computed `is_eligible`, created_at.
- **Never exposed pre-acceptance:** street address, access/parking/restock notes,
  special instructions, requester identity.

### Job detail + accept (race-condition safe)
- `(worker)/jobs/[id]` shows the safe preview + checklist preview + eligibility state.
- `accept_job(p_job_id)` RPC validates: authenticated → role `worker` → worker profile
  exists → `is_online` → `verification_status='verified'` → tier ≥ required (explicit
  L1/L2/L3 rank map) → job exists, `cleaning` category, active cleaning job type — then
  claims atomically:
  `update jobs set status='accepted', assigned_worker_user_id=auth.uid(), accepted_at=now()
   where id=$1 and status='posted' and assigned_worker_user_id is null;`
  Exactly one concurrent worker wins; the loser gets `JOB_ALREADY_TAKEN` (clear UI error).
- Workers have **no UPDATE policy on `jobs`** — the RPC is the only path; hand-editing
  status from the client is impossible.
- After acceptance, the assigned worker (only) sees assignment details — full address,
  access/parking/restock notes, special instructions — via two scoped RLS policies
  (`jobs` and `service_locations` SELECT where `assigned_worker_user_id = auth.uid()`).

### Worker self-upgrade hardening (security fix)
Migration 002's broad own-row UPDATE policy would have let a worker set their own
`verification_status`/`worker_tier`. Closed with three layers:
1. `worker_profiles_update_own` policy **dropped** (not replaced) — no direct client updates.
2. `before insert or update` trigger: authenticated INSERTs are forced to
   `pending`/`L1`/offline; authenticated UPDATEs changing verification/tier raise
   `PROTECTED_FIELD`. Admin SQL (no user JWT → `auth.uid() is null`) is exempt.
3. The `set_worker_online_status` RPC touches only `is_online`; `accept_job` independently
   re-validates verification + tier at accept time.

### Eligibility behavior
- Both Cleaning job types require **L2**. Pending/L1 workers still **see** matched jobs with
  locked messaging ("Accepting jobs unlocks after verification." / "This job requires Worker
  Tier L2.") — nothing silently hidden — and the server hard-blocks their accepts.
- Promote a test worker (Supabase SQL Editor):
  `update public.worker_profiles set verification_status='verified', worker_tier='L2' where user_id='<uuid>';`
  Allowed values are `pending`/`verified`/`rejected` (**`approved` is not legal** — the
  Sprint 3 spec's `approved` maps to the schema's `verified`).

### Requester visibility
- Requester Dashboard gains a **Recent Jobs** section (latest 5) with status badges —
  Draft / Posted / **Accepted** (green) — using existing owner-scoped reads. No new RLS.

### Landing copy cleanup
- Welcome: "LIVE JOB DISPATCH · NE OHIO" / "Cleaning jobs handled in real time." /
  "Requesters post cleaning jobs — STR turnovers and home cleanings. Workers go online…"
- Login/Signup subtitles de-Host/Cleaner-ified. No redesign.

## Database

Migration: `supabase/migrations/003_sprint_3_worker_feed_acceptance.sql` (idempotent,
data-preserving; 001/002 untouched): assignment columns + index, the hardening trigger +
policy drop, `worker_tier_rank` helper, 4 RPCs (`set_worker_online_status`,
`get_available_jobs_for_worker`, `get_worker_job_detail`, `accept_job` — all
`security definer`, `search_path` pinned, execute granted to `authenticated` only), and the
two assigned-worker SELECT policies.

## Manual Supabase steps

1. Apply migration 003 in the SQL Editor.
2. Promote test worker(s) to `verified`/`L2` (SQL above).
3. Ensure the test job's location ZIP and worker `home_base_zip` share the first 3 digits.

## Manual test loop

Requester: sign in → add location (if needed) → post a Cleaning job → status **Posted**.
Worker: sign in → (promote via SQL if needed) → dashboard loads → **Go Online** → job
appears under Available Jobs → open detail (no street address shown) → **Accept Job** →
assignment details revealed → job leaves the available feed.
Requester: dashboard Recent Jobs shows the job as **Accepted**.
Security spot-checks: unverified/L1 worker is blocked from accepting (locked UI + server
error); direct client update of `verification_status`/`worker_tier` is rejected; only the
assigned worker can read the address.

## Out of scope (unchanged)

GPS/maps/geocoding, check-in, photo proof upload, completion/approval, payments/Stripe,
messaging, ratings, disputes, admin dashboard, background checks, push/SMS, calendar,
recurring jobs, AI, categories beyond Cleaning.

## Next: Sprint 4

Job execution flow: worker en-route/check-in states, room-by-room checklist completion with
photo proof upload, and requester review/approval — building on
`cleaning_checklist_templates` and the `JobStatus` lifecycle already in the schema.
