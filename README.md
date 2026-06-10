# On Demand Jobs

An app-first MVP for a **real-time local job dispatch marketplace** in Northeast Ohio.

- **Requesters** ("I Need Help") post paid jobs and manage service locations.
- **Workers** ("I Want Gigs") go online, accept nearby jobs, complete proof-based
  checklists, and get paid.

The first labor category is **Cleaning**, with two first-class job types:
**STR Turnover Cleaning** and **Home Cleaning**. (Requesters include homeowners, STR
hosts, co-hosts, property managers, and small businesses — the app is not Airbnb-only.)

This repo currently contains:

- **Sprint 1** — foundation: auth, role selection, profile setup, role dashboards.
- **Sprint 2** — Requester/Worker architecture + the Requester-side Cleaning job posting
  foundation (service locations, cleaning jobs, checklist templates), saved in Supabase.
- **Sprint 3** — the Worker live job loop: real Go Online state, an Available Jobs feed of
  posted Cleaning jobs (safe preview fields only), job detail, and race-safe acceptance via
  a Supabase RPC. Requesters see jobs flip to **Accepted**.

Payments, GPS check-in, photo proof, messaging, and the completion flow are built in later
sprints.

## Tech stack

- Expo / React Native + TypeScript
- Expo Router (file-based routing, under `src/app`)
- Supabase (auth, database, storage)
- React Native `StyleSheet` (shared tokens in `src/constants/theme.ts`)

## Setup

```bash
cd "$HOME/Documents/on_demand_jobs"
npm install
cp .env.example .env
npm run typecheck
npm run lint
npx expo start --clear
```

Then fill in `.env` with your Supabase credentials:

```
EXPO_PUBLIC_SUPABASE_URL=<your project URL>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your anon public key>
```

Both values are in the Supabase dashboard under **Project Settings → API**. The app
throws a clear setup error at startup if either variable is missing. (`.env` is
git-ignored; only `.env.example` is committed.)

## Apply the database migrations (required)

Apply the migrations to your Supabase project (SQL Editor or CLI) in order:

```
supabase/migrations/001_sprint_1_foundation.sql
supabase/migrations/002_sprint_2_requester_worker_cleaning_jobs.sql
supabase/migrations/003_sprint_3_worker_feed_acceptance.sql
```

- **001** creates `user_profiles` + the role profile tables with triggers, indexes, RLS.
- **002** refactors roles/profiles to **requester/worker** (renames host→requester,
  cleaner→worker — data-preserving and idempotent) and adds the Cleaning schema:
  `service_locations`, `service_categories`, `job_types`, `jobs`,
  `cleaning_checklist_templates` (with seeds, triggers, indexes, owner-scoped RLS).
- **003** adds job assignment (`assigned_worker_user_id`, `accepted_at`), the worker feed /
  job detail / atomic `accept_job` / `set_worker_online_status` RPCs, assigned-worker RLS,
  and hardens `worker_profiles` so workers cannot self-change `verification_status` or
  `worker_tier` from the app.

All migrations are idempotent — safe to re-run.

### Worker testing setup (Sprint 3)

New workers start as `verification_status='pending'`, `worker_tier='L1'` and cannot accept
jobs (current Cleaning job types require **L2**). To promote a test worker, run in the
Supabase **SQL Editor**:

```sql
update public.worker_profiles
   set verification_status = 'verified', worker_tier = 'L2'
 where user_id = '<auth user uuid>';
```

(The allowed values are `pending` / `verified` / `rejected` — `approved` is not a legal
value. The SQL editor works because the protected-fields trigger only restricts
authenticated app sessions; admin SQL runs without a user JWT.)

**Sprint 3 matching rule (temporary):** a worker sees posted Cleaning jobs whose service
location ZIP shares its **first 3 digits** with the worker's `home_base_zip` (Northeast Ohio
prefixes 440–445). This is ZIP-area matching for testing — not GPS/distance matching, which
arrives in a later sprint. Make sure your test job's location ZIP and the worker's home base
ZIP share a prefix (e.g. 44303 and 44313).

## Auth & email confirmation

Signup is handled gracefully either way:

- **Email confirmation disabled** → signup creates an immediate session and routes to
  Role Selection.
