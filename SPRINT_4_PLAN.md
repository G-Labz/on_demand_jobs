# Sprint 4 — Job Execution, Proof Photos, Requester Approval

## Mission

Build the full MVP execution loop:

**Worker accepts → opens job workspace → Mark En Route → Check In → Start Work →
completes the room/task Checklist → uploads required Proof Photos → Submit Proof →
Requester Reviews Proof → Approve Completion → job Completed.**

No payments, disputes, cancellation, revision flow, GPS, messaging, or ratings.

## What was built

### Status lifecycle (existing values, strict order)
`accepted → en_route → checked_in → in_progress → awaiting_approval → completed`.
Every transition is a security-definer RPC with a race-safe conditional UPDATE and a
`job_status_events` audit row. `proof_submitted` (the enum value) is intentionally unused —
submission goes straight to `awaiting_approval` with a `proof_submitted_at` timestamp.
**Check In is a worker action button — no GPS or location tracking is performed or implied.**

### Worker job workspace — `(worker)/jobs/[id]/work.tsx`
Route choice: the Sprint 3 detail file moved to `jobs/[id]/index.tsx` (pre-accept preview +
accept; assigned jobs redirect to the workspace) and the workspace is a dedicated sibling
route — one screen handling preview *and* execution would be unmaintainable.
The workspace shows: status progress strip, one next-action button per state with the spec
copy ("You accepted this job." / "You're on the way." / "You're checked in." / "Complete the
checklist and upload proof." / "Proof submitted. Waiting for requester approval." / "Job
completed."), full assignment details (address/access/parking/restock/instructions —
assigned worker only), the interactive checklist grouped by room, per-item proof photo
upload with thumbnails, and the gated **Submit Proof** button.

### Checklist
`ensure_job_checklist` copies the job type's `cleaning_checklist_templates` rows into
`job_checklist_items` exactly once per job (unique `(job_id, template_id)` +
`on conflict do nothing` — idempotent even under concurrent opens), freezing the checklist
per job. **Submission rule:** ALL checklist items must be completed (the schema has no
optional-task concept — every task is required), and every `requires_photo` item needs ≥1
proof photo. Item completion is one-way (`complete_checklist_item`), assigned-worker-only,
`in_progress`-only.

### Proof photos (private end-to-end)
- Private bucket **`job-proof-photos`** (created in migration 004). No public access.
- Path: `{job_id}/{checklist_item_id}/{worker_user_id}/{unique}.{ext}` — policies key on
  the job-id first segment; no private requester data in paths.
- Storage RLS: upload only by the **assigned worker while `in_progress`**; read only by the
  assigned worker or the **owning requester**. No update/delete (photos immutable; a bad
  photo is superseded by uploading another).
- Display is via short-lived **signed URLs** created by authenticated participants.
- Metadata rows (`job_proof_photos`) are written by the `add_job_proof_photo` RPC, which
  re-validates assignment, status, item↔job linkage, and the path prefix.
- Picking uses **`expo-image-picker`** (new dependency, SDK-pinned): file input on web
  (web-first), native pickers on iOS/Android.

### Requester review — `(requester)/jobs/[id]/review.tsx`
Job summary + submitted timestamp, checklist completion (n/total + per-task marks), proof
photo previews (signed URLs), and **Approve Completion** → `approve_job_completion`
(ownership + `awaiting_approval` validated server-side) → `completed`, `approved_at`,
`completed_at`, `approved_by_requester_user_id`. Approval is the requester's only mutation;
there is no reject/revision flow in Sprint 4 (deliberate).

### Dashboards
- **Worker:** Active Job cards for all execution statuses with a status badge + "Next:"
  action label, linking straight to the workspace. Available feed unchanged.
- **Requester:** Recent Jobs badges extended (En Route / Checked In / In Progress /
  **Awaiting Approval** with a **Review Proof ›** action / **Completed**); awaiting/completed
  cards open the review screen.

### One-active-job limit
`accept_job` was re-created (migration 004; the 003 file is untouched) with all Sprint 3
validations plus `WORKER_HAS_ACTIVE_JOB`: a worker with a job in
`accepted/en_route/checked_in/in_progress` cannot accept another. `awaiting_approval` does
not block (the work is done). Acceptance now also writes an audit event.

### Copy cleanup (bundled)
Welcome screen neutralized: kicker `LIVE LOCAL JOB DISPATCH · NE OHIO`, headline
`Get local work done in real time.`, subtext "Requesters post local jobs. Workers go online,
accept nearby work, complete the job, and get paid." No redesign.

## Database

Migration: `supabase/migrations/004_sprint_4_job_execution_proof_approval.sql`
(idempotent, data-preserving; 001–003 untouched): six execution timestamps +
`approved_by_requester_user_id` on `jobs`; `job_checklist_items`, `job_proof_photos`,
`job_status_events` with **SELECT-only participant RLS** (assigned worker + owning
requester; all writes via RPC); private storage bucket + 2 storage policies; 8 RPCs +
`accept_job` replacement — all `security definer`, pinned `search_path`, `authenticated`
execute only.

## Manual Supabase steps

1. Apply migration 004 in the SQL Editor.
2. If the `storage.objects` policy statements are rejected (hosted permission variance),
   create the two policies via Dashboard → Storage → `job-proof-photos` → Policies using
   the exact expressions from the migration file. Keep the bucket **private**.
3. Reuse the Sprint 3 `verified`/`L2` test worker; post a fresh ZIP-prefix-matched job.

## Manual test loop

Requester posts → worker (online, verified L2) accepts → workspace: Mark En Route →
Check In → Start Work → complete every checklist task → add proof photos to "Photo" tasks →
Submit Proof → requester opens **Review Proof** from the dashboard → sees checklist + photos
→ **Approve Completion** → both sides show **Completed**.
Security checks: unassigned worker sees no address/proof and cannot transition; submit is
blocked without required photos; non-owner cannot approve; public/anon cannot read the
bucket; worker still cannot self-upgrade verification/tier; Sprint 3 accept flow intact
(plus the new one-active-job rule).

## Out of scope (unchanged)

Payments/Stripe/release, disputes, cancellation/no-show, revision requests, messaging,
maps/GPS/geolocation, ratings/reviews, push/SMS, admin dashboard, background checks,
realtime subscriptions, photo deletion, categories beyond Cleaning.

## Next: Sprint 5

Payments — payout authorization at posting, escrow-style hold, release on approval
(Stripe Connect), and an auto-release timer for unreviewed proof.
