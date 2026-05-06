-- ─────────────────────────────────────────────────────────────────────────────
-- 049_standard_booking_billing.sql
--
-- Part 1 — Checkout VDO: single VDO reading replaces start/end pair.
--   • Adds vdo_reading column to checkout_invoices.
--   • Replaces complete_checkout_outcome_atomic with a new version that
--     accepts p_vdo_reading (one decimal, the paper-sheet difference)
--     instead of p_vdo_start_reading / p_vdo_end_reading.
--   • Old invoices keep their existing vdo_start_reading / vdo_end_reading
--     columns (nullable) for historical display; new invoices store NULL there.
--
-- Part 2 — Standard booking post-flight billing.
--   • booking_invoices — invoice for a standard booking after flight records approved.
--   • booking_landing_charges — landing charges linked to a booking invoice.
--   • booking_bank_transfer_submissions — bank transfer proofs for standard invoices.
--   • finalise_standard_booking_invoice_atomic — creates the invoice, applies
--     credit, moves booking → payment_pending (or completed if credit covers all).
--   • prepare_booking_payment_atomic — re-applies any new credit at payment time,
--     computes Stripe surcharge, returns authoritative charge amount.
--   • mark_booking_invoice_paid_atomic — idempotent; called by Stripe webhook.
--   • approve_standard_bank_transfer_atomic — admin confirms manual payment.
--   • reject_standard_bank_transfer_atomic — admin rejects manual payment.
--   • booking_invoice_live_amount view — live display amounts for the customer.
--   • Full RLS policies for all new tables.
--
-- Migration constraints:
--   • Do NOT modify any prior migration file.
--   • No existing checkout table columns are removed.
--   • Landing fee is fixed at $25 (2500 cents) per landing, same as checkout.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 — CHECKOUT VDO: SINGLE READING
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1a. Add vdo_reading column to checkout_invoices ──────────────────────────
-- Nullable: new invoices will have a value, historical invoices will be NULL.
ALTER TABLE public.checkout_invoices
  ADD COLUMN IF NOT EXISTS vdo_reading numeric(10,1);

-- ── 1b. Replace complete_checkout_outcome_atomic ──────────────────────────────
-- Drop the current 10-param version (VDO start + end), replace with 9-param
-- version that uses a single vdo_reading parameter.

DROP FUNCTION IF EXISTS public.complete_checkout_outcome_atomic(
  uuid, uuid, numeric, numeric, text, jsonb, text, boolean, text, integer
);

-- Also clean up any 9-param predecessor from migration 045.
DROP FUNCTION IF EXISTS public.complete_checkout_outcome_atomic(
  uuid, uuid, numeric, numeric, text, jsonb, text, boolean, text
);

