-- ─────────────────────────────────────────────────────────────────────────────
-- 067_checkout_change_requests.sql
--
-- Introduces a separate customer checkout booking lifecycle (distinct from
-- checkout outcome values on profiles.pilot_clearance_status) and adds
-- customer cancel/reschedule request tracking for checkout bookings.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1) Separate lifecycle status for checkout booking scheduling workflow
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS checkout_lifecycle_status text;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_checkout_lifecycle_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_checkout_lifecycle_status_check
  CHECK (
    checkout_lifecycle_status IS NULL
    OR checkout_lifecycle_status IN (
      'requested',
      'scheduled',
      'reschedule_requested',
      'cancelled_by_customer',
      'cancelled_by_admin',
      'completed'
    )
  );

-- Backfill checkout lifecycle for existing checkout bookings.
UPDATE public.bookings
SET checkout_lifecycle_status = CASE
  WHEN status = 'checkout_requested' THEN 'requested'
  WHEN status = 'checkout_confirmed' THEN 'scheduled'
  WHEN status = 'checkout_completed_under_review' THEN 'completed'
  WHEN status = 'checkout_payment_required' THEN 'completed'
  WHEN status = 'completed' THEN 'completed'
  WHEN status = 'cancelled' THEN 'cancelled_by_admin'
  ELSE checkout_lifecycle_status
END
WHERE booking_type = 'checkout'
  AND checkout_lifecycle_status IS NULL;

-- 2) Customer checkout change requests (cancel + reschedule)
CREATE TABLE IF NOT EXISTS public.checkout_change_requests (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_request_id        uuid NOT NULL
    REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_id                uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  request_type               text NOT NULL
    CHECK (request_type IN ('cancel', 'reschedule')),
  status                     text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  original_scheduled_start   timestamptz NOT NULL,
  original_scheduled_end     timestamptz NOT NULL,
  requested_scheduled_start  timestamptz,
  requested_scheduled_end    timestamptz,
  customer_note              text,
  admin_note                 text,
  reviewed_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at                timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checkout_change_requests_reschedule_time_check
    CHECK (
      (request_type = 'cancel' AND requested_scheduled_start IS NULL AND requested_scheduled_end IS NULL)
      OR
      (request_type = 'reschedule' AND requested_scheduled_start IS NOT NULL AND requested_scheduled_end IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_checkout_change_requests_checkout
  ON public.checkout_change_requests(checkout_request_id);

CREATE INDEX IF NOT EXISTS idx_checkout_change_requests_customer
  ON public.checkout_change_requests(customer_id);

CREATE INDEX IF NOT EXISTS idx_checkout_change_requests_status
  ON public.checkout_change_requests(status);

-- At most one pending reschedule request per checkout booking.
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkout_reschedule_pending_per_checkout
  ON public.checkout_change_requests(checkout_request_id)
  WHERE request_type = 'reschedule' AND status = 'pending';

DROP TRIGGER IF EXISTS set_checkout_change_requests_updated_at ON public.checkout_change_requests;
CREATE TRIGGER set_checkout_change_requests_updated_at
  BEFORE UPDATE ON public.checkout_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) RLS
ALTER TABLE public.checkout_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checkout_change_requests_customer_select"
  ON public.checkout_change_requests
  FOR SELECT
  USING (
    customer_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id = checkout_change_requests.checkout_request_id
        AND b.booking_owner_user_id = auth.uid()
        AND b.booking_type = 'checkout'
    )
  );

CREATE POLICY "checkout_change_requests_customer_insert"
  ON public.checkout_change_requests
  FOR INSERT
  WITH CHECK (
    customer_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id = checkout_change_requests.checkout_request_id
        AND b.booking_owner_user_id = auth.uid()
        AND b.booking_type = 'checkout'
    )
  );

CREATE POLICY "checkout_change_requests_admin_all"
  ON public.checkout_change_requests
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
