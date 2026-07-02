BEGIN;

-- ============================================================
-- 097_block_time_refund.sql
-- Admin-initiated refunds for block time purchases.
--
-- Two-phase design so the Stripe API call can sit safely between
-- database writes:
--   1) begin_block_time_refund   — validate + mark refunded (blocks any
--      further drawdown immediately, since drawdown only picks 'active')
--   2) Stripe refund happens in the server action
--   3) finalise_block_time_refund — record the Stripe refund id and mark
--      the purchase invoice refunded
--   or revert_block_time_refund   — put the purchase back to 'active'
--      if the Stripe refund failed.
--
-- Policy: only fully unused packages are refundable (no drawdown rows,
-- hours_remaining = hours_purchased, status = 'active').
-- ============================================================

DROP FUNCTION IF EXISTS public.begin_block_time_refund(uuid);

CREATE OR REPLACE FUNCTION public.begin_block_time_refund(
  p_purchase_id uuid
)
RETURNS TABLE (
  out_stripe_payment_intent_id text,
  out_refund_amount            numeric(10,2),
  out_user_id                  uuid,
  out_hours_purchased          numeric(8,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_purchase    public.pilot_block_time_purchases%ROWTYPE;
  v_usage_count integer;
BEGIN
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
$$;


DROP FUNCTION IF EXISTS public.finalise_block_time_refund(uuid, text);

CREATE OR REPLACE FUNCTION public.finalise_block_time_refund(
  p_purchase_id      uuid,
  p_refund_stripe_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status text;
BEGIN
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
$$;


DROP FUNCTION IF EXISTS public.revert_block_time_refund(uuid);

CREATE OR REPLACE FUNCTION public.revert_block_time_refund(
  p_purchase_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_purchase public.pilot_block_time_purchases%ROWTYPE;
BEGIN
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
$$;

COMMIT;
