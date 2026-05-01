-- ============================================================
-- 032_customer_credits_rpc_hardening.sql
--
-- Harden RPCs by removing p_admin_id and using auth.uid()
-- ============================================================

-- Drop the old functions with the p_admin_id signature
DROP FUNCTION IF EXISTS public.apply_credit_and_create_checkout_invoice_atomic(uuid, uuid, integer, uuid);
DROP FUNCTION IF EXISTS public.apply_credit_to_standard_booking_atomic(uuid, integer, numeric, uuid, text, text);

-- Recreate apply_credit_and_create_checkout_invoice_atomic
CREATE OR REPLACE FUNCTION public.apply_credit_and_create_checkout_invoice_atomic(
  p_booking_id uuid,
  p_customer_id uuid,
  p_checkout_fee_cents integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_customer_id uuid;
  v_balance_cents integer := 0;
  v_advance_applied_cents integer := 0;
  v_amount_due_cents integer := 0;
  v_invoice_status text;
  v_invoice_id uuid;
BEGIN
  -- Validate caller is admin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_checkout_fee_cents <= 0 THEN
    RAISE EXCEPTION 'Checkout fee must be greater than 0';
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

  -- Ensure balance is non-negative
  IF v_balance_cents < 0 THEN
    v_balance_cents := 0;
  END IF;

  -- 5. Determine amounts
  IF v_balance_cents >= p_checkout_fee_cents THEN
    v_advance_applied_cents := p_checkout_fee_cents;
    v_amount_due_cents := 0;
  ELSE
    v_advance_applied_cents := v_balance_cents;
    v_amount_due_cents := p_checkout_fee_cents - v_balance_cents;
  END IF;

  v_invoice_status := CASE WHEN v_amount_due_cents = 0 THEN 'paid' ELSE 'payment_required' END;

  -- 6. Create invoice
  INSERT INTO public.checkout_invoices (
    customer_id,
    booking_id,
    invoice_type,
    status,
    subtotal_cents,
    advance_applied_cents,
    stripe_amount_due_cents,
    total_paid_cents,
    paid_at
  ) VALUES (
    p_customer_id,
    p_booking_id,
    'checkout',
    v_invoice_status,
    p_checkout_fee_cents,
    v_advance_applied_cents,
    v_amount_due_cents,
    v_advance_applied_cents,
    CASE WHEN v_amount_due_cents = 0 THEN now() ELSE null END
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


-- Recreate apply_credit_to_standard_booking_atomic
CREATE OR REPLACE FUNCTION public.apply_credit_to_standard_booking_atomic(
  p_booking_id uuid,
  p_subtotal_cents integer,
  p_final_amount numeric,
  p_new_status text,
  p_admin_notes text
)
RETURNS TABLE (
  advance_applied_cents integer,
  amount_due_cents integer,
  payment_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_current_payment_status text;
  v_balance_cents integer := 0;
  v_advance_applied_cents integer := 0;
  v_amount_due_cents integer := 0;
  v_new_payment_status text;
BEGIN
  -- Validate caller is admin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_subtotal_cents <= 0 THEN
    RAISE EXCEPTION 'Subtotal must be greater than 0';
  END IF;

  -- 1. Get customer ID and current payment status from booking and lock the row
  SELECT booking_owner_user_id, payment_status 
  INTO v_customer_id, v_current_payment_status
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  -- 2. Acquire transaction-level lock for this customer to prevent double-spending race conditions
  PERFORM pg_advisory_xact_lock(hashtext(v_customer_id::text));

  -- 3. Ensure idempotent: don't double-bill if it's already generated
  IF COALESCE(v_current_payment_status, 'not_started') != 'not_started' THEN
    RAISE EXCEPTION 'Booking has already been billed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.customer_payment_ledger
    WHERE booking_id = p_booking_id
      AND entry_type = 'advance_applied'
  ) THEN
    RAISE EXCEPTION 'Advance credit already applied to this booking';
  END IF;

  -- 4. Calculate available credit
  SELECT COALESCE(balance_cents, 0)
  INTO v_balance_cents
  FROM public.customer_credit_balances
  WHERE customer_id = v_customer_id;

  IF v_balance_cents < 0 THEN
    v_balance_cents := 0;
  END IF;

  -- 5. Determine amounts
  IF v_balance_cents >= p_subtotal_cents THEN
    v_advance_applied_cents := p_subtotal_cents;
    v_amount_due_cents := 0;
  ELSE
    v_advance_applied_cents := v_balance_cents;
    v_amount_due_cents := p_subtotal_cents - v_balance_cents;
  END IF;

  -- Determine final payment status
  v_new_payment_status := CASE WHEN v_amount_due_cents = 0 THEN 'paid' ELSE 'invoice_generated' END;

  -- 6. Update booking
  UPDATE public.bookings
  SET
    subtotal_cents = p_subtotal_cents,
    advance_applied_cents = v_advance_applied_cents,
    amount_due_cents = v_amount_due_cents,
    final_amount = p_final_amount,
    payment_status = v_new_payment_status,
    status = p_new_status,
    admin_notes = COALESCE(p_admin_notes, admin_notes)
  WHERE id = p_booking_id;

  -- 7. Record applied credit if > 0
  IF v_advance_applied_cents > 0 THEN
    INSERT INTO public.customer_payment_ledger (
      customer_id,
      booking_id,
      amount_cents,
      entry_type,
      note,
      created_by
    ) VALUES (
      v_customer_id,
      p_booking_id,
      -v_advance_applied_cents,
      'advance_applied',
      'Applied to standard booking',
      auth.uid()
    );
  END IF;

  RETURN QUERY SELECT v_advance_applied_cents, v_amount_due_cents, v_new_payment_status;
END;
$$;
