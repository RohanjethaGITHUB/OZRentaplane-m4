-- ============================================================
-- 040_checkout_payment_waiver.sql
--
-- Adds optional payment waiver for non-cleared checkout outcomes.
--
-- Business rule:
--   cleared_to_fly:              payment always required
--   additional_checkout_required: admin may charge or waive
--   checkout_reschedule_required: admin may charge or waive
--   not_currently_eligible:       admin may charge or waive
--
-- Changes:
--   1. Add checkout_invoices.waiver_reason column (text, nullable)
--   2. Add 'waived' to valid_invoice_status constraint
--      (confirmed name: valid_invoice_status, set in migration 027)
--   3. Recreate complete_checkout_outcome_atomic as 9-param function
--      Source: migration 039 body (036 body + status renames).
--      Additions only:
--        - p_payment_waived boolean DEFAULT false  (8th param)
--        - p_waiver_reason  text    DEFAULT NULL   (9th param)
--        - waiver validation block
--        - waiver execution path (pre-existing payment path unchanged)
--
-- Idempotency: the existing invoice existence guard fires before both
-- payment and waiver branches — double submission is rejected at the RPC.
--
-- Wrapped in a transaction: any failure rolls back all changes.
-- ============================================================

BEGIN;


-- ── STEP 1: Add waiver_reason column ─────────────────────────────────────────

ALTER TABLE public.checkout_invoices
  ADD COLUMN IF NOT EXISTS waiver_reason text;


-- ── STEP 2: Add 'waived' to invoice status constraint ────────────────────────
-- Constraint confirmed: valid_invoice_status on checkout_invoices
-- Last set in migration 027. Not modified in any subsequent migration.

ALTER TABLE public.checkout_invoices
  DROP CONSTRAINT IF EXISTS valid_invoice_status;

ALTER TABLE public.checkout_invoices
  ADD CONSTRAINT valid_invoice_status
  CHECK (status IN ('draft', 'payment_required', 'paid', 'void', 'failed', 'waived'));


-- ── STEP 3: Recreate complete_checkout_outcome_atomic (9-param) ───────────────
-- Drop the 7-param signature from migration 039, create the 9-param version.
-- The payment path body is byte-for-byte identical to migration 039.
-- The waiver path is a new branch added before the payment path.
-- All landing charge, credit, invoice, and grant logic is preserved.

DROP FUNCTION IF EXISTS public.complete_checkout_outcome_atomic(
  uuid, uuid, integer, numeric, text, jsonb, text
);

