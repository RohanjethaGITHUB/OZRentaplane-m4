# Cron Framework Guide — OZRentAPlane

Complete reference for scheduled jobs on Vercel + Next.js: architecture, data flow, where to implement, feature list, implementation steps, and performance impact.

---

## 1. Goal

Build one **generic, reusable** scheduling system for:

- Email delivery (outbox drain)
- Notifications (email + in-app)
- Next-day / day-before flight reminders (including checkout flights)
- Daily maintenance (overdue flight records, document expiry, hold cleanup, etc.)

So any future scheduled task plugs into the **same pattern** instead of inventing a new cron each time.

---

## 2. Next.js vs Vercel vs other tools (what to use)

| Layer | Tool | Role |
|-------|------|------|
| **Scheduler** | **Vercel Cron** | Wakes up on a timetable and HTTP-calls your URL |
| **Worker** | **Next.js API Route** (`app/api/cron/...`) | Runs business logic when that URL is hit |
| **Queue** | **Postgres `email_outbox`** | Durable email jobs with claim/retry |
| **Email provider** | **Resend** | Actual send |
| **Database** | **Supabase** | Bookings, docs, invoices, outbox |

### Decision summary

| Option | Use it? | Why |
|--------|---------|-----|
| **Vercel Cron + Next.js routes** | **Yes — primary** | Matches hosting; already started with `/api/cron/email-outbox` |
| **Inngest / Trigger.dev / BullMQ** | Not yet | Extra cost/complexity; outbox + registry is enough |
| **`node-cron` inside Next.js** | **No** | Function dies after request; unreliable on serverless |
| **Separate always-on worker** | **No** | Not how Vercel works (Socket.io is separate and is not for cron) |
| **Supabase Edge Function cron** | Keep existing only | Prefer Next.js for new jobs so email templates stay shared |
| **External HTTP cron** (cron-job.org etc.) | Optional | Needed on **Hobby** for sub-daily outbox drain |

**You use Vercel and Next.js together** — Vercel schedules; Next.js executes.

### Hobby vs Pro (critical)

| Need | Vercel Hobby | Vercel Pro |
|------|--------------|------------|
| Daily jobs (reminders, maintenance) | OK (max 1 run/day per cron) | OK |
| Drain email outbox every 1–5 min | **Not allowed** | OK |

**Default strategy:** all cron routes accept `Authorization: Bearer $CRON_SECRET` from **either** Vercel Cron **or** an external pinger. Same code works on both plans.

---

## 3. Architecture overview

```
┌─────────────────────┐     ┌─────────────────────┐
│  Vercel Cron        │     │  External HTTP cron │
│  (vercel.json)      │     │  (Hobby outbox)     │
└─────────┬───────────┘     └─────────┬───────────┘
          │  GET/POST + Bearer         │
          └────────────┬──────────────┘
                       ▼
          ┌────────────────────────────┐
          │  Next.js /api/cron/[job]   │
          │  authorizeCronRequest()    │
          └────────────┬───────────────┘
                       ▼
          ┌────────────────────────────┐
          │  lib/jobs registry         │
          │  runJob(jobId)             │
          └────────────┬───────────────┘
                       ▼
          ┌────────────────────────────┐
          │  Handlers (lib/jobs/…)     │
          │  query DB → enqueue work  │
          └────────────┬───────────────┘
                       ▼
          ┌────────────────────────────┐
          │  email_outbox / DB updates │
          │  verification_events       │
          └────────────┬───────────────┘
                       ▼
          ┌────────────────────────────┐
          │  email-outbox drain job    │
          │  claim → Resend → mark     │
          └────────────────────────────┘
```

### Design rules

1. **Cron = time-based sweeps only.** Booking confirmed, Stripe paid, checkout outcome → stay in server actions / webhooks.
2. **Business crons enqueue emails; they do not send bulk Resend calls in a loop.** Outbox drain sends.
3. **Every job is idempotent** (safe if run twice). Use unique `idempotency_key` / `email_events` dedupe.
4. **Every job is batched** so it finishes before the Vercel function timeout.
5. **One registry** — add a handler + register it; reuse auth, logging, and route shape.

