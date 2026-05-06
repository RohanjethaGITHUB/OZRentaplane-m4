-- ============================================================
-- 047_checkout_editable_hourly_rate.sql
--
-- Adds an admin-editable hourly rate to the checkout billing flow.
-- Default remains 29000 cents ($290/hr) when not overridden.
--
-- 1. Replaces the 9-param complete_checkout_outcome_atomic from
--    migration 045 with a 10-param version that accepts:
--      p_checkout_rate_cents_per_hour integer DEFAULT 29000
--    The new parameter is appended after p_waiver_reason so that
--    all existing callers passing 9 positional args continue to work
--    (they receive the default $290/hr).
--
-- 2. The admin-provided rate is validated (must be > 0) and used for
--    all billing calculations instead of the hardcoded 29000.
--
-- 3. The rate is stored in checkout_invoices.checkout_rate_cents_per_hour
--    (column already exists since migration 027). This means:
--      - checkout_invoice_live_amount view already exposes it correctly
--      - Any downstream display reading that column gets the actual rate
--    No schema changes are required.
--
-- 4. For the waiver path: amounts stay 0 but the entered rate is stored
--    in checkout_rate_cents_per_hour for audit/breakdown purposes.
--
-- Backwards compatibility:
--   Existing callers that do not pass p_checkout_rate_cents_per_hour
--   get DEFAULT 29000 (identical behaviour to migration 045).
-- ============================================================

BEGIN;


-- ── Drop the 9-param signature from migration 045 ────────────────────────────
-- The new 10-param version replaces it. PostgreSQL resolves overloads by
-- parameter types; the explicit DROP avoids ambiguity.

DROP FUNCTION IF EXISTS public.complete_checkout_outcome_atomic(
  uuid, uuid, numeric, numeric, text, jsonb, text, boolean, text
);


-- ── New 10-param complete_checkout_outcome_atomic ────────────────────────────

CREATE FUNCTION public.complete_checkout_outcome_atomic(
  p_booking_id                   uuid,
  p_customer_id                  uuid,
  p_vdo_start_reading            numeric(10,1),   -- VDO meter at start of flight; NULL for waived
  p_vdo_end_reading              numeric(10,1),   -- VDO meter at end of flight;   NULL for waived
  p_checkout_outcome             text,            -- one of 4 outcome values
  p_landing_charges              jsonb,           -- [{airport_id, landing_count}]; NULL for waived
  p_admin_notes                  text    DEFAULT NULL,
  p_payment_waived               boolean DEFAULT false,
  p_waiver_reason                text    DEFAULT NULL,  -- required when p_payment_waived = true
  p_checkout_rate_cents_per_hour integer DEFAULT 29000  -- NEW: admin-overridable rate, default $290/hr
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
  -- p_checkout_rate_cents_per_hour is used directly (replaces v_checkout_rate_cents := 29000)
  v_landing_rate_cents          integer := 2500;   -- fixed $25 per landing (policy, not from airports table)
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

  -- ── Hourly rate validation — always required ───────────────────────────────────
  IF p_checkout_rate_cents_per_hour <= 0 THEN
    RAISE EXCEPTION 'VALIDATION: Checkout hourly rate must be greater than 0 (got % cents/hr)',
      p_checkout_rate_cents_per_hour;
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
    -- Uses p_checkout_rate_cents_per_hour (admin-provided or default 29000).
    -- All money in integer cents to avoid floating-point errors.
    v_vdo_base_amount_cents := ROUND(v_vdo_hours * p_checkout_rate_cents_per_hour)::integer;
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


  -- ══════════════════════════════════════════════════════════════════════════════
  -- WAIVER PATH
  -- Creates a waived audit invoice and immediately completes the booking.
  -- Amounts are all 0. p_checkout_rate_cents_per_hour is stored for audit.
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
      checkout_rate_cents_per_hour,        -- stored for audit even on waiver
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
      0, p_checkout_rate_cents_per_hour, 0, 0,
      now(),
      auth.uid(),
      p_checkout_outcome,
      0,
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

    RETURN QUERY SELECT
      v_invoice_id,
      0::integer,
      'completed'::text,
      p_checkout_outcome;

    RETURN;
  END IF;


  -- ══════════════════════════════════════════════════════════════════════════════
  -- PAYMENT PATH
  -- VDO hours and base amount already computed above.
  -- ══════════════════════════════════════════════════════════════════════════════

  -- ── Validate and compute landing charges ──────────────────────────────────────
  -- Landing fee is fixed at v_landing_rate_cents ($25) — NOT read from airports table.
  IF p_landing_charges IS NOT NULL AND jsonb_array_length(p_landing_charges) > 0 THEN
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

      -- Fixed rate: $25 per landing
      v_unit_amount_cents      := v_landing_rate_cents;
      v_row_total_cents        := v_landing_count * v_unit_amount_cents;
      v_landing_subtotal_cents := v_landing_subtotal_cents + v_row_total_cents;
    END LOOP;
  END IF;

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
  v_invoice_status         := CASE WHEN v_amount_due_cents = 0 THEN 'paid' ELSE 'payment_required' END;
  v_final_booking_status   := CASE WHEN v_amount_due_cents = 0 THEN 'completed' ELSE 'checkout_payment_required' END;
  v_final_clearance_status := CASE
    WHEN v_amount_due_cents = 0 THEN p_checkout_outcome
    ELSE 'checkout_payment_required'
  END;

  -- ── Insert checkout invoice ───────────────────────────────────────────────────
  -- checkout_duration_hours          = vdo_hours (existing column, reused)
  -- checkout_rate_cents_per_hour     = admin-provided rate (or default 29000)
  -- checkout_calculated_amount_cents = vdo_base_amount_cents
  -- checkout_final_amount_cents      = vdo_base + landings
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
    v_final_checkout_amount_cents,   -- subtotal = calculated total
    v_advance_applied_cents,         -- credit applied at creation
    v_amount_due_cents,              -- Stripe snapshot
    0,                               -- total_paid_cents: Stripe only, starts at 0
    CASE WHEN v_amount_due_cents = 0 THEN now() ELSE NULL END,
    v_vdo_hours,                     -- checkout_duration_hours = VDO hours
    p_checkout_rate_cents_per_hour,  -- admin-provided rate (replaces hardcoded 29000)
    v_vdo_base_amount_cents,         -- checkout_calculated_amount_cents = VDO base
    v_final_checkout_amount_cents,   -- checkout_final_amount_cents = VDO + landings
    now(),
    auth.uid(),
    p_checkout_outcome,
    v_landing_subtotal_cents,
    p_vdo_start_reading,
    p_vdo_end_reading
  ) RETURNING id INTO v_invoice_id;

  -- ── Insert landing charge rows ─────────────────────────────────────────────────
  IF p_landing_charges IS NOT NULL AND jsonb_array_length(p_landing_charges) > 0 THEN
    FOR v_charge IN SELECT * FROM jsonb_array_elements(p_landing_charges) LOOP
      v_airport_id        := (v_charge->>'airport_id')::uuid;
      v_landing_count     := (v_charge->>'landing_count')::integer;
      v_unit_amount_cents := v_landing_rate_cents;
      v_row_total_cents   := v_landing_count * v_unit_amount_cents;

      INSERT INTO public.checkout_landing_charges (
        booking_id, airport_id, landing_count,
        unit_amount_cents, total_amount_cents
      ) VALUES (
        p_booking_id, v_airport_id, v_landing_count,
        v_unit_amount_cents, v_row_total_cents
      );
    END LOOP;
  END IF;

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

