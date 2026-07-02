BEGIN;

-- ============================================================
-- 098_stripe_webhook_events.sql
-- Stripe webhook event-ID dedupe ledger.
--
-- The webhook handler checks this table before processing and records
-- the event id after successful processing, so a Stripe retry of an
-- already-processed event returns success without reprocessing.
-- This is additive protection on top of the existing purchase/invoice
-- based idempotency checks.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id     text        PRIMARY KEY,
  event_type   text        NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed_at
  ON public.stripe_webhook_events (processed_at DESC);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Written only by the webhook handler via the service role (which bypasses
-- RLS); admins may inspect it, nobody else can touch it.
DROP POLICY IF EXISTS "Admins can view stripe webhook events" ON public.stripe_webhook_events;
CREATE POLICY "Admins can view stripe webhook events"
  ON public.stripe_webhook_events
  FOR SELECT
  USING (public.get_own_role() = 'admin');

COMMIT;
