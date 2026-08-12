-- 118_release_schedule_blocks_on_booking_completed.sql
--
-- Bug: standard bookings that reach `completed` (mark paid / waive / credit /
-- Stripe / bank-transfer approve) left related schedule_blocks as `active`.
-- Availability and the admin calendar key off active blocks, so completed
-- flights kept blocking rebooking of the same slot.
--
-- Checkout already cancels related blocks on outcome. Mirror that for standard
-- billing completion paths, and backfill orphan active blocks.

BEGIN;

CREATE OR REPLACE FUNCTION public.release_related_schedule_blocks(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_booking_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.schedule_blocks
  SET status = 'cancelled',
      updated_at = now()
  WHERE related_booking_id = p_booking_id
    AND status = 'active';
END;
$$;

REVOKE ALL ON FUNCTION public.release_related_schedule_blocks(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_related_schedule_blocks(uuid) TO service_role;

-- ── mark_booking_invoice_paid_atomic ─────────────────────────────────────────
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
    UPDATE bookings SET status = 'completed', updated_at = now()
    WHERE id = v_invoice.booking_id AND status <> 'completed';
    PERFORM public.release_related_schedule_blocks(v_invoice.booking_id);
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

  PERFORM public.release_related_schedule_blocks(v_invoice.booking_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_booking_invoice_paid_atomic(uuid, text, text, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mark_booking_invoice_paid_atomic(uuid, text, text, integer) TO service_role;

-- ── approve_standard_bank_transfer_atomic ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_standard_bank_transfer_atomic(
  p_submission_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
  v_invoice RECORD;
  v_caller_id uuid := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT id, invoice_id, booking_id, customer_id, status, submitted_at, created_at
  INTO v_sub
  FROM public.booking_bank_transfer_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found: %', p_submission_id;
  END IF;
  IF v_sub.status <> 'pending_review' THEN
    RAISE EXCEPTION 'Submission is not pending review: %', v_sub.status;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.booking_bank_transfer_submissions s
    WHERE s.invoice_id = v_sub.invoice_id
      AND (
        COALESCE(s.submitted_at, s.created_at, '-infinity'::timestamptz),
        COALESCE(s.created_at, s.submitted_at, '-infinity'::timestamptz),
        s.id
      ) > (
        COALESCE(v_sub.submitted_at, v_sub.created_at, '-infinity'::timestamptz),
        COALESCE(v_sub.created_at, v_sub.submitted_at, '-infinity'::timestamptz),
        v_sub.id
      )
  ) THEN
    RAISE EXCEPTION 'A newer submission exists for this invoice and must be reviewed instead.';
  END IF;

  SELECT id, status, subtotal_cents, advance_applied_cents
  INTO v_invoice
  FROM public.booking_invoices
  WHERE id = v_sub.invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found: %', v_sub.invoice_id;
  END IF;
  IF v_invoice.status NOT IN ('payment_required', 'bank_transfer_pending_review') THEN
    RAISE EXCEPTION 'Invoice is not awaiting payment review: %', v_invoice.status;
  END IF;

  UPDATE public.booking_bank_transfer_submissions
  SET status = 'approved',
      reviewed_by = v_caller_id,
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_submission_id;

  UPDATE public.booking_invoices
  SET status = 'paid',
      payment_method = 'bank_transfer',
      total_paid_cents = subtotal_cents - advance_applied_cents,
      paid_at = now(),
      updated_at = now()
  WHERE id = v_sub.invoice_id;

  INSERT INTO public.customer_payment_ledger (
    customer_id,
    booking_id,
    invoice_id,
    invoice_source_type,
    amount_cents,
    entry_type,
    payment_method,
    note,
    created_by
  ) VALUES (
    v_sub.customer_id,
    v_sub.booking_id,
    v_sub.invoice_id,
    'booking',
    v_invoice.subtotal_cents - v_invoice.advance_applied_cents,
    'bank_transfer',
    'bank_transfer',
    'Bank transfer approved by admin',
    v_caller_id
  );

  UPDATE public.bookings
  SET status = 'completed', updated_at = now()
  WHERE id = v_sub.booking_id;

  PERFORM public.release_related_schedule_blocks(v_sub.booking_id);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_standard_bank_transfer_atomic(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_standard_bank_transfer_atomic(uuid) TO authenticated;

-- ── finalise_standard_booking_invoice_atomic ─────────────────────────────────
-- When credit covers the full invoice the booking goes straight to completed;
-- release blocks in that path. payment_pending keeps blocks until paid.
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
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT id INTO v_existing_invoice FROM booking_invoices WHERE booking_id = p_booking_id;
  IF FOUND THEN
    RAISE EXCEPTION 'Invoice already exists for booking %', p_booking_id;
  END IF;

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
  IF v_booking.status <> 'pending_post_flight_review' THEN
    RAISE EXCEPTION 'Booking status must be pending_post_flight_review, got: %', v_booking.status;
  END IF;
  IF v_booking.booking_owner_user_id <> p_customer_id THEN
    RAISE EXCEPTION 'Customer ID mismatch';
  END IF;

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
      v_landing_subtotal_cents := v_landing_subtotal_cents + (v_unit_amount_cents * v_airport_count);
    END LOOP;
  END IF;

  v_vdo_base_cents := ROUND(p_vdo_reading::numeric * p_rate_cents_per_hour)::integer;
  v_subtotal_cents := v_vdo_base_cents + v_landing_subtotal_cents;

  PERFORM pg_advisory_xact_lock(hashtext('customer_credit:' || p_customer_id::text));
  SELECT balance_cents INTO v_advance_balance
  FROM customer_credit_balances WHERE customer_id = p_customer_id;
  v_advance_balance := COALESCE(v_advance_balance, 0);
  v_advance_applied := LEAST(v_advance_balance, v_subtotal_cents);
  v_amount_due := v_subtotal_cents - v_advance_applied;

  IF v_amount_due = 0 THEN
    v_invoice_status := 'paid';
    v_final_booking_status := 'completed';
  ELSE
    v_invoice_status := 'payment_required';
    v_final_booking_status := 'payment_pending';
  END IF;

  v_invoice_number := 'BKINV-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' ||
    upper(substring(p_booking_id::text, 1, 6));

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

  IF p_landing_charges IS NOT NULL THEN
    FOR v_landing IN SELECT * FROM jsonb_array_elements(p_landing_charges) LOOP
      v_airport_id := (v_landing->>'airport_id')::uuid;
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

  IF v_advance_applied > 0 THEN
    INSERT INTO public.customer_payment_ledger (
      customer_id, booking_id, invoice_id, invoice_source_type,
      amount_cents, entry_type, note, created_by
    ) VALUES (
      p_customer_id, p_booking_id, v_invoice_id, 'booking',
      -v_advance_applied, 'advance_applied',
      'Credit applied to standard booking invoice', auth.uid()
    );
  END IF;

  UPDATE bookings
  SET status = v_final_booking_status,
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      updated_at = now()
  WHERE id = p_booking_id;

  IF v_final_booking_status = 'completed' THEN
    PERFORM public.release_related_schedule_blocks(p_booking_id);
  END IF;

  RETURN QUERY SELECT v_invoice_id, v_amount_due, v_final_booking_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalise_standard_booking_invoice_atomic(
  uuid, uuid, numeric, integer, jsonb, text
) TO authenticated;

-- Backfill: completed / cancelled / no_show bookings must not keep active holds.
UPDATE public.schedule_blocks sb
SET status = 'cancelled',
    updated_at = now()
FROM public.bookings b
WHERE sb.related_booking_id = b.id
  AND sb.status = 'active'
  AND b.status IN ('completed', 'cancelled', 'no_show');

COMMIT;
