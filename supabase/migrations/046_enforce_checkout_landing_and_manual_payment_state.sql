-- ============================================================
-- 046_enforce_checkout_landing_and_manual_payment_state.sql
--
-- Enforces mandatory checkout landing rows for ALL finalized
-- checkout outcomes, even when payment is waived.
--
-- 1. Modifies `complete_checkout_outcome_atomic` to validate
--    and compute landing charges unconditionally.
-- 2. Inserts into `checkout_landing_charges` unconditionally.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.complete_checkout_outcome_atomic(
  p_booking_id        uuid,
  p_customer_id       uuid,
  p_vdo_start_reading numeric(10,1),   -- VDO meter at start of checkout flight; NULL for waived
  p_vdo_end_reading   numeric(10,1),   -- VDO meter at end of checkout flight; NULL for waived
  p_checkout_outcome  text,            -- one of 4 outcome values
  p_landing_charges   jsonb,           -- [{airport_id, landing_count}]; Required for ALL outcomes
  p_admin_notes       text    DEFAULT NULL,
  p_payment_waived    boolean DEFAULT false,
  p_waiver_reason     text    DEFAULT NULL  -- required when p_payment_waived = true
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
  v_checkout_rate_cents         integer := 29000;   -- $290/hr in cents
  v_landing_rate_cents          integer := 2500;    -- fixed $25 per landing (policy, not from airports table)
  v_booking_customer_id         uuid;
  v_balance_cents               integer := 0;
  v_advance_applied_cents       integer := 0;
  v_amount_due_cents            integer := 0;
  v_invoice_status              text;
  v_invoice_id                  uuid;
  v_vdo_hours                   numeric(10,1);
  v_vdo_base_amount_cents       integer;
  v_landing_subtotal_cents      integer := 0;
  v_final_checkout_amount_cents integer;
  v_final_booking_status        text;
  v_final_clearance_status      text;
  -- Landing charge loop variables
  v_charge                      jsonb;
  v_airport_id                  uuid;
  v_landing_count               integer;
  v_unit_amount_cents           integer;
  v_row_total_cents             integer;
  v_airport_active              boolean;
BEGIN

  -- ── Auth check ────────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: caller must be an admin';
  END IF;

  -- ── Input validation — always required ────────────────────────────────────────
  IF p_booking_id IS NULL THEN
    RAISE EXCEPTION 'booking_id is required';
  END IF;
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_id is required';
  END IF;
  IF p_checkout_outcome NOT IN (
    'cleared_to_fly',
    'additional_checkout_required',
    'checkout_reschedule_required',
    'not_currently_eligible'
  ) THEN
    RAISE EXCEPTION 'Invalid checkout_outcome: %', p_checkout_outcome;
  END IF;

  -- ── Waiver validation ─────────────────────────────────────────────────────────
  IF p_payment_waived AND p_checkout_outcome = 'cleared_to_fly' THEN
    RAISE EXCEPTION 'VALIDATION: Payment cannot be waived for the cleared_to_fly outcome';
  END IF;
  IF p_payment_waived AND (p_waiver_reason IS NULL OR trim(p_waiver_reason) = '') THEN
    RAISE EXCEPTION 'VALIDATION: A waiver reason is required when payment is waived';
  END IF;

  -- ── Input validation — payment path only ─────────────────────────────────────
  IF NOT p_payment_waived THEN
    IF p_vdo_start_reading IS NULL THEN
      RAISE EXCEPTION 'VALIDATION: VDO start reading is required';
    END IF;
    IF p_vdo_end_reading IS NULL THEN
      RAISE EXCEPTION 'VALIDATION: VDO end reading is required';
    END IF;
    IF p_vdo_start_reading < 0 THEN
      RAISE EXCEPTION 'VALIDATION: VDO start reading must be 0 or greater (got %)', p_vdo_start_reading;
    END IF;
    IF p_vdo_end_reading <= p_vdo_start_reading THEN
      RAISE EXCEPTION 'VALIDATION: VDO end reading (%) must be greater than start reading (%)',
        p_vdo_end_reading, p_vdo_start_reading;
    END IF;

    -- VDO hours reasonableness check: 0.1 to 5.0 hours.
    -- Guards against accidental huge invoices from data entry errors.
    v_vdo_hours := p_vdo_end_reading - p_vdo_start_reading;
    IF v_vdo_hours < 0.1 THEN
      RAISE EXCEPTION 'VALIDATION: VDO hours flown (%) is below minimum of 0.1h. '
        'Check your readings.', v_vdo_hours;
    END IF;
    IF v_vdo_hours > 5.0 THEN
      RAISE EXCEPTION 'VALIDATION: VDO hours flown (%) exceeds maximum of 5.0h. '
        'Check your readings — if correct, contact engineering.', v_vdo_hours;
    END IF;

    -- ── Server-side billing calculation ───────────────────────────────────────
    -- All money calculations are in integer cents to avoid floating point errors.
    v_vdo_base_amount_cents := ROUND(v_vdo_hours * v_checkout_rate_cents)::integer;
  END IF;

  -- ── Lock booking row and verify ownership ─────────────────────────────────────
  SELECT booking_owner_user_id
  INTO   v_booking_customer_id
  FROM   public.bookings
  WHERE  id = p_booking_id
  FOR UPDATE;

  IF v_booking_customer_id IS NULL THEN
    RAISE EXCEPTION 'Booking not found: %', p_booking_id;
  END IF;
  IF v_booking_customer_id != p_customer_id THEN
    RAISE EXCEPTION 'Booking % does not belong to customer %', p_booking_id, p_customer_id;
  END IF;

  -- ── Customer-level advisory lock (prevents double-submit race) ────────────────
  PERFORM pg_advisory_xact_lock(hashtext(p_customer_id::text));

  -- ── Idempotency guard (covers both payment and waiver paths) ─────────────────
  IF EXISTS (
    SELECT 1 FROM public.checkout_invoices
    WHERE  booking_id = p_booking_id AND invoice_type = 'checkout'
  ) THEN
    RAISE EXCEPTION 'Checkout invoice already exists for booking %', p_booking_id;
  END IF;

  -- ── Validate and compute landing charges (Required for all outcomes) ─────────
  IF p_landing_charges IS NULL OR jsonb_array_length(p_landing_charges) = 0 THEN
    RAISE EXCEPTION 'VALIDATION: At least one landing airport is required for all checkouts.';
  END IF;

  FOR v_charge IN SELECT * FROM jsonb_array_elements(p_landing_charges) LOOP
    BEGIN
      v_airport_id := (v_charge->>'airport_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid airport_id in landing charges: %', v_charge->>'airport_id';
    END;

    IF v_airport_id IS NULL THEN
      RAISE EXCEPTION 'VALIDATION: airport_id is required for each landing charge row';
    END IF;

    BEGIN
      v_landing_count := (v_charge->>'landing_count')::integer;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid landing_count in landing charges: %', v_charge->>'landing_count';
    END;

    IF v_landing_count IS NULL OR v_landing_count <= 0 THEN
      RAISE EXCEPTION 'VALIDATION: landing_count must be >= 1 (got % for airport %)',
        v_landing_count, v_airport_id;
    END IF;

    -- Validate airport exists and is active (fee is not read from this table)
    SELECT is_active
    INTO   v_airport_active
    FROM   public.airports
    WHERE  id = v_airport_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Airport not found: %', v_airport_id;
    END IF;
    IF NOT v_airport_active THEN
      RAISE EXCEPTION 'Airport % is not active for landing charges', v_airport_id;
    END IF;

    -- Fixed rate: $25 per landing (v_landing_rate_cents = 2500 cents)
    v_unit_amount_cents      := v_landing_rate_cents;
    v_row_total_cents        := v_landing_count * v_unit_amount_cents;
    v_landing_subtotal_cents := v_landing_subtotal_cents + v_row_total_cents;
  END LOOP;

  -- ══════════════════════════════════════════════════════════════════════════════
  -- WAIVER PATH
  -- Creates a waived audit invoice and immediately completes the booking.
  -- No VDO, no credit consumed, no Stripe session.
  -- ══════════════════════════════════════════════════════════════════════════════
  IF p_payment_waived THEN

    INSERT INTO public.checkout_invoices (
      customer_id,
      booking_id,
      invoice_type,
      status,
      subtotal_cents,
      advance_applied_cents,
      stripe_amount_due_cents,
      total_paid_cents,
      paid_at,
      checkout_duration_hours,
      checkout_rate_cents_per_hour,
      checkout_calculated_amount_cents,
      checkout_final_amount_cents,
      checkout_completed_at,
      checkout_completed_by,
      checkout_outcome,
      checkout_landing_subtotal_cents,
      waiver_reason,
      vdo_start_reading,
      vdo_end_reading
    ) VALUES (
      p_customer_id,
      p_booking_id,
      'checkout',
      'waived',
      0, 0, 0, 0,
      now(),
      0, 0, 0, 0,
      now(),
      auth.uid(),
      p_checkout_outcome,
      0,      -- checkout_landing_subtotal_cents (0 because waived)
      p_waiver_reason,
      NULL,   -- no VDO readings for waived flights
      NULL
    ) RETURNING id INTO v_invoice_id;

    UPDATE public.bookings
    SET
      status      = 'completed',
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      updated_at  = now()
    WHERE id = p_booking_id;

    UPDATE public.profiles
    SET
      pilot_clearance_status = p_checkout_outcome,
      updated_at             = now()
    WHERE id = p_customer_id;

    -- Insert landing charge rows (0 cents because waived)
    FOR v_charge IN SELECT * FROM jsonb_array_elements(p_landing_charges) LOOP
      v_airport_id        := (v_charge->>'airport_id')::uuid;
      v_landing_count     := (v_charge->>'landing_count')::integer;
      v_unit_amount_cents := 0;          -- 0 cents because waived
      v_row_total_cents   := 0;

      INSERT INTO public.checkout_landing_charges (
        booking_id, airport_id, landing_count,
        unit_amount_cents, total_amount_cents
      ) VALUES (
        p_booking_id, v_airport_id, v_landing_count,
        v_unit_amount_cents, v_row_total_cents
      );
    END LOOP;

    RETURN QUERY SELECT
      v_invoice_id,
      0::integer,
      'completed'::text,
      p_checkout_outcome;

    RETURN;
  END IF;


  -- ══════════════════════════════════════════════════════════════════════════════
  -- PAYMENT PATH
  -- VDO hours already computed above as v_vdo_hours and v_vdo_base_amount_cents.
  -- ══════════════════════════════════════════════════════════════════════════════

  -- ── Final amount (server-side, never trusted from client) ─────────────────────
  v_final_checkout_amount_cents := v_vdo_base_amount_cents + v_landing_subtotal_cents;

  IF v_final_checkout_amount_cents <= 0 THEN
    RAISE EXCEPTION 'VALIDATION: Calculated checkout amount is zero or negative. '
      'VDO hours: %, base: % cents, landings: % cents.',
      v_vdo_hours, v_vdo_base_amount_cents, v_landing_subtotal_cents;
  END IF;

  -- ── Credit balance ────────────────────────────────────────────────────────────
  SELECT COALESCE(balance_cents, 0)
  INTO   v_balance_cents
  FROM   public.customer_credit_balances
  WHERE  customer_id = p_customer_id;

  v_balance_cents := COALESCE(v_balance_cents, 0);
  IF v_balance_cents < 0 THEN v_balance_cents := 0; END IF;

  -- ── Credit / Stripe split ─────────────────────────────────────────────────────
  v_advance_applied_cents := LEAST(v_balance_cents, v_final_checkout_amount_cents);
  v_amount_due_cents      := v_final_checkout_amount_cents - v_advance_applied_cents;

  -- ── Derived statuses ──────────────────────────────────────────────────────────
  v_invoice_status       := CASE WHEN v_amount_due_cents = 0 THEN 'paid' ELSE 'payment_required' END;
  v_final_booking_status := CASE WHEN v_amount_due_cents = 0 THEN 'completed' ELSE 'checkout_payment_required' END;
  v_final_clearance_status := CASE
    WHEN v_amount_due_cents = 0 THEN p_checkout_outcome
    ELSE 'checkout_payment_required'
  END;

  -- ── Insert checkout invoice ───────────────────────────────────────────────────
  -- checkout_duration_hours  = vdo_hours (the existing column, reused)
  -- checkout_calculated_amount_cents = vdo_base_amount_cents (existing column, reused)
  -- checkout_final_amount_cents      = vdo_base + landings (the new source of truth)
  -- subtotal_cents                   = same as final (Option 1 accounting model)
  INSERT INTO public.checkout_invoices (
    customer_id,
    booking_id,
    invoice_type,
    status,
    subtotal_cents,
    advance_applied_cents,
    stripe_amount_due_cents,
    total_paid_cents,
    paid_at,
    checkout_duration_hours,
    checkout_rate_cents_per_hour,
    checkout_calculated_amount_cents,
    checkout_final_amount_cents,
    checkout_completed_at,
    checkout_completed_by,
    checkout_outcome,
    checkout_landing_subtotal_cents,
    vdo_start_reading,
    vdo_end_reading
  ) VALUES (
    p_customer_id,
    p_booking_id,
    'checkout',
    v_invoice_status,
    v_final_checkout_amount_cents,  -- subtotal = calculated total
    v_advance_applied_cents,        -- credit applied at creation
    v_amount_due_cents,             -- Stripe snapshot
    0,                              -- total_paid_cents: Stripe only, starts at 0
    CASE WHEN v_amount_due_cents = 0 THEN now() ELSE NULL END,
    v_vdo_hours,                    -- checkout_duration_hours = VDO hours
    v_checkout_rate_cents,          -- $290/hr in cents
    v_vdo_base_amount_cents,        -- checkout_calculated_amount_cents = VDO base
    v_final_checkout_amount_cents,  -- checkout_final_amount_cents = VDO + landings
    now(),
    auth.uid(),
    p_checkout_outcome,
    v_landing_subtotal_cents,
    p_vdo_start_reading,
    p_vdo_end_reading
  ) RETURNING id INTO v_invoice_id;

  -- ── Insert landing charge rows ─────────────────────────────────────────────────
  FOR v_charge IN SELECT * FROM jsonb_array_elements(p_landing_charges) LOOP
    v_airport_id        := (v_charge->>'airport_id')::uuid;
    v_landing_count     := (v_charge->>'landing_count')::integer;
    v_unit_amount_cents := v_landing_rate_cents;          -- fixed $25 per landing
    v_row_total_cents   := v_landing_count * v_unit_amount_cents;

    INSERT INTO public.checkout_landing_charges (
      booking_id, airport_id, landing_count,
      unit_amount_cents, total_amount_cents
    ) VALUES (
      p_booking_id, v_airport_id, v_landing_count,
      v_unit_amount_cents, v_row_total_cents
    );
  END LOOP;

  -- ── Debit credit ledger ───────────────────────────────────────────────────────
  IF v_advance_applied_cents > 0 THEN
    INSERT INTO public.customer_payment_ledger (
      customer_id, booking_id, invoice_id,
      amount_cents, entry_type, note, created_by
    ) VALUES (
      p_customer_id, p_booking_id, v_invoice_id,
      -v_advance_applied_cents,
      'advance_applied',
      'Applied to checkout invoice at outcome recording',
      auth.uid()
    );
  END IF;

  -- ── Update booking status ─────────────────────────────────────────────────────
  UPDATE public.bookings
  SET
    status      = v_final_booking_status,
    admin_notes = COALESCE(p_admin_notes, admin_notes),
    updated_at  = now()
  WHERE id = p_booking_id;

  -- ── Update pilot clearance status ─────────────────────────────────────────────
  UPDATE public.profiles
  SET
    pilot_clearance_status = v_final_clearance_status,
    updated_at             = now()
  WHERE id = p_customer_id;

  -- ── Return result ─────────────────────────────────────────────────────────────
  RETURN QUERY SELECT
    v_invoice_id,
    v_amount_due_cents,
    v_final_booking_status,
    v_final_clearance_status;

END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_checkout_outcome_atomic(
  uuid, uuid, numeric, numeric, text, jsonb, text, boolean, text
) TO authenticated;

COMMIT;
