# OZRentaplane Performance Batch 1 Report

Date: 2026-07-28

Scope: Batch 1 only. No infrastructure-region changes, migrations, middleware changes, streaming, persistent caching, RLS changes, booking logic, checkout logic, pricing, payment, invoice, document, clearance, revalidation, or email behaviour changes were made.

Confirmed infrastructure from task input:

- Vercel Function Region: `syd1`
- Supabase Project Region: `ap-southeast-2`
- Co-location: confirmed by supplied production infrastructure evidence.

## Files Changed

| File | Change |
| --- | --- |
| `lib/supabase/server.ts` | Added request-scoped `getCachedUser()` and `getCachedProfile()` helpers using React `cache()`. |
| `app/admin/layout.tsx` | Reused cached auth/profile helper. |
| `app/admin/page.tsx` | Reused cached auth/profile helper. |
| `app/dashboard/layout.tsx` | Reused cached auth/profile helper and parallelized profile plus block-time count after auth. |
| `app/dashboard/page.tsx` | Reused cached auth/profile helper. |

## Helper Implementation

`lib/supabase/server.ts` now exports:

- `getCachedUser()`: request-scoped cached wrapper around `supabase.auth.getUser()`.
- `getCachedProfile(userId, scope)`: request-scoped cached profile lookup.

Profile scopes:

- `admin`: `role, full_name`
- `dashboard`: explicit shared dashboard superset: `id, full_name, first_name, email, role, account_status, account_lock_reason, pilot_clearance_status, has_night_vfr_rating, last_flight_date, last_login_at, login_count, must_change_password`

The helper uses React `cache()` only. It does not use `unstable_cache`, global memory caching, persistent storage, migrations, or service-role reads. It creates the normal Supabase SSR client, so cookie handling and RLS remain unchanged.

## Call Sites Updated

| Route | Previous | Current |
| --- | --- | --- |
| `/admin/layout` | Direct `supabase.auth.getUser()` and direct `profiles` read | `getCachedUser()` and `getCachedProfile(user.id, 'admin')` |
| `/admin` | Direct `supabase.auth.getUser()` and direct `profiles` read | `getCachedUser()` and `getCachedProfile(user.id, 'admin')` |
| `/dashboard/layout` | Direct auth, then sequential profile, then block-time count | `getCachedUser()`, then profile and block-time count in one `Promise.all` group |
| `/dashboard` | Direct `supabase.auth.getUser()` and direct `profiles` read | `getCachedUser()` and `getCachedProfile(user.id, 'dashboard')` |

## Profile Reads

| Request/render tree | Before | After | Evidence |
| --- | ---: | ---: | --- |
| Admin layout + `/admin` page | 2 profile queries | 1 cached profile query | Both call `getCachedProfile(user.id, 'admin')`; helper logs `profile_query_admin` only when the cache loader actually runs. |
| Dashboard layout + `/dashboard` page | 2 profile queries | 1 cached profile query | Both call `getCachedProfile(user.id, 'dashboard')`; helper logs `profile_query_dashboard` only when the cache loader actually runs. |

## Timing Table

Authenticated before/after timing medians were not captured locally because no admin/customer test-session cookies or test credentials were available in this environment. The local production server was started with `PERF_LOG=1`, but unauthenticated `/dashboard` and `/admin` requests correctly redirected to `/login` before profile/dashboard phases could run.

| Workflow | Before Median | After Median | Difference | Percentage |
| --- | ---: | ---: | ---: | ---: |
| Customer layout total | Not measured | Not measured | N/A | N/A |
| Customer page total | Not measured | Not measured | N/A | N/A |
| Admin layout total | Not measured | Not measured | N/A | N/A |
| Admin home total | Not measured | Not measured | N/A | N/A |
| Profile reads per authenticated request | 2 | 1 | -1 | -50% |

Unauthenticated smoke-test logs did confirm one shared auth helper execution per request while both layout and page phases awaited it:

- `/admin`: one `shared_auth` log plus route-level `admin_home.identity_preparation` and `admin_layout.authenticated_user_lookup`.
- `/dashboard`: one `shared_auth` log plus route-level `customer_dashboard_page.identity_preparation` and `customer_dashboard_layout.authenticated_user_lookup`.

## Build And Checks

| Check | Result |
| --- | --- |
| `npm run build` | Passed with Node `v20.20.2` from `~/.nvm/versions/node/v20.20.2/bin`. |
| `npx tsc --noEmit` | Passed after build generated `.next/types`. |
| `git diff --check` | Passed. |
| Production server start | Passed: `PERF_LOG=1 npm run start`, ready on `http://localhost:3000`. |
| `/dashboard` unauthenticated smoke | Passed: `307` redirect to `/login`. |
| `/admin` unauthenticated smoke | Passed: `307` redirect to `/login`. |
| `/login` smoke | Passed: `200 OK`. |

Build emitted existing `TEMP-DEBUG` billing messages during static generation. Those were not introduced or modified in this batch.

## Regression Status

| Area | Status |
| --- | --- |
| Customer login | Login page loads; authenticated login flow not tested without credentials. |
| Admin login | Login page loads; authenticated login flow not tested without credentials. |
| Admin/customer role redirect | Static-preserved; authenticated role redirects not runtime-tested without credentials. |
| Password-change redirect | Static-preserved in `/dashboard/page.tsx`; not runtime-tested without credentials. |
| Customer dashboard access | Unauthenticated redirect verified; authenticated access not tested without credentials. |
| Admin dashboard access | Unauthenticated redirect verified; authenticated access not tested without credentials. |
| Account and clearance checks | Static-preserved; no clearance logic changed. |
| RLS and authorization behaviour | Preserved by using the existing Supabase SSR client and anon/RLS path. |

## Separate Bugs Not Touched

Per Batch 1 restriction, these were not modified:

- invalid `profiles -> user_document_files` relationship
- missing `checkout_change_requests.customer_message`
- missing `verification_events.request_id`

## Unresolved Risks

- Authenticated before/after timing medians still need to be collected with valid admin/customer test sessions.
- The profile-read reduction is code-path proven and instrumented, but the exact local latency improvement is not measured.
- React `cache()` is request/render scoped; it does not share state with middleware, route handlers outside the render tree, or later browser navigations.

## Measurement Follow-Up

Run once valid local or preview test credentials are available:

```bash
PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npm run build
PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" PERF_LOG=1 npm run start
```

Then perform at least three warm authenticated runs each:

- customer `/dashboard`
- admin `/admin`
- navigation from another dashboard page back to `/dashboard`
- navigation from another admin page back to `/admin`

Count real profile queries from `cached_profile_helper` phases:

- `profile_query_admin`
- `profile_query_dashboard`

## Rollback

```bash
git checkout -- lib/supabase/server.ts app/admin/layout.tsx app/admin/page.tsx app/dashboard/layout.tsx app/dashboard/page.tsx docs/performance-batch-1-2026-07-28.md
```

No migrations were added.
