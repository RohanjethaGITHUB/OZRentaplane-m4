BEGIN;

-- ============================================================
-- 095_block_time_drawdown.sql
-- Block Time queue ordering, flight drawdown, and expiry sweep
-- ============================================================

-- ------------------------------------------------------------
-- 1) FIFO queue position assignment trigger
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.assign_queue_position();

CREATE OR REPLACE FUNCTION public.assign_queue_position()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.queue_position := COALESCE(
    (
      SELECT MAX(queue_position)
      FROM public.pilot_block_time_purchases
      WHERE user_id = NEW.user_id
        AND status = 'active'
    ),
    0
  ) + 1;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_assign_queue_position ON public.pilot_block_time_purchases;
CREATE TRIGGER trigger_assign_queue_position
  BEFORE UPDATE ON public.pilot_block_time_purchases
  FOR EACH ROW
  WHEN (NEW.status = 'active' AND OLD.status <> 'active')
  EXECUTE FUNCTION public.assign_queue_position();


-- ------------------------------------------------------------
-- 2) Core block time drawdown function
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.process_block_time_flight(uuid, uuid, numeric, numeric);

CREATE OR REPLACE FUNCTION public.process_block_time_flight(
  p_user_id      uuid,
  p_booking_id   uuid,
  p_vdo_hours    numeric(8,2),
  p_landing_fees numeric(10,2)
)
RETURNS TABLE (
  out_invoice_id           uuid,
  out_invoice_number       text,
  out_overflow_hours       numeric(8,2),
  out_overflow_amount      numeric(10,2),
  out_hours_after          numeric(8,2),
  out_needs_overflow_charge boolean,
  out_needs_landing_charge boolean,
  out_purchase_id          uuid,
  out_rate_per_hour        numeric(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_purchase         public.pilot_block_time_purchases%ROWTYPE;
  v_invoice_id       uuid;
  v_invoice_number   text;
  v_hours_before     numeric(8,2);
  v_can_deduct       numeric(8,2);
  v_overflow_hours   numeric(8,2);
  v_overflow_amount  numeric(10,2);
  v_hours_after      numeric(8,2);
  v_flight_subtotal  numeric(10,2);
  v_flight_gst       numeric(10,2);
  v_flight_total     numeric(10,2);
  v_landing_subtotal numeric(10,2);
  v_landing_gst      numeric(10,2);
  v_total_subtotal   numeric(10,2);
  v_total_gst        numeric(10,2);
  v_total_total      numeric(10,2);
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

  -- Step 4: Create the invoice record for the block time drawdown.
  v_flight_subtotal  := ROUND((v_can_deduct * v_purchase.rate_per_hour) / 1.1, 2);
  v_flight_gst       := ROUND((v_can_deduct * v_purchase.rate_per_hour) - v_flight_subtotal, 2);
  v_flight_total     := ROUND(v_can_deduct * v_purchase.rate_per_hour, 2);
  v_landing_subtotal := ROUND(p_landing_fees / 1.1, 2);
  v_landing_gst      := ROUND(p_landing_fees - v_landing_subtotal, 2);
  v_total_subtotal   := ROUND(v_flight_subtotal + v_landing_subtotal, 2);
  v_total_gst        := ROUND(v_flight_gst + v_landing_gst, 2);
  v_total_total      := ROUND(v_flight_total + p_landing_fees, 2);

  INSERT INTO public.invoices (
    type,
    user_id,
    booking_id,
    block_time_purchase_id,
    billing_mode,
    subtotal,
    gst_amount,
    total,
    status,
    payment_method,
    paid_at
  ) VALUES (
    'flight',
    p_user_id,
    p_booking_id,
    v_purchase.id,
    'block_time',
    v_total_subtotal,
    v_total_gst,
    v_total_total,
    'paid',
    CASE WHEN p_landing_fees > 0 THEN 'stripe' ELSE NULL END,
    now()
  )
  RETURNING id, invoice_number INTO v_invoice_id, v_invoice_number;

  -- Step 5: Insert line items in the invoice display order.
  INSERT INTO public.invoice_line_items (
    invoice_id,
    type,
    description,
    quantity,
    unit_price,
    amount,
    display_order
  ) VALUES (
    v_invoice_id,
    'flight_hours',
    'Aircraft Hire — Block Time deduction',
    v_can_deduct,
    v_purchase.rate_per_hour,
    v_flight_total,
    1
  );

  IF v_overflow_hours > 0 THEN
    INSERT INTO public.invoice_line_items (
      invoice_id,
      type,
      description,
      quantity,
      unit_price,
      amount,
      display_order
    ) VALUES (
      v_invoice_id,
      'overflow_hours',
      'Block Time Overflow — hours exceeding balance, charged at block rate',
      v_overflow_hours,
      v_purchase.rate_per_hour,
      v_overflow_amount,
      2
    );
  END IF;

  IF p_landing_fees > 0 THEN
    INSERT INTO public.invoice_line_items (
      invoice_id,
      type,
      description,
      quantity,
      unit_price,
      amount,
      display_order
    ) VALUES (
      v_invoice_id,
      'landing_fee',
      'Landing Fee',
      1,
      p_landing_fees,
      p_landing_fees,
      CASE WHEN v_overflow_hours > 0 THEN 3 ELSE 2 END
    );
  END IF;

  -- Step 6: Record the usage event for audit/history.
  INSERT INTO public.pilot_block_time_usage (
    purchase_id,
    user_id,
    booking_id,
    invoice_id,
    hours_deducted,
    overflow_hours,
    overflow_amount,
    hours_before,
    hours_after
  ) VALUES (
    v_purchase.id,
    p_user_id,
    p_booking_id,
    v_invoice_id,
    v_can_deduct,
    v_overflow_hours,
    v_overflow_amount,
    v_hours_before,
    v_hours_after
  );

  -- Step 7: Return the processed values to the caller.
  RETURN QUERY SELECT
    v_invoice_id,
    v_invoice_number,
    v_overflow_hours,
    v_overflow_amount,
    v_hours_after,
    (v_overflow_hours > 0),
    (p_landing_fees > 0),
    v_purchase.id,
    v_purchase.rate_per_hour;
END;
$$;


-- ------------------------------------------------------------
-- 3) Expiry enforcement sweep
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.expire_block_time_packages();

CREATE OR REPLACE FUNCTION public.expire_block_time_packages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expired_count integer := 0;
BEGIN
  UPDATE public.pilot_block_time_purchases
  SET status = 'expired',
      updated_at = now()
  WHERE status = 'active'
    AND expires_at < now();

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;
  RETURN v_expired_count;
END;
$$;

COMMIT;