---

## 4. Data flow (how data moves)

### 4.1 Event-driven path (already exists — not cron)

```
User/Admin action (server action / Stripe webhook)
  → mutate bookings / invoices / profiles
  → enqueueEmail* OR sendEmail (sync)
  → email_outbox and/or email_events
  → (if outbox) wait for drain cron → Resend
```

Examples today: checkout request, booking confirmed, payment confirmed.

### 4.2 Scheduled business job path (new)

Example: **day-before / next-day flight reminder**

```
1. Scheduler hits GET /api/cron/day-before-flights
2. Auth: Authorization Bearer CRON_SECRET
3. Handler:
   a. Compute "tomorrow" window in Australia/Sydney
   b. SELECT bookings WHERE status IN ('confirmed','checkout_confirmed')
      AND scheduled_start ∈ tomorrow window
      AND not already reminded (idempotency / email_events)
   c. For each booking: enqueue email_outbox row
      (event_type = flight_reminder_day_before, idempotency_key = …)
   d. Optionally insert verification_events (in-app bell)
4. Return JSON { ok, enqueued, skipped }
5. Later: email-outbox drain claims rows → render template → Resend → status=sent
```

### 4.3 Email outbox drain path (exists)

```
Scheduler → /api/cron/email-outbox
  → claim_email_outbox_jobs(limit, worker_id)   -- Postgres RPC, locks rows
  → for each job: renderOutboxEmail → sendEmail (Resend)
  → update row: sent | failed + backoff available_at
```

Table: `email_outbox`  
Statuses: `pending` → `processing` → `sent` | `failed`  
Retry: `attempts`, `max_attempts`, `available_at`

### 4.4 Daily maintenance path (new)

```
Scheduler → /api/cron/daily-maintenance
  → run handlers in sequence (each batched):
      markFlightRecordOverdue
      expireTemporaryHolds
      documentExpiryReminders
      unpaidInvoiceChase (optional)
      blockTimeExpiryReminders (after migration)
  → each handler: DB writes and/or outbox enqueue
  → single JSON summary for ops logs
```

### 4.5 Data entities touched

| Entity | Role in cron |
|--------|----------------|
| `bookings` | Find tomorrow flights; flip `flight_record_overdue` |
| `flight_records` | Detect missing / late submissions |
| `schedule_blocks` | Expire `temporary_hold` past `expires_at` |
| `user_documents` | Expiry reminders |
| `booking_invoices` / `checkout_invoices` | Payment chase |
| `block_time_packages` / purchases | Expiry + 7-day reminder |
| `email_outbox` | Queue + drain |
| `email_events` | Send log / dedupe |
| `verification_events` | In-app notifications |

---

## 5. Where we implement (file map)

### New / primary

| Path | Purpose |
|------|---------|
| `vercel.json` | Cron schedules (paths + cron expressions, UTC) |
| `lib/jobs/types.ts` | `JobDefinition`, `JobContext`, `JobResult` |
| `lib/jobs/authorize-cron.ts` | Shared Bearer `CRON_SECRET` check |
| `lib/jobs/registry.ts` | Register and lookup jobs by id |
| `lib/jobs/run-job.ts` | Timing, error wrap, structured result |
| `lib/jobs/handlers/*.ts` | One file per business job |
| `app/api/cron/[job]/route.ts` | Generic route: auth → `runJob(params.job)` |
| `app/api/cron/email-outbox/route.ts` | Keep (or fold into registry as `email-outbox`) |
| `lib/email/templates/*` | New reminder / expiry templates |
| `lib/email/outbox.ts` | Extend event types + enqueue helpers |
| `docs/cron-framework-guide.md` | This document |
| `.env.example` | Document `CRON_SECRET` |

### Existing (reuse, do not reinvent)

| Path | Purpose |
|------|---------|
| `app/api/cron/email-outbox/route.ts` | Outbox processor |
| `lib/email/outbox.ts` | Enqueue + render |
| `lib/email/send-email.ts` | Resend + `email_events` dedupe |
| `lib/supabase/admin.ts` | Service-role client for cron |
| `supabase/migrations/115_email_outbox.sql` | Outbox schema + `claim_email_outbox_jobs` |
| `supabase/functions/daily-block-time-tasks/` | Existing block-time daily job (migrate later) |
| `lib/booking/notifications.ts` | Patterns for notify helpers |
| `docs/email-triggers.md` | Catalog of event-driven emails |

