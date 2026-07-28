# OZRentaplane Performance Batch 0 Baseline

Date: 2026-07-28

Scope: measurement infrastructure only. No caching, query consolidation, migrations, runtime-region changes, middleware changes, redirects, business logic, payment logic, booking calculations, or document workflow changes were added.

## A. Infrastructure Findings

| Finding | Status | Repository Evidence | Notes |
| --- | --- | --- | --- |
| Hosting provider | Unresolved from repository | No `vercel.json`; no `.openai/hosting.json`; `package.json` uses standard Next scripts | Vercel is plausible because the app is Next.js and the task references Vercel-style checks, but this is not proven by repo evidence. |
| Frontend execution region | Not proven | `next.config.mjs` has no region configuration; no deployment metadata found | Do not infer production frontend region from local files. |
| Explicit server function region | Not configured in repo | No `preferredRegion`; no `regions`; no `vercel.json` | If deployed on Vercel, project-level/function settings must be checked in the dashboard. |
| Next.js runtime declarations | No Edge/Node runtime declarations found | `rg` found `dynamic` declarations only; no `export const runtime = 'edge'` or `runtime = 'nodejs'` in `app/` | App Router routes default to the platform runtime unless configured elsewhere. |
| Edge routes | None proven | No route-level `runtime = 'edge'` declarations found | Static marketing routes use `dynamic = 'force-static'`; admin pages use dynamic server rendering. |
| Supabase project ref | Present | `.env.local` contains a `NEXT_PUBLIC_SUPABASE_URL` project ref | The URL proves the project ref, not the physical database region. Secrets were not copied into this report. |
| Supabase region | Not proven from repository | No `supabase/config.toml` or dashboard export with region was found | The requested `ap-southeast-2` assumption still needs dashboard verification. |
| Co-location | Not confirmed | Neither frontend region nor Supabase region is proven in repo | Record both values from hosting and Supabase dashboards before Batch 1. |

Manual Vercel verification steps:

1. Open Vercel Dashboard -> the OZRentaplane project -> Settings -> Functions.
2. Record the configured Function Region or Function Regions. Vercel documents function-region configuration in project settings and `vercel.json`: https://vercel.com/docs/functions/configuring-functions/region
3. Open the latest Production deployment -> inspect Functions/Serverless Function details and logs for `/admin`, `/dashboard`, and any server action/function entries.
4. For a live request, capture the response headers for authenticated server-rendered pages where possible. If present, record `x-vercel-id`; Vercel community guidance notes this header can expose the serving region for the request path.
5. Compare the recorded function region with Supabase `ap-southeast-2` / Sydney. If the Vercel function region is not Sydney or near Sydney, co-location is not confirmed.

Manual Supabase verification steps:

1. Open Supabase Dashboard -> select project `grkwzsrqpzkviihxlzwu`.
2. Open Project Settings -> General, or the platform/project overview section that shows the project region.
3. Record the exact region label and region code. Supabase documents that each project is deployed to one primary region: https://supabase.com/docs/guides/platform/regions
4. If the region is not visible there, check Database -> Replication or project infrastructure details for the primary database region.
5. Compare the exact value with the frontend function region from Vercel.

## B. Instrumentation Added

Files changed:

| File | Instrumentation |
| --- | --- |
| `lib/perf/timing.ts` | Feature-flagged structured timing helper. |
| `app/admin/layout.tsx` | Admin auth lookup, profile/role lookup, first parallel query group, dependent second query group, total layout preparation. |
| `app/admin/page.tsx` | Identity/profile preparation, main parallel query group, owner-profile follow-up, document-review follow-up, invoice follow-up, bank-transfer follow-up, metric/action-feed preparation, total page preparation. |
| `app/dashboard/layout.tsx` | Customer auth lookup, profile lookup, block-time count lookup, total layout preparation. |
| `app/dashboard/page.tsx` | Identity/profile preparation, login tracking write, main query group, post-flight payment lookups, checkout payment lookups, readiness lookups, block-time summary lookups, total page preparation. |
| `app/actions/booking.ts` | `createBooking` auth/authorization, overage reads, validation, RPC write, profile update, revalidation, post-write identity/profile reads, email preparation, email delivery request, total action duration. |

