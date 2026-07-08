BEGIN;

-- ============================================================
-- 106_block_time_landing_payment_routing.sql
-- Block time landing fees route through the same admin payment
-- chooser (send invoice / mark paid / waived) as PAYF billing,
-- instead of a hardcoded off-session Stripe card charge.
--
--  • process_block_time_flight v3 — identical to v2 (migration
--    104) except the landing fee invoice is no longer created
--    with payment_method 'stripe' hardcoded. Like the overage
--    invoice, it is created with payment_method NULL; the method
--    is set later by the admin's payment-path choice.
--    Balance/overage math, GST helper, and the usage invoice are
--    unchanged.
--  • invoices.payment_method — adds 'cash' and 'card_in_person'
--    so an admin can record a manual (Case 3) settlement of a
--    block time landing or overage invoice.
--  • invoices.status — adds 'waived' so an admin-waived landing
--    fee is represented the same way booking_invoices represents
--    it (migration 105).
--  • customer_payment_ledger.invoice_source_type — adds
--    'block_time' so manual settlements of invoices-table rows
--    can be recorded in the ledger.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Widen invoices.payment_method for manual settlement
-- ------------------------------------------------------------
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_payment_method_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_payment_method_check
  CHECK (payment_method IN ('stripe', 'bank_transfer', 'cash', 'card_in_person'));

-- ------------------------------------------------------------
-- 2) Allow 'waived' on invoices.status
-- ------------------------------------------------------------
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_status_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft', 'paid', 'awaiting', 'void', 'refunded', 'waived'));

-- ------------------------------------------------------------
-- 3) Allow 'block_time' ledger entries
-- ------------------------------------------------------------
ALTER TABLE public.customer_payment_ledger
  DROP CONSTRAINT IF EXISTS customer_payment_ledger_invoice_source_type_check;

ALTER TABLE public.customer_payment_ledger
  ADD CONSTRAINT customer_payment_ledger_invoice_source_type_check
  CHECK (invoice_source_type IN ('checkout', 'booking', 'block_time'));

-- ------------------------------------------------------------
-- 4) Drawdown function v3 — landing invoice payment method is
--    no longer hardcoded to 'stripe'
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.process_block_time_flight(uuid, uuid, numeric, numeric);

CREATE OR REPLACE FUNCTION public.process_block_time_flight(
  p_user_id      uuid,
  p_booking_id   uuid,
  p_vdo_hours    numeric(8,2),
  p_landing_fees numeric(10,2)
)
RETURNS TABLE (
  out_usage_invoice_id       uuid,
  out_usage_invoice_number   text,
  out_overage_invoice_id     uuid,
  out_overage_invoice_number text,
  out_landing_invoice_id     uuid,
  out_landing_invoice_number text,
  out_overflow_hours         numeric(8,2),
  out_overflow_amount        numeric(10,2),
  out_hours_after            numeric(8,2),
  out_purchase_id            uuid,
  out_rate_per_hour          numeric(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

COMMIT;