### Do **not** put cron logic here

| Path | Why |
|------|-----|
| `app/actions/*` | User-triggered only |
| `middleware.ts` | Runs every request — wrong place |
| `realtime/server.ts` | Socket process — not a job runner |
| Client components | Cron must be server-only |

---

## 6. Full feature / job list

### A. Already partially built (wire schedule + harden)

| # | Feature | Trigger | Action | Priority |
|---|---------|---------|--------|----------|
| A1 | **Email outbox drain** | Every 1–5 min | Claim + send via Resend | P0 |
| A2 | **Block-time expire packages** | Daily | RPC `expire_block_time_packages` | P1 |
| A3 | **Block-time 7-day expiry reminder** | Daily | Enqueue reminder emails | P1 |

### B. Flight / checkout time-based (core product)

| # | Feature | Trigger | Action | Priority |
|---|---------|---------|--------|----------|
| B1 | **Day-before / next-day flight reminder** | Daily ~morning Sydney | Email (+ optional in-app) for `confirmed` / `checkout_confirmed` tomorrow | P0 |
| B2 | **Mark `flight_record_overdue`** | Daily or hourly | Flip `awaiting_flight_record` → `flight_record_overdue` after `scheduled_end` | P1 |
| B3 | **Flight-record overdue nudge** | Daily | Remind customer + admin until submitted | P1 |
| B4 | **Pre-flight dispatch pack notice** (12h) | Hourly (Pro) or daily scan | Optional product email — FAQ mentions 12h | P2 |

### C. Documents / compliance

| # | Feature | Trigger | Action | Priority |
|---|---------|---------|--------|----------|
| C1 | **Document / medical / licence expiry reminders** | Daily | Email N days before expiry (e.g. 30/14/7) | P1 |

### D. Calendar / holds / billing hygiene

| # | Feature | Trigger | Action | Priority |
|---|---------|---------|--------|----------|
| D1 | **Expire stale `temporary_hold` blocks** | Hourly/daily | Set `schedule_blocks.status = expired` past `expires_at` | P1 |
| D2 | **Unpaid invoice chase** | Daily | Remind `payment_required` invoices | P2 |
| D3 | **Admin ops digest** | Daily | One email: pending checkouts, bank proofs, clarifications | P2 |
| D4 | **Annual invoice sequence reset** | Yearly Jan 1 | Reset `invoice_number_seq` (per invoice spec) | P3 |
| D5 | **Win-back after block-time expiry PAYF** | Daily or on billing event | Template exists; wire caller | P3 |

### E. Framework (enables everything)

| # | Feature | Priority |
|---|---------|----------|
| E1 | Shared cron auth + job registry | P0 |
| E2 | `vercel.json` schedules | P0 |
| E3 | Generic `/api/cron/[job]` route | P0 |
| E4 | Structured job logging / stats JSON | P1 |
| E5 | Migrate Edge Function into registry | P2 |

### Explicitly **not** cron

- Booking / checkout / payment confirmation emails → server actions + Stripe webhook  
- Live UI updates → Socket.io  
- Push/SMS → not in product today  

---

## 7. Implementation steps (phased)

### Phase 0 — Prerequisites (ops)

1. Confirm Vercel plan (Hobby vs Pro).
2. Set `CRON_SECRET` in Vercel project env (and locally in `.env.local`).
3. Keep `EMAIL_OUTBOX_CRON_SECRET` as optional fallback.
4. Ensure `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAIL`, `APP_URL` are set.
5. Decide timezone for “tomorrow”: **`Australia/Sydney`** (document in code).

### Phase 1 — Framework + wire email outbox (P0)

1. Create `lib/jobs/authorize-cron.ts` (extract from email-outbox route).
2. Create `lib/jobs/types.ts`, `registry.ts`, `run-job.ts`.
3. Register job `email-outbox` pointing at existing processor logic.
4. Add `vercel.json`:
   - Pro: `*/5 * * * *` → `/api/cron/email-outbox`
   - Hobby: daily stub for business jobs; use external cron for outbox every 5 min
