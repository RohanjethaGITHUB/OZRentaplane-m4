# OZRentaplane Performance Batch 6

Scope: remove external Resend delivery from the user-facing critical path for customer standard rental creation, customer checkout-request submission, and admin checkout confirmation.

## Existing Infrastructure Found

- `email_events`: existing transactional delivery log and dedupe guard in `supabase/migrations/063_email_events.sql`. It records recipient, event type, entity, status, Resend id, errors, and metadata. It is not a durable queue because it has no lock, availability, attempts, max-attempts, or claim semantics.
- `lib/email/send-email.ts`: existing Resend integration. It logs to `email_events` and skips duplicates already marked sent.
- `supabase/functions/daily-block-time-tasks`: existing scheduled Supabase Edge Function for block-time reminders. It is separate from the Batch 5 booking/checkout mutation flows and sends directly via Resend fetch.
- No existing notification outbox, email queue, webhook queue, general job table, Vercel Cron route, pg_cron config, reusable background worker, or retryable email status table was found for these target flows.

## New Durable Outbox

Migration `supabase/migrations/115_email_outbox.sql` adds `email_outbox` with durable payloads, deterministic `idempotency_key`, status, attempts, max-attempts, availability time, processing lock fields, sanitized error storage, provider id storage, timestamps, and a constrained status check.

`claim_email_outbox_jobs()` atomically claims bounded batches using row locking and `FOR UPDATE SKIP LOCKED`. It also recovers stale processing locks before claiming new work.

## Security Model

`email_outbox` has RLS enabled and intentionally defines no policies for authenticated users. Ordinary customers cannot query queued emails, insert arbitrary recipients, alter job status, or force retries. Admin users also do not receive broad table access by default.

Trusted server-side code uses `SUPABASE_SERVICE_ROLE_KEY` through the established `createAdminClient()` convention. The processor route is protected by `Authorization: Bearer $EMAIL_OUTBOX_CRON_SECRET` or `$CRON_SECRET`; in production it returns 503 if no secret is configured. No service-role key is exposed to browser code.

## Failure Behavior

The booking or checkout database write remains independent of Resend availability. Provider-delivery failures happen only in the processor and are retried with backoff until `max_attempts`, then left as `failed` for operations review.

Durable enqueue failure is treated differently from provider failure: target actions throw or return an operational error after the authoritative write because notification durability could not be recorded. This avoids reporting silent full success when the email job is missing.
