-- ============================================================
-- 037_checkout_payment_rpcs.sql
--
-- 1. prepare_checkout_payment_atomic
--    Called at payment-click time by payment.ts (authenticated).
--    Locks invoice + credit, applies any additional credit,
--    returns the final amount to charge via Stripe.
--    If fully covered by credit, marks invoice paid and
--    promotes pilot_clearance_status immediately.
--
-- 2. mark_checkout_invoice_paid_atomic
--    Called by the Stripe webhook (service role only).
--    Fully idempotent: safe to call twice for the same invoice.
--    Uses stripe_checkout_session_id for duplicate ledger guard.
--    Promotes pilot_clearance_status to the stored checkout_outcome.
--
-- Both RPCs are idempotent and safe against duplicate calls.
-- ============================================================


-- ── PART 1: prepare_checkout_payment_atomic ───────────────────────────────────
-- Called by: payment.ts (authenticated customer)
-- Purpose:   Lock invoice + credit balance at payment-click time,
--            apply any newly available credit, return authoritative
--            amount to charge. If amount = 0, complete everything
--            without Stripe.
--
-- Accounting model — Option 1 (applies to all RPCs in both migrations):
--   advance_applied_cents = ALL credit consumed (initial + any top-ups)
--   total_paid_cents      = Stripe / card payments ONLY (never includes credit)
--
-- Idempotency:
--   If invoice is already 'paid', return (0, 'paid', true) immediately.
--   Additional credit debits are only written if v_additional_credit > 0.
--
-- Credit math (correct under Option 1):
--   remaining_to_charge = subtotal - advance_applied - total_paid
--     advance_applied = all credit consumed so far
--     total_paid      = Stripe amounts received so far
--   additional_credit = MIN(current_ledger_balance, remaining_to_charge)
--     current_ledger_balance already reflects the initial advance_applied debit,
--     so it is the credit added AFTER invoice creation only.
--   final_stripe_amount = remaining_to_charge - additional_credit
--
-- When additional_credit > 0: only advance_applied_cents is updated.
-- total_paid_cents is intentionally NOT touched here (Stripe-only column).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prepare_checkout_payment_atomic(
  p_invoice_id  uuid,
  p_customer_id uuid
)
RETURNS TABLE (
  out_final_amount_cents  integer,
  out_invoice_status      text,
  out_settled_by_credit   boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice             record;
  v_balance_cents       integer := 0;
  v_remaining_cents     integer := 0;
  v_additional_credit   integer := 0;
  v_final_amount_cents  integer := 0;
BEGIN
  -- ── Auth check ────────────────────────────────────────────────────────────────
  IF auth.uid() != p_customer_id THEN
    RAISE EXCEPTION 'Unauthorized: invoice does not belong to this user';
  END IF;

  -- ── Lock invoice row ──────────────────────────────────────────────────────────
  SELECT *
  INTO   v_invoice
  FROM   public.checkout_invoices
  WHERE  id         = p_invoice_id
    AND  customer_id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
  END IF;

  -- ── Idempotency: already paid ─────────────────────────────────────────────────
  IF v_invoice.status = 'paid' THEN
    RETURN QUERY SELECT 0::integer, 'paid'::text, true;
    RETURN;
  END IF;

  IF v_invoice.status NOT IN ('payment_required') THEN
    RAISE EXCEPTION 'Invoice is not in payment_required state (status: %)', v_invoice.status;
  END IF;

  -- ── Advisory lock on customer credit (prevents double-apply race) ─────────────
  PERFORM pg_advisory_xact_lock(hashtext(p_customer_id::text));

  -- ── Read current credit balance ───────────────────────────────────────────────
  -- This balance already has the initial advance_applied debit subtracted,
  -- so it only reflects credit that was added AFTER invoice creation.
  SELECT COALESCE(balance_cents, 0)
  INTO   v_balance_cents
  FROM   public.customer_credit_balances
  WHERE  customer_id = p_customer_id;

  v_balance_cents := COALESCE(v_balance_cents, 0);
  IF v_balance_cents < 0 THEN v_balance_cents := 0; END IF;

  -- ── Compute remaining amount (before any new credit) ──────────────────────────
  v_remaining_cents := v_invoice.subtotal_cents
                     - v_invoice.advance_applied_cents
                     - v_invoice.total_paid_cents;
  v_remaining_cents := GREATEST(v_remaining_cents, 0);

  -- ── Apply additional credit (only newly available credit since invoice creation)
  v_additional_credit := LEAST(v_balance_cents, v_remaining_cents);
  v_additional_credit := GREATEST(v_additional_credit, 0);

  v_final_amount_cents := v_remaining_cents - v_additional_credit;
  v_final_amount_cents := GREATEST(v_final_amount_cents, 0);

  -- ── Apply additional credit if any ───────────────────────────────────────────
  IF v_additional_credit > 0 THEN
    -- Option 1: additional credit goes into advance_applied_cents ONLY.
    -- total_paid_cents is Stripe-only and must NOT be changed here.
    -- Updating total_paid_cents would cause double-subtraction in the view:
    --   subtotal - advance_applied - total_paid - current_credit
    -- where current_credit already reflects the ledger debit we are about to write.
    UPDATE public.checkout_invoices
    SET
      advance_applied_cents = advance_applied_cents + v_additional_credit,
      updated_at            = now()
    WHERE id = p_invoice_id;

    INSERT INTO public.customer_payment_ledger (
      customer_id, booking_id, invoice_id,
      amount_cents, entry_type, note, created_by
    ) VALUES (
      p_customer_id,
      v_invoice.booking_id,
      p_invoice_id,
      -v_additional_credit,
      'advance_applied',
      'Additional credit applied at payment time',
      p_customer_id
    );
  END IF;

  -- ── Fully covered by credit → settle without Stripe ──────────────────────────
  IF v_final_amount_cents = 0 THEN
    UPDATE public.checkout_invoices
    SET
      status     = 'paid',
      paid_at    = now(),
      stripe_amount_due_cents = 0,
      updated_at = now()
    WHERE id = p_invoice_id;

    UPDATE public.bookings
    SET
      status     = 'completed',
      updated_at = now()
    WHERE id = v_invoice.booking_id;

    -- Promote clearance to the stored checkout outcome
    UPDATE public.profiles
    SET
      pilot_clearance_status = v_invoice.checkout_outcome,
      updated_at             = now()
    WHERE id = p_customer_id;

    -- Notify customer
    INSERT INTO public.verification_events (
      user_id, actor_role, event_type, title, body, is_read, email_status
    ) VALUES (
      p_customer_id,
      'system',
      'approved',
      'Checkout invoice settled using account credit',
      'Your checkout invoice has been fully settled using your account credit. Your pilot status has been updated.',
      false,
      'skipped'
    );

    RETURN QUERY SELECT 0::integer, 'paid'::text, true;
    RETURN;
  END IF;

  -- ── Update the stripe_amount_due_cents snapshot for session creation ──────────
  -- Note: even if the customer abandons Stripe, the applied additional_credit
  -- remains reserved on the invoice. The dashboard will correctly show the
  -- updated remaining amount due (acceptable per spec).
  UPDATE public.checkout_invoices
  SET
    stripe_amount_due_cents = v_final_amount_cents,
    updated_at              = now()
  WHERE id = p_invoice_id;

  RETURN QUERY SELECT v_final_amount_cents, 'payment_required'::text, false;
END;
$$;

COMMENT ON FUNCTION public.prepare_checkout_payment_atomic IS
  'Authoritative payment amount at click time. Locks invoice + credit, '
  'applies any additional credit, settles by credit if possible, '
  'otherwise returns final_amount_cents for Stripe session creation. '
  'Idempotent: safe to call again if the customer refreshes.';

-- Grant: customer calls this at payment-click time via the authenticated client.
REVOKE ALL ON FUNCTION public.prepare_checkout_payment_atomic(
  uuid, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_checkout_payment_atomic(
  uuid, uuid
) TO authenticated;


-- ── PART 2: mark_checkout_invoice_paid_atomic ─────────────────────────────────
-- Called by: Stripe webhook handler (service role only).
-- Purpose:   Mark invoice paid, record Stripe ledger entry,
--            complete booking, promote pilot_clearance_status
--            to the stored checkout_outcome.
--
-- Idempotency (two-level):
--   Level 1: If invoice.status = 'paid', check downstream state and
--            repair anything incomplete, then return cleanly.
--   Level 2: Before inserting ledger entry, check for existing row
--            with same stripe_checkout_session_id + 'stripe_payment'.
--            Skip if already present.
--
-- This means: calling this function twice for the same payment is safe.
-- It will never create duplicate ledger entries or set incorrect state.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mark_checkout_invoice_paid_atomic(
  p_invoice_id                  uuid,
  p_stripe_payment_intent_id    text,
  p_stripe_checkout_session_id  text,
  p_amount_paid_cents           integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice        record;
  v_booking_status text;
  v_clearance      text;
BEGIN
  -- ── Lock invoice row ──────────────────────────────────────────────────────────
  SELECT *
  INTO   v_invoice
  FROM   public.checkout_invoices
  WHERE  id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
  END IF;

  -- ── Level 1 idempotency — invoice already paid ────────────────────────────────
  -- Repair any downstream state that may be incomplete from a partial failure.
  IF v_invoice.status = 'paid' THEN
    -- Check and repair booking
    SELECT status INTO v_booking_status
    FROM   public.bookings
    WHERE  id = v_invoice.booking_id;

    IF v_booking_status != 'completed' THEN
      UPDATE public.bookings
      SET status = 'completed', updated_at = now()
      WHERE id = v_invoice.booking_id;
    END IF;

    -- Check and repair clearance
    SELECT pilot_clearance_status INTO v_clearance
    FROM   public.profiles
    WHERE  id = v_invoice.customer_id;

    IF v_clearance = 'checkout_payment_required' THEN
      UPDATE public.profiles
      SET
        pilot_clearance_status = v_invoice.checkout_outcome,
        updated_at             = now()
      WHERE id = v_invoice.customer_id;
    END IF;

    -- Level 2: ensure ledger entry exists even in recovery path
    IF NOT EXISTS (
      SELECT 1 FROM public.customer_payment_ledger
      WHERE  stripe_checkout_session_id = p_stripe_checkout_session_id
        AND  entry_type = 'stripe_payment'
    ) THEN
      INSERT INTO public.customer_payment_ledger (
        customer_id, booking_id, invoice_id,
        amount_cents, entry_type, payment_method,
        stripe_checkout_session_id, stripe_payment_intent_id,
        note, created_by
      ) VALUES (
        v_invoice.customer_id, v_invoice.booking_id, p_invoice_id,
        p_amount_paid_cents, 'stripe_payment', 'stripe',
        p_stripe_checkout_session_id, p_stripe_payment_intent_id,
        'Stripe checkout payment received (recovery path)',
        NULL
      );
    END IF;

    RETURN;  -- All good, exit cleanly
  END IF;

  -- ── Amount mismatch guard ────────────────────────────────────────────────────
  -- Defensive check: the Stripe amount received must match the snapshot written
  -- by prepare_checkout_payment_atomic.  A mismatch means either:
  --   a) a different Stripe session (wrong invoice_id in metadata), or
  --   b) a partial/overpayment — both are hard errors.
  -- This fires only when status = 'payment_required' (not in the idempotency path).
  IF v_invoice.stripe_amount_due_cents IS NOT NULL
    AND v_invoice.stripe_amount_due_cents > 0
    AND p_amount_paid_cents != v_invoice.stripe_amount_due_cents
  THEN
    RAISE EXCEPTION
      'Payment amount mismatch for invoice %: expected % cents, received % cents. '
      'Refusing to mark invoice paid.',
      p_invoice_id,
      v_invoice.stripe_amount_due_cents,
      p_amount_paid_cents;
  END IF;

  -- ── Mark invoice paid ─────────────────────────────────────────────────────────
  -- Option 1: total_paid_cents receives the Stripe amount only.
  -- advance_applied_cents is NOT changed here — credit was written at creation
  -- and/or by prepare_checkout_payment_atomic.
  UPDATE public.checkout_invoices
  SET
    status                      = 'paid',
    paid_at                     = now(),
    stripe_payment_intent_id    = p_stripe_payment_intent_id,
    stripe_checkout_session_id  = p_stripe_checkout_session_id,
    total_paid_cents            = total_paid_cents + p_amount_paid_cents,
    stripe_amount_due_cents     = 0,
    updated_at                  = now()
  WHERE id = p_invoice_id;

  -- ── Level 2 idempotency — ledger entry ───────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.customer_payment_ledger
    WHERE  stripe_checkout_session_id = p_stripe_checkout_session_id
      AND  entry_type = 'stripe_payment'
  ) THEN
    INSERT INTO public.customer_payment_ledger (
      customer_id, booking_id, invoice_id,
      amount_cents, entry_type, payment_method,
      stripe_checkout_session_id, stripe_payment_intent_id,
      note, created_by
    ) VALUES (
      v_invoice.customer_id, v_invoice.booking_id, p_invoice_id,
      p_amount_paid_cents, 'stripe_payment', 'stripe',
      p_stripe_checkout_session_id, p_stripe_payment_intent_id,
      'Stripe checkout payment received',
      NULL
    );
  END IF;

  -- ── Complete booking ──────────────────────────────────────────────────────────
  UPDATE public.bookings
  SET
    status     = 'completed',
    updated_at = now()
  WHERE id = v_invoice.booking_id;

  -- ── Promote pilot_clearance_status to the stored checkout_outcome ─────────────
  -- This is the key change: all 4 outcomes are handled correctly here.
  -- The stored checkout_outcome tells us exactly what clearance to promote to.
  UPDATE public.profiles
  SET
    pilot_clearance_status = v_invoice.checkout_outcome,
    updated_at             = now()
  WHERE id = v_invoice.customer_id;

END;
$$;

COMMENT ON FUNCTION public.mark_checkout_invoice_paid_atomic IS
  'Called by Stripe webhook via service_role client. Fully idempotent — safe '
  'to call twice for the same session. Validates Stripe amount against the '
  'stripe_amount_due_cents snapshot. Promotes pilot_clearance_status to the '
  'stored checkout_outcome. Not callable by authenticated users.';

-- Grant: Stripe webhook uses the service_role client.
-- service_role bypasses RLS by default, but an explicit GRANT is still required
-- for SECURITY DEFINER functions when called via the REST API / PostgREST.
-- REVOKE from PUBLIC ensures no authenticated user can call it directly.
REVOKE ALL ON FUNCTION public.mark_checkout_invoice_paid_atomic(
  uuid, text, text, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_checkout_invoice_paid_atomic(
  uuid, text, text, integer
) TO service_role;
