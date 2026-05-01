-- ============================================================
-- 036_airports_landing_charges.sql
--
-- 1. Create `airports` table and seed NSW airport list
-- 2. Create `checkout_landing_charges` table
-- 3. Add `checkout_outcome` and `checkout_landing_subtotal_cents`
--    to `checkout_invoices`
-- 4. Create `checkout_invoice_live_amount` display view
-- 5. Drop the old 5-parameter `complete_checkout_outcome_atomic`
--    and replace with the new 7-parameter version that:
--      - supports all 4 checkout outcomes
--      - inserts landing charge rows (server-side fee lookup)
--      - stores checkout_outcome for post-payment promotion
--      - rejects inactive airports
--      - rejects landing_count <= 0
--      - is idempotent against duplicate calls
-- ============================================================


-- ── PART 1: airports table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.airports (
  id                        uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  icao_code                 text         NOT NULL UNIQUE,
  name                      text         NOT NULL,
  is_active                 boolean      NOT NULL DEFAULT true,
  default_landing_fee_cents integer      NOT NULL DEFAULT 2500,
  created_at                timestamptz  DEFAULT now()
);

-- RLS
ALTER TABLE public.airports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view active airports" ON public.airports;
CREATE POLICY "Authenticated users can view active airports" ON public.airports
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admin full access airports" ON public.airports;
CREATE POLICY "Admin full access airports" ON public.airports
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Seed NSW airports (idempotent via ON CONFLICT DO NOTHING)
INSERT INTO public.airports (icao_code, name, is_active, default_landing_fee_cents) VALUES
  ('YSBK', 'Sydney/Bankstown Airport',              true,  2500),
  ('YSCN', 'Camden Airport',                        true,  2500),
  ('YSHL', 'Shellharbour/Wollongong Airport',        true,  2500),
  ('YWVA', 'Warnervale/Central Coast Airport',       true,  2500),
  ('YCNK', 'Cessnock Airport',                       true,  2500),
  ('YBTH', 'Bathurst Airport',                       true,  2500),
  ('YMDG', 'Mudgee Airport',                         true,  2500),
  ('YGLB', 'Goulburn Airport',                       true,  2500),
  ('YMND', 'Maitland Airport',                       true,  2500),
  ('YWLM', 'Newcastle/Williamtown Airport',          true,  2500),
  ('YSSY', 'Sydney Kingsford Smith International',  true,  2500),
  ('YOAS', 'The Oaks Airfield',                      true,  2500),
  ('YWBN', 'Wedderburn Airport',                     true,  2500),
  ('YORG', 'Orange Airport',                         true,  2500),
  ('YRYL', 'Rylstone Airpark',                       true,  2500),
  ('YSMB', 'Somersby/Gosford Airport',               true,  2500),
  ('YSWS', 'Western Sydney International',           false, 2500)
ON CONFLICT (icao_code) DO NOTHING;


-- ── PART 2: checkout_landing_charges table ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.checkout_landing_charges (
  id                 uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id         uuid         NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  airport_id         uuid         NOT NULL REFERENCES public.airports(id),
  landing_count      integer      NOT NULL CHECK (landing_count > 0),
  unit_amount_cents  integer      NOT NULL CHECK (unit_amount_cents >= 0),
  total_amount_cents integer      NOT NULL CHECK (total_amount_cents >= 0),
  created_at         timestamptz  DEFAULT now(),
  updated_at         timestamptz  DEFAULT now()
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


-- ── PART 3: Add new columns to checkout_invoices ───────────────────────────────
-- checkout_outcome: stores the admin-selected outcome so the payment
--   webhook/RPC knows which clearance to promote to after payment.
-- checkout_landing_subtotal_cents: sum of all landing charge rows.

ALTER TABLE public.checkout_invoices
  ADD COLUMN IF NOT EXISTS checkout_outcome                text,
  ADD COLUMN IF NOT EXISTS checkout_landing_subtotal_cents integer NOT NULL DEFAULT 0;

-- Add CHECK constraint on checkout_outcome (DROP first for idempotency)
ALTER TABLE public.checkout_invoices
  DROP CONSTRAINT IF EXISTS valid_checkout_outcome;
ALTER TABLE public.checkout_invoices
  ADD CONSTRAINT valid_checkout_outcome CHECK (
    checkout_outcome IS NULL OR checkout_outcome IN (
      'cleared_for_solo_hire',
      'additional_supervised_time_required',
      'reschedule_required',
      'not_currently_eligible'
    )
  );


-- ── PART 4: checkout_invoice_live_amount view (display only) ──────────────────
-- IMPORTANT: This view is for read-only dashboard display.
-- The authoritative amount at payment time comes from
-- prepare_checkout_payment_atomic (migration 037).
--
-- Accounting model — Option 1 (chosen):
--   advance_applied_cents = total credit applied (initial + any later top-ups)
--   total_paid_cents      = Stripe / card payments ONLY (never includes credit)
--
-- Correct remaining formula:
--   amount_due = subtotal - advance_applied - total_paid - current_available_credit
--
-- Why subtracting current_credit is correct:
--   At invoice creation, the ledger entry (-advance_applied_cents) is written,
--   so customer_credit_balances already reflects the initial debit.
--   current_credit_balance is therefore the credit available AFTER the initial
--   application, i.e. any credit added since invoice creation.
--   Subtracting it here gives the customer visibility of further savings without
--   double-counting the advance already captured in advance_applied_cents.

CREATE OR REPLACE VIEW public.checkout_invoice_live_amount
WITH (security_invoker = true) AS
SELECT
  ci.id                                                      AS invoice_id,
  ci.booking_id,
  ci.customer_id,
  ci.subtotal_cents,
  ci.advance_applied_cents,
  ci.total_paid_cents,
  ci.status,
  ci.checkout_outcome,
  ci.checkout_duration_hours,
  ci.checkout_landing_subtotal_cents,
  COALESCE(ccb.balance_cents, 0)                            AS current_credit_balance_cents,
  GREATEST(
    ci.subtotal_cents
    - ci.advance_applied_cents
    - ci.total_paid_cents
    - COALESCE(ccb.balance_cents, 0)
  , 0)                                                       AS display_amount_due_cents
FROM public.checkout_invoices ci
LEFT JOIN public.customer_credit_balances ccb
       ON ccb.customer_id = ci.customer_id
WHERE ci.invoice_type = 'checkout';

COMMENT ON VIEW public.checkout_invoice_live_amount IS
  'Read-only display view. Do NOT use for Stripe session creation — '
  'call prepare_checkout_payment_atomic instead.';


-- ── PART 5: Replace complete_checkout_outcome_atomic ──────────────────────────
-- Drop ONLY the old 5-parameter signature used in migration 035.
-- The new signature adds p_checkout_outcome and p_landing_charges.
-- Signature: (uuid, uuid, integer, numeric, text DEFAULT NULL)

DROP FUNCTION IF EXISTS public.complete_checkout_outcome_atomic(
  uuid, uuid, integer, numeric, text
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
    'cleared_for_solo_hire',
    'additional_supervised_time_required',
    'reschedule_required',
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

-- Grant: admin UI calls this via the authenticated Supabase client.
-- SECURITY DEFINER means it runs as the function owner (postgres/service) and
-- can bypass RLS for the tables it writes. The internal auth.uid() + role check
-- ensures only real admins can execute the business logic.
REVOKE ALL ON FUNCTION public.complete_checkout_outcome_atomic(
  uuid, uuid, integer, numeric, text, jsonb, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_checkout_outcome_atomic(
  uuid, uuid, integer, numeric, text, jsonb, text
) TO authenticated;