COMMENT ON FUNCTION public.complete_checkout_outcome_atomic IS
  'Records a checkout outcome. '
  'Payment path: accepts VDO meter readings and an optional admin-overridable hourly rate '
  '(p_checkout_rate_cents_per_hour, default 29000 = $290/hr). '
  'Calculates vdo_hours and billing server-side: VDO hours × rate + landing_count × $25 fixed per landing. '
  'Landing fee is fixed at 2500 cents — airports table is queried for existence/active check only. '
  'Applies customer credit, transitions booking through checkout_payment_required. '
  'Waiver path (non-cleared outcomes only): creates waived audit invoice (status=waived, amounts 0) '
  'and stores the entered rate in checkout_rate_cents_per_hour for audit purposes. '
  'Called by admin only. All money in integer cents.';

REVOKE ALL ON FUNCTION public.complete_checkout_outcome_atomic(
  uuid, uuid, numeric, numeric, text, jsonb, text, boolean, text, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_checkout_outcome_atomic(
  uuid, uuid, numeric, numeric, text, jsonb, text, boolean, text, integer
) TO authenticated;


NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================
-- POST-MIGRATION VERIFICATION QUERIES
-- ============================================================

-- 1. Confirm the new 10-param signature exists and the old 9-param is gone:
-- SELECT proname, pg_get_function_arguments(oid)
-- FROM pg_proc
-- WHERE proname = 'complete_checkout_outcome_atomic'
--   AND pronamespace = 'public'::regnamespace;
-- Expected: one row; args end with 'p_checkout_rate_cents_per_hour integer DEFAULT 29000'

-- 2. Confirm function grant for authenticated:
-- SELECT routine_name, grantee, privilege_type
-- FROM information_schema.routine_privileges
-- WHERE routine_schema = 'public'
--   AND routine_name   = 'complete_checkout_outcome_atomic'
-- ORDER BY grantee;

-- 3. Smoke test — call with default rate (should behave identically to migration 045):
-- The default p_checkout_rate_cents_per_hour = 29000 preserves existing $290/hr behaviour.
-- Existing callers that pass 9 positional arguments continue to receive the default.
