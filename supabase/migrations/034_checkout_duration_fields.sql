-- ============================================================
-- 034_checkout_duration_fields.sql
--
-- Adds checkout duration and dynamic amount fields to
-- checkout_invoices so the admin-entered final payable amount
-- is stored instead of a fixed $290 hardcode.
--
-- Also updates apply_credit_and_create_checkout_invoice_atomic
-- to accept and store duration/amount metadata, using the
-- admin-entered final amount as the actual fee.
-- ============================================================

-- ── 1. Add new columns to checkout_invoices ───────────────────────────────────

ALTER TABLE public.checkout_invoices
  ADD COLUMN IF NOT EXISTS checkout_duration_hours     numeric,
  ADD COLUMN IF NOT EXISTS checkout_rate_cents_per_hour integer DEFAULT 29000,
  ADD COLUMN IF NOT EXISTS checkout_calculated_amount_cents integer,
  ADD COLUMN IF NOT EXISTS checkout_final_amount_cents  integer,
  ADD COLUMN IF NOT EXISTS checkout_completed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS checkout_completed_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 2. Drop old function signature and recreate with new parameters ───────────

DROP FUNCTION IF EXISTS public.apply_credit_and_create_checkout_invoice_atomic(uuid, uuid, integer);

CREATE OR REPLACE FUNCTION public.apply_credit_and_create_checkout_invoice_atomic(
  p_booking_id                     uuid,
  p_customer_id                    uuid,
  p_checkout_fee_cents             integer,  -- = checkout_final_amount_cents (admin-entered)
  p_checkout_duration_hours        numeric,
  p_checkout_calculated_amount_cents integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_customer_id      uuid;
  v_balance_cents            integer := 0;
  v_advance_applied_cents    integer := 0;
  v_amount_due_cents         integer := 0;
  v_invoice_status           text;
  v_invoice_id               uuid;
BEGIN
  -- Validate caller is admin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_checkout_fee_cents <= 0 THEN
    RAISE EXCEPTION 'Checkout fee must be greater than 0';
  END IF;

  IF p_checkout_duration_hours IS NOT NULL AND p_checkout_duration_hours <= 0 THEN
    RAISE EXCEPTION 'Checkout duration must be greater than 0';
  END IF;

  -- 1. Load and lock the booking row to verify ownership
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

  -- 2. Acquire transaction-level lock for this customer to prevent double-spending race conditions
  PERFORM pg_advisory_xact_lock(hashtext(p_customer_id::text));

  -- 3. Ensure idempotent: check if an invoice already exists for this booking
  IF EXISTS (SELECT 1 FROM public.checkout_invoices WHERE booking_id = p_booking_id AND invoice_type = 'checkout') THEN
    RAISE EXCEPTION 'Checkout invoice already exists for this booking';
  END IF;

  -- 4. Calculate available credit
  SELECT COALESCE(balance_cents, 0)
  INTO v_balance_cents
  FROM public.customer_credit_balances
  WHERE customer_id = p_customer_id;

  IF v_balance_cents < 0 THEN
    v_balance_cents := 0;
  END IF;

  -- 5. Determine amounts using the admin-entered final fee
  IF v_balance_cents >= p_checkout_fee_cents THEN
    v_advance_applied_cents := p_checkout_fee_cents;
    v_amount_due_cents := 0;
  ELSE
    v_advance_applied_cents := v_balance_cents;
    v_amount_due_cents := p_checkout_fee_cents - v_balance_cents;
  END IF;

  v_invoice_status := CASE WHEN v_amount_due_cents = 0 THEN 'paid' ELSE 'payment_required' END;

  -- 6. Create invoice with duration/amount metadata
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
    CASE WHEN v_amount_due_cents = 0 THEN now() ELSE null END,
    p_checkout_duration_hours,
    29000,
    p_checkout_calculated_amount_cents,
    p_checkout_fee_cents,
    now(),
    auth.uid()
  ) RETURNING id INTO v_invoice_id;

  -- 7. Record applied credit if > 0
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

  RETURN v_invoice_id;
END;
$$;