CREATE OR REPLACE FUNCTION public.complete_checkout_outcome_atomic(
  p_booking_id                   uuid,
  p_customer_id                  uuid,
  p_vdo_reading                  numeric(10,1),    -- billable duration (paper-sheet value)
  p_checkout_outcome             text,
  p_landing_charges              jsonb     DEFAULT NULL,
  p_admin_notes                  text      DEFAULT NULL,
  p_payment_waived               boolean   DEFAULT false,
  p_waiver_reason                text      DEFAULT NULL,
  p_checkout_rate_cents_per_hour integer   DEFAULT 29000
)
RETURNS TABLE (
  out_invoice_id             uuid,
  out_amount_due_now_cents   integer,
  out_final_booking_status   text,
  out_pilot_clearance_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking                RECORD;
  v_landing_rate_cents     integer  := 2500;   -- $25 per landing (fixed)
  v_vdo_hours              numeric(10,1);
  v_vdo_base_cents         integer;
  v_landing_subtotal_cents integer  := 0;
  v_final_amount_cents     integer;
  v_advance_balance        integer  := 0;
  v_advance_applied        integer  := 0;
  v_amount_due             integer;
  v_invoice_id             uuid;
  v_invoice_status         text;
  v_final_booking_status   text;
  v_clearance_status       text;
  v_invoice_number         text;
  v_landing                jsonb;
  v_airport_id             uuid;
  v_airport_count          integer;
  v_airport_active         boolean;
  v_unit_amount_cents      integer;
  v_unit_amount_cents      integer;
  v_existing_invoice       uuid;
BEGIN

  -- ── Auth check ────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- ── Auth check ────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- ── Idempotency guard ─────────────────────────────────────────────────────
  SELECT id INTO v_existing_invoice FROM checkout_invoices WHERE booking_id = p_booking_id;
  IF FOUND THEN
    RAISE EXCEPTION 'Invoice already exists for booking %', p_booking_id;
  END IF;

  -- ── Fetch and lock booking ────────────────────────────────────────────────
  SELECT id, status, booking_type, booking_owner_user_id, aircraft_id
  INTO v_booking
  FROM bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found: %', p_booking_id;
  END IF;
  IF v_booking.booking_type <> 'checkout' THEN
    RAISE EXCEPTION 'Booking is not a checkout booking';
  END IF;
  IF v_booking.status <> 'checkout_completed_under_review' THEN
    RAISE EXCEPTION 'Booking status must be checkout_completed_under_review, got: %', v_booking.status;
  END IF;
  IF v_booking.booking_owner_user_id <> p_customer_id THEN
    RAISE EXCEPTION 'Customer ID mismatch';
  END IF;

  -- ── Validate outcome value ────────────────────────────────────────────────
  IF p_checkout_outcome NOT IN (
    'cleared_to_fly', 'additional_supervised_time_required',
    'reschedule_required', 'not_currently_eligible'
  ) THEN
    RAISE EXCEPTION 'Invalid checkout outcome: %', p_checkout_outcome;
  END IF;

  -- ── Waiver validation ─────────────────────────────────────────────────────
  IF p_payment_waived AND p_checkout_outcome = 'cleared_to_fly' THEN
    RAISE EXCEPTION 'Payment cannot be waived for cleared_to_fly outcome';
  END IF;
  IF p_payment_waived AND (p_waiver_reason IS NULL OR trim(p_waiver_reason) = '') THEN
    RAISE EXCEPTION 'Waiver reason is required when payment is waived';
  END IF;

  -- ── VDO reading validation (payment path only) ────────────────────────────
  IF NOT p_payment_waived THEN
    IF p_vdo_reading IS NULL OR p_vdo_reading <= 0 THEN
      RAISE EXCEPTION 'VDO reading must be greater than 0';
    END IF;
    IF p_vdo_reading < 0.1 THEN
      RAISE EXCEPTION 'VDO reading must be at least 0.1 hours';
    END IF;
    IF p_vdo_reading > 5.0 THEN
      RAISE EXCEPTION 'VDO reading exceeds maximum of 5.0 hours';
    END IF;
  END IF;

  -- ── Landing charges validation ────────────────────────────────────────────
  IF p_landing_charges IS NULL OR jsonb_array_length(p_landing_charges) = 0 THEN
    RAISE EXCEPTION 'At least one landing airport is required';
  END IF;

  FOR v_landing IN SELECT * FROM jsonb_array_elements(p_landing_charges) LOOP
    v_airport_id    := (v_landing->>'airport_id')::uuid;
    v_airport_count := (v_landing->>'landing_count')::integer;
    IF v_airport_id IS NULL OR v_airport_count IS NULL OR v_airport_count < 1 THEN
      RAISE EXCEPTION 'Each landing row must have airport_id and landing_count >= 1';
    END IF;
    SELECT is_active, default_landing_fee_cents INTO v_airport_active, v_unit_amount_cents FROM airports WHERE id = v_airport_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Airport not found: %', v_airport_id;
    END IF;
    IF NOT v_airport_active THEN
      RAISE EXCEPTION 'Airport is not active: %', v_airport_id;
    END IF;
    v_landing_subtotal_cents := v_landing_subtotal_cents + (v_unit_amount_cents * v_airport_count);
  END LOOP;

  -- ── Billing calculation ───────────────────────────────────────────────────
  IF p_payment_waived THEN
    v_vdo_hours              := COALESCE(p_vdo_reading, 0);
    v_vdo_base_cents         := 0;
    v_final_amount_cents     := 0;
    v_advance_applied        := 0;
    v_amount_due             := 0;
    v_invoice_status         := 'waived';
    v_final_booking_status   := 'completed';
    v_clearance_status       := p_checkout_outcome;
  ELSE
    v_vdo_hours              := p_vdo_reading;
    v_vdo_base_cents         := ROUND(v_vdo_hours::numeric * p_checkout_rate_cents_per_hour)::integer;
    v_final_amount_cents     := v_vdo_base_cents + v_landing_subtotal_cents;

    -- Advisory lock to prevent credit double-spend
    PERFORM pg_advisory_xact_lock(hashtext('customer_credit:' || p_customer_id::text));

    SELECT balance_cents INTO v_advance_balance
    FROM customer_credit_balances WHERE customer_id = p_customer_id;
    v_advance_balance := COALESCE(v_advance_balance, 0);
    v_advance_applied := LEAST(v_advance_balance, v_final_amount_cents);
    v_amount_due      := v_final_amount_cents - v_advance_applied;

    IF v_amount_due = 0 THEN
      v_invoice_status       := 'paid';
      v_final_booking_status := 'completed';
      v_clearance_status     := p_checkout_outcome;
    ELSE
      v_invoice_status       := 'payment_required';
      v_final_booking_status := 'checkout_payment_required';
      v_clearance_status     := 'checkout_payment_required';
    END IF;
  END IF;

  -- ── Generate invoice number ───────────────────────────────────────────────
  v_invoice_number := 'CHK-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' ||
    upper(substring(p_booking_id::text, 1, 6));

  -- ── Insert checkout invoice ───────────────────────────────────────────────
  INSERT INTO checkout_invoices (
    customer_id, booking_id, invoice_number, invoice_type, status, currency,
    subtotal_cents, advance_applied_cents, stripe_amount_due_cents, total_paid_cents,
    vdo_reading, vdo_start_reading, vdo_end_reading,
    checkout_duration_hours, checkout_rate_cents_per_hour,
    checkout_calculated_amount_cents, checkout_landing_subtotal_cents,
    checkout_final_amount_cents, checkout_outcome, waiver_reason,
    checkout_completed_by, checkout_completed_at
  )
  VALUES (
    p_customer_id, p_booking_id, v_invoice_number, 'checkout',
    v_invoice_status, 'aud',
    v_final_amount_cents, v_advance_applied, v_amount_due, 0,
    p_vdo_reading, NULL, NULL,            -- new: vdo_reading stored; start/end now NULL
    v_vdo_hours, p_checkout_rate_cents_per_hour,
    v_vdo_base_cents, v_landing_subtotal_cents,
    v_final_amount_cents, p_checkout_outcome, p_waiver_reason,
    auth.uid(), now()
  )
  RETURNING id INTO v_invoice_id;

  -- ── Insert landing charges ────────────────────────────────────────────────
  FOR v_landing IN SELECT * FROM jsonb_array_elements(p_landing_charges) LOOP
    v_airport_id    := (v_landing->>'airport_id')::uuid;
    v_airport_count := (v_landing->>'landing_count')::integer;
    SELECT default_landing_fee_cents INTO v_unit_amount_cents FROM airports WHERE id = v_airport_id;
    INSERT INTO checkout_landing_charges (
      booking_id, airport_id, landing_count, unit_amount_cents, total_amount_cents
    ) VALUES (
      p_booking_id, v_airport_id, v_airport_count,
      v_unit_amount_cents, v_unit_amount_cents * v_airport_count
    );
  END LOOP;

  -- ── Debit credit if applied ───────────────────────────────────────────────
  IF v_advance_applied > 0 THEN
    INSERT INTO public.customer_payment_ledger (
      customer_id, booking_id, invoice_id, amount_cents, entry_type, note, created_by
    ) VALUES (
      p_customer_id, p_booking_id, v_invoice_id, -v_advance_applied, 'advance_applied',
      'Credit applied to checkout invoice', auth.uid()
    );
  END IF;

  -- ── Update booking ────────────────────────────────────────────────────────
  UPDATE bookings
  SET status      = v_final_booking_status,
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      updated_at  = now()
  WHERE id = p_booking_id;

  -- ── Update pilot clearance status ─────────────────────────────────────────
  UPDATE profiles
  SET pilot_clearance_status = v_clearance_status,
      updated_at             = now()
  WHERE id = p_customer_id;

  RETURN QUERY SELECT v_invoice_id, v_amount_due, v_final_booking_status, v_clearance_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_checkout_outcome_atomic(
  uuid, uuid, numeric, text, jsonb, text, boolean, text, integer
) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — STANDARD BOOKING BILLING TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 2a. booking_invoices ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.booking_invoices (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id                  uuid        NOT NULL
    REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_id                 uuid        NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,

  invoice_number              text        NOT NULL UNIQUE,
  status                      text        NOT NULL DEFAULT 'payment_required'
    CHECK (status IN ('payment_required', 'paid', 'void', 'failed')),

  currency                    text        NOT NULL DEFAULT 'aud',

  -- VDO-based billing
  vdo_reading                 numeric(10,1),            -- billable hours from paper sheet
  rate_cents_per_hour         integer     NOT NULL DEFAULT 29000,
  base_amount_cents           integer     NOT NULL DEFAULT 0,   -- vdo_reading × rate
  landing_subtotal_cents      integer     NOT NULL DEFAULT 0,
  subtotal_cents              integer     NOT NULL DEFAULT 0,   -- base + landings

  -- Credit applied at finalisation time
  advance_applied_cents       integer     NOT NULL DEFAULT 0,

  -- Payment amounts
  stripe_amount_due_cents     integer     NOT NULL DEFAULT 0,
  total_paid_cents            integer     NOT NULL DEFAULT 0,

  -- Stripe fields
  stripe_checkout_session_id  text,
  stripe_payment_intent_id    text,
  stripe_fee_rate_bps         integer,
  stripe_fee_fixed_cents      integer,
  stripe_gross_amount_cents   integer,
  online_payment_surcharge_cents integer,

  -- Payment method chosen by customer
  payment_method              text        CHECK (payment_method IN ('card', 'bank_transfer')),

  -- Timestamps & admin
  paid_at                     timestamptz,
  finalised_by                uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  finalised_at                timestamptz,
  admin_notes                 text,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_invoices_booking
  ON public.booking_invoices(booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_invoices_customer
  ON public.booking_invoices(customer_id);

-- Prevent duplicate invoices per booking
CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_invoices_booking
  ON public.booking_invoices(booking_id);

-- ── 2b. booking_landing_charges ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.booking_landing_charges (
  id                   uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_invoice_id   uuid    NOT NULL
    REFERENCES public.booking_invoices(id) ON DELETE CASCADE,
  booking_id           uuid    NOT NULL
    REFERENCES public.bookings(id) ON DELETE CASCADE,
  airport_id           uuid    NOT NULL
    REFERENCES public.airports(id) ON DELETE RESTRICT,
  landing_count        integer NOT NULL CHECK (landing_count > 0),
  unit_amount_cents    integer NOT NULL DEFAULT 2500,
  total_amount_cents   integer NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_landing_charges_invoice
  ON public.booking_landing_charges(booking_invoice_id);

CREATE INDEX IF NOT EXISTS idx_booking_landing_charges_booking
  ON public.booking_landing_charges(booking_id);

-- ── 2c. booking_bank_transfer_submissions ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.booking_bank_transfer_submissions (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id           uuid        NOT NULL
    REFERENCES public.booking_invoices(id) ON DELETE CASCADE,
  booking_id           uuid        NOT NULL
    REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_id          uuid        NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  reference            text,
  receipt_storage_path text        NOT NULL,
  status               text        NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'rejected')),
  admin_note           text,
  submitted_at         timestamptz NOT NULL DEFAULT now(),
  reviewed_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_bank_submissions_invoice
  ON public.booking_bank_transfer_submissions(invoice_id);

CREATE INDEX IF NOT EXISTS idx_booking_bank_submissions_booking
  ON public.booking_bank_transfer_submissions(booking_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3 — RLS POLICIES FOR NEW TABLES
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.booking_invoices                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_landing_charges          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_bank_transfer_submissions ENABLE ROW LEVEL SECURITY;

-- booking_invoices: customers read own, admins read/write all
CREATE POLICY "booking_invoices_customer_select"
  ON public.booking_invoices FOR SELECT
  USING (customer_id = auth.uid());

CREATE POLICY "booking_invoices_admin_all"
  ON public.booking_invoices FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- booking_landing_charges: customers read own (via invoice), admins all
CREATE POLICY "booking_landing_charges_customer_select"
  ON public.booking_landing_charges FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.booking_invoices bi
      WHERE bi.id = booking_landing_charges.booking_invoice_id
        AND bi.customer_id = auth.uid()
    )
  );

CREATE POLICY "booking_landing_charges_admin_all"
  ON public.booking_landing_charges FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- booking_bank_transfer_submissions: customers read/insert own, admins all
CREATE POLICY "booking_bank_submissions_customer_select"
  ON public.booking_bank_transfer_submissions FOR SELECT
  USING (customer_id = auth.uid());

CREATE POLICY "booking_bank_submissions_customer_insert"
  ON public.booking_bank_transfer_submissions FOR INSERT
  WITH CHECK (
    customer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.booking_invoices bi
      WHERE bi.id = booking_bank_transfer_submissions.invoice_id
        AND bi.customer_id = auth.uid()
    )
  );

CREATE POLICY "booking_bank_submissions_admin_all"
  ON public.booking_bank_transfer_submissions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4 — RPC FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 4a. finalise_standard_booking_invoice_atomic ─────────────────────────────
-- Called by admin after approving the post-flight review.
-- Creates the booking_invoices and booking_landing_charges rows.
-- Applies any available customer credit.
-- Transitions booking: post_flight_approved → payment_pending (or completed).

CREATE OR REPLACE FUNCTION public.finalise_standard_booking_invoice_atomic(
  p_booking_id          uuid,
  p_customer_id         uuid,
  p_vdo_reading         numeric(10,1),
  p_rate_cents_per_hour integer   DEFAULT 29000,
  p_landing_charges     jsonb     DEFAULT NULL,
  p_admin_notes         text      DEFAULT NULL
)
RETURNS TABLE (
  out_invoice_id           uuid,
  out_amount_due_now_cents integer,
  out_final_booking_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking                RECORD;
  v_landing_rate_cents     integer  := 2500;
  v_vdo_base_cents         integer;
  v_landing_subtotal_cents integer  := 0;
  v_subtotal_cents         integer;
  v_advance_balance        integer  := 0;
  v_advance_applied        integer  := 0;
  v_amount_due             integer;
  v_invoice_id             uuid;
  v_invoice_status         text;
  v_final_booking_status   text;
  v_invoice_number         text;
  v_landing                jsonb;
  v_airport_id             uuid;
  v_airport_count          integer;
  v_airport_active         boolean;
  v_unit_amount_cents      integer;
  v_unit_amount_cents      integer;
  v_existing_invoice       uuid;
BEGIN
  -- ── Idempotency guard ─────────────────────────────────────────────────────
  SELECT id INTO v_existing_invoice FROM booking_invoices WHERE booking_id = p_booking_id;
  IF FOUND THEN
    RAISE EXCEPTION 'Invoice already exists for booking %', p_booking_id;
  END IF;

  -- ── Validate VDO reading ──────────────────────────────────────────────────
  IF p_vdo_reading IS NULL OR p_vdo_reading <= 0 THEN
    RAISE EXCEPTION 'VDO reading must be greater than 0';
  END IF;
  IF p_vdo_reading < 0.1 THEN
    RAISE EXCEPTION 'VDO reading must be at least 0.1 hours';
  END IF;
  IF p_vdo_reading > 24.0 THEN
    RAISE EXCEPTION 'VDO reading exceeds maximum of 24.0 hours';
  END IF;

  IF p_rate_cents_per_hour IS NULL OR p_rate_cents_per_hour <= 0 THEN
    RAISE EXCEPTION 'Hourly rate must be a positive number';
  END IF;

  -- ── Fetch and lock booking ────────────────────────────────────────────────
  SELECT id, status, booking_type, booking_owner_user_id
  INTO v_booking
  FROM bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found: %', p_booking_id;
  END IF;
  IF v_booking.booking_type <> 'standard' THEN
    RAISE EXCEPTION 'Booking is not a standard booking';
  END IF;
  IF v_booking.status <> 'post_flight_approved' THEN
    RAISE EXCEPTION 'Booking status must be post_flight_approved, got: %', v_booking.status;
  END IF;
  IF v_booking.booking_owner_user_id <> p_customer_id THEN
    RAISE EXCEPTION 'Customer ID mismatch';
  END IF;

  -- ── Landing charges validation ────────────────────────────────────────────
  IF p_landing_charges IS NOT NULL AND jsonb_array_length(p_landing_charges) > 0 THEN
    FOR v_landing IN SELECT * FROM jsonb_array_elements(p_landing_charges) LOOP
      v_airport_id    := (v_landing->>'airport_id')::uuid;
      v_airport_count := (v_landing->>'landing_count')::integer;
      IF v_airport_id IS NULL OR v_airport_count IS NULL OR v_airport_count < 1 THEN
        RAISE EXCEPTION 'Each landing row must have airport_id and landing_count >= 1';
      END IF;
      SELECT is_active, default_landing_fee_cents INTO v_airport_active, v_unit_amount_cents FROM airports WHERE id = v_airport_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Airport not found: %', v_airport_id;
      END IF;
      IF NOT v_airport_active THEN
        RAISE EXCEPTION 'Airport is not active: %', v_airport_id;
      END IF;
      v_landing_subtotal_cents := v_landing_subtotal_cents
        + (v_unit_amount_cents * v_airport_count);
    END LOOP;
  END IF;

  -- ── Billing ───────────────────────────────────────────────────────────────
  v_vdo_base_cents     := ROUND(p_vdo_reading::numeric * p_rate_cents_per_hour)::integer;
  v_subtotal_cents     := v_vdo_base_cents + v_landing_subtotal_cents;

  -- Apply credit
  PERFORM pg_advisory_xact_lock(hashtext('customer_credit:' || p_customer_id::text));
  SELECT balance_cents INTO v_advance_balance
  FROM customer_credit_balances WHERE customer_id = p_customer_id;
  v_advance_balance := COALESCE(v_advance_balance, 0);
  v_advance_applied := LEAST(v_advance_balance, v_subtotal_cents);
  v_amount_due      := v_subtotal_cents - v_advance_applied;

  -- ── Booking/invoice status ────────────────────────────────────────────────
  IF v_amount_due = 0 THEN
    v_invoice_status       := 'paid';
    v_final_booking_status := 'completed';
  ELSE
    v_invoice_status       := 'payment_required';
    v_final_booking_status := 'payment_pending';
  END IF;

  -- ── Generate invoice number ───────────────────────────────────────────────
  v_invoice_number := 'BKINV-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' ||
    upper(substring(p_booking_id::text, 1, 6));

  -- ── Insert booking_invoices ───────────────────────────────────────────────
  INSERT INTO booking_invoices (
    booking_id, customer_id, invoice_number, status, currency,
    vdo_reading, rate_cents_per_hour, base_amount_cents,
    landing_subtotal_cents, subtotal_cents,
    advance_applied_cents, stripe_amount_due_cents, total_paid_cents,
    finalised_by, finalised_at, admin_notes
  )
  VALUES (
    p_booking_id, p_customer_id, v_invoice_number, v_invoice_status, 'aud',
    p_vdo_reading, p_rate_cents_per_hour, v_vdo_base_cents,
    v_landing_subtotal_cents, v_subtotal_cents,
    v_advance_applied, v_amount_due, 0,
    auth.uid(),
    now(), p_admin_notes
  )
  RETURNING id INTO v_invoice_id;

  -- ── Insert landing charges ────────────────────────────────────────────────
  IF p_landing_charges IS NOT NULL THEN
    FOR v_landing IN SELECT * FROM jsonb_array_elements(p_landing_charges) LOOP
      v_airport_id    := (v_landing->>'airport_id')::uuid;
      v_airport_count := (v_landing->>'landing_count')::integer;
      IF v_airport_id IS NOT NULL AND v_airport_count > 0 THEN
        SELECT default_landing_fee_cents INTO v_unit_amount_cents FROM airports WHERE id = v_airport_id;
        INSERT INTO booking_landing_charges (
          booking_invoice_id, booking_id, airport_id,
          landing_count, unit_amount_cents, total_amount_cents
        ) VALUES (
          v_invoice_id, p_booking_id, v_airport_id,
          v_airport_count, v_unit_amount_cents, v_unit_amount_cents * v_airport_count
        );
      END IF;
    END LOOP;
  END IF;

  -- ── Debit credit ──────────────────────────────────────────────────────────
  IF v_advance_applied > 0 THEN
    INSERT INTO public.customer_payment_ledger (
      customer_id, booking_id, invoice_id, amount_cents, entry_type, note, created_by
    ) VALUES (
      p_customer_id, p_booking_id, v_invoice_id, -v_advance_applied, 'advance_applied',
      'Credit applied to standard booking invoice', auth.uid()
    );
  END IF;

  -- ── Update booking ────────────────────────────────────────────────────────
  UPDATE bookings
  SET status      = v_final_booking_status,
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      updated_at  = now()
  WHERE id = p_booking_id;

  RETURN QUERY SELECT v_invoice_id, v_amount_due, v_final_booking_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalise_standard_booking_invoice_atomic(
  uuid, uuid, numeric, integer, jsonb, text
) TO authenticated;


-- ── 4b. prepare_booking_payment_atomic ───────────────────────────────────────
-- Called at payment button click time to apply any newly available credit,
-- compute Stripe surcharge, and return the authoritative charge amount.
-- Mirrors prepare_checkout_payment_atomic from migration 037/041.

CREATE OR REPLACE FUNCTION public.prepare_booking_payment_atomic(
  p_invoice_id       uuid,
  p_customer_id      uuid,
  p_fee_rate_bps     integer DEFAULT 170,
  p_fee_fixed_cents  integer DEFAULT 30,
  p_apply_surcharge  boolean DEFAULT true
)
RETURNS TABLE (
  out_final_amount_cents integer,
  out_invoice_status     text,
  out_settled_by_credit  boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice          RECORD;
  v_credit_balance   integer := 0;
  v_new_credit       integer := 0;
  v_base_due         integer;
  v_gross_amount     integer;
  v_surcharge_cents  integer := 0;
BEGIN
  -- ── Fetch and lock invoice ────────────────────────────────────────────────
  SELECT id, booking_id, customer_id, status, subtotal_cents,
         advance_applied_cents, stripe_amount_due_cents, total_paid_cents
  INTO v_invoice
  FROM booking_invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
  END IF;
  IF p_customer_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_invoice.customer_id <> p_customer_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Already paid — idempotent return
  IF v_invoice.status = 'paid' THEN
    RETURN QUERY SELECT 0, 'paid'::text, true;
    RETURN;
  END IF;

  IF v_invoice.status <> 'payment_required' THEN
    RAISE EXCEPTION 'Invoice is not in payment_required state: %', v_invoice.status;
  END IF;

  -- ── Re-apply credit (catch any new credit since finalisation) ─────────────
  PERFORM pg_advisory_xact_lock(hashtext('customer_credit:' || p_customer_id::text));
  SELECT balance_cents INTO v_credit_balance
  FROM customer_credit_balances WHERE customer_id = p_customer_id;
  v_credit_balance := COALESCE(v_credit_balance, 0);

  -- New credit = current balance (already reduced by advance at finalisation)
  v_new_credit := LEAST(v_credit_balance,
    v_invoice.subtotal_cents - v_invoice.advance_applied_cents);

  IF v_new_credit < 0 THEN v_new_credit := 0; END IF;

  v_base_due := v_invoice.subtotal_cents
    - v_invoice.advance_applied_cents
    - v_new_credit;

  IF v_base_due < 0 THEN v_base_due := 0; END IF;

  -- ── Credit settles the invoice ────────────────────────────────────────────
  IF v_base_due = 0 THEN
    IF v_new_credit > 0 THEN
      UPDATE booking_invoices
      SET advance_applied_cents = advance_applied_cents + v_new_credit,
          stripe_amount_due_cents = 0,
          updated_at = now()
      WHERE id = p_invoice_id;

      INSERT INTO public.customer_payment_ledger (
        customer_id, booking_id, invoice_id, amount_cents, entry_type, note, created_by
      ) VALUES (
        p_customer_id, v_invoice.booking_id, p_invoice_id, -v_new_credit, 'advance_applied',
        'Additional credit applied at payment time, settling invoice', auth.uid()
      );
    END IF;

    UPDATE booking_invoices
    SET status = 'paid', paid_at = now(), total_paid_cents = v_invoice.subtotal_cents,
        updated_at = now()
    WHERE id = p_invoice_id;

    UPDATE bookings SET status = 'completed', updated_at = now()
    WHERE id = v_invoice.booking_id;

    RETURN QUERY SELECT 0, 'paid'::text, true;
    RETURN;
  END IF;

  -- ── Compute surcharge ─────────────────────────────────────────────────────
  IF p_apply_surcharge THEN
    v_gross_amount  := CEIL(
      (v_base_due::numeric + p_fee_fixed_cents) / (1.0 - p_fee_rate_bps::numeric / 10000.0)
    )::integer;
    v_surcharge_cents := v_gross_amount - v_base_due;
  ELSE
    v_gross_amount    := v_base_due;
    v_surcharge_cents := 0;
  END IF;

  -- ── Update invoice with surcharge fields ──────────────────────────────────
  UPDATE booking_invoices
  SET advance_applied_cents         = advance_applied_cents + v_new_credit,
      stripe_amount_due_cents       = v_base_due,
      online_payment_surcharge_cents = v_surcharge_cents,
      stripe_fee_rate_bps           = p_fee_rate_bps,
      stripe_fee_fixed_cents        = p_fee_fixed_cents,
      stripe_gross_amount_cents     = v_gross_amount,
      updated_at                    = now()
  WHERE id = p_invoice_id;

  IF v_new_credit > 0 THEN
    INSERT INTO public.customer_payment_ledger (
      customer_id, booking_id, invoice_id, amount_cents, entry_type, note, created_by
    ) VALUES (
      p_customer_id, v_invoice.booking_id, p_invoice_id, -v_new_credit, 'advance_applied',
      'Additional credit applied at payment time', auth.uid()
    );
  END IF;

  RETURN QUERY SELECT v_gross_amount, 'payment_required'::text, false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.prepare_booking_payment_atomic(
  uuid, uuid, integer, integer, boolean
) TO authenticated;


-- ── 4c. mark_booking_invoice_paid_atomic ─────────────────────────────────────
-- Idempotent. Called by the Stripe webhook (service role).
-- Marks the invoice paid and transitions the booking to completed.

CREATE OR REPLACE FUNCTION public.mark_booking_invoice_paid_atomic(
  p_invoice_id                  uuid,
  p_stripe_payment_intent_id    text,
  p_stripe_checkout_session_id  text,
  p_amount_paid_cents           integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
BEGIN
  SELECT id, booking_id, customer_id, status
  INTO v_invoice
  FROM booking_invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
  END IF;

  -- Idempotent: already paid is a success
  IF v_invoice.status = 'paid' THEN
    -- Repair booking if needed
    UPDATE bookings SET status = 'completed', updated_at = now()
    WHERE id = v_invoice.booking_id AND status <> 'completed';
    RETURN;
  END IF;

  UPDATE booking_invoices
  SET status                       = 'paid',
      stripe_payment_intent_id     = p_stripe_payment_intent_id,
      stripe_checkout_session_id   = p_stripe_checkout_session_id,
      total_paid_cents             = p_amount_paid_cents,
      paid_at                      = now(),
      updated_at                   = now()
  WHERE id = p_invoice_id;

  UPDATE bookings
  SET status     = 'completed',
      updated_at = now()
  WHERE id = v_invoice.booking_id;
END;
$$;

-- Webhook uses service role — no GRANT to authenticated needed.
REVOKE EXECUTE ON FUNCTION public.mark_booking_invoice_paid_atomic(uuid, text, text, integer) FROM PUBLIC;


-- ── 4d. approve_standard_bank_transfer_atomic ────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_standard_bank_transfer_atomic(
  p_submission_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub     RECORD;
  v_invoice RECORD;
BEGIN
  -- ── Auth check ────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT id, invoice_id, booking_id, customer_id, status
  INTO v_sub
  FROM booking_bank_transfer_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found: %', p_submission_id;
  END IF;
  IF v_sub.status <> 'pending_review' THEN
    RAISE EXCEPTION 'Submission is not pending review: %', v_sub.status;
  END IF;

  -- Lock invoice
  SELECT id, status, subtotal_cents FROM booking_invoices
  WHERE id = v_sub.invoice_id FOR UPDATE
  INTO v_invoice;

  -- ── Auth check ────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  UPDATE booking_bank_transfer_submissions
  SET status = 'approved', reviewed_at = now(), updated_at = now()
  WHERE id = p_submission_id;

  UPDATE booking_invoices
  SET status           = 'paid',
      payment_method   = 'bank_transfer',
      total_paid_cents = subtotal_cents - advance_applied_cents,
      paid_at          = now(),
      updated_at       = now()
  WHERE id = v_sub.invoice_id;

  UPDATE bookings
  SET status = 'completed', updated_at = now()
  WHERE id = v_sub.booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_standard_bank_transfer_atomic(uuid) TO authenticated;


-- ── 4e. reject_standard_bank_transfer_atomic ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.reject_standard_bank_transfer_atomic(
  p_submission_id uuid,
  p_admin_note    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE booking_bank_transfer_submissions
  SET status      = 'rejected',
      admin_note  = p_admin_note,
      reviewed_at = now(),
      updated_at  = now()
  WHERE id = p_submission_id AND status = 'pending_review';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found or not in pending_review state: %', p_submission_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_standard_bank_transfer_atomic(uuid, text) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 5 — LIVE AMOUNT VIEW
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.booking_invoice_live_amount AS
SELECT
  bi.id,
  bi.booking_id,
  bi.customer_id,
  bi.invoice_number,
  bi.status,
  bi.vdo_reading,
  bi.rate_cents_per_hour,
  bi.base_amount_cents,
  bi.landing_subtotal_cents,
  bi.subtotal_cents,
  bi.advance_applied_cents,
  bi.stripe_amount_due_cents,
  bi.total_paid_cents,
  bi.payment_method,
  bi.online_payment_surcharge_cents,
  bi.stripe_gross_amount_cents,
  bi.paid_at,
  bi.admin_notes,
  bi.created_at,
  bi.updated_at,
  -- Live amount due (subtracts any additional credit earned since finalisation)
  GREATEST(
    bi.subtotal_cents
    - bi.advance_applied_cents
    - COALESCE(ccb.balance_cents, 0),
    0
  ) AS display_amount_due_cents
FROM public.booking_invoices bi
LEFT JOIN public.customer_credit_balances ccb ON ccb.customer_id = bi.customer_id;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 6 — RELOAD POSTGREST SCHEMA CACHE
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

COMMIT;
