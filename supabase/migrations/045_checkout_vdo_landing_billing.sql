-- ============================================================
-- 045_checkout_vdo_landing_billing.sql
--
-- Changes checkout billing source of truth from admin-entered
-- duration to VDO meter readings.
--
-- Business rule:
--   Final checkout amount =
--     (vdo_end_reading - vdo_start_reading) × $290
--     + sum(landing_count × $25 fixed per landing)
--   Landing fee is fixed at 2500 cents per landing.
--   airports.default_landing_fee_cents is NOT used for billing.
--
-- 1. Add vdo_start_reading and vdo_end_reading columns to
--    checkout_invoices (nullable for legacy records).
--
-- 2. Replace complete_checkout_outcome_atomic (9-param, from 040)
--    with a new 9-param version that accepts VDO readings instead
--    of admin-entered duration/amount. The RPC calculates
--    vdo_hours, vdo_base_amount_cents, landing_fees_total_cents,
--    and final_checkout_amount_cents server-side.
--    The payment and waiver paths, credit logic, landing charge
--    rows, and all downstream flows are unchanged.
--
-- 3. Update checkout_invoice_live_amount view to expose the
--    new VDO fields for dashboard display.
--
-- Backwards compatibility: existing invoices without VDO readings
-- are not broken — vdo_start_reading and vdo_end_reading are NULL
-- for legacy rows. checkout_duration_hours and
-- checkout_calculated_amount_cents continue to exist and are
-- populated by the new RPC (from VDO readings), so all downstream
-- display code still works.
-- ============================================================

BEGIN;


-- ── PART 1: Add VDO reading columns to checkout_invoices ─────────────────────
-- Nullable so legacy records without VDO data are not affected.

ALTER TABLE public.checkout_invoices
  ADD COLUMN IF NOT EXISTS vdo_start_reading numeric(10,1),
  ADD COLUMN IF NOT EXISTS vdo_end_reading   numeric(10,1);

-- Constraints applied only when both columns are non-NULL (no effect on legacy rows).
ALTER TABLE public.checkout_invoices
  DROP CONSTRAINT IF EXISTS chk_vdo_readings_valid;
ALTER TABLE public.checkout_invoices
  ADD CONSTRAINT chk_vdo_readings_valid CHECK (
    vdo_start_reading IS NULL
    OR vdo_end_reading IS NULL
    OR (
      vdo_start_reading >= 0
      AND vdo_end_reading > vdo_start_reading
    )
  );


-- ── PART 2: Replace complete_checkout_outcome_atomic ─────────────────────────
-- Drop the 9-param signature from migration 040.
-- New signature replaces p_checkout_fee_cents (integer) and
-- p_checkout_duration_hours (numeric) with p_vdo_start_reading
-- and p_vdo_end_reading (both numeric(10,1)).
-- Param count is identical (9); types differ for params 3 and 4.
--
-- Landing fee policy:
--   Fixed at $25 (2500 cents) per landing regardless of airport.
--   The airports table is still queried to validate that the airport
--   exists and is active, but its default_landing_fee_cents column
--   is NOT used for billing calculations.

DROP FUNCTION IF EXISTS public.complete_checkout_outcome_atomic(
  uuid, uuid, integer, numeric, text, jsonb, text, boolean, text
);

