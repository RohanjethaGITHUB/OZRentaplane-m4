-- ─────────────────────────────────────────────────────────────────────────────
-- 048_customer_cancellation.sql
--
-- Adds customer self-service cancellation support:
--
--   1. Extends bookings.status check constraint to include
--      'cancellation_requested' (late cancel pending admin review).
--
--      Source of truth for the COMPLETE prior constraint is migration 027
--      (027_checkout_payment_foundation.sql) which last recreated it.
--      All existing values are preserved; only 'cancellation_requested' is added.
--
--   2. Creates booking_cancellation_requests table:
--      - Stores context for both immediate and late cancellation requests.
--      - Late (within-24h) requests remain pending until admin decides.
--      - Admin can approve with charge waived or charge applied.
--
--   3. Unique partial index prevents duplicate pending requests per booking
--      at the database level (server action also checks, but DB is the gate).
--
--   4. RLS: customers can insert/select their own requests only.
--      Customers have no UPDATE policy — they cannot modify admin fields.
--      Admins see and can update all rows.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Extend bookings status check constraint ────────────────────────────────
--
-- Last recreated in migration 027 with this complete set:
--   Standard: draft, pending_confirmation, confirmed, ready_for_dispatch,
--     dispatched, awaiting_flight_record, flight_record_overdue,
--     pending_post_flight_review, needs_clarification, post_flight_approved,
--     invoice_generated, payment_pending, paid, completed,
--     cancelled, no_show, overdue, admin_hold
--   Checkout: checkout_requested, checkout_confirmed,
--     checkout_completed_under_review, checkout_payment_required
--   Provisional: pending_checkout_clearance, released_due_to_checkout
--
-- Added here: cancellation_requested

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
    CHECK (status IN (
      -- Standard booking lifecycle
      'draft',
      'pending_confirmation',
      'confirmed',
      'ready_for_dispatch',
      'dispatched',
      'awaiting_flight_record',
      'flight_record_overdue',
      'pending_post_flight_review',
      'needs_clarification',
      'post_flight_approved',
      'invoice_generated',
      'payment_pending',
      'paid',
      'completed',
      'cancelled',
      'no_show',
      'overdue',
      'admin_hold',
      -- Checkout booking statuses (added in migrations 022 and 027)
      'checkout_requested',
      'checkout_confirmed',
      'checkout_completed_under_review',
      'checkout_payment_required',
      -- Provisional first-solo reservation (added in migration 022)
      'pending_checkout_clearance',
      -- Released because checkout outcome was not clearance (added in migration 022)
      'released_due_to_checkout',
      -- NEW: late cancellation submitted by customer, awaiting admin review
      'cancellation_requested'
    ));

-- ── 2. booking_cancellation_requests table ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.booking_cancellation_requests (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          UUID        NOT NULL
                        REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id             UUID        NOT NULL
                        REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Snapshot of the departure time at the moment of request (for audit)
  booking_start_time  TIMESTAMPTZ NOT NULL,

  -- True when the request was submitted inside the 24-hour window
  is_within_24_hours  BOOLEAN     NOT NULL DEFAULT false,

  -- Optional message the customer can leave for the operations team
  customer_message    TEXT,

  -- Lifecycle:
  --   pending                  → awaiting admin decision
  --   approved_waived          → admin approved, no charge
  --   approved_charged         → admin approved, cancellation fee applies
  --   cancelled_without_charge → immediate cancel (>24h), no review needed;
  --                              stored for audit even though no admin action required
  status              TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'approved_waived',
      'approved_charged',
      'cancelled_without_charge'
    )),

  -- Admin decision fields — only populated when admin acts on a pending request
  -- Customers have no UPDATE policy so they cannot write these fields.
  admin_note          TEXT,
  decided_by          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at          TIMESTAMPTZ,

  -- Estimated charge amount in cents (computed at admin decision time for charged path)
  charge_amount_cents INTEGER,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. Indexes ────────────────────────────────────────────────────────────────

-- General lookup by booking
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_booking
  ON public.booking_cancellation_requests(booking_id);

-- General lookup by customer
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_user
  ON public.booking_cancellation_requests(user_id);

-- UNIQUE partial index: at most one pending request per booking.
-- This is the database-level guard against duplicate pending requests
-- caused by double-clicks or concurrent requests.
-- The server action also checks before inserting, but this is the hard guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cancellation_requests_pending_per_booking
  ON public.booking_cancellation_requests(booking_id)
  WHERE status = 'pending';

-- ── 4. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.booking_cancellation_requests ENABLE ROW LEVEL SECURITY;

-- Customers can read their own requests, verified through two conditions:
--   (a) the row's user_id matches the caller, AND
--   (b) the referenced booking is owned by the same caller.
-- This prevents a customer from reading a cancellation request even if they
-- somehow constructed a row with their own user_id pointing to another
-- customer's booking.
CREATE POLICY "cancellation_requests_customer_select"
  ON public.booking_cancellation_requests
  FOR SELECT
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id = booking_cancellation_requests.booking_id
        AND b.booking_owner_user_id = auth.uid()
    )
  );

-- Customers can insert requests only for their own bookings.
-- No UPDATE policy for customers — they cannot modify admin decision fields
-- (admin_note, decided_by, decided_at, charge_amount_cents, status → approved_*).
CREATE POLICY "cancellation_requests_customer_insert"
  ON public.booking_cancellation_requests
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id = booking_cancellation_requests.booking_id
        AND b.booking_owner_user_id = auth.uid()
    )
  );

-- Admins can read and write all rows (covers approve-waived and approve-charged).
-- Both USING (read gate) and WITH CHECK (write gate) are explicit so the
-- policy applies correctly to every DML operation.
CREATE POLICY "cancellation_requests_admin_all"
  ON public.booking_cancellation_requests
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