5. Manual test:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" \
     "http://localhost:3000/api/cron/email-outbox"
   ```
6. Deploy; confirm Vercel Cron Invocations in dashboard.

### Phase 2 — Next-day / day-before flights (P0)

1. Add template `lib/email/templates/...` for flight reminder.
2. Extend `lib/email/outbox.ts` with new `event_type` + enqueue helper.
3. Add `lib/jobs/handlers/day-before-flights.ts`:
   - Query tomorrow window
   - Filter statuses
   - Enqueue with unique idempotency keys
4. Register + expose `/api/cron/day-before-flights`.
5. Schedule daily UTC time that maps to morning Sydney (account for DST carefully).
6. Test with a booking whose `scheduled_start` is tomorrow; run job twice → second run must enqueue **0** new rows.

### Phase 3 — Daily maintenance bundle (P1)

1. Create `/api/cron/daily-maintenance` that runs multiple handlers.
2. Implement:
   - `flight-record-overdue`
   - `expire-temporary-holds`
   - `document-expiry-reminders`
3. Each handler: batch limit (e.g. 100–500 rows), return counts.
4. One `vercel.json` entry for the bundle (fewer cron slots, one ops log).

### Phase 4 — Consolidate + polish (P2)

1. Port `daily-block-time-tasks` into a Next.js handler using shared email/outbox.
2. Add admin digest / unpaid chase if product wants them.
3. Document all jobs in `docs/email-triggers.md` (scheduled section).
4. Optional: failed-outbox alert if `status=failed` count > 0.

### Per-job checklist (use every time)

- [ ] Handler in `lib/jobs/handlers/`
- [ ] Registered in `registry.ts`
- [ ] Route reachable under `/api/cron/...`
- [ ] Entry in `vercel.json` (or covered by daily-maintenance)
- [ ] Idempotency key strategy documented
- [ ] Batch limit + timeout-safe
- [ ] Emails go through outbox when possible
- [ ] Local curl test + one staging run

---

## 8. Example `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/email-outbox",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/day-before-flights",
      "schedule": "0 21 * * *"
    },
    {
      "path": "/api/cron/daily-maintenance",
      "schedule": "0 22 * * *"
    }
  ]
}
```

Notes:

- Schedules are **UTC**.
- Hobby: remove `*/5` entry; ping outbox with external cron instead.
- Prefer one `daily-maintenance` path over many daily paths.

---

## 9. Example job handler shape

```ts
// lib/jobs/handlers/day-before-flights.ts
import type { JobDefinition } from '../types'

