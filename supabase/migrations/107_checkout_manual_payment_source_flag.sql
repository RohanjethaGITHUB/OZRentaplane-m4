BEGIN;

DROP FUNCTION IF EXISTS public.mark_checkout_invoice_paid_atomic(uuid, text, text, integer);

CREATE OR REPLACE FUNCTION public.mark_checkout_invoice_paid_atomic(
  p_invoice_id                 uuid,
  p_stripe_payment_intent_id   text,
  p_stripe_checkout_session_id text,
  p_amount_paid_cents          integer,
  p_is_stripe_payment          boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invoice        record;
  v_booking_status text;
  v_clearance      text;
  v_base_amount    integer;
BEGIN
  SELECT * INTO v_invoice FROM public.checkout_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found: %', p_invoice_id; END IF;

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
    IF p_is_stripe_payment AND NOT EXISTS (
      SELECT 1 FROM public.customer_payment_ledger
      WHERE stripe_checkout_session_id = p_stripe_checkout_session_id AND entry_type = 'stripe_payment'
    ) THEN
      INSERT INTO public.customer_payment_ledger (
        customer_id, booking_id, invoice_id, invoice_source_type, amount_cents, entry_type, payment_method,
        stripe_checkout_session_id, stripe_payment_intent_id, note, created_by
      ) VALUES (
        v_invoice.customer_id, v_invoice.booking_id, p_invoice_id, 'checkout',
        v_invoice.stripe_amount_due_cents, 'stripe_payment', 'stripe',
        p_stripe_checkout_session_id, p_stripe_payment_intent_id,
        'Stripe checkout payment received (recovery path)', NULL
      );
    END IF;
    RETURN;
  END IF;

  IF p_is_stripe_payment
    AND v_invoice.stripe_gross_amount_cents IS NOT NULL
    AND v_invoice.stripe_gross_amount_cents > 0
    AND p_amount_paid_cents != v_invoice.stripe_gross_amount_cents
  THEN
    RAISE EXCEPTION
      'Payment amount mismatch for invoice %: expected % cents (gross), received % cents. Refusing to mark paid.',
      p_invoice_id, v_invoice.stripe_gross_amount_cents, p_amount_paid_cents;
  END IF;

  v_base_amount := CASE WHEN p_is_stripe_payment THEN v_invoice.stripe_amount_due_cents ELSE p_amount_paid_cents END;

  UPDATE public.checkout_invoices
  SET
    status                     = 'paid',
    paid_at                    = now(),
    payment_method             = CASE WHEN p_is_stripe_payment THEN 'stripe' ELSE payment_method END,
    stripe_payment_intent_id   = CASE WHEN p_is_stripe_payment THEN p_stripe_payment_intent_id ELSE stripe_payment_intent_id END,
    stripe_checkout_session_id = CASE WHEN p_is_stripe_payment THEN p_stripe_checkout_session_id ELSE stripe_checkout_session_id END,
    total_paid_cents           = total_paid_cents + v_base_amount,
    stripe_amount_due_cents    = 0,
    updated_at                 = now()
  WHERE id = p_invoice_id;

  IF p_is_stripe_payment AND NOT EXISTS (
    SELECT 1 FROM public.customer_payment_ledger
    WHERE stripe_checkout_session_id = p_stripe_checkout_session_id AND entry_type = 'stripe_payment'
  ) THEN
    INSERT INTO public.customer_payment_ledger (
      customer_id, booking_id, invoice_id, invoice_source_type, amount_cents, entry_type, payment_method,
      stripe_checkout_session_id, stripe_payment_intent_id, note, created_by
    ) VALUES (
      v_invoice.customer_id, v_invoice.booking_id, p_invoice_id, 'checkout',
      v_base_amount, 'stripe_payment', 'stripe',
      p_stripe_checkout_session_id, p_stripe_payment_intent_id,
      'Stripe checkout payment received', NULL
    );
  END IF;

  UPDATE public.bookings SET status = 'completed', updated_at = now() WHERE id = v_invoice.booking_id;

  UPDATE public.profiles
  SET pilot_clearance_status = v_invoice.checkout_outcome, updated_at = now()
  WHERE id = v_invoice.customer_id;
END;
$$;

COMMENT ON FUNCTION public.mark_checkout_invoice_paid_atomic(uuid, text, text, integer, boolean) IS
  'Called by Stripe webhook via service_role when p_is_stripe_payment = true. Validates amount against '
  'stripe_amount_due_cents snapshot and writes the Stripe ledger row. When false, settles manual admin checkout '
  'payments without fabricating a Stripe ledger row or overwriting checkout_invoices.payment_method. '
  'Fully idempotent (two-level). Promotes clearance to stored checkout_outcome.';

REVOKE ALL ON FUNCTION public.mark_checkout_invoice_paid_atomic(uuid, text, text, integer, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mark_checkout_invoice_paid_atomic(uuid, text, text, integer, boolean) TO service_role;

COMMIT;
