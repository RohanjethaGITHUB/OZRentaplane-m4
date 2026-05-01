-- ============================================================
-- 039_rename_checkout_outcomes.sql
--
-- Renames three checkout outcome / pilot clearance status values:
--   cleared_for_solo_hire               → cleared_to_fly
--   additional_supervised_time_required → additional_checkout_required
--   reschedule_required                 → checkout_reschedule_required
--   not_currently_eligible              (unchanged)
--
-- Safe migration order:
--   1. Drop check constraints (unblock both tables for data updates)
--   2. Update existing rows (now unconstrained, safe to write new values)
--   3. Recreate check constraints with the new value set
--   4. Recreate complete_checkout_outcome_atomic (outcome validation list only)
--   5. Recreate create_checkout_booking_atomic (clearance gate only)
--   6. Restore grants on both functions
--
-- Wrapped in a transaction: if any step fails the entire migration rolls back.
-- All constraint names confirmed from migration history:
--   profiles_pilot_clearance_status_check  (last set in migration 033)
--   valid_checkout_outcome                 (last set in migration 036)
-- Function bodies are byte-for-byte copies of the latest live versions
-- (create_checkout_booking_atomic from 023, complete_checkout_outcome_atomic
-- from 036) with only the status string literals changed.
-- ============================================================

BEGIN;

-- ── STEP 1: Drop both check constraints ───────────────────────────────────────
-- Dropping first ensures the UPDATE statements in Step 2 cannot be rejected
-- by the old constraint, regardless of which values are already in the table.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_pilot_clearance_status_check;

ALTER TABLE public.checkout_invoices
  DROP CONSTRAINT IF EXISTS valid_checkout_outcome;


-- ── STEP 2: Migrate existing data ─────────────────────────────────────────────
-- Rename the three old values wherever they appear. not_currently_eligible is
-- unchanged and needs no UPDATE.

-- profiles.pilot_clearance_status
UPDATE public.profiles
  SET pilot_clearance_status = 'cleared_to_fly'
  WHERE pilot_clearance_status = 'cleared_for_solo_hire';

UPDATE public.profiles
  SET pilot_clearance_status = 'additional_checkout_required'
  WHERE pilot_clearance_status = 'additional_supervised_time_required';

UPDATE public.profiles
  SET pilot_clearance_status = 'checkout_reschedule_required'
  WHERE pilot_clearance_status = 'reschedule_required';

-- checkout_invoices.checkout_outcome
UPDATE public.checkout_invoices
  SET checkout_outcome = 'cleared_to_fly'
  WHERE checkout_outcome = 'cleared_for_solo_hire';

UPDATE public.checkout_invoices
  SET checkout_outcome = 'additional_checkout_required'
  WHERE checkout_outcome = 'additional_supervised_time_required';

UPDATE public.checkout_invoices
  SET checkout_outcome = 'checkout_reschedule_required'
  WHERE checkout_outcome = 'reschedule_required';


-- ── STEP 3: Recreate check constraints with the new value set ─────────────────

-- profiles.pilot_clearance_status — all 9 valid values, 3 renamed
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

-- checkout_invoices.checkout_outcome — 4 outcome values, 3 renamed
ALTER TABLE public.checkout_invoices
  ADD CONSTRAINT valid_checkout_outcome CHECK (
    checkout_outcome IS NULL OR checkout_outcome IN (
      'cleared_to_fly',
      'additional_checkout_required',
      'checkout_reschedule_required',
      'not_currently_eligible'
    )
  );


-- ── STEP 4: Recreate complete_checkout_outcome_atomic ─────────────────────────
-- Full body preserved from migration 036 (7-param version).
-- Only change: p_checkout_outcome IN (...) validation list updated to new values.
-- All billing, landing charge, credit, and booking conflict logic is unchanged.

DROP FUNCTION IF EXISTS public.complete_checkout_outcome_atomic(
  uuid, uuid, integer, numeric, text, jsonb, text
);