export const dayBeforeFlightsJob: JobDefinition = {
  id: 'day-before-flights',
  description: 'Enqueue reminder emails for flights scheduled tomorrow (Sydney)',
  async run(ctx) {
    const admin = ctx.admin
    // 1) compute tomorrow start/end in Australia/Sydney → UTC
    // 2) select eligible bookings
    // 3) enqueue outbox rows (skip on unique conflict)
    // 4) return { scanned, enqueued, skipped }
    return { ok: true, stats: { scanned: 0, enqueued: 0, skipped: 0 } }
  },
}
```

```ts
// app/api/cron/[job]/route.ts
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params }: { params: { job: string } }) {
  const unauthorized = authorizeCronRequest(req)
  if (unauthorized) return unauthorized
  return NextResponse.json(await runJob(params.job))
}
```

---

## 10. Security

| Rule | Detail |
|------|--------|
| Auth | `Authorization: Bearer $CRON_SECRET` required in production |
| No browser access | Outbox has RLS with no user policies; cron uses service role |
| Secrets | Never expose `CRON_SECRET` / service role to client |
| Least privilege | Handlers only touch tables they need |
| Idempotency | Prevents duplicate emails if cron double-fires |

---

## 11. Performance impact

### What cron costs

| Resource | Impact | Mitigation |
|----------|--------|------------|
| **Vercel function invocations** | 1 per cron tick | Bundle daily jobs; outbox every 5 min ≈ 288/day |
| **Function duration** | Billed/time-limited | Batch (limit 10–50 emails, 100–500 DB rows); return early |
| **Supabase DB load** | Periodic indexed queries | Use indexes on `scheduled_start`, `status`, `available_at`; avoid full table scans |
| **Resend API** | Sends only from drain | Cap batch size; backoff on failure |
| **User-facing latency** | **None** if designed correctly | Cron is off the request path; users never wait on reminders |
| **Cold starts** | Occasional slow first tick | Acceptable for daily/5-min jobs; keep handlers lean |

### Positive performance effects

- **Faster user actions:** moving more emails to outbox means booking/checkout actions return sooner (already started in Batch 6).
- **Retries without blocking UI:** failed Resend does not fail the user click.
- **Predictable load:** sweeps run off-peak (night/morning UTC) instead of ad-hoc spikes.

### Risks if done poorly

| Anti-pattern | Risk | Fix |
|--------------|------|-----|
| Send 1000 Resend calls inside one cron | Timeout + rate limits | Outbox + small claim batches |
| Unindexed `WHERE scheduled_start::date = …` | Slow queries | Range filter on timestamptz + index |
| Non-idempotent reminder | Duplicate emails | Unique `idempotency_key` |
| Too many separate crons | Ops noise + Hobby limits | `daily-maintenance` bundle |
| Heavy work in middleware / every page | Site-wide slowdown | Never |

### Target budgets (guidelines)

| Job | Target duration | Batch |
|-----|-----------------|-------|
| email-outbox | &lt; 10–20s | 10 jobs/run (existing default) |
| day-before-flights | &lt; 15s | Enqueue only; no send |
| daily-maintenance | &lt; 30–50s total | Per-handler limits |

If a job regularly approaches timeout: split into multiple cron paths or process “cursor pages” (`WHERE id > last_id LIMIT n`).

---

## 12. Observability

Each job response should look like:

```json
{
  "ok": true,
  "job": "day-before-flights",
  "durationMs": 412,
  "stats": { "scanned": 18, "enqueued": 12, "skipped": 6 }
}
```

Log failures with code/message only (no PII in logs). Optionally alert when:

- `email_outbox` rows stuck in `failed`
- Job returns `ok: false`
- Duration exceeds budget

---

## 13. Testing plan

| Level | How |
|-------|-----|
| Local | `curl` with Bearer secret; seed a tomorrow booking |
| Idempotency | Run same job twice; assert second enqueue = 0 |
| Staging | Enable Vercel Cron; watch Invocations + outbox rows |
| Failure | Force bad Resend key → outbox retries / fails cleanly |
| Timezone | Booking near midnight Sydney; assert window correct |

---

## 14. Suggested build order (summary)

1. **Framework + auth + vercel.json + outbox schedule**  
2. **Day-before / next-day flight reminders** (checkout + standard)  
3. **Daily maintenance:** overdue flight records, hold expiry, document reminders  
4. **Migrate block-time Edge Function** into the same registry  
5. **Nice-to-haves:** unpaid chase, admin digest, annual invoice reset  

---

## 15. Quick FAQ

**Q: Do I write cron in Next.js or Vercel?**  
A: Both. Vercel = schedule. Next.js = code.

**Q: Will this slow the website?**  
A: No, if jobs stay off user requests and stay batched. Users never hit cron routes.

**Q: Where do new features go later?**  
A: Add `lib/jobs/handlers/my-job.ts` → register → add schedule (or plug into `daily-maintenance`).

**Q: Why not only Supabase cron?**  
A: You already have Next email templates, outbox, and admin client. One place = less duplication.

**Q: What about notifications?**  
A: Email via outbox; in-app via `verification_events` inserts inside the same handler.

---

## 16. Related docs

- [email-triggers.md](./email-triggers.md) — event-driven email catalog  
- [email-templates.md](./email-templates.md) — templates including block-time reminders  
- [performance-batch-6-2026-07-29.md](./performance-batch-6-2026-07-29.md) — email outbox introduction  
- [invoice-specification.md](./invoice-specification.md) — annual sequence reset note  