Helper API:

```ts
const perf = createPerfLogger({ route: '/dashboard', role: 'customer' })
await perf.time('customer_dashboard_page', 'profile_preparation', () => query)
perf.timeSync('createBooking', 'revalidation', () => revalidatePath('/dashboard'))
const markTotal = perf.start('admin_home', 'total_server_page_preparation')
markTotal({ rowCount: sortedActionRows.length })
```

Environment flag:

```bash
PERF_LOG=1
```

When `PERF_LOG` is absent or not exactly `1`, the helper returns the original function result without emitting logs, doing JSON serialization, calling the database, or using external dependencies.

Log format:

```json
{
  "type": "perf_timing",
  "timestamp": "2026-07-28T00:00:00.000Z",
  "operationId": "uuid",
  "route": "/dashboard",
  "role": "customer",
  "operationName": "customer_dashboard_page",
  "phase": "profile_preparation",
  "durationMs": 12.34,
  "status": "success",
  "rowCount": 1
}
```

Privacy protections:

- Logs include role only, never user id, email, name, phone, cookies, tokens, notes, payment details, document contents, or full database records.
- Failure logs include an error category only, not the full sensitive error payload.
- Row counts are included only where they can be safely derived from counts or result cardinality.

Enable locally:

```bash
PERF_LOG=1 npm run start
```

Disable:

```bash
unset PERF_LOG
npm run start
```

## C. Baseline Table

No reliable timing baseline was captured in this environment. `node`, `npm`, and `npx` are unavailable on PATH, so `npm run build`, `npm run start`, local warm runs, and TypeScript verification could not execute here. Authenticated production or preview access was also not available.

| Workflow | Environment | Run Type | Total Duration | Auth | Profile | DB/Query Blocks | External Work | Revalidation | Notes |
| -------- | ----------- | -------- | -------------: | ---: | ------: | --------------- | ------------: | -----------: | ----- |
| Login submission | Not measured | Not measured | N/A | N/A | N/A | N/A | N/A | N/A | Login route/action was outside Batch 0 instrumentation scope. Requires test account and production/preview access. |
| Customer dashboard | Not measured | Not measured | N/A | N/A | N/A | N/A | N/A | N/A | Instrumented in `/dashboard/layout` and `/dashboard`; run with `PERF_LOG=1`. |
| Admin dashboard | Not measured | Not measured | N/A | N/A | N/A | N/A | N/A | N/A | Instrumented in `/admin/layout` and `/admin`; run with `PERF_LOG=1`. |
| Customer booking-detail page | Not measured | Not measured | N/A | N/A | N/A | N/A | N/A | N/A | Not instrumented in Batch 0 file list. Requires separate approved scope if needed. |
| Admin booking-detail page | Not measured | Not measured | N/A | N/A | N/A | N/A | N/A | N/A | Not instrumented in Batch 0 file list. Requires separate approved scope if needed. |
| `createBooking` | Not measured | Not measured | N/A | N/A | N/A | N/A | N/A | N/A | Instrumented in `app/actions/booking.ts`; requires safe aircraft/test slot/customer account. |

Measurement commands to run once Node is available:

```bash
npm run build
PERF_LOG=1 npm run start
```

For each route/action, perform one cold run separately, then at least three warm runs. Do not mix cold and warm results. Compute median warm duration for each phase from `perf_timing` logs with the same workflow label.

## D. Query Sequence Map

### `/admin/layout`

