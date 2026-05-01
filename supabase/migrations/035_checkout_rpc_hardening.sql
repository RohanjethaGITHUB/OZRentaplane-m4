-- ============================================================
-- 035_checkout_rpc_hardening.sql
--
-- Replaces the two-step invoice-then-status-update approach
-- with a single atomic RPC that:
--
-- 1. Computes checkout_calculated_amount_cents internally from
--    duration × rate (removes reliance on frontend calculation).
-- 2. Validates all inputs strictly at the database level.
-- 3. Creates the checkout invoice.
-- 4. Updates booking status atomically in the same transaction.
-- 5. Updates pilot_clearance_status atomically in the same
--    transaction — preventing the broken state where an invoice
--    exists but the booking/clearance were never updated.
-- 6. Returns enough data for the caller to drive audit/notification
--    without needing a second query.
--
-- Pilot clearance is set to 'checkout_payment_required' when
-- payment is still owed, and to 'cleared_for_solo_hire' only
-- after the full amount is covered (either by credit or Stripe).
-- ============================================================

-- Drop the version added in 034 (5-param signature)
DROP FUNCTION IF EXISTS public.apply_credit_and_create_checkout_invoice_atomic(uuid, uuid, integer, numeric, integer);

-- ── New atomic function ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.complete_checkout_outcome_atomic(
  p_booking_id              uuid,
  p_customer_id             uuid,
  p_checkout_fee_cents      integer,    -- admin-entered final payable amount
  p_checkout_duration_hours numeric,    -- actual duration in hours (e.g. 1.2)
  p_admin_notes             text DEFAULT NULL
)
RETURNS TABLE (
  out_invoice_id              uuid,
  out_stripe_amount_due_cents integer,
  out_final_booking_status    text,
  out_final_clearance_status  text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_checkout_rate_cents        integer := 29000;   -- $290/hr in cents
  v_booking_customer_id        uuid;
  v_balance_cents              integer := 0;
  v_advance_applied_cents      integer := 0;
  v_amount_due_cents           integer := 0;
  v_invoice_status             text;
  v_invoice_id                 uuid;
  v_calculated_amount_cents    integer;
  v_final_booking_status       text;
  v_final_clearance_status     text;
BEGIN
  -- ── Auth ────────────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- ── Input validation ─────────────────────────────────────────────────────
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

  -- ── Compute authoritative reference amount in the database ────────────────
  -- Frontend display value is for UX only; this is the stored source of truth.
  v_calculated_amount_cents := ROUND(p_checkout_duration_hours * v_checkout_rate_cents)::integer;

  -- ── Lock booking and verify ownership ────────────────────────────────────
  SELECT booking_owner_user_id
  INTO v_booking_customer_id
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking_customer_id IS NULL THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking_customer_id != p_customer_id THEN
    RAISE EXCEPTION 'Booking does not belong to this customer';
  END IF;

  -- ── Customer-level advisory lock (prevent double-spend race) ─────────────
  PERFORM pg_advisory_xact_lock(hashtext(p_customer_id::text));

  -- ── Idempotency ───────────────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM public.checkout_invoices
    WHERE booking_id = p_booking_id AND invoice_type = 'checkout'
  ) THEN
    RAISE EXCEPTION 'Checkout invoice already exists for this booking';
  END IF;

  -- ── Credit balance ────────────────────────────────────────────────────────
  -- SELECT INTO sets the variable to NULL when no row matches (i.e. the
  -- customer has no credit balance row at all). The := 0 initialiser is
  -- overwritten by the NULL result, so we must guard with COALESCE after
  -- the query, not just inside it.
  SELECT COALESCE(balance_cents, 0)
  INTO v_balance_cents
  FROM public.customer_credit_balances
  WHERE customer_id = p_customer_id;

  -- Guard against no-row case (customer with zero credits has no row in view)
  v_balance_cents := COALESCE(v_balance_cents, 0);

  IF v_balance_cents < 0 THEN
    v_balance_cents := 0;
  END IF;

  -- ── Determine amounts ─────────────────────────────────────────────────────
  IF v_balance_cents >= p_checkout_fee_cents THEN
    v_advance_applied_cents := p_checkout_fee_cents;
    v_amount_due_cents := 0;
  ELSE
    v_advance_applied_cents := v_balance_cents;
    v_amount_due_cents := p_checkout_fee_cents - v_balance_cents;
  END IF;

  v_invoice_status := CASE WHEN v_amount_due_cents = 0 THEN 'paid' ELSE 'payment_required' END;

  v_final_booking_status   := CASE WHEN v_amount_due_cents = 0 THEN 'completed' ELSE 'checkout_payment_required' END;
  v_final_clearance_status := CASE WHEN v_amount_due_cents = 0 THEN 'cleared_for_solo_hire' ELSE 'checkout_payment_required' END;

  -- ── Create invoice ────────────────────────────────────────────────────────
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
    checkout_completed_by
  ) VALUES (
    p_customer_id,
    p_booking_id,
    'checkout',
    v_invoice_status,
    p_checkout_fee_cents,
    v_advance_applied_cents,
    v_amount_due_cents,
    v_advance_applied_cents,
    CASE WHEN v_amount_due_cents = 0 THEN now() ELSE NULL END,
    p_checkout_duration_hours,
    v_checkout_rate_cents,
    v_calculated_amount_cents,   -- computed here, not from frontend
    p_checkout_fee_cents,
    now(),
    auth.uid()
  ) RETURNING id INTO v_invoice_id;

  -- ── Apply credit ledger entry ─────────────────────────────────────────────
  IF v_advance_applied_cents > 0 THEN
    INSERT INTO public.customer_payment_ledger (
      customer_id,
      booking_id,
      invoice_id,
      amount_cents,
      entry_type,
      note,
      created_by
    ) VALUES (
      p_customer_id,
      p_booking_id,
      v_invoice_id,
      -v_advance_applied_cents,
      'advance_applied',
      'Applied to checkout invoice',
      auth.uid()
    );
  END IF;

  -- ── Update booking status (atomic — same transaction) ─────────────────────
  UPDATE public.bookings
  SET
    status      = v_final_booking_status,
    admin_notes = COALESCE(p_admin_notes, admin_notes),
    updated_at  = now()
  WHERE id = p_booking_id;

  -- ── Update pilot clearance status (atomic — same transaction) ────────────
  -- Pilot is NOT cleared for solo hire until checkout payment is complete.
  -- v_final_clearance_status is 'checkout_payment_required' when amount is due,
  -- and 'cleared_for_solo_hire' only when fully paid by credit.
  UPDATE public.profiles
  SET
    pilot_clearance_status = v_final_clearance_status,
    updated_at             = now()
  WHERE id = p_customer_id;

  -- ── Return result to caller ───────────────────────────────────────────────
  RETURN QUERY SELECT
    v_invoice_id,
    v_amount_due_cents,
    v_final_booking_status,
    v_final_clearance_status;
END;
$$;

-- ── Remove legacy fixed-amount column defaults ────────────────────────────────
-- checkout_invoices.subtotal_cents and stripe_amount_due_cents were created in
-- 027_checkout_payment_foundation.sql with DEFAULT 29000. Now that all inserts
-- go through complete_checkout_outcome_atomic (which always supplies explicit
-- values), these defaults are inert but dangerous — an accidental direct INSERT
-- bypassing the RPC would silently create a $290 invoice. Dropping the defaults
-- forces a NOT NULL violation if an INSERT ever bypasses the RPC, surfacing the
-- error immediately rather than storing corrupted data.

ALTER TABLE public.checkout_invoices
  ALTER COLUMN subtotal_cents          DROP DEFAULT;

ALTER TABLE public.checkout_invoices
  ALTER COLUMN stripe_amount_due_cents DROP DEFAULT;
