# Sprint 1 — Foundation Plan

## Mission

Create a clean app foundation for a real-time STR turnover gig dispatch marketplace
(Northeast Ohio, V1 = Airbnb/STR turnover cleaning only): authentication, role
selection, profile creation, and two distinct placeholder home screens that make the
product direction obvious — Host centers on **Post Turnover**, Cleaner centers on
**Go Online**. Sprint 1 deliberately does *not* build the marketplace; it sets up the
base that Sprint 2 (property setup + turnover posting) and Sprint 3 (live gig feed +
accepting) build on.

## Tech

Expo / React Native, TypeScript, Expo Router, Supabase (auth/db/storage), React
Native `StyleSheet`. App code lives under `src/` (Expo's default; `@/*` → `src/*`).

## What was built

### Auth, routing & state
- `src/context/AuthProvider.tsx` — holds the Supabase session + a profile-completion
  snapshot; exposes `refresh()` and `signOut()`. Single source of auth state.
- `src/hooks/useAuth.ts` — context accessor.
- `src/app/_layout.tsx` — wraps the app in `AuthProvider` and runs a **centralized
  route guard** (`resolveRoute` + `useRouteGuard`) that redirects by session + role +
  profile completion. No per-screen routing logic.
- `src/app/index.tsx` — boot screen: loading spinner, or error + **retry** if the
  profile lookup fails.

### Routing rules
- No session → `(auth)/welcome`
- Session, no `user_profiles` row → `(onboarding)/role-selection`
- Role host & (incomplete **or** missing `host_profiles`) → host profile setup
- Role cleaner & (incomplete **or** missing `cleaner_profiles`) → cleaner profile setup
- Completed host → `(host)/home`; completed cleaner → `(cleaner)/home`
- Sign out → back to welcome. (Host/cleaner homes share the URL `/home` across groups —
  navigated with group-qualified hrefs `/(host)/home` and `/(cleaner)/home`.)

### Screens (`src/app`)
`(auth)`: welcome, login, signup. `(onboarding)`: role-selection,
host-profile-setup, cleaner-profile-setup. `(host)/home`, `(cleaner)/home`.

### Reusable components (`src/components`)
`AppButton`, `AppInput`, `ScreenContainer`, `RoleCard`, `StatusBadge` — typed,
presentational only.

### Data layer
- `src/lib/supabase.ts` — env-driven client (AsyncStorage session persistence, URL
  polyfill, focus-based token refresh). Throws a clear setup error if env vars are
  missing.
- `src/services/profileService.ts` — all profile reads/writes (`getUserProfile`,
  `createUserProfile`, `updateUserProfile`, `createHostProfile`,
  `createCleanerProfile`, `getProfileCompletionState`); friendly errors incl.
  duplicate detection.
- `src/types/profiles.ts` — `UserRole`, `PosterType`, `WorkerTier`,
  `VerificationStatus`, profile interfaces, inputs, `ProfileCompletionState`.

### Database
`supabase/migrations/001_sprint_1_foundation.sql` — `pgcrypto` extension; the three
profile tables with checks/defaults; shared `updated_at` trigger; `user_id` indexes;
RLS enabled with owner-scoped SELECT/INSERT/UPDATE policies (`TO authenticated`,
`auth.uid()` checks). No public access, no admin policies.

## Environment variables

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

Copy `.env.example` → `.env` and fill in from Supabase **Project Settings → API**.

## Verify

```bash
npm install
cp .env.example .env
npm run typecheck
npm run lint
npx expo start --clear
```

Apply `supabase/migrations/001_sprint_1_foundation.sql` to Supabase (SQL editor or
CLI) before testing real auth/profile flows.

## Acceptance criteria (Sprint 1)

Sign up → choose Host/Cleaner (stored in Supabase) → complete the matching profile
→ land on the correct, visually distinct home. Log out / log back in routes
correctly. Centralized Supabase client, RLS not left open, migration + profile
service + types present, no hardcoded secrets, `.env.example` present.

## Next: Sprint 2

Property setup + turnover posting: `properties` table (+ RLS), `propertyService`,
host "Add Property" flow, "Post Turnover" creation flow, and enabling the disabled
Post Turnover button on Host Home.