1. Create Supabase SSR client.
2. Authenticated user lookup: render-blocking.
3. Profile/role lookup: render-blocking, dependent on user id.
4. First parallel query group: checkout counts, standard booking count candidates, payment rows, cancellation counts, checkout issue count, overage count, document rows.
5. Local queue metric preparation: render-blocking.
6. Dependent second query group: standard booking invoices and bank-transfer submissions for `payment_pending` booking ids.
7. Local invoice/submission reduction and document-review queue reduction.
8. Child content can render after total layout preparation completes.

### `/admin`

1. `noStore()`.
2. Create Supabase SSR client.
3. Authenticated user lookup.
4. Admin profile lookup.
5. Main parallel query group: overage invoices, customer documents, checkout counts, checkout queues, standard rental queues, cancellation queues, payment queues.
6. Local owner id extraction from queue rows.
7. Sequential owner profile lookup.
8. Sequential document-review booking lookup.
9. Sequential booking invoice lookup for standard payment rows.
10. Sequential booking bank-transfer submission lookup.
11. Dashboard metric preparation and action-feed row construction.
12. Render `ActionQueueSection`.

### `/dashboard/layout`

1. Create Supabase SSR client.
2. Authenticated user lookup.
3. Profile lookup.
4. Block-time purchase count lookup.
5. Redirect admin users to `/admin`.
6. Render customer portal nav and child content after layout preparation completes.

### `/dashboard`

1. Create Supabase SSR client.
2. Authenticated user lookup.
3. Profile lookup.
4. Optional login-tracking write.
5. Main parallel query group: documents, verification events, checkout payment booking, latest active standard booking, post-flight required rows, post-flight review row, upcoming booking, checkout snapshot, post-flight payment row.
6. Conditional post-flight invoice lookup.
7. Conditional post-flight bank-transfer lookup.
8. Conditional checkout payment parallel group: live invoice amount, landing charges, invoice status.
9. Conditional checkout bank-transfer lookup.
10. Manual checkout clearance lookup.
11. Booking-readiness parallel query group: historical clearance, active terms, latest terms acceptance, paid checkout invoice.
12. Possible admin-client fallback reads for historical clearance, paid invoice, terms acceptance, active terms.
13. Dashboard summary/action-state preparation.
14. Block-time package lookup.
15. Block-time purchase summary lookup.
16. Optional recent block-time invoice lookup after purchase success.
17. Render `DashboardContent`.

### `createBooking`

Current execution order:

1. Initial authentication and authorization via `requireClearedCustomer`.
2. Availability/pricing read: unpaid block-time overage gate.
3. Input validation and request header extraction.
4. Booking RPC/database write: `create_aircraft_booking_atomic`.
5. Post-write profile update: save last flight review date.
6. Revalidation: `/dashboard`, `/admin`.
7. Post-write identity client preparation and authenticated user read.
8. Post-write profile read for notification fields.
9. Email preparation.
10. Email delivery request through existing notification helper.
11. Return booking id/reference/status.

Note: revalidation currently happens before notification lookup/email work. That behavior was preserved.

## E. Confirmed Versus Unresolved Questions

| Question | Status | Evidence | Next Verification Step |
| -------- | ------ | -------- | ---------------------- |
| Is the frontend hosted on Vercel? | Unresolved | No `vercel.json` or hosting metadata in repo | Check hosting dashboard/project DNS/deployment provider. |
| What region runs Next.js server functions? | Unresolved | No repo region configuration | Check Vercel Project -> Settings -> Functions and latest production deployment function details. |
| Are any app routes Edge runtime? | Confirmed not configured in repo | No `runtime = 'edge'` declarations found in `app/` | Confirm deployment function runtime metadata in hosting dashboard. |
| Is Supabase in `ap-southeast-2`? | Unresolved from repo | `.env.local` shows project ref only | Check Supabase Project Settings -> General / infrastructure region. |
| Are frontend and database co-located? | Unresolved | Both region values are unresolved from repo | Compare verified Vercel function region with verified Supabase region. |
| Does instrumentation log with `PERF_LOG=1`? | Not runtime-tested | Helper emits structured JSON only when flag is exactly `1` | Run production build with `PERF_LOG=1` and collect stdout logs. |
| Are logs silent with `PERF_LOG` unset? | Static-confirmed only | Helper returns before `console.log` and before JSON serialization when disabled | Run production build without `PERF_LOG` and inspect stdout. |
| Did Batch 0 add migrations or behavior changes? | Confirmed by file scope | Only app timing wrappers, helper, and this report were added | Review `git diff --stat`; no `supabase/migrations` changes. |

