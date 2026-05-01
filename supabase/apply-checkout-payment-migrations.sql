-- ==========================================================================
-- apply-checkout-payment-migrations.sql  (migrations 034–037, combined)
--
-- ACCOUNTING MODEL — Option 1:
--   advance_applied_cents = ALL credit consumed (initial + top-ups)
--   total_paid_cents      = Stripe / card payments ONLY
--   amount_due = subtotal - advance_applied - total_paid - current_available_credit
-- ==========================================================================


-- ── 034: Dynamic pricing columns ──────────────────────────────────────────────

ALTER TABLE public.checkout_invoices
  ADD COLUMN IF NOT EXISTS checkout_duration_hours          numeric,
  ADD COLUMN IF NOT EXISTS checkout_rate_cents_per_hour     integer DEFAULT 29000,
  ADD COLUMN IF NOT EXISTS checkout_calculated_amount_cents integer,
  ADD COLUMN IF NOT EXISTS checkout_final_amount_cents      integer,
  ADD COLUMN IF NOT EXISTS checkout_completed_at            timestamptz,
  ADD COLUMN IF NOT EXISTS checkout_completed_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL;


-- ── 035: Drop old RPCs and legacy column defaults ─────────────────────────────

DROP FUNCTION IF EXISTS public.apply_credit_and_create_checkout_invoice_atomic(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.apply_credit_and_create_checkout_invoice_atomic(uuid, uuid, integer, numeric, integer);

ALTER TABLE public.checkout_invoices ALTER COLUMN subtotal_cents          DROP DEFAULT;
ALTER TABLE public.checkout_invoices ALTER COLUMN stripe_amount_due_cents DROP DEFAULT;


-- ── 036 Part A: airports table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.airports (
  id                        uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  icao_code                 text        NOT NULL UNIQUE,
  name                      text        NOT NULL,
  is_active                 boolean     NOT NULL DEFAULT true,
  default_landing_fee_cents integer     NOT NULL DEFAULT 2500,
  created_at                timestamptz DEFAULT now()
);

ALTER TABLE public.airports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view active airports" ON public.airports;
CREATE POLICY "Authenticated users can view active airports" ON public.airports
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admin full access airports" ON public.airports;
CREATE POLICY "Admin full access airports" ON public.airports
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

INSERT INTO public.airports (icao_code, name, is_active, default_landing_fee_cents) VALUES
  ('YSBK', 'Sydney/Bankstown Airport',             true,  2500),
  ('YSCN', 'Camden Airport',                       true,  2500),
  ('YSHL', 'Shellharbour/Wollongong Airport',       true,  2500),
  ('YWVA', 'Warnervale/Central Coast Airport',      true,  2500),
  ('YCNK', 'Cessnock Airport',                      true,  2500),
  ('YBTH', 'Bathurst Airport',                      true,  2500),
  ('YMDG', 'Mudgee Airport',                        true,  2500),
  ('YGLB', 'Goulburn Airport',                      true,  2500),
  ('YMND', 'Maitland Airport',                      true,  2500),
  ('YWLM', 'Newcastle/Williamtown Airport',         true,  2500),
  ('YSSY', 'Sydney Kingsford Smith International', true,  2500),
  ('YOAS', 'The Oaks Airfield',                     true,  2500),
  ('YWBN', 'Wedderburn Airport',                    true,  2500),
  ('YORG', 'Orange Airport',                        true,  2500),
  ('YRYL', 'Rylstone Airpark',                      true,  2500),
  ('YSMB', 'Somersby/Gosford Airport',              true,  2500),
  ('YSWS', 'Western Sydney International',          false, 2500)
ON CONFLICT (icao_code) DO NOTHING;


-- ── 036 Part B: checkout_landing_charges table ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.checkout_landing_charges (
  id                 uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id         uuid        NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  airport_id         uuid        NOT NULL REFERENCES public.airports(id),
  landing_count      integer     NOT NULL CHECK (landing_count > 0),
  unit_amount_cents  integer     NOT NULL CHECK (unit_amount_cents >= 0),
  total_amount_cents integer     NOT NULL CHECK (total_amount_cents >= 0),
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

ALTER TABLE public.checkout_landing_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can view own landing charges" ON public.checkout_landing_charges;
CREATE POLICY "Customers can view own landing charges" ON public.checkout_landing_charges
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bookings
      WHERE id = checkout_landing_charges.booking_id
        AND booking_owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admin full access landing charges" ON public.checkout_landing_charges;
CREATE POLICY "Admin full access landing charges" ON public.checkout_landing_charges
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ── 036 Part C: New columns on checkout_invoices ──────────────────────────────

ALTER TABLE public.checkout_invoices
  ADD COLUMN IF NOT EXISTS checkout_outcome                text,
  ADD COLUMN IF NOT EXISTS checkout_landing_subtotal_cents integer NOT NULL DEFAULT 0;

ALTER TABLE public.checkout_invoices DROP CONSTRAINT IF EXISTS valid_checkout_outcome;
ALTER TABLE public.checkout_invoices ADD CONSTRAINT valid_checkout_outcome CHECK (
  checkout_outcome IS NULL OR checkout_outcome IN (
    'cleared_to_fly',
    'additional_checkout_required',
    'checkout_reschedule_required',
    'not_currently_eligible'
  )
);


-- ── 036 Part D: checkout_invoice_live_amount view ─────────────────────────────
-- Formula: amount_due = subtotal - advance_applied - total_paid - current_credit
-- current_credit (customer_credit_balances) already reflects the initial
-- advance_applied debit, so it equals credit added AFTER invoice creation only.
-- No double-counting occurs under Option 1.

CREATE OR REPLACE VIEW public.checkout_invoice_live_amount
WITH (security_invoker = true) AS
SELECT
  ci.id                                            AS invoice_id,
  ci.booking_id,
  ci.customer_id,
  ci.subtotal_cents,
  ci.advance_applied_cents,
  ci.total_paid_cents,
  ci.status,
  ci.checkout_outcome,
  ci.checkout_duration_hours,
  ci.checkout_landing_subtotal_cents,
  COALESCE(ccb.balance_cents, 0)                   AS current_credit_balance_cents,
  GREATEST(
    ci.subtotal_cents
    - ci.advance_applied_cents
    - ci.total_paid_cents
    - COALESCE(ccb.balance_cents, 0)
  , 0)                                             AS display_amount_due_cents
FROM public.checkout_invoices ci
LEFT JOIN public.customer_credit_balances ccb ON ccb.customer_id = ci.customer_id
WHERE ci.invoice_type = 'checkout';

COMMENT ON VIEW public.checkout_invoice_live_amount IS
  'Read-only display view. Do NOT use for Stripe session creation — '
  'call prepare_checkout_payment_atomic instead.';


-- ── 036 Part E: complete_checkout_outcome_atomic (7-param replacement) ─────────
-- Drops the old 5-param signature from migration 035 only.

DROP FUNCTION IF EXISTS public.complete_checkout_outcome_atomic(uuid, uuid, integer, numeric, text);

CREATE OR REPLACE FUNCTION public.complete_checkout_outcome_atomic(
  p_booking_id              uuid,
  p_customer_id             uuid,
  p_checkout_fee_cents      integer,
  p_checkout_duration_hours numeric,
  p_checkout_outcome        text,
  p_landing_charges         jsonb,
  p_admin_notes             text DEFAULT NULL
)
RETURNS TABLE (
  out_invoice_id             uuid,
  out_amount_due_now_cents   integer,
  out_final_booking_status   text,
  out_pilot_clearance_status text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_checkout_rate_cents     integer := 29000;
  v_booking_customer_id     uuid;
  v_balance_cents           integer := 0;
  v_advance_applied_cents   integer := 0;
  v_amount_due_cents        integer := 0;
  v_invoice_status          text;
  v_invoice_id              uuid;
  v_calculated_amount_cents integer;
  v_final_booking_status    text;
  v_final_clearance_status  text;
  v_landing_subtotal_cents  integer := 0;
  v_charge                  jsonb;
  v_airport_id              uuid;
  v_landing_count           integer;
  v_unit_amount_cents       integer;
  v_row_total_cents         integer;
  v_airport_active          boolean;
BEGIN
  -- Auth: admin only
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: caller must be an admin';
  END IF;

  -- Input validation
  IF p_booking_id IS NULL THEN RAISE EXCEPTION 'booking_id is required'; END IF;
  IF p_customer_id IS NULL THEN RAISE EXCEPTION 'customer_id is required'; END IF;
  IF p_checkout_fee_cents IS NULL OR p_checkout_fee_cents <= 0 THEN
    RAISE EXCEPTION 'checkout_fee_cents must be > 0 (got %)', p_checkout_fee_cents;
  END IF;
  IF p_checkout_duration_hours IS NULL OR p_checkout_duration_hours <= 0 THEN
    RAISE EXCEPTION 'checkout_duration_hours must be > 0 (got %)', p_checkout_duration_hours;
  END IF;
  IF p_checkout_outcome NOT IN (
    'cleared_to_fly','additional_checkout_required',
    'checkout_reschedule_required','not_currently_eligible'
  ) THEN
    RAISE EXCEPTION 'Invalid checkout_outcome: %', p_checkout_outcome;
  END IF;

  -- Validate and sum landing charges (fee looked up server-side)
  IF p_landing_charges IS NOT NULL AND jsonb_array_length(p_landing_charges) > 0 THEN
    FOR v_charge IN SELECT * FROM jsonb_array_elements(p_landing_charges) LOOP
      BEGIN v_airport_id  := (v_charge->>'airport_id')::uuid;
      EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid airport_id: %', v_charge->>'airport_id'; END;
      BEGIN v_landing_count := (v_charge->>'landing_count')::integer;
      EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid landing_count: %', v_charge->>'landing_count'; END;
      IF v_landing_count <= 0 THEN
        RAISE EXCEPTION 'landing_count must be > 0 (got % for airport %)', v_landing_count, v_airport_id;
      END IF;
      SELECT is_active, default_landing_fee_cents INTO v_airport_active, v_unit_amount_cents
      FROM public.airports WHERE id = v_airport_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Airport not found: %', v_airport_id; END IF;
      IF NOT v_airport_active THEN RAISE EXCEPTION 'Airport % is not active', v_airport_id; END IF;
      v_row_total_cents        := v_landing_count * v_unit_amount_cents;
      v_landing_subtotal_cents := v_landing_subtotal_cents + v_row_total_cents;
    END LOOP;
  END IF;

  v_calculated_amount_cents := ROUND(p_checkout_duration_hours * v_checkout_rate_cents)::integer;

  -- Lock booking row and verify ownership
  SELECT booking_owner_user_id INTO v_booking_customer_id
  FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF v_booking_customer_id IS NULL THEN RAISE EXCEPTION 'Booking not found: %', p_booking_id; END IF;
  IF v_booking_customer_id != p_customer_id THEN
    RAISE EXCEPTION 'Booking % does not belong to customer %', p_booking_id, p_customer_id;
  END IF;

  -- Customer-level advisory lock (prevents double-spend race)
  PERFORM pg_advisory_xact_lock(hashtext(p_customer_id::text));

  -- Idempotency: reject duplicate invoice creation
  IF EXISTS (SELECT 1 FROM public.checkout_invoices WHERE booking_id = p_booking_id AND invoice_type = 'checkout') THEN
    RAISE EXCEPTION 'Checkout invoice already exists for booking %', p_booking_id;
  END IF;

  -- Read credit balance
  SELECT COALESCE(balance_cents, 0) INTO v_balance_cents
  FROM public.customer_credit_balances WHERE customer_id = p_customer_id;
  v_balance_cents := GREATEST(COALESCE(v_balance_cents, 0), 0);

  -- Option 1: advance_applied = credit, total_paid starts at 0 (Stripe-only)
  v_advance_applied_cents := LEAST(v_balance_cents, p_checkout_fee_cents);
  v_amount_due_cents      := p_checkout_fee_cents - v_advance_applied_cents;

  v_invoice_status         := CASE WHEN v_amount_due_cents = 0 THEN 'paid'      ELSE 'payment_required'         END;
  v_final_booking_status   := CASE WHEN v_amount_due_cents = 0 THEN 'completed' ELSE 'checkout_payment_required' END;
  v_final_clearance_status := CASE WHEN v_amount_due_cents = 0 THEN p_checkout_outcome ELSE 'checkout_payment_required' END;

  INSERT INTO public.checkout_invoices (
    customer_id, booking_id, invoice_type, status,
    subtotal_cents, advance_applied_cents, stripe_amount_due_cents,
    total_paid_cents,   -- Option 1: Stripe-only, starts at 0
    paid_at,
    checkout_duration_hours, checkout_rate_cents_per_hour,
    checkout_calculated_amount_cents, checkout_final_amount_cents,
    checkout_completed_at, checkout_completed_by,
    checkout_outcome, checkout_landing_subtotal_cents
  ) VALUES (
    p_customer_id, p_booking_id, 'checkout', v_invoice_status,
    p_checkout_fee_cents,
    v_advance_applied_cents,
    v_amount_due_cents,
    0,                  -- total_paid_cents = 0; credit NOT placed here
    CASE WHEN v_amount_due_cents = 0 THEN now() ELSE NULL END,
    p_checkout_duration_hours, v_checkout_rate_cents,
    v_calculated_amount_cents, p_checkout_fee_cents,
    now(), auth.uid(),
    p_checkout_outcome, v_landing_subtotal_cents
  ) RETURNING id INTO v_invoice_id;

  -- Insert landing charge rows
  IF p_landing_charges IS NOT NULL AND jsonb_array_length(p_landing_charges) > 0 THEN
    FOR v_charge IN SELECT * FROM jsonb_array_elements(p_landing_charges) LOOP
      v_airport_id    := (v_charge->>'airport_id')::uuid;
      v_landing_count := (v_charge->>'landing_count')::integer;
      SELECT default_landing_fee_cents INTO v_unit_amount_cents FROM public.airports WHERE id = v_airport_id;
      v_row_total_cents := v_landing_count * v_unit_amount_cents;
      INSERT INTO public.checkout_landing_charges (booking_id, airport_id, landing_count, unit_amount_cents, total_amount_cents)
      VALUES (p_booking_id, v_airport_id, v_landing_count, v_unit_amount_cents, v_row_total_cents);
    END LOOP;
  END IF;

  -- Debit credit ledger (reduces customer_credit_balances so current_available_credit
  -- in the view only shows post-creation credit — no double-counting)
  IF v_advance_applied_cents > 0 THEN
    INSERT INTO public.customer_payment_ledger (
      customer_id, booking_id, invoice_id, amount_cents, entry_type, note, created_by
    ) VALUES (
      p_customer_id, p_booking_id, v_invoice_id,
      -v_advance_applied_cents, 'advance_applied',
      'Applied to checkout invoice at outcome recording', auth.uid()
    );
  END IF;

  UPDATE public.bookings
  SET status = v_final_booking_status, admin_notes = COALESCE(p_admin_notes, admin_notes), updated_at = now()
  WHERE id = p_booking_id;

  UPDATE public.profiles
  SET pilot_clearance_status = v_final_clearance_status, updated_at = now()
  WHERE id = p_customer_id;

  RETURN QUERY SELECT v_invoice_id, v_amount_due_cents, v_final_booking_status, v_final_clearance_status;
END;
$$;

COMMENT ON FUNCTION public.complete_checkout_outcome_atomic IS
  'Records checkout outcome for any of the 4 outcomes. Creates invoice with '
  'total_paid_cents=0 (Stripe-only). advance_applied_cents holds credit consumed. '
  'Admin only. Replaces old 5-param version from migration 035.';

REVOKE ALL ON FUNCTION public.complete_checkout_outcome_atomic(uuid, uuid, integer, numeric, text, jsonb, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.complete_checkout_outcome_atomic(uuid, uuid, integer, numeric, text, jsonb, text) TO authenticated;


-- ── 037 Part A: prepare_checkout_payment_atomic ───────────────────────────────
-- Called by payment.ts at payment-click time (authenticated customer).
-- Option 1: when additional credit is applied, only advance_applied_cents is
-- updated. total_paid_cents (Stripe-only) is intentionally NOT touched.

CREATE OR REPLACE FUNCTION public.prepare_checkout_payment_atomic(
  p_invoice_id  uuid,
  p_customer_id uuid
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
BEGIN
  IF auth.uid() != p_customer_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_invoice FROM public.checkout_invoices
  WHERE id = p_invoice_id AND customer_id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found: %', p_invoice_id; END IF;

  -- Idempotency: already paid
  IF v_invoice.status = 'paid' THEN
    RETURN QUERY SELECT 0::integer, 'paid'::text, true; RETURN;
  END IF;

  IF v_invoice.status NOT IN ('payment_required') THEN
    RAISE EXCEPTION 'Invoice is not in payment_required state (status: %)', v_invoice.status;
  END IF;

  -- Advisory lock to prevent double-apply race
  PERFORM pg_advisory_xact_lock(hashtext(p_customer_id::text));

  SELECT COALESCE(balance_cents, 0) INTO v_balance_cents
  FROM public.customer_credit_balances WHERE customer_id = p_customer_id;
  v_balance_cents := GREATEST(COALESCE(v_balance_cents, 0), 0);

  -- Option 1: remaining = subtotal - advance_applied - total_paid
  v_remaining_cents    := GREATEST(v_invoice.subtotal_cents - v_invoice.advance_applied_cents - v_invoice.total_paid_cents, 0);
  v_additional_credit  := GREATEST(LEAST(v_balance_cents, v_remaining_cents), 0);
  v_final_amount_cents := GREATEST(v_remaining_cents - v_additional_credit, 0);

  IF v_additional_credit > 0 THEN
    -- Option 1: update advance_applied_cents ONLY.
    -- total_paid_cents is Stripe-only — must NOT be updated here or the view
    -- formula (subtotal - advance - total_paid - current_credit) double-counts.
    UPDATE public.checkout_invoices
    SET advance_applied_cents = advance_applied_cents + v_additional_credit, updated_at = now()
    WHERE id = p_invoice_id;

    INSERT INTO public.customer_payment_ledger (
      customer_id, booking_id, invoice_id, amount_cents, entry_type, note, created_by
    ) VALUES (
      p_customer_id, v_invoice.booking_id, p_invoice_id,
      -v_additional_credit, 'advance_applied',
      'Additional credit applied at payment time', p_customer_id
    );
  END IF;

  -- Fully covered by credit — settle without Stripe
  IF v_final_amount_cents = 0 THEN
    UPDATE public.checkout_invoices
    SET status = 'paid', paid_at = now(), stripe_amount_due_cents = 0, updated_at = now()
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

  -- Update Stripe snapshot for session creation
  UPDATE public.checkout_invoices
  SET stripe_amount_due_cents = v_final_amount_cents, updated_at = now()
  WHERE id = p_invoice_id;

  RETURN QUERY SELECT v_final_amount_cents, 'payment_required'::text, false;
END;
$$;

COMMENT ON FUNCTION public.prepare_checkout_payment_atomic IS
  'Authoritative payment amount at click time (authenticated). Option 1: '
  'advance_applied_cents updated for credit, total_paid_cents untouched. '
  'Idempotent. Settles by credit if possible, otherwise returns Stripe amount.';

REVOKE ALL ON FUNCTION public.prepare_checkout_payment_atomic(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.prepare_checkout_payment_atomic(uuid, uuid) TO authenticated;


-- ── 037 Part B: mark_checkout_invoice_paid_atomic ─────────────────────────────
-- Called by Stripe webhook via service_role client.
-- Option 1: total_paid_cents += Stripe amount. advance_applied_cents untouched.
-- Amount mismatch guard: rejects if Stripe amount != stripe_amount_due_cents.
-- Fully idempotent (two-level).

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
BEGIN
  SELECT * INTO v_invoice FROM public.checkout_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found: %', p_invoice_id; END IF;

  -- Level 1 idempotency: invoice already paid — repair downstream and exit
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
    -- Level 2: ensure ledger entry exists in recovery path
    IF NOT EXISTS (
      SELECT 1 FROM public.customer_payment_ledger
      WHERE stripe_checkout_session_id = p_stripe_checkout_session_id AND entry_type = 'stripe_payment'
    ) THEN
      INSERT INTO public.customer_payment_ledger (
        customer_id, booking_id, invoice_id, amount_cents, entry_type, payment_method,
        stripe_checkout_session_id, stripe_payment_intent_id, note, created_by
      ) VALUES (
        v_invoice.customer_id, v_invoice.booking_id, p_invoice_id,
        p_amount_paid_cents, 'stripe_payment', 'stripe',
        p_stripe_checkout_session_id, p_stripe_payment_intent_id,
        'Stripe checkout payment received (recovery path)', NULL
      );
    END IF;
    RETURN;
  END IF;

  -- Amount mismatch guard — prevents underpayment or mismatched session
  -- completing the invoice. Only fires on the first call (status = payment_required).
  IF v_invoice.stripe_amount_due_cents IS NOT NULL
    AND v_invoice.stripe_amount_due_cents > 0
    AND p_amount_paid_cents != v_invoice.stripe_amount_due_cents
  THEN
    RAISE EXCEPTION
      'Payment amount mismatch for invoice %: expected % cents, received % cents. Refusing to mark paid.',
      p_invoice_id, v_invoice.stripe_amount_due_cents, p_amount_paid_cents;
  END IF;

  -- Option 1: total_paid_cents receives the Stripe amount only.
  -- advance_applied_cents was written at invoice creation and/or by prepare RPC.
  UPDATE public.checkout_invoices
  SET
    status                     = 'paid',
    paid_at                    = now(),
    stripe_payment_intent_id   = p_stripe_payment_intent_id,
    stripe_checkout_session_id = p_stripe_checkout_session_id,
    total_paid_cents           = total_paid_cents + p_amount_paid_cents,
    stripe_amount_due_cents    = 0,
    updated_at                 = now()
  WHERE id = p_invoice_id;

  -- Level 2 idempotency: skip ledger if session already recorded
  IF NOT EXISTS (
    SELECT 1 FROM public.customer_payment_ledger
    WHERE stripe_checkout_session_id = p_stripe_checkout_session_id AND entry_type = 'stripe_payment'
  ) THEN
    INSERT INTO public.customer_payment_ledger (
      customer_id, booking_id, invoice_id, amount_cents, entry_type, payment_method,
      stripe_checkout_session_id, stripe_payment_intent_id, note, created_by
    ) VALUES (
      v_invoice.customer_id, v_invoice.booking_id, p_invoice_id,
      p_amount_paid_cents, 'stripe_payment', 'stripe',
      p_stripe_checkout_session_id, p_stripe_payment_intent_id,
      'Stripe checkout payment received', NULL
    );
  END IF;

  UPDATE public.bookings SET status = 'completed', updated_at = now() WHERE id = v_invoice.booking_id;

  -- Promote clearance to the stored checkout_outcome (all 4 outcomes handled)
  UPDATE public.profiles
  SET pilot_clearance_status = v_invoice.checkout_outcome, updated_at = now()
  WHERE id = v_invoice.customer_id;
END;
$$;

COMMENT ON FUNCTION public.mark_checkout_invoice_paid_atomic IS
  'Called by Stripe webhook via service_role. Validates amount against '
  'stripe_amount_due_cents snapshot. Option 1: total_paid_cents = Stripe only. '
  'Fully idempotent (two-level). Promotes clearance to stored checkout_outcome.';

-- service_role bypasses RLS by default, but an explicit GRANT is required for
-- SECURITY DEFINER functions called via PostgREST / Supabase client.
REVOKE ALL ON FUNCTION public.mark_checkout_invoice_paid_atomic(uuid, text, text, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mark_checkout_invoice_paid_atomic(uuid, text, text, integer) TO service_role;
