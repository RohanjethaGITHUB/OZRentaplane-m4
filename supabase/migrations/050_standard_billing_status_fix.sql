-- ─────────────────────────────────────────────────────────────────────────────
-- 050_standard_billing_status_fix.sql
--
-- The finalise_standard_booking_invoice_atomic RPC in migration 049 was
-- written expecting the booking to be in status 'post_flight_approved'.
-- However, after a customer submits flight records via submitFlightRecord(),
-- the booking moves to 'pending_post_flight_review' — not 'post_flight_approved'.
-- post_flight_approved was an intermediate step that is no longer in the flow:
-- the new flow is:
--
--   pending_post_flight_review
--     → admin opens billing panel (AdminStandardBillingPanel)
--     → admin finalises billing
--     → payment_pending  (or completed if credit settles all)
--
-- This migration replaces the RPC to accept 'pending_post_flight_review'
-- as the required input status.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Drop the existing 6-param version from migration 049
DROP FUNCTION IF EXISTS public.finalise_standard_booking_invoice_atomic(
  uuid, uuid, numeric, integer, jsonb, text
);

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
  v_existing_invoice       uuid;
BEGIN
  -- ── Auth check ─────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- ── Idempotency guard ──────────────────────────────────────────────────────
  SELECT id INTO v_existing_invoice FROM booking_invoices WHERE booking_id = p_booking_id;
  IF FOUND THEN
    RAISE EXCEPTION 'Invoice already exists for booking %', p_booking_id;
  END IF;

  -- ── Validate VDO reading ───────────────────────────────────────────────────
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

  -- ── Fetch and lock booking ─────────────────────────────────────────────────
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
  -- Accept pending_post_flight_review (customer just submitted) as the valid
  -- input state. post_flight_approved is no longer required.
  IF v_booking.status <> 'pending_post_flight_review' THEN
    RAISE EXCEPTION 'Booking status must be pending_post_flight_review, got: %', v_booking.status;
  END IF;
  IF v_booking.booking_owner_user_id <> p_customer_id THEN
    RAISE EXCEPTION 'Customer ID mismatch';
  END IF;

  -- ── Landing charges validation ─────────────────────────────────────────────
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

  -- ── Billing ────────────────────────────────────────────────────────────────
  v_vdo_base_cents     := ROUND(p_vdo_reading::numeric * p_rate_cents_per_hour)::integer;
  v_subtotal_cents     := v_vdo_base_cents + v_landing_subtotal_cents;

  -- Apply credit
  PERFORM pg_advisory_xact_lock(hashtext('customer_credit:' || p_customer_id::text));
  SELECT balance_cents INTO v_advance_balance
  FROM customer_credit_balances WHERE customer_id = p_customer_id;
  v_advance_balance := COALESCE(v_advance_balance, 0);
  v_advance_applied := LEAST(v_advance_balance, v_subtotal_cents);
  v_amount_due      := v_subtotal_cents - v_advance_applied;

  -- ── Booking/invoice status ─────────────────────────────────────────────────
  IF v_amount_due = 0 THEN
    v_invoice_status       := 'paid';
    v_final_booking_status := 'completed';
  ELSE
    v_invoice_status       := 'payment_required';
    v_final_booking_status := 'payment_pending';
  END IF;

  -- ── Generate invoice number ────────────────────────────────────────────────
  v_invoice_number := 'BKINV-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' ||
    upper(substring(p_booking_id::text, 1, 6));

  -- ── Insert booking_invoices ────────────────────────────────────────────────
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

  -- ── Insert landing charges ─────────────────────────────────────────────────
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

  -- ── Debit credit ───────────────────────────────────────────────────────────
  IF v_advance_applied > 0 THEN
    INSERT INTO public.customer_payment_ledger (
      customer_id, booking_id, invoice_id, amount_cents, entry_type, note, created_by
    ) VALUES (
      p_customer_id, p_booking_id, v_invoice_id, -v_advance_applied, 'advance_applied',
      'Credit applied to standard booking invoice', auth.uid()
    );
  END IF;

  -- ── Update booking ─────────────────────────────────────────────────────────
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

COMMIT;