## F. Recommended Next Batch

No optimization batch should begin from this local environment because no timings were captured.

Recommended immediate next step: run Batch 0 measurement collection in a production or preview deployment with authenticated admin/customer test accounts and `PERF_LOG=1`.

Decision rule after measurements:

- If verified frontend function region is not Sydney/near Supabase, prioritize region relocation.
- If dashboard logs show repeated profile/auth reads dominating, prioritize profile-request deduplication.
- If `/admin/layout` blocks every admin navigation with slow queue counts, prioritize admin-shell streaming or route scoping.
- If `/dashboard` main/query follow-up groups dominate, prioritize dashboard-query changes.
- If `createBooking` tail phases dominate after the RPC, prioritize mutation-tail reduction.

## Testing Status

| Requirement | Result |
| --- | --- |
| Production build succeeds | Not run: `node`, `npm`, and `npx` are unavailable on PATH in this environment. |
| Application behavior unchanged with `PERF_LOG` unset | Static-confirmed only: disabled helper immediately invokes original functions and emits no logs. |
| No logs appear with `PERF_LOG` unset | Static-confirmed only: `console.log` is guarded behind `PERF_LOG === '1'`. |
| Structured logs appear with `PERF_LOG=1` | Not runtime-tested; helper emits JSON to stdout when enabled. |
| No sensitive information appears in logs | Static-confirmed: no user ids, names, emails, notes, payment details, cookies, tokens, or records are included. |
| Login still works | Not tested: no running production build/test account. |
| Customer dashboard still loads | Not tested: no running production build/test account. |
| Admin dashboard still loads | Not tested: no running production build/test account. |
| One booking can still be created | Not tested: requires safe aircraft/test slot/customer account. |
| Authorization/RLS unchanged | Static-confirmed only: no auth guards, RLS, policies, or query filters were changed. |
| Booking/payment logic unchanged | Static-confirmed only: no booking/payment calculations or migrations were changed. |

## Production Measurement Instructions

Collect logs for:

- `/dashboard/layout`
- `/dashboard`
- `/admin/layout`
- `/admin`
- `server_action:createBooking`

Run sequence:

1. Deploy the Batch 0 branch to Preview, or enable `PERF_LOG=1` on a short production measurement window.
2. Keep all other feature flags unchanged.
3. Open stdout/function logs in the hosting dashboard.
4. Perform one cold run per workflow and label it cold.
5. Perform at least three warm runs per workflow and label them warm.
6. Export only `perf_timing` JSON lines.
7. Group by `operationId`, then by `operationName` and `phase`.
8. Record the median warm total and median warm phase durations in the baseline table.
9. Disable `PERF_LOG` after collection.

Required access:

- Admin test account.
- Customer test account with dashboard access.
- Cleared customer test account allowed to create a safe booking.
- Safe aircraft/test slot that can be booked without affecting real operations.
- Hosting dashboard access to function logs and deployment/function region metadata.
- Supabase dashboard access to project region.

## Rollback

Remove these files/edits:

```bash
rm lib/perf/timing.ts
git checkout -- app/admin/layout.tsx app/admin/page.tsx app/dashboard/layout.tsx app/dashboard/page.tsx app/actions/booking.ts docs/performance-audit-2026-07-28.md
```

No migrations were added.
