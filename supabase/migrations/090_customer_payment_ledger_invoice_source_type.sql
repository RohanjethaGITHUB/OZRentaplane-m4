BEGIN;

ALTER TABLE public.customer_payment_ledger
  DROP CONSTRAINT IF EXISTS fk_ledger_invoice;

ALTER TABLE public.customer_payment_ledger
  ADD COLUMN IF NOT EXISTS invoice_source_type text;

DO $$
BEGIN
  ALTER TABLE public.customer_payment_ledger
    ADD CONSTRAINT customer_payment_ledger_invoice_source_type_check
    CHECK (invoice_source_type IN ('checkout', 'booking'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

UPDATE public.customer_payment_ledger cpl
SET invoice_source_type = 'checkout'
FROM public.checkout_invoices ci
WHERE cpl.invoice_id = ci.id
  AND cpl.invoice_source_type IS NULL;

UPDATE public.customer_payment_ledger cpl
SET invoice_source_type = 'booking'
FROM public.booking_invoices bi
WHERE cpl.invoice_id = bi.id
  AND cpl.invoice_source_type IS NULL;

DO $$
DECLARE
  v_unmatched integer;
BEGIN
  SELECT count(*)
  INTO v_unmatched
  FROM public.customer_payment_ledger
  WHERE invoice_id IS NOT NULL
    AND invoice_source_type IS NULL;

  IF v_unmatched > 0 THEN
    RAISE WARNING
      'customer_payment_ledger backfill left % rows with invoice_id but no invoice_source_type',
      v_unmatched;
  END IF;
END
$$;

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
  v_landing_rate_cents     integer  := 2895;
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

  RETURN QUERY SELECT v_invoice_id, v_amount_due, v_final_booking_status;
END;
$$;

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

  IF v_invoice.status = 'paid' THEN
    RETURN QUERY SELECT 0, 'paid'::text, true;
    RETURN;
  END IF;

  IF v_invoice.status <> 'payment_required' THEN
    RAISE EXCEPTION 'Invoice is not in payment_required state: %', v_invoice.status;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('customer_credit:' || p_customer_id::text));
  SELECT balance_cents INTO v_credit_balance
  FROM customer_credit_balances WHERE customer_id = p_customer_id;
  v_credit_balance := COALESCE(v_credit_balance, 0);

  v_new_credit := LEAST(v_credit_balance,
    v_invoice.subtotal_cents - v_invoice.advance_applied_cents);

  IF v_new_credit < 0 THEN v_new_credit := 0; END IF;

  v_base_due := v_invoice.subtotal_cents
    - v_invoice.advance_applied_cents
    - v_new_credit;

  IF v_base_due < 0 THEN v_base_due := 0; END IF;

  IF v_base_due = 0 THEN
    IF v_new_credit > 0 THEN
      UPDATE booking_invoices
      SET advance_applied_cents = advance_applied_cents + v_new_credit,
          stripe_amount_due_cents = 0,
          updated_at = now()
      WHERE id = p_invoice_id;

      INSERT INTO public.customer_payment_ledger (
        customer_id, booking_id, invoice_id, invoice_source_type,
        amount_cents, entry_type, note, created_by
      ) VALUES (
        p_customer_id, v_invoice.booking_id, p_invoice_id, 'booking',
        -v_new_credit, 'advance_applied',
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

  IF p_apply_surcharge THEN
    v_gross_amount := CEIL(
      (v_base_due::numeric + p_fee_fixed_cents) / (1.0 - p_fee_rate_bps::numeric / 10000.0)
    )::integer;
    v_surcharge_cents := v_gross_amount - v_base_due;
  ELSE
    v_gross_amount := v_base_due;
    v_surcharge_cents := 0;
  END IF;

  UPDATE booking_invoices
  SET advance_applied_cents = advance_applied_cents + v_new_credit,
      stripe_amount_due_cents = v_base_due,
      online_payment_surcharge_cents = v_surcharge_cents,
      stripe_fee_rate_bps = p_fee_rate_bps,
      stripe_fee_fixed_cents = p_fee_fixed_cents,
      stripe_gross_amount_cents = v_gross_amount,
      updated_at = now()
  WHERE id = p_invoice_id;

  IF v_new_credit > 0 THEN
    INSERT INTO public.customer_payment_ledger (
      customer_id, booking_id, invoice_id, invoice_source_type,
      amount_cents, entry_type, note, created_by
    ) VALUES (
      p_customer_id, v_invoice.booking_id, p_invoice_id, 'booking',
      -v_new_credit, 'advance_applied',
      'Additional credit applied at payment time', auth.uid()
    );
  END IF;

  RETURN QUERY SELECT v_gross_amount, 'payment_required'::text, false;
END;
$$;

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
    v_airport_id := (v_landing->>'airport_id')::uuid;
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
    v_vdo_hours := COALESCE(p_vdo_reading, 0);
    v_vdo_base_cents := 0;
    v_final_amount_cents := 0;
    v_advance_applied := 0;
    v_amount_due := 0;
    v_invoice_status := 'waived';
    v_final_booking_status := 'completed';
    v_clearance_status := p_checkout_outcome;
  ELSE
    v_vdo_hours := p_vdo_reading;
    v_vdo_base_cents := ROUND(v_vdo_hours::numeric * p_checkout_rate_cents_per_hour)::integer;
    v_final_amount_cents := v_vdo_base_cents + v_landing_subtotal_cents;

    PERFORM pg_advisory_xact_lock(hashtext('customer_credit:' || p_customer_id::text));

    SELECT balance_cents INTO v_advance_balance
    FROM customer_credit_balances WHERE customer_id = p_customer_id;
    v_advance_balance := COALESCE(v_advance_balance, 0);
    v_advance_applied := LEAST(v_advance_balance, v_final_amount_cents);
    v_amount_due := v_final_amount_cents - v_advance_applied;

    IF v_amount_due = 0 THEN
      v_invoice_status := 'paid';
      v_final_booking_status := 'completed';
      v_clearance_status := p_checkout_outcome;
    ELSE
      v_invoice_status := 'payment_required';
      v_final_booking_status := 'checkout_payment_required';
      v_clearance_status := 'checkout_payment_required';
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
    v_airport_id := (v_landing->>'airport_id')::uuid;
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
      customer_id, booking_id, invoice_id, invoice_source_type,
      amount_cents, entry_type, note, created_by
    ) VALUES (
      p_customer_id, p_booking_id, v_invoice_id, 'checkout',
      -v_advance_applied, 'advance_applied',
      'Credit applied to checkout invoice', auth.uid()
    );
  END IF;

  UPDATE bookings
  SET status = v_final_booking_status,
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      updated_at = now()
  WHERE id = p_booking_id;

  UPDATE profiles
  SET pilot_clearance_status = v_clearance_status,
      updated_at = now()
  WHERE id = p_customer_id;

  RETURN QUERY SELECT v_invoice_id, v_amount_due, v_final_booking_status, v_clearance_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_checkout_payment_atomic(
  p_invoice_id      uuid,
  p_customer_id     uuid,
  p_fee_rate_bps    integer DEFAULT 170,
  p_fee_fixed_cents integer DEFAULT 30,
  p_apply_surcharge boolean DEFAULT true
)
RETURNS TABLE (
  out_final_amount_cents integer,
  out_invoice_status     text,
  out_settled_by_credit  boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invoice            record;
  v_balance_cents      integer := 0;
  v_remaining_cents    integer := 0;
  v_additional_credit  integer := 0;
  v_final_amount_cents integer := 0;
  v_surcharge_cents    integer := 0;
  v_gross_amount_cents integer := 0;
BEGIN
  IF auth.uid() != p_customer_id THEN
    RAISE EXCEPTION 'Unauthorized: invoice does not belong to this user';
  END IF;

  SELECT * INTO v_invoice FROM public.checkout_invoices
  WHERE id = p_invoice_id AND customer_id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found: %', p_invoice_id; END IF;

  IF v_invoice.status = 'paid' THEN
    RETURN QUERY SELECT 0::integer, 'paid'::text, true; RETURN;
  END IF;

  IF v_invoice.status NOT IN ('payment_required') THEN
    RAISE EXCEPTION 'Invoice is not in payment_required state (status: %)', v_invoice.status;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_customer_id::text));

  SELECT COALESCE(balance_cents, 0) INTO v_balance_cents
  FROM public.customer_credit_balances WHERE customer_id = p_customer_id;
  v_balance_cents := GREATEST(COALESCE(v_balance_cents, 0), 0);

  v_remaining_cents := GREATEST(v_invoice.subtotal_cents - v_invoice.advance_applied_cents - v_invoice.total_paid_cents, 0);
  v_additional_credit := GREATEST(LEAST(v_balance_cents, v_remaining_cents), 0);
  v_final_amount_cents := GREATEST(v_remaining_cents - v_additional_credit, 0);

  IF v_additional_credit > 0 THEN
    UPDATE public.checkout_invoices
    SET advance_applied_cents = advance_applied_cents + v_additional_credit, updated_at = now()
    WHERE id = p_invoice_id;

    INSERT INTO public.customer_payment_ledger (
      customer_id, booking_id, invoice_id, invoice_source_type,
      amount_cents, entry_type, note, created_by
    ) VALUES (
      p_customer_id, v_invoice.booking_id, p_invoice_id, 'checkout',
      -v_additional_credit, 'advance_applied',
      'Additional credit applied at payment time', p_customer_id
    );
  END IF;

  IF v_final_amount_cents > 0 AND p_apply_surcharge THEN
    v_gross_amount_cents := ceil((v_final_amount_cents + p_fee_fixed_cents) / (1.0 - (p_fee_rate_bps / 10000.0)))::integer;
    v_surcharge_cents := v_gross_amount_cents - v_final_amount_cents;
  ELSE
    v_gross_amount_cents := v_final_amount_cents;
    v_surcharge_cents := 0;
  END IF;

  IF v_final_amount_cents = 0 THEN
    UPDATE public.checkout_invoices
    SET status = 'paid', paid_at = now(), stripe_amount_due_cents = 0,
        payment_method = 'account_credit', updated_at = now()
    WHERE id = p_invoice_id;
    UPDATE public.bookings SET status = 'completed', updated_at = now() WHERE id = v_invoice.booking_id;
    UPDATE public.profiles SET pilot_clearance_status = v_invoice.checkout_outcome, updated_at = now()
    WHERE id = p_customer_id;
    INSERT INTO public.verification_events (user_id, actor_role, event_type, title, body, is_read, email_status)
    VALUES (p_customer_id, 'system', 'approved',
      'Checkout invoice settled using account credit',
      'Your checkout invoice has been fully settled using your account credit. Your pilot status has been updated.',
      false, 'skipped');
    RETURN QUERY SELECT 0::integer, 'paid'::text, true; RETURN;
  END IF;

  UPDATE public.checkout_invoices
  SET
    stripe_amount_due_cents = v_final_amount_cents,
    online_payment_surcharge_cents = v_surcharge_cents,
    stripe_fee_rate_bps = p_fee_rate_bps,
    stripe_fee_fixed_cents = p_fee_fixed_cents,
    stripe_gross_amount_cents = v_gross_amount_cents,
    updated_at = now()
  WHERE id = p_invoice_id;

  RETURN QUERY SELECT v_gross_amount_cents, 'payment_required'::text, false;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_checkout_invoice_paid_atomic(
  p_invoice_id                 uuid,
  p_stripe_payment_intent_id   text,
  p_stripe_checkout_session_id text,
  p_amount_paid_cents          integer
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invoice        record;
  v_booking_status text;
  v_clearance      text;
  v_base_amount    integer;
BEGIN
  SELECT * INTO v_invoice FROM public.checkout_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found: %', p_invoice_id; END IF;

  IF v_invoice.status = 'paid' THEN
    SELECT status INTO v_booking_status FROM public.bookings WHERE id = v_invoice.booking_id;
    IF v_booking_status != 'completed' THEN
      UPDATE public.bookings SET status = 'completed', updated_at = now() WHERE id = v_invoice.booking_id;
    END IF;
    SELECT pilot_clearance_status INTO v_clearance FROM public.profiles WHERE id = v_invoice.customer_id;
    IF v_clearance = 'checkout_payment_required' THEN
      UPDATE public.profiles
      SET pilot_clearance_status = v_invoice.checkout_outcome, updated_at = now()
      WHERE id = v_invoice.customer_id;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.customer_payment_ledger
      WHERE stripe_checkout_session_id = p_stripe_checkout_session_id AND entry_type = 'stripe_payment'
    ) THEN
      INSERT INTO public.customer_payment_ledger (
        customer_id, booking_id, invoice_id, invoice_source_type, amount_cents, entry_type, payment_method,
        stripe_checkout_session_id, stripe_payment_intent_id, note, created_by
      ) VALUES (
        v_invoice.customer_id, v_invoice.booking_id, p_invoice_id, 'checkout',
        v_invoice.stripe_amount_due_cents, 'stripe_payment', 'stripe',
        p_stripe_checkout_session_id, p_stripe_payment_intent_id,
        'Stripe checkout payment received (recovery path)', NULL
      );
    END IF;
    RETURN;
  END IF;

  IF v_invoice.stripe_gross_amount_cents IS NOT NULL
    AND v_invoice.stripe_gross_amount_cents > 0
    AND p_amount_paid_cents != v_invoice.stripe_gross_amount_cents
  THEN
    RAISE EXCEPTION
      'Payment amount mismatch for invoice %: expected % cents (gross), received % cents. Refusing to mark paid.',
      p_invoice_id, v_invoice.stripe_gross_amount_cents, p_amount_paid_cents;
  END IF;

  v_base_amount := v_invoice.stripe_amount_due_cents;

  UPDATE public.checkout_invoices
  SET
    status                     = 'paid',
    paid_at                    = now(),
    payment_method             = 'stripe',
    stripe_payment_intent_id   = p_stripe_payment_intent_id,
    stripe_checkout_session_id = p_stripe_checkout_session_id,
    total_paid_cents           = total_paid_cents + v_base_amount,
    stripe_amount_due_cents    = 0,
    updated_at                 = now()
  WHERE id = p_invoice_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.customer_payment_ledger
    WHERE stripe_checkout_session_id = p_stripe_checkout_session_id AND entry_type = 'stripe_payment'
  ) THEN
    INSERT INTO public.customer_payment_ledger (
      customer_id, booking_id, invoice_id, invoice_source_type, amount_cents, entry_type, payment_method,
      stripe_checkout_session_id, stripe_payment_intent_id, note, created_by
    ) VALUES (
      v_invoice.customer_id, v_invoice.booking_id, p_invoice_id, 'checkout',
      v_base_amount, 'stripe_payment', 'stripe',
      p_stripe_checkout_session_id, p_stripe_payment_intent_id,
      'Stripe checkout payment received', NULL
    );
  END IF;

  UPDATE public.bookings SET status = 'completed', updated_at = now() WHERE id = v_invoice.booking_id;

  UPDATE public.profiles
  SET pilot_clearance_status = v_invoice.checkout_outcome, updated_at = now()
  WHERE id = v_invoice.customer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_bank_transfer_atomic(
    p_submission_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_caller_id   uuid;
    v_submission  record;
    v_invoice     record;
    v_base_amount integer;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: not authenticated';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: must be an admin';
    END IF;

    SELECT * INTO v_submission FROM public.checkout_bank_transfer_submissions
        WHERE id = p_submission_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found'; END IF;
    IF v_submission.status != 'pending_review' THEN
        RAISE EXCEPTION 'Submission is not pending review (status: %)', v_submission.status;
    END IF;

    SELECT * INTO v_invoice FROM public.checkout_invoices
        WHERE id = v_submission.invoice_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found for submission %', p_submission_id;
    END IF;

    IF v_invoice.status != 'payment_required' THEN
        RAISE EXCEPTION 'Invoice % is not in payment_required state (status: %)', v_invoice.id, v_invoice.status;
    END IF;
    IF v_invoice.customer_id != v_submission.customer_id THEN
        RAISE EXCEPTION 'Invoice customer does not match submission customer';
    END IF;
    IF v_invoice.booking_id != v_submission.booking_id THEN
        RAISE EXCEPTION 'Invoice booking does not match submission booking';
    END IF;
    IF v_invoice.invoice_type IS DISTINCT FROM 'checkout' THEN
        RAISE EXCEPTION 'Invoice % is not a checkout invoice', v_invoice.id;
    END IF;

    v_base_amount := GREATEST(
        v_invoice.subtotal_cents - v_invoice.advance_applied_cents - v_invoice.total_paid_cents,
        0
    );

    UPDATE public.checkout_bank_transfer_submissions
    SET status = 'approved', reviewed_by = v_caller_id, reviewed_at = now()
    WHERE id = p_submission_id;

    UPDATE public.checkout_invoices
    SET
        status                         = 'paid',
        paid_at                        = now(),
        payment_method                 = 'bank_transfer',
        total_paid_cents               = total_paid_cents + v_base_amount,
        stripe_amount_due_cents        = 0,
        online_payment_surcharge_cents = 0,
        stripe_fee_rate_bps            = NULL,
        stripe_fee_fixed_cents         = NULL,
        stripe_gross_amount_cents      = NULL,
        updated_at                     = now()
    WHERE id = v_invoice.id;

    IF NOT EXISTS (
        SELECT 1 FROM public.customer_payment_ledger
        WHERE invoice_id = v_invoice.id AND entry_type = 'bank_transfer'
    ) THEN
        INSERT INTO public.customer_payment_ledger (
            customer_id, booking_id, invoice_id, invoice_source_type, amount_cents,
            entry_type, payment_method, note, created_by
        ) VALUES (
            v_invoice.customer_id, v_invoice.booking_id, v_invoice.id, 'checkout', v_base_amount,
            'bank_transfer', 'bank_transfer', 'Bank transfer approved', v_caller_id
        );
    END IF;

    UPDATE public.bookings SET status = 'completed', updated_at = now()
        WHERE id = v_invoice.booking_id;

    UPDATE public.profiles
    SET pilot_clearance_status = v_invoice.checkout_outcome, updated_at = now()
    WHERE id = v_invoice.customer_id;
END;
$$;

COMMIT;