CREATE OR REPLACE FUNCTION public.complete_checkout_outcome_atomic(
  p_booking_id              uuid,
  p_customer_id             uuid,
  p_checkout_fee_cents      integer,    -- admin-entered gross total (flight + landings), cents
  p_checkout_duration_hours numeric,    -- actual time flown in hours (e.g. 1.5)
  p_checkout_outcome        text,       -- one of 4 outcome values
  p_landing_charges         jsonb,      -- [{airport_id, landing_count}] — fees looked up server-side
  p_admin_notes             text DEFAULT NULL
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

  -- ── Input validation ──────────────────────────────────────────────────────────
  IF p_booking_id IS NULL THEN
    RAISE EXCEPTION 'booking_id is required';
  END IF;
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_id is required';
  END IF;
  IF p_checkout_fee_cents IS NULL OR p_checkout_fee_cents <= 0 THEN
    RAISE EXCEPTION 'checkout_fee_cents must be a positive integer (got %)', p_checkout_fee_cents;
  END IF;
  IF p_checkout_duration_hours IS NULL OR p_checkout_duration_hours <= 0 THEN
    RAISE EXCEPTION 'checkout_duration_hours must be greater than 0 (got %)', p_checkout_duration_hours;
  END IF;
  IF p_checkout_outcome NOT IN (
    'cleared_to_fly',
    'additional_checkout_required',
    'checkout_reschedule_required',
    'not_currently_eligible'
  ) THEN
    RAISE EXCEPTION 'Invalid checkout_outcome: %', p_checkout_outcome;
  END IF;

  -- ── Validate and compute landing charges ──────────────────────────────────────
  -- Only airport_id and landing_count come from the frontend.
  -- Fees are looked up from airports.default_landing_fee_cents.
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

  -- ── Customer-level advisory lock (prevents double-spend race) ────────────────
  PERFORM pg_advisory_xact_lock(hashtext(p_customer_id::text));

  -- ── Idempotency guard ─────────────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM public.checkout_invoices
    WHERE  booking_id = p_booking_id AND invoice_type = 'checkout'
  ) THEN
    RAISE EXCEPTION 'Checkout invoice already exists for booking %', p_booking_id;
  END IF;

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
  'Records a checkout outcome for any of the 4 outcomes, creates an invoice '
  'with landing charge rows, applies existing credit, and atomically updates '
  'booking + clearance status. Called by admin only. '
  'Replaces the old 5-parameter version from migration 035.';