- **Email confirmation enabled** → signup shows a "check your email to confirm, then log
  in" message; the user logs in after confirming.

## Project structure

```
src/
  app/                     # Expo Router routes
    _layout.tsx            # AuthProvider + centralized route guard
    index.tsx              # boot / loading / retry screen
    (auth)/                # welcome, login, signup
    (onboarding)/          # role-selection, requester/worker profile setup
    (requester)/           # dashboard (+ Recent Jobs), locations (list/new/[id]), jobs (new/review)
    (worker)/              # dashboard (Go Online + Available Jobs), jobs/[id] (detail + accept)
  components/              # AppButton, AppInput, ScreenContainer, RoleCard, StatusBadge,
                           # OptionGroup, ToggleRow, DateTimeField
  constants/theme.ts       # colors, spacing, radius, typography
  context/AuthProvider.tsx # session + profile state
  hooks/useAuth.ts
  lib/supabase.ts          # Supabase client (env-driven, web/native/server-safe)
  lib/format.ts            # currency + datetime display helpers
  services/                # errors, profileService, locationService, jobService,
                           # workerService, workerJobService
  types/                   # profiles, locations, jobs, worker-jobs
supabase/migrations/       # 001_…sql, 002_…sql, 003_…sql
```

## Available scripts

- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — `expo lint`
- `npm run build:web` — `expo export --platform web` (static web build into `dist/`)
- `npm run build` — alias of `build:web` (used by Vercel)
- `npx expo start --clear` — start the dev server (Metro). Also regenerates typed routes.

> Note: `expo export` does not rewrite `.expo/types/router.d.ts`; run `expo start` once
> after adding/renaming routes so `npm run typecheck` sees the new typed-route hrefs.

## Deploy to Vercel

The web app deploys to Vercel from GitHub. The production deployment builds from the
`main` branch.

- **GitHub repo:** `https://github.com/G-Labz/on_demand_jobs.git`
- **Vercel project:** `on-demand-jobs`

### Vercel dashboard settings

| Setting | Value |
| --- | --- |
| Framework Preset | Other |
| Install Command | `npm install` |
| Build Command | `npm run build:web` |
| Output Directory | `dist` |
| Production Branch | `main` |

These are also encoded in `vercel.json` at the repo root.

> Static export: `expo.web.output` is `"static"`, so the build generates one HTML file per
> route (e.g. `/welcome`, `/dashboard`, `/locations/new`). No SPA catch-all rewrite is used
> or needed — adding one would break per-route HTML/deep links.

### Required Vercel environment variables

Add these in **Vercel → Project → Settings → Environment Variables**:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Guidance:

- Add them to **Production** and **Preview** (and **Development** if offered — select all
  environments).
- Use the Supabase **publishable / anon** key only. **Never** put the Supabase
  **secret / service role** key in Vercel frontend env vars.
- `EXPO_PUBLIC_*` values are **baked into the web build at build time**. After adding or
  changing them in Vercel, you must **redeploy** for the change to take effect. If the first
  deploy ran before the env vars were set, redeploy after adding them.
- Do not commit `.env` (it is git-ignored; only `.env.example` is committed).

### Database

- Supabase migrations **001** and **002** must be applied before live auth / profile / job
  posting flows work.
- Migration **002** has already been applied manually to the current Supabase project.

### Supabase Auth — after you have the Vercel production URL

Once Vercel assigns a production URL (e.g. `https://on-demand-jobs.vercel.app`), add it in
**Supabase → Authentication → URL Configuration**:

- **Site URL** → the Vercel production URL
- **Redirect URLs / Additional Redirect URLs** → the Vercel production URL (and any custom
  domain)

This is required for auth redirects, email confirmation links, password reset links, and
OAuth flows to work on the deployed site.

### Deployment flow

1. Set the Vercel env vars above (Production + Preview).
2. Commit to `main` and push to GitHub.
3. Vercel builds and deploys from the connected GitHub repo.
4. If the first deployment was triggered before env vars were set, **redeploy** after adding
   them (env vars are baked into the build).
5. The Production Deployment appears in Vercel after a successful build.

## Next: Sprint 4

Job execution flow: worker en-route/check-in states, room-by-room checklist completion with
photo proof upload, and requester review/approval — building on the checklist templates and
the job status lifecycle already in the schema.
