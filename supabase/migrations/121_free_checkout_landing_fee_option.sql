-- 121_free_checkout_landing_fee_option.sql
--
-- Black Friday free checkout: let the admin choose, when recording the checkout
-- outcome, whether the landing fees are also free or still charged.
--
--   apply_checkout_credit_to_booking(p_booking_id, p_charge_landing_fees DEFAULT false)
--
--   false (default) — whole checkout free: invoice settled at $0 (unchanged behaviour).
--   true            — checkout flight (aircraft hire) free, landing fees charged:
--                     the invoice is reduced to the landing subtotal. Account credit
--                     the invoice had consumed is kept only up to the landing amount
--                     and the rest is returned. If something is still owed the
--                     invoice stays 'payment_required' and the pilot pays it the
--                     normal way (card / bank transfer, or admin marks it paid).
--
-- Returns out_amount_due_cents so the app knows whether payment is still needed.
-- Replaces the 1-argument version from migration 115 (dropped to avoid an
-- ambiguous overload; a call with only p_booking_id still works via the default).

BEGIN;

DROP FUNCTION IF EXISTS public.apply_checkout_credit_to_booking(uuid);

CREATE OR REPLACE FUNCTION public.apply_checkout_credit_to_booking(
  p_booking_id          uuid,
  p_charge_landing_fees boolean DEFAULT false
)
RETURNS TABLE (
  out_credit_id        uuid,
  out_invoice_id       uuid,
  out_checkout_outcome text,
  out_restored_cents   integer,
  out_amount_due_cents integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invoice  record;
  v_credit   record;
  v_advance  integer := 0;
  v_landing  integer := 0;
  v_keep     integer := 0;
  v_restored integer := 0;
  v_due      integer := 0;
  v_charge   boolean;
BEGIN
  SELECT * INTO v_invoice
  FROM public.checkout_invoices
  WHERE booking_id = p_booking_id AND invoice_type = 'checkout'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Only an unpaid invoice, or one settled purely by account credit, can be
  -- covered. An invoice paid by card / bank / cash is left alone.
  IF NOT (
    v_invoice.status = 'payment_required'
    OR (v_invoice.status = 'paid'
        AND COALESCE(v_invoice.advance_applied_cents, 0) > 0
        AND COALESCE(v_invoice.total_paid_cents, 0) = 0
        AND COALESCE(v_invoice.payment_method, 'account_credit') IN ('account_credit', 'stripe'))
  ) THEN
    RETURN;
  END IF;

  SELECT * INTO v_credit
  FROM public.checkout_credits
  WHERE user_id = v_invoice.customer_id AND status = 'available'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_advance := COALESCE(v_invoice.advance_applied_cents, 0);
  v_landing := GREATEST(COALESCE(v_invoice.checkout_landing_subtotal_cents, 0), 0);
  v_charge  := COALESCE(p_charge_landing_fees, false) AND v_landing > 0;

  IF v_charge THEN
    v_keep := LEAST(v_advance, v_landing);  -- account credit still used for landing fees
    v_due  := v_landing - v_keep;
  ELSE
    v_keep := 0;
    v_due  := 0;
  END IF;
  v_restored := v_advance - v_keep;

  -- Give back account credit the free part no longer needs, so the free
  -- checkout never eats the customer's own prepaid balance.
  IF v_restored > 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('customer_credit:' || v_invoice.customer_id::text));
    INSERT INTO public.customer_payment_ledger (
      customer_id, booking_id, invoice_id, invoice_source_type,
      amount_cents, entry_type, note, created_by
    ) VALUES (
      v_invoice.customer_id, v_invoice.booking_id, v_invoice.id, 'checkout',
      v_restored, 'credit_reversed',
      'Account credit restored: checkout covered by promotion free checkout credit', NULL
    );
  END IF;

  IF v_charge THEN
    UPDATE public.checkout_invoices
    SET subtotal_cents              = v_landing,
        checkout_final_amount_cents = v_landing,
        advance_applied_cents       = v_keep,
        stripe_amount_due_cents     = v_due,
        status                      = CASE WHEN v_due = 0 THEN 'paid' ELSE 'payment_required' END,
        paid_at                     = CASE WHEN v_due = 0 THEN COALESCE(paid_at, now()) ELSE NULL END,
        payment_method              = CASE WHEN v_due = 0 THEN 'account_credit' ELSE NULL END,
        waiver_reason               = 'Promotion: free checkout flight included with block time package (landing fees charged)',
        updated_at                  = now()
    WHERE id = v_invoice.id;
  ELSE
    UPDATE public.checkout_invoices
    SET status                  = 'paid',
        paid_at                 = COALESCE(paid_at, now()),
        payment_method          = 'waived',
        waiver_reason           = 'Promotion: free checkout flight included with block time package',
        advance_applied_cents   = 0,
        stripe_amount_due_cents = 0,
        updated_at              = now()
    WHERE id = v_invoice.id;
  END IF;

  UPDATE public.checkout_credits
  SET status             = 'used',
      used_on_booking_id = v_invoice.booking_id,
      used_on_invoice_id = v_invoice.id,
      used_at            = now()
  WHERE id = v_credit.id;

  IF v_due = 0 THEN
    UPDATE public.bookings
    SET status = 'completed', updated_at = now()
    WHERE id = v_invoice.booking_id AND status <> 'completed';

    IF v_invoice.checkout_outcome IS NOT NULL THEN
      UPDATE public.profiles
      SET pilot_clearance_status = v_invoice.checkout_outcome, updated_at = now()
      WHERE id = v_invoice.customer_id
        AND pilot_clearance_status = 'checkout_payment_required';
    END IF;
  END IF;
  -- v_due > 0 only happens when the invoice was still 'payment_required' (an
  -- invoice already settled by account credit always covers the landing fees),
  -- so the booking and pilot are already 'checkout_payment_required' and simply
  -- wait for the landing fee payment like any checkout invoice.

  RETURN QUERY SELECT v_credit.id, v_invoice.id, v_invoice.checkout_outcome::text, v_restored, v_due;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_checkout_credit_to_booking(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_checkout_credit_to_booking(uuid, boolean) TO service_role;

COMMIT;
