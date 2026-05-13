-- 064_fix_checkout_outcome_canonicalization.sql
-- Ensures checkout outcome submission path is fully canonicalized to:
--   cleared_to_fly
--   additional_checkout_required
--   checkout_reschedule_required
--   not_currently_eligible
--
-- This migration:
-- 1) Backfills legacy stored values.
-- 2) Reasserts DB constraints.
-- 3) Replaces complete_checkout_outcome_atomic with canonical allowlist.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Backfill legacy values in persisted data (defensive)
-- ---------------------------------------------------------------------------
UPDATE public.profiles
SET pilot_clearance_status = 'additional_checkout_required'
WHERE pilot_clearance_status = 'additional_supervised_time_required';

UPDATE public.profiles
SET pilot_clearance_status = 'checkout_reschedule_required'
WHERE pilot_clearance_status = 'reschedule_required';

UPDATE public.checkout_invoices
SET checkout_outcome = 'additional_checkout_required'
WHERE checkout_outcome = 'additional_supervised_time_required';

UPDATE public.checkout_invoices
SET checkout_outcome = 'checkout_reschedule_required'
WHERE checkout_outcome = 'reschedule_required';

-- ---------------------------------------------------------------------------
-- 2) Reassert constraints with canonical values
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_pilot_clearance_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pilot_clearance_status_check
  CHECK (pilot_clearance_status IN (
    'checkout_required',
    'checkout_requested',
    'checkout_confirmed',
    'checkout_completed_under_review',
    'checkout_payment_required',
    'cleared_to_fly',
    'additional_checkout_required',
    'checkout_reschedule_required',
    'not_currently_eligible'
  ));

ALTER TABLE public.checkout_invoices
  DROP CONSTRAINT IF EXISTS valid_checkout_outcome;

ALTER TABLE public.checkout_invoices
  ADD CONSTRAINT valid_checkout_outcome
  CHECK (
    checkout_outcome IS NULL OR checkout_outcome IN (
      'cleared_to_fly',
      'additional_checkout_required',
      'checkout_reschedule_required',
      'not_currently_eligible'
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Recreate checkout outcome RPC with canonical allowlist
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.complete_checkout_outcome_atomic(
  uuid, uuid, numeric, numeric, text, jsonb, text, boolean, text, integer
);

DROP FUNCTION IF EXISTS public.complete_checkout_outcome_atomic(
  uuid, uuid, numeric, numeric, text, jsonb, text, boolean, text
);

CREATE OR REPLACE FUNCTION public.complete_checkout_outcome_atomic(
  p_booking_id                   uuid,
  p_customer_id                  uuid,
  p_vdo_reading                  numeric(10,1),
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
  v_existing_invoice       uuid;
BEGIN

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT id INTO v_existing_invoice FROM checkout_invoices WHERE booking_id = p_booking_id;
  IF FOUND THEN
    RAISE EXCEPTION 'Invoice already exists for booking %', p_booking_id;
  END IF;

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

  IF p_checkout_outcome NOT IN (
    'cleared_to_fly', 'additional_checkout_required',
    'checkout_reschedule_required', 'not_currently_eligible'
  ) THEN
    RAISE EXCEPTION 'Invalid checkout outcome: %', p_checkout_outcome;
  END IF;

  IF p_payment_waived AND p_checkout_outcome = 'cleared_to_fly' THEN
    RAISE EXCEPTION 'Payment cannot be waived for cleared_to_fly outcome';
  END IF;
  IF p_payment_waived AND (p_waiver_reason IS NULL OR trim(p_waiver_reason) = '') THEN
    RAISE EXCEPTION 'Waiver reason is required when payment is waived';
  END IF;

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

  v_invoice_number := 'CHK-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' ||
    upper(substring(p_booking_id::text, 1, 6));

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
    p_vdo_reading, NULL, NULL,
    v_vdo_hours, p_checkout_rate_cents_per_hour,
    v_vdo_base_cents, v_landing_subtotal_cents,
    v_final_amount_cents, p_checkout_outcome, p_waiver_reason,
    auth.uid(), now()
  )
  RETURNING id INTO v_invoice_id;

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

  IF v_advance_applied > 0 THEN
    INSERT INTO public.customer_payment_ledger (
      customer_id, booking_id, invoice_id, amount_cents, entry_type, note, created_by
    ) VALUES (
      p_customer_id, p_booking_id, v_invoice_id, -v_advance_applied, 'advance_applied',
      'Credit applied to checkout invoice', auth.uid()
    );
  END IF;

  UPDATE bookings
  SET status      = v_final_booking_status,
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      updated_at  = now()
  WHERE id = p_booking_id;

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

COMMIT;