REVOKE ALL ON FUNCTION public.complete_checkout_outcome_atomic(
  uuid, uuid, integer, numeric, text, jsonb, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_checkout_outcome_atomic(
  uuid, uuid, integer, numeric, text, jsonb, text
) TO authenticated;


-- ── STEP 5: Recreate create_checkout_booking_atomic ──────────────────────────
-- Full body preserved from migration 023 (3-param version).
-- Only change: clearance gate updated to new status names.
--   additional_checkout_required  (was: additional_supervised_time_required)
--   checkout_reschedule_required  (was: reschedule_required)
-- All conflict detection, buffer, booking, and audit logic is unchanged.

DROP FUNCTION IF EXISTS public.create_checkout_booking_atomic(
  uuid, timestamptz, text
);

CREATE FUNCTION public.create_checkout_booking_atomic(
  p_aircraft_id     uuid,
  p_scheduled_start timestamptz,
  p_customer_notes  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  CHECKOUT_RATE            constant numeric(10,2) := 290.00;
  v_user_id                uuid;
  v_clearance_status       text;
  v_active_checkout_count  integer;
  v_aircraft               record;
  v_scheduled_end          timestamptz;
  v_conflict_count         integer;
  v_expanded_start         timestamptz;
  v_expanded_end           timestamptz;
  v_booking_id             uuid;
  v_booking_reference      text;
  v_now                    timestamptz;
BEGIN

  -- ── Auth ────────────────────────────────────────────────────────────────────
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  -- ── Fixed 1-hour duration ─────────────────────────────────────────────────
  v_scheduled_end := p_scheduled_start + interval '1 hour';

  -- ── Clearance status gate ─────────────────────────────────────────────────
  -- Allowed states:
  --   checkout_required             → first-time checkout
  --   additional_checkout_required  → repeat session after additional checkout
  --   checkout_reschedule_required  → repeat session after reschedule
  -- All other states (checkout_requested, checkout_confirmed,
  -- checkout_completed_under_review, cleared_to_fly,
  -- not_currently_eligible) are blocked.
  SELECT pilot_clearance_status
  INTO   v_clearance_status
  FROM   public.profiles
  WHERE  id = v_user_id;

  IF v_clearance_status NOT IN (
    'checkout_required',
    'additional_checkout_required',
    'checkout_reschedule_required'
  ) THEN
    RAISE EXCEPTION 'VALIDATION: Your current status does not allow submitting a checkout request.';
  END IF;

  -- ── One active checkout at a time ─────────────────────────────────────────
  -- Prevents duplicate submissions. "Active" means the booking is waiting for
  -- admin confirmation or has been confirmed but not yet flown.
  SELECT COUNT(*)
  INTO   v_active_checkout_count
  FROM   public.bookings
  WHERE  booking_owner_user_id = v_user_id
    AND  booking_type          = 'checkout'
    AND  status IN ('checkout_requested', 'checkout_confirmed');

  IF v_active_checkout_count > 0 THEN
    RAISE EXCEPTION 'VALIDATION: You already have an active checkout booking. Please wait for it to be resolved before submitting a new request.';
  END IF;

  -- ── Date validation ────────────────────────────────────────────────────────
  IF p_scheduled_start <= now() THEN
    RAISE EXCEPTION 'VALIDATION: Checkout flight time must be in the future.';
  END IF;

  -- ── Fetch aircraft ─────────────────────────────────────────────────────────
  SELECT id,
         status,
         default_preflight_buffer_minutes,
         default_postflight_buffer_minutes
  INTO   v_aircraft
  FROM   public.aircraft
  WHERE  id = p_aircraft_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aircraft not found.';
  END IF;

  IF v_aircraft.status IN ('inactive', 'grounded') THEN
    RAISE EXCEPTION 'AVAILABILITY: This aircraft is not currently available.';
  END IF;

  -- ── Buffer-expanded window ────────────────────────────────────────────────
  v_expanded_start := p_scheduled_start
    - (v_aircraft.default_preflight_buffer_minutes  || ' minutes')::interval;
  v_expanded_end   := v_scheduled_end
    + (v_aircraft.default_postflight_buffer_minutes || ' minutes')::interval;

  -- ── Conflict check ────────────────────────────────────────────────────────
  SELECT COUNT(*)
  INTO   v_conflict_count
  FROM   public.schedule_blocks
  WHERE  aircraft_id = p_aircraft_id
    AND  status      = 'active'
    AND  start_time  < v_expanded_end
    AND  end_time    > v_expanded_start
    AND  NOT (
           block_type = 'temporary_hold'
           AND expires_at IS NOT NULL
           AND expires_at <= now()
         );

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'AVAILABILITY: The selected time overlaps with an existing booking or block.';
  END IF;

  -- ── Insert booking ────────────────────────────────────────────────────────
  v_now := now();

  INSERT INTO public.bookings (
    aircraft_id,
    booking_owner_user_id,
    scheduled_start,
    scheduled_end,
    status,
    booking_type,
    estimated_hours,
    estimated_amount,
    customer_notes,
    payment_status,
    created_at,
    updated_at
  ) VALUES (
    p_aircraft_id,
    v_user_id,
    p_scheduled_start,
    v_scheduled_end,
    'checkout_requested',
    'checkout',
    1,               -- 1 hour, fixed
    CHECKOUT_RATE,   -- $290.00
    p_customer_notes,
    'not_required',
    v_now,
    v_now
  )
  RETURNING id, booking_reference
  INTO v_booking_id, v_booking_reference;

  -- ── Schedule blocks ───────────────────────────────────────────────────────
  INSERT INTO public.schedule_blocks (
    aircraft_id, related_booking_id, block_type,
    start_time, end_time,
    public_label, internal_reason,
    created_by_user_id, created_by_role,
    is_public_visible, status
  ) VALUES
    -- Flight block
    (p_aircraft_id, v_booking_id, 'customer_booking',
     p_scheduled_start, v_scheduled_end,
     'Checkout Flight', NULL,
     v_user_id, 'customer', true, 'active'),
    -- Pre-flight buffer
    (p_aircraft_id, v_booking_id, 'buffer',
     v_expanded_start, p_scheduled_start,
     NULL, 'Pre-flight buffer (checkout)',
     v_user_id, 'customer', false, 'active'),
    -- Post-flight buffer
    (p_aircraft_id, v_booking_id, 'buffer',
     v_scheduled_end, v_expanded_end,
     NULL, 'Post-flight buffer (checkout)',
     v_user_id, 'customer', false, 'active');

  -- ── Status history ─────────────────────────────────────────────────────────
  INSERT INTO public.booking_status_history (
    booking_id, old_status, new_status, changed_by_user_id, note
  ) VALUES (
    v_booking_id, NULL, 'checkout_requested', v_user_id,
    'Checkout booking submitted by customer.'
  );

  -- ── Audit event ───────────────────────────────────────────────────────────
  INSERT INTO public.booking_audit_events (
    booking_id, aircraft_id, actor_user_id, actor_role,
    event_type, event_summary, new_value
  ) VALUES (
    v_booking_id, p_aircraft_id, v_user_id, 'customer',
    'checkout_booking_submitted',
    'Customer submitted 1-hour checkout booking ($290).',
    jsonb_build_object(
      'booking_id',        v_booking_id,
      'booking_reference', v_booking_reference,
      'status',            'checkout_requested',
      'booking_type',      'checkout',
      'estimated_hours',   1,
      'estimated_amount',  CHECKOUT_RATE
    )
  );

  -- ── Update pilot clearance status ─────────────────────────────────────────
  UPDATE public.profiles
  SET    pilot_clearance_status = 'checkout_requested',
         updated_at             = v_now
  WHERE  id = v_user_id;

  -- ── Return result ─────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'booking_id',        v_booking_id,
    'booking_reference', v_booking_reference,
    'scheduled_start',   p_scheduled_start,
    'scheduled_end',     v_scheduled_end,
    'status',            'checkout_requested',
    'booking_type',      'checkout',
    'estimated_hours',   1,
    'estimated_amount',  CHECKOUT_RATE
  );

END;
$$;

REVOKE EXECUTE
  ON FUNCTION public.create_checkout_booking_atomic(uuid, timestamptz, text)
  FROM PUBLIC;

GRANT EXECUTE
  ON FUNCTION public.create_checkout_booking_atomic(uuid, timestamptz, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================
-- POST-MIGRATION VERIFICATION QUERIES
-- Run these manually after applying the migration to confirm
-- the data and schema are in the expected state.
-- ============================================================

-- 1. Count profiles by pilot_clearance_status.
--    Old values (cleared_for_solo_hire, additional_supervised_time_required,
--    reschedule_required) must show 0 rows.
--
-- SELECT pilot_clearance_status, COUNT(*)
-- FROM public.profiles
-- GROUP BY pilot_clearance_status
-- ORDER BY pilot_clearance_status;

-- 2. Count checkout_invoices by checkout_outcome.
--    Old values must show 0 rows.
--
-- SELECT checkout_outcome, COUNT(*)
-- FROM public.checkout_invoices
-- GROUP BY checkout_outcome
-- ORDER BY checkout_outcome;

-- 3. Confirm the live constraint on profiles allows exactly the 9 expected values.
--
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.profiles'::regclass
--   AND conname = 'profiles_pilot_clearance_status_check';

-- 4. Confirm the live constraint on checkout_invoices allows exactly the 4 expected values.
--
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.checkout_invoices'::regclass
--   AND conname = 'valid_checkout_outcome';

-- 5. Confirm the function signatures exist with correct argument types.
--
-- SELECT proname, pg_get_function_arguments(oid) AS args
-- FROM pg_proc
-- WHERE proname IN (
--   'create_checkout_booking_atomic',
--   'complete_checkout_outcome_atomic'
-- )
-- AND pronamespace = 'public'::regnamespace
-- ORDER BY proname;

-- 6. Confirm grants — both functions must be executable by the authenticated role.
--
-- SELECT routine_name, grantee, privilege_type
-- FROM information_schema.routine_privileges
-- WHERE routine_schema = 'public'
--   AND routine_name IN (
--     'create_checkout_booking_atomic',
--     'complete_checkout_outcome_atomic'
--   )
-- ORDER BY routine_name, grantee;
