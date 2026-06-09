# Sprint 2 — Requester/Worker Refactor + Cleaning Job Posting

## Mission

Two execution blocks, in order:

1. **Naming/architecture correction** — top-level roles become **Requester** (posts paid
   jobs) and **Worker** (accepts/completes jobs). "Host" is no longer a top-level role;
   STR Host survives only as a requester *subtype*. The app is a real-time local job
   dispatch marketplace, not Airbnb-only.
2. **Requester-side Cleaning job posting foundation** — Cleaning as the first service
   category, with two first-class job types: **STR Turnover Cleaning** and **Home
   Cleaning**. Saved in Supabase.

Worker feed/accept, Go Online logic, payments, GPS, and photo proof are out of scope.

## What changed

### Naming/architecture
- `UserRole = 'requester' | 'worker'`. `RequesterType` =
  `homeowner | str_host | co_host | property_manager | small_business` (homeowner is
  first-class, listed first).
- Theme accent keys `host→requester`, `cleaner→worker`.
- Route folders `(host)→(requester)`, `(cleaner)→(worker)`; `home.tsx→dashboard.tsx`.
  Onboarding `host/cleaner-profile-setup → requester/worker-profile-setup`.
- Role cards: **"I Need Help"** (Requester) / **"I Want Gigs"** (Worker). Dashboards titled
  **Requester Dashboard** / **Worker Dashboard**; Requester centers **Post Job**, Worker
  centers **Go Online** (disabled, "Live jobs unlock in Sprint 3.").
- Centralized route guard (`src/app/_layout.tsx`) updated to requester/worker; mechanism
  (compare group segment, redirect on mismatch) preserved. Sprint 1 auth flow untouched.

### Data layer
- `src/services/errors.ts` — shared `ServiceError` + `toFriendlyError` + `isUniqueViolation`.
- `profileService` → `createRequesterProfile` / `createWorkerProfile`; completion check reads
  `requester_profiles` / `worker_profiles`.
- New `locationService` (CRUD-ish for `service_locations`) and `jobService` (cleaning jobs,
  job types, checklist templates; draft → posted).
- New types: `types/locations.ts`, `types/jobs.ts` (`jobs.cleaning_scope` for Home Cleaning).
- `lib/format.ts` — cents/dollars + local datetime display helpers.

### Screens & components
- New components: `OptionGroup`, `ToggleRow`, `DateTimeField` (quick presets + manual,
  local time, no dependency).
- Requester routes: `dashboard`, `locations` (list), `locations/new`, `locations/[id]`,
  `jobs/new` (job-type-aware), `jobs/review`. Worker `dashboard` (Go Online disabled).
- STR Turnover vs Home Cleaning are intentionally different: STR emphasizes "Guest-ready
  by" + laundry/restock/trash + checklist preview; Home emphasizes "Needed by / Preferred
  completion by" + estimated hours + **cleaning scope** + supplies.

## Database

Migration: `supabase/migrations/002_sprint_2_requester_worker_cleaning_jobs.sql`
(idempotent, data-preserving, safe to re-run; migration 001 untouched).

- **Old role values migrated:** `user_profiles.role` `host→requester`, `cleaner→worker`;
  role check constraint replaced to allow only `requester`/`worker`.
- **Profile tables renamed (not recreated) when present**, preserving data:
  `host_profiles→requester_profiles` (`poster_type→requester_type`, expanded check),
  `cleaner_profiles→worker_profiles` (all worker fields preserved). On a fresh DB where
  neither old nor new table exists, the new tables are created instead. Old host/cleaner
  RLS policies dropped; requester/worker owner policies created (no conflicts).
- **New tables:** `service_locations`, `service_categories` (seed: cleaning),
  `job_types` (seed: str_turnover, home_cleaning · L2), `jobs` (+ nullable
  `cleaning_scope`), `cleaning_checklist_templates` (seeded per job type). Triggers,
  indexes, and RLS per spec. `service_locations`/`jobs` are owner-scoped with **no worker
  read** (Sprint 3 adds those). Catalog tables are read-only to authenticated users.

## Manual Supabase step (required)

Apply `002_…sql` in the Supabase SQL Editor (or CLI) before testing. On a Sprint 1
database it migrates existing data in place; on a fresh database run 001 then 002.

## Verification

- `npm run typecheck` — pass
- `npm run lint` — pass
- `npx expo export --platform web` — all 28 routes static-rendered (no broken routes,
  web/server-render safe, no `window is not defined`)
- `npx expo start --clear` — boots clean (no errors); also regenerates typed routes

## Manual test flow

**Requester:** sign up/login → "I Need Help" → Requester Profile → Requester Dashboard →
Add Location → Post Cleaning Job → choose STR Turnover or Home Cleaning → Review → Post →
job appears in the dashboard's Active Jobs count.

**Worker:** sign up/login → "I Want Gigs" → Worker Profile → Worker Dashboard with **Go
Online** visible but disabled.

## Next: Sprint 3

Worker-side: add worker RLS read policies on `jobs`, build the nearby gig feed + accept
flow, and wire real **Go Online** state (`worker_profiles.is_online`).