CREATE FUNCTION public.complete_checkout_outcome_atomic(
  p_booking_id        uuid,
  p_customer_id       uuid,
  p_vdo_start_reading numeric(10,1),   -- VDO meter at start of checkout flight; NULL for waived
  p_vdo_end_reading   numeric(10,1),   -- VDO meter at end of checkout flight; NULL for waived
  p_checkout_outcome  text,            -- one of 4 outcome values
  p_landing_charges   jsonb,           -- [{airport_id, landing_count}]; NULL for waived
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
  -- VDO hours already computed above as v_vdo_hours and v_vdo_base_amount_cents.
  -- ══════════════════════════════════════════════════════════════════════════════

  -- ── Validate and compute landing charges ──────────────────────────────────────
  -- airport_id and landing_count come from the frontend.
  -- Landing fee is fixed at v_landing_rate_cents ($25) — NOT read from airports table.
  -- airports table is queried only to confirm the airport exists and is active.
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

      -- Fixed rate: $25 per landing (v_landing_rate_cents = 2500 cents)
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
  -- Airport already validated in the validation loop above.
  -- Rate is fixed: v_landing_rate_cents = 2500 cents ($25 per landing).
  IF p_landing_charges IS NOT NULL AND jsonb_array_length(p_landing_charges) > 0 THEN
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
  'Payment path: accepts VDO meter readings, calculates vdo_hours and billing '
  'server-side (VDO hours × $290 + landing_count × $25 fixed per landing). '
  'Landing fee is fixed at 2500 cents — airports table is queried for existence/'
  'active check only, NOT for default_landing_fee_cents. '
  'Applies credit, transitions booking through checkout_payment_required. '
  'Waiver path (non-cleared outcomes only): creates waived audit invoice (status=waived, '
  'all amounts 0, vdo_start_reading=NULL, vdo_end_reading=NULL), immediately completes '
  'booking and promotes pilot clearance. No VDO readings required or stored for waiver. '
  'Called by admin only. All money in integer cents.';

REVOKE ALL ON FUNCTION public.complete_checkout_outcome_atomic(
  uuid, uuid, numeric, numeric, text, jsonb, text, boolean, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_checkout_outcome_atomic(
  uuid, uuid, numeric, numeric, text, jsonb, text, boolean, text
) TO authenticated;


-- ── PART 3: Recreate checkout_invoice_live_amount view ───────────────────────
-- CREATE OR REPLACE VIEW cannot reorder or rename existing output columns.
-- DROP + CREATE is required because this migration adds new columns between
-- existing ones and appends vdo_hours_flown.
-- No CASCADE needed: the view has no dependent views or rules.

DROP VIEW IF EXISTS public.checkout_invoice_live_amount;

CREATE VIEW public.checkout_invoice_live_amount
WITH (security_invoker = true) AS
SELECT
  ci.id                                                           AS invoice_id,
  ci.booking_id,
  ci.customer_id,
  ci.subtotal_cents,
  ci.advance_applied_cents,
  ci.total_paid_cents,
  ci.status,
  ci.checkout_outcome,
  ci.checkout_duration_hours,
  ci.checkout_rate_cents_per_hour,
  ci.checkout_calculated_amount_cents,
  ci.checkout_final_amount_cents,
  ci.checkout_landing_subtotal_cents,
  ci.vdo_start_reading,
  ci.vdo_end_reading,
  -- vdo_hours is checkout_duration_hours for new records (set from VDO diff in RPC);
  -- NULL for legacy records that predate VDO billing.
  CASE
    WHEN ci.vdo_start_reading IS NOT NULL AND ci.vdo_end_reading IS NOT NULL
    THEN ci.vdo_end_reading - ci.vdo_start_reading
    ELSE NULL
  END                                                             AS vdo_hours_flown,
  COALESCE(ccb.balance_cents, 0)                                  AS current_credit_balance_cents,
  GREATEST(
    ci.subtotal_cents
    - ci.advance_applied_cents
    - ci.total_paid_cents
    - COALESCE(ccb.balance_cents, 0)
  , 0)                                                            AS display_amount_due_cents
FROM public.checkout_invoices ci
LEFT JOIN public.customer_credit_balances ccb
       ON ccb.customer_id = ci.customer_id
WHERE ci.invoice_type = 'checkout';

COMMENT ON VIEW public.checkout_invoice_live_amount IS
  'Read-only display view. Do NOT use for Stripe session creation — '
  'call prepare_checkout_payment_atomic instead. '
  'Exposes vdo_start_reading, vdo_end_reading, vdo_hours_flown for dashboard display.';

-- Restore the read grant that was on the old view.
GRANT SELECT ON public.checkout_invoice_live_amount TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================
-- POST-MIGRATION VERIFICATION QUERIES
-- ============================================================

-- 1. Confirm vdo_start_reading and vdo_end_reading exist on checkout_invoices:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name   = 'checkout_invoices'
--   AND column_name  IN ('vdo_start_reading', 'vdo_end_reading')
-- ORDER BY column_name;
-- Expected: 2 rows, data_type = 'numeric', is_nullable = 'YES'

-- 2. Confirm complete_checkout_outcome_atomic signature uses p_vdo_start_reading
--    and p_vdo_end_reading (numeric, numeric for params 3 and 4):
-- SELECT proname, pg_get_function_arguments(oid)
-- FROM pg_proc
-- WHERE proname = 'complete_checkout_outcome_atomic'
--   AND pronamespace = 'public'::regnamespace;
-- Expected: one row; args include 'p_vdo_start_reading numeric' and
-- 'p_vdo_end_reading numeric' (NOT integer/p_checkout_fee_cents).

-- 3. Confirm function grant is in place for authenticated:
-- SELECT routine_name, grantee, privilege_type
-- FROM information_schema.routine_privileges
-- WHERE routine_schema = 'public'
--   AND routine_name   = 'complete_checkout_outcome_atomic'
-- ORDER BY grantee;

-- 4. Confirm checkout_invoice_live_amount exposes vdo_start_reading,
--    vdo_end_reading, and vdo_hours_flown:
-- SELECT column_name
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name   = 'checkout_invoice_live_amount'
-- ORDER BY ordinal_position;
-- Expected columns include: vdo_start_reading, vdo_end_reading, vdo_hours_flown

-- 5. Confirm view SELECT grant for authenticated is restored:
-- SELECT table_name, grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public'
--   AND table_name   = 'checkout_invoice_live_amount'
--   AND grantee      = 'authenticated';