CREATE FUNCTION public.complete_checkout_outcome_atomic(
  p_booking_id              uuid,
  p_customer_id             uuid,
  p_checkout_fee_cents      integer,           -- admin gross total in cents; 0 for waived
  p_checkout_duration_hours numeric,           -- hours flown; 0 for waived
  p_checkout_outcome        text,              -- one of 4 outcome values
  p_landing_charges         jsonb,             -- [{airport_id, landing_count}]; NULL for waived
  p_admin_notes             text    DEFAULT NULL,
  p_payment_waived          boolean DEFAULT false,
  p_waiver_reason           text    DEFAULT NULL  -- required when p_payment_waived = true
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
  v_checkout_rate_cents        integer := 29000;   -- $290/hr reference rate
  v_booking_customer_id        uuid;
  v_balance_cents              integer := 0;
  v_advance_applied_cents      integer := 0;
  v_amount_due_cents           integer := 0;
  v_invoice_status             text;
  v_invoice_id                 uuid;
  v_calculated_amount_cents    integer;
  v_final_booking_status       text;
  v_final_clearance_status     text;
  v_landing_subtotal_cents     integer := 0;
  -- Landing charge row processing
  v_charge                     jsonb;
  v_airport_id                 uuid;
  v_landing_count              integer;
  v_unit_amount_cents          integer;
  v_row_total_cents            integer;
  v_airport_active             boolean;
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
  -- Payment cannot be waived for cleared_to_fly (enforced at RPC + frontend).
  IF p_payment_waived AND p_checkout_outcome = 'cleared_to_fly' THEN
    RAISE EXCEPTION 'VALIDATION: Payment cannot be waived for the cleared_to_fly outcome';
  END IF;

  -- Waiver reason is mandatory when waiving payment.
  IF p_payment_waived AND (p_waiver_reason IS NULL OR trim(p_waiver_reason) = '') THEN
    RAISE EXCEPTION 'VALIDATION: A waiver reason is required when payment is waived';
  END IF;

  -- ── Input validation — payment path only ─────────────────────────────────────
  IF NOT p_payment_waived THEN
    IF p_checkout_fee_cents IS NULL OR p_checkout_fee_cents <= 0 THEN
      RAISE EXCEPTION 'checkout_fee_cents must be a positive integer (got %)', p_checkout_fee_cents;
    END IF;
    IF p_checkout_duration_hours IS NULL OR p_checkout_duration_hours <= 0 THEN
      RAISE EXCEPTION 'checkout_duration_hours must be greater than 0 (got %)', p_checkout_duration_hours;
    END IF;
  END IF;

  -- ── Lock booking row and verify ownership ─────────────────────────────────────
  -- Done before the waiver/payment branch so both paths are protected.
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
  -- Creates an audit invoice with status='waived', immediately completes the
  -- booking, and promotes the pilot's clearance to the selected outcome.
  -- No credit is consumed. No Stripe session will be created.
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
      waiver_reason
    ) VALUES (
      p_customer_id,
      p_booking_id,
      'checkout',
      'waived',
      0,           -- subtotal_cents: no charge
      0,           -- advance_applied_cents: no credit consumed
      0,           -- stripe_amount_due_cents: no Stripe session
      0,           -- total_paid_cents: no payment received
      now(),       -- paid_at: treated as settled at waiver time
      0,           -- checkout_duration_hours: not applicable
      0,           -- checkout_rate_cents_per_hour: not applicable
      0,           -- checkout_calculated_amount_cents: not applicable
      0,           -- checkout_final_amount_cents: no charge
      now(),
      auth.uid(),
      p_checkout_outcome,
      0,           -- checkout_landing_subtotal_cents: no landings charged
      p_waiver_reason
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
  -- PAYMENT PATH (unchanged from migration 039 / 036)
  -- Landing charges, credit application, invoice creation, checkout_payment_required
  -- transition — all identical to the previous function version.
  -- ══════════════════════════════════════════════════════════════════════════════

  -- ── Validate and compute landing charges ──────────────────────────────────────
  IF p_landing_charges IS NOT NULL AND jsonb_array_length(p_landing_charges) > 0 THEN
    FOR v_charge IN SELECT * FROM jsonb_array_elements(p_landing_charges) LOOP
      -- Parse and validate airport_id
      BEGIN
        v_airport_id := (v_charge->>'airport_id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid airport_id in landing charges: %', v_charge->>'airport_id';
      END;

      -- Parse and validate landing_count
      BEGIN
        v_landing_count := (v_charge->>'landing_count')::integer;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid landing_count in landing charges: %', v_charge->>'landing_count';
      END;

      IF v_landing_count <= 0 THEN
        RAISE EXCEPTION 'landing_count must be > 0 (got % for airport %)', v_landing_count, v_airport_id;
      END IF;

      -- Look up fee and active status from airports table (server-side, trusted)
      SELECT is_active, default_landing_fee_cents
      INTO   v_airport_active, v_unit_amount_cents
      FROM   public.airports
      WHERE  id = v_airport_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Airport not found: %', v_airport_id;
      END IF;
      IF NOT v_airport_active THEN
        RAISE EXCEPTION 'Airport % is not active for landing charges', v_airport_id;
      END IF;

      v_row_total_cents        := v_landing_count * v_unit_amount_cents;
      v_landing_subtotal_cents := v_landing_subtotal_cents + v_row_total_cents;
    END LOOP;
  END IF;

  -- ── Reference calculation (audit trail) ──────────────────────────────────────
  v_calculated_amount_cents := ROUND(p_checkout_duration_hours * v_checkout_rate_cents)::integer;

  -- ── Credit balance ────────────────────────────────────────────────────────────
  SELECT COALESCE(balance_cents, 0)
  INTO   v_balance_cents
  FROM   public.customer_credit_balances
  WHERE  customer_id = p_customer_id;

  v_balance_cents := COALESCE(v_balance_cents, 0);
  IF v_balance_cents < 0 THEN v_balance_cents := 0; END IF;

  -- ── Determine credit/Stripe split ─────────────────────────────────────────────
  v_advance_applied_cents := LEAST(v_balance_cents, p_checkout_fee_cents);
  v_amount_due_cents      := p_checkout_fee_cents - v_advance_applied_cents;

  -- ── Derived statuses ──────────────────────────────────────────────────────────
  -- Invoice status
  v_invoice_status := CASE WHEN v_amount_due_cents = 0 THEN 'paid' ELSE 'payment_required' END;
  -- Booking status
  v_final_booking_status := CASE WHEN v_amount_due_cents = 0 THEN 'completed' ELSE 'checkout_payment_required' END;
  -- Clearance status:
  --   If fully paid by credit → promote to the actual checkout outcome immediately.
  --   If Stripe payment still owed → hold at checkout_payment_required.
  v_final_clearance_status := CASE
    WHEN v_amount_due_cents = 0 THEN p_checkout_outcome
    ELSE 'checkout_payment_required'
  END;

  -- ── Insert checkout invoice ───────────────────────────────────────────────────
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
    checkout_landing_subtotal_cents
  ) VALUES (
    p_customer_id,
    p_booking_id,
    'checkout',
    v_invoice_status,
    p_checkout_fee_cents,            -- subtotal = admin-entered gross (fixed, never changes)
    -- ACCOUNTING MODEL (Option 1):
    --   advance_applied_cents = credit applied (initial)
    --   total_paid_cents      = Stripe/card payments ONLY → starts at 0
    --   The ledger entry (-v_advance_applied_cents) written below is what
    --   reduces customer_credit_balances.  Do NOT also put credit into
    --   total_paid_cents — that would cause double-subtraction in the view:
    --     subtotal - advance_applied - total_paid - current_credit
    --   With total_paid = 0 this formula is correct.
    v_advance_applied_cents,   -- advance_applied_cents: credit consumed at creation
    v_amount_due_cents,        -- stripe_amount_due_cents: snapshot for Stripe session
    0,                         -- total_paid_cents: Stripe payments only, starts at 0
    CASE WHEN v_amount_due_cents = 0 THEN now() ELSE NULL END,
    p_checkout_duration_hours,
    v_checkout_rate_cents,
    v_calculated_amount_cents,       -- reference: duration × rate (DB-computed, audit only)
    p_checkout_fee_cents,            -- final = admin-entered
    now(),
    auth.uid(),
    p_checkout_outcome,
    v_landing_subtotal_cents
  ) RETURNING id INTO v_invoice_id;

  -- ── Insert landing charge rows ─────────────────────────────────────────────────
  IF p_landing_charges IS NOT NULL AND jsonb_array_length(p_landing_charges) > 0 THEN
    FOR v_charge IN SELECT * FROM jsonb_array_elements(p_landing_charges) LOOP
      v_airport_id    := (v_charge->>'airport_id')::uuid;
      v_landing_count := (v_charge->>'landing_count')::integer;

      SELECT default_landing_fee_cents INTO v_unit_amount_cents
      FROM   public.airports WHERE id = v_airport_id;

      v_row_total_cents := v_landing_count * v_unit_amount_cents;

      INSERT INTO public.checkout_landing_charges (
        booking_id, airport_id, landing_count,
        unit_amount_cents, total_amount_cents
      ) VALUES (
        p_booking_id, v_airport_id, v_landing_count,
        v_unit_amount_cents, v_row_total_cents
      );
    END LOOP;
  END IF;

  -- ── Debit credit ledger if advance applied ────────────────────────────────────
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
  'Records a checkout outcome for any of the 4 outcomes. '
  'Payment path: creates invoice with landing charges, applies credit, transitions '
  'through checkout_payment_required. '
  'Waiver path (non-cleared outcomes only): creates waived audit invoice, immediately '
  'completes booking and promotes pilot clearance to selected outcome. No credit consumed. '
  'Called by admin only.';

REVOKE ALL ON FUNCTION public.complete_checkout_outcome_atomic(
  uuid, uuid, integer, numeric, text, jsonb, text, boolean, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_checkout_outcome_atomic(
  uuid, uuid, integer, numeric, text, jsonb, text, boolean, text
) TO authenticated;

COMMIT;


-- ============================================================
-- POST-MIGRATION VERIFICATION QUERIES
-- ============================================================

-- 1. Confirm valid_invoice_status now includes 'waived':
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.checkout_invoices'::regclass
--   AND conname = 'valid_invoice_status';

-- 2. Confirm waiver_reason column exists:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name   = 'checkout_invoices'
--   AND column_name  = 'waiver_reason';

-- 3. Confirm 9-param function exists with correct signature:
-- SELECT proname, pg_get_function_arguments(oid)
-- FROM pg_proc
-- WHERE proname = 'complete_checkout_outcome_atomic'
--   AND pronamespace = 'public'::regnamespace;

-- 4. Confirm grant is in place:
-- SELECT routine_name, grantee, privilege_type
-- FROM information_schema.routine_privileges
-- WHERE routine_schema = 'public'
--   AND routine_name   = 'complete_checkout_outcome_atomic'
-- ORDER BY grantee;
