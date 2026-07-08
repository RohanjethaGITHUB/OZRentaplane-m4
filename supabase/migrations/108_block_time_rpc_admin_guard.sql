-- 108_block_time_rpc_admin_guard.sql
--
-- STAGE 1 of the payment-RPC lockdown (security fix).
--
-- Adds an internal admin-authorization guard to the four block time RPCs that
-- previously trusted their caller completely. Each is SECURITY DEFINER and was
-- reachable directly via PostgREST by anon/authenticated (the project's
-- ALTER DEFAULT PRIVILEGES rule grants EXECUTE to anon+authenticated on every
-- new function, so the historical `REVOKE ... FROM PUBLIC` was ineffective).
--
-- These functions are only ever invoked from admin server actions using the
-- authenticated *session* client (finaliseStandardBookingInvoice ->
-- process_block_time_flight; refundBlockTimePurchase -> begin/finalise/revert),
-- so auth.uid() resolves to the calling admin and the guard does not affect the
-- legitimate flow. There is no service_role / webhook / edge-function caller of
-- any of these four.
--
-- The function bodies below are reproduced verbatim from the live definitions
-- (process_block_time_flight = migration 106 v3; refund trio = migration 097),
-- with ONLY the admin guard prepended as the first statement. No other logic
-- was changed.
--
-- STAGE 2 (separate migration 109) revokes anon/PUBLIC from these functions.
-- This migration must be applied and verified BEFORE stage 2.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- process_block_time_flight
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_block_time_flight(
  p_user_id uuid,
  p_booking_id uuid,
  p_vdo_hours numeric,
  p_landing_fees numeric
)
RETURNS TABLE(
  out_usage_invoice_id uuid,
  out_usage_invoice_number text,
  out_overage_invoice_id uuid,
  out_overage_invoice_number text,
  out_landing_invoice_id uuid,
  out_landing_invoice_number text,
  out_overflow_hours numeric,
  out_overflow_amount numeric,
  out_hours_after numeric,
  out_purchase_id uuid,
  out_rate_per_hour numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_purchase                 public.pilot_block_time_purchases%ROWTYPE;
  v_usage_invoice_id         uuid;
  v_usage_invoice_number     text;
  v_overage_invoice_id       uuid;
  v_overage_invoice_number   text;
  v_landing_invoice_id       uuid;
  v_landing_invoice_number   text;
  v_hours_before             numeric(8,2);
  v_can_deduct               numeric(8,2);
  v_overflow_hours           numeric(8,2);
  v_overflow_amount          numeric(10,2);
  v_hours_after              numeric(8,2);
  v_usage_total              numeric(10,2);
  v_usage_subtotal           numeric(10,2);
  v_usage_gst                numeric(10,2);
  v_overage_total            numeric(10,2);
  v_overage_subtotal         numeric(10,2);
  v_overage_gst              numeric(10,2);
  v_landing_total            numeric(10,2);
  v_landing_subtotal         numeric(10,2);
  v_landing_gst              numeric(10,2);
BEGIN
  -- Admin authorization guard (security fix): only an admin caller may run this.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Step 1: Find the oldest active package for this pilot.
  SELECT *
  INTO v_purchase
  FROM public.pilot_block_time_purchases
  WHERE user_id = p_user_id
    AND status = 'active'
    AND expires_at > now()
  ORDER BY queue_position ASC NULLS LAST, activated_at ASC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active block time package found for user %', p_user_id;
  END IF;

  -- Step 2: Calculate the drawdown and any overflow.
  v_hours_before    := v_purchase.hours_remaining;
  v_can_deduct      := LEAST(p_vdo_hours, v_hours_before);
  v_overflow_hours  := GREATEST(p_vdo_hours - v_hours_before, 0);
  v_overflow_amount := ROUND(v_overflow_hours * v_purchase.rate_per_hour, 2);
  v_hours_after     := ROUND(v_hours_before - v_can_deduct, 2);

  -- Step 3: Update the purchase balance.
  UPDATE public.pilot_block_time_purchases
  SET hours_remaining = v_hours_after,
      status = CASE WHEN v_hours_after = 0 THEN 'exhausted' ELSE 'active' END,
      updated_at = now()
  WHERE id = v_purchase.id;

  -- Step 4: Usage invoice — the hours actually deducted from the package.
  -- Settled by block time, so it is created as paid with no payment method.
  SELECT g.o_subtotal, g.o_gst, g.o_total
  INTO v_usage_subtotal, v_usage_gst, v_usage_total
  FROM public.block_time_gst_parts(ROUND(v_can_deduct * v_purchase.rate_per_hour, 2)) AS g;

  INSERT INTO public.invoices (
    type, user_id, booking_id, block_time_purchase_id, billing_mode,
    subtotal, gst_amount, total, status, payment_method, paid_at
  ) VALUES (
    'flight', p_user_id, p_booking_id, v_purchase.id, 'block_time',
    v_usage_subtotal, v_usage_gst, v_usage_total, 'paid', NULL, now()
  )
  RETURNING id, invoice_number INTO v_usage_invoice_id, v_usage_invoice_number;

  INSERT INTO public.invoice_line_items (
    invoice_id, type, description, quantity, unit_price, amount, display_order
  ) VALUES (
    v_usage_invoice_id,
    'flight_hours',
    'Aircraft Hire — Block Time deduction',
    v_can_deduct,
    v_purchase.rate_per_hour,
    ROUND(v_can_deduct * v_purchase.rate_per_hour, 2),
    1
  );

  -- Step 5: Overage invoice — hours exceeding the balance, at the locked
  -- package rate. Left unpaid ('awaiting') and flagged: an outstanding
  -- overage invoice gates new bookings, purchases, and top-ups.
  IF v_overflow_hours > 0 THEN
    SELECT g.o_subtotal, g.o_gst, g.o_total
    INTO v_overage_subtotal, v_overage_gst, v_overage_total
    FROM public.block_time_gst_parts(v_overflow_amount) AS g;

    INSERT INTO public.invoices (
      type, user_id, booking_id, block_time_purchase_id, billing_mode,
      subtotal, gst_amount, total, status, payment_method, paid_at,
      is_block_time_overage
    ) VALUES (
      'flight', p_user_id, p_booking_id, v_purchase.id, 'block_time',
      v_overage_subtotal, v_overage_gst, v_overage_total, 'awaiting', NULL, NULL,
      true
    )
    RETURNING id, invoice_number INTO v_overage_invoice_id, v_overage_invoice_number;

    INSERT INTO public.invoice_line_items (
      invoice_id, type, description, quantity, unit_price, amount, display_order
    ) VALUES (
      v_overage_invoice_id,
      'overflow_hours',
      'BLOCK TIME OVERAGE — flight hours exceeding package balance, at locked package rate. Payment required.',
      v_overflow_hours,
      v_purchase.rate_per_hour,
      v_overflow_amount,
      1
    );
  END IF;

  -- Step 6: Landing fee invoice — always its own invoice document,
  -- independent of the flight-hours billing outcome. Created 'awaiting'
  -- with NO payment method: the admin's payment-path choice (send
  -- invoice / mark paid / waived) sets the method afterwards, exactly
  -- like PAYF billing. No automatic card charge.
  IF p_landing_fees > 0 THEN
    SELECT g.o_subtotal, g.o_gst, g.o_total
    INTO v_landing_subtotal, v_landing_gst, v_landing_total
    FROM public.block_time_gst_parts(p_landing_fees) AS g;

    INSERT INTO public.invoices (
      type, user_id, booking_id, block_time_purchase_id, billing_mode,
      subtotal, gst_amount, total, status, payment_method, paid_at
    ) VALUES (
      'flight', p_user_id, p_booking_id, v_purchase.id, 'block_time',
      v_landing_subtotal, v_landing_gst, v_landing_total, 'awaiting', NULL, NULL
    )
    RETURNING id, invoice_number INTO v_landing_invoice_id, v_landing_invoice_number;

    INSERT INTO public.invoice_line_items (
      invoice_id, type, description, quantity, unit_price, amount, display_order
    ) VALUES (
      v_landing_invoice_id,
      'landing_fee',
      'Landing Fee',
      1,
      p_landing_fees,
      p_landing_fees,
      1
    );
  END IF;

  -- Step 7: Record the usage event for audit/history (linked to the usage invoice).
  INSERT INTO public.pilot_block_time_usage (
    purchase_id, user_id, booking_id, invoice_id,
    hours_deducted, overflow_hours, overflow_amount, hours_before, hours_after
  ) VALUES (
    v_purchase.id, p_user_id, p_booking_id, v_usage_invoice_id,
    v_can_deduct, v_overflow_hours, v_overflow_amount, v_hours_before, v_hours_after
  );

  -- Step 8: Return the processed values to the caller.
  RETURN QUERY SELECT
    v_usage_invoice_id,
    v_usage_invoice_number,
    v_overage_invoice_id,
    v_overage_invoice_number,
    v_landing_invoice_id,
    v_landing_invoice_number,
    v_overflow_hours,
    v_overflow_amount,
    v_hours_after,
    v_purchase.id,
    v_purchase.rate_per_hour;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- begin_block_time_refund
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.begin_block_time_refund(p_purchase_id uuid)
RETURNS TABLE(
  out_stripe_payment_intent_id text,
  out_refund_amount numeric,
  out_user_id uuid,
  out_hours_purchased numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_purchase    public.pilot_block_time_purchases%ROWTYPE;
  v_usage_count integer;
BEGIN
  -- Admin authorization guard (security fix): only an admin caller may run this.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_purchase
  FROM public.pilot_block_time_purchases
  WHERE id = p_purchase_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Block time purchase % not found', p_purchase_id;
  END IF;

  IF v_purchase.status <> 'active' THEN
    RAISE EXCEPTION 'Only active packages can be refunded (current status: %)', v_purchase.status;
  END IF;

  IF v_purchase.hours_remaining <> v_purchase.hours_purchased THEN
    RAISE EXCEPTION 'Package has been partially used (%.2f of %.2f hours remaining) and cannot be refunded',
      v_purchase.hours_remaining, v_purchase.hours_purchased;
  END IF;

  SELECT COUNT(*)
  INTO v_usage_count
  FROM public.pilot_block_time_usage
  WHERE purchase_id = p_purchase_id;

  IF v_usage_count > 0 THEN
    RAISE EXCEPTION 'Package has % drawdown record(s) and cannot be refunded', v_usage_count;
  END IF;

  IF v_purchase.stripe_payment_intent_id IS NULL THEN
    RAISE EXCEPTION 'Purchase has no Stripe payment intent; refund it manually via the payment provider';
  END IF;

  UPDATE public.pilot_block_time_purchases
  SET status        = 'refunded',
      refund_amount = v_purchase.amount_paid,
      refunded_at   = now(),
      updated_at    = now()
  WHERE id = p_purchase_id;

  RETURN QUERY SELECT
    v_purchase.stripe_payment_intent_id,
    v_purchase.amount_paid,
    v_purchase.user_id,
    v_purchase.hours_purchased;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- finalise_block_time_refund
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finalise_block_time_refund(p_purchase_id uuid, p_refund_stripe_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_status text;
BEGIN
  -- Admin authorization guard (security fix): only an admin caller may run this.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT status
  INTO v_status
  FROM public.pilot_block_time_purchases
  WHERE id = p_purchase_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Block time purchase % not found', p_purchase_id;
  END IF;

  IF v_status <> 'refunded' THEN
    RAISE EXCEPTION 'Purchase % is not marked refunded (status: %)', p_purchase_id, v_status;
  END IF;

  UPDATE public.pilot_block_time_purchases
  SET refund_stripe_id = p_refund_stripe_id,
      updated_at       = now()
  WHERE id = p_purchase_id;

  UPDATE public.invoices
  SET status     = 'refunded',
      updated_at = now()
  WHERE block_time_purchase_id = p_purchase_id
    AND type = 'block_time_purchase';
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- revert_block_time_refund
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revert_block_time_refund(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_purchase public.pilot_block_time_purchases%ROWTYPE;
BEGIN
  -- Admin authorization guard (security fix): only an admin caller may run this.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_purchase
  FROM public.pilot_block_time_purchases
  WHERE id = p_purchase_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Block time purchase % not found', p_purchase_id;
  END IF;

  -- Only revert an in-flight refund; once a Stripe refund id is recorded
  -- the money has moved and the status must stay 'refunded'.
  IF v_purchase.status <> 'refunded' OR v_purchase.refund_stripe_id IS NOT NULL THEN
    RAISE EXCEPTION 'Purchase % is not in a revertable refund state', p_purchase_id;
  END IF;

  UPDATE public.pilot_block_time_purchases
  SET status        = 'active',
      refund_amount = NULL,
      refunded_at   = NULL,
      updated_at    = now()
  WHERE id = p_purchase_id;
END;
$function$;

COMMIT;
