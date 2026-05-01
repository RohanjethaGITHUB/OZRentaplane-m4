-- ============================================================
-- 041_checkout_payment_methods.sql
--
-- 1. Add payment methods and surcharge columns to checkout_invoices
-- 2. Create checkout_bank_transfer_submissions table (hardened RLS)
-- 3. Update checkout_invoice_live_amount view
-- 4. Update prepare_checkout_payment_atomic for surcharge
-- 5. Update mark_checkout_invoice_paid_atomic for gross amounts
-- 6. Add bank transfer approval/rejection RPCs
-- ============================================================

-- ── 1. Update checkout_invoices ───────────────────────────────────────────────
ALTER TABLE public.checkout_invoices
  ADD COLUMN IF NOT EXISTS payment_method                 text DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS online_payment_surcharge_cents integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_fee_rate_bps            integer,
  ADD COLUMN IF NOT EXISTS stripe_fee_fixed_cents         integer,
  ADD COLUMN IF NOT EXISTS stripe_gross_amount_cents      integer;

-- Non-negative constraints on surcharge/fee fields.
-- Wrapped in DO blocks so the migration is safe to re-run.
DO $$ BEGIN
  ALTER TABLE public.checkout_invoices
    ADD CONSTRAINT chk_surcharge_non_negative
    CHECK (online_payment_surcharge_cents >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.checkout_invoices
    ADD CONSTRAINT chk_stripe_fee_rate_non_negative
    CHECK (stripe_fee_rate_bps IS NULL OR stripe_fee_rate_bps >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.checkout_invoices
    ADD CONSTRAINT chk_stripe_fee_fixed_non_negative
    CHECK (stripe_fee_fixed_cents IS NULL OR stripe_fee_fixed_cents >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.checkout_invoices
    ADD CONSTRAINT chk_stripe_gross_non_negative
    CHECK (stripe_gross_amount_cents IS NULL OR stripe_gross_amount_cents >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Allowed payment_method values.
-- 'waived' is kept for compatibility with the admin payment-waiver path (migration 040).
-- 'account_credit' is used when account credit fully settles the invoice.
-- NULL is permitted for invoices created before this column existed.
DO $$ BEGIN
  ALTER TABLE public.checkout_invoices
    ADD CONSTRAINT chk_payment_method_values
    CHECK (payment_method IS NULL OR
           payment_method IN ('stripe', 'bank_transfer', 'account_credit', 'waived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend valid_entry_type on customer_payment_ledger to include 'bank_transfer'.
-- The approve_bank_transfer_atomic RPC inserts a ledger row with this entry_type.
-- Pattern mirrors migration 031: drop the old constraint, recreate it with all
-- previously allowed values intact plus the new one.
ALTER TABLE public.customer_payment_ledger
  DROP CONSTRAINT IF EXISTS valid_entry_type;

ALTER TABLE public.customer_payment_ledger
  ADD CONSTRAINT valid_entry_type
  CHECK (entry_type IN (
    'advance_credit',
    'advance_applied',
    'stripe_payment',
    'refund',
    'manual_adjustment',
    'credit_reversed',
    'credit_refunded',
    'bank_transfer'
  ));

-- ── 2. Create checkout_bank_transfer_submissions ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.checkout_bank_transfer_submissions (
    id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_id           uuid NOT NULL REFERENCES public.checkout_invoices(id) ON DELETE CASCADE,
    booking_id           uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    customer_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status               text NOT NULL DEFAULT 'pending_review',
    reference            text,
    receipt_storage_path text NOT NULL,
    admin_note           text,
    submitted_at         timestamptz DEFAULT now(),
    reviewed_at          timestamptz,
    reviewed_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT valid_bank_transfer_status CHECK (status IN ('pending_review', 'approved', 'rejected'))
);

ALTER TABLE public.checkout_bank_transfer_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can view their own submissions" ON public.checkout_bank_transfer_submissions;
CREATE POLICY "Customers can view their own submissions" ON public.checkout_bank_transfer_submissions
    FOR SELECT USING (auth.uid() = customer_id);

-- Hardened INSERT policy — every reference to the new row is fully qualified.
--
-- All three columns that appear in both checkout_bank_transfer_submissions and
-- checkout_invoices (invoice_id is not in checkout_invoices, but booking_id and
-- customer_id are) are written as
--   public.checkout_bank_transfer_submissions.<column>
-- inside the EXISTS subquery, leaving PostgreSQL no room to bind them to a
-- column of the subquery's own tables.
DROP POLICY IF EXISTS "Customers can create their own submissions" ON public.checkout_bank_transfer_submissions;
CREATE POLICY "Customers can create their own submissions" ON public.checkout_bank_transfer_submissions
    FOR INSERT WITH CHECK (
        -- New-row field checks (bare names are unambiguous outside any subquery)
        auth.uid() = customer_id
        AND status      = 'pending_review'
        AND reviewed_at IS NULL
        AND reviewed_by IS NULL
        AND admin_note  IS NULL
        -- Receipt must be stored under the customer's own folder
        AND split_part(receipt_storage_path, '/', 1) = auth.uid()::text
        -- Invoice and booking checks — every new-row reference is table-qualified
        AND EXISTS (
            SELECT 1
            FROM   public.checkout_invoices ci
            JOIN   public.bookings b ON b.id = ci.booking_id
            WHERE  ci.id                   = public.checkout_bank_transfer_submissions.invoice_id
              AND  ci.customer_id          = public.checkout_bank_transfer_submissions.customer_id
              AND  ci.customer_id          = auth.uid()
              AND  ci.booking_id           = public.checkout_bank_transfer_submissions.booking_id
              AND  ci.status               = 'payment_required'
              AND  ci.invoice_type         = 'checkout'
              AND  b.id                    = public.checkout_bank_transfer_submissions.booking_id
              AND  b.booking_owner_user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Admin full access submissions" ON public.checkout_bank_transfer_submissions;
CREATE POLICY "Admin full access submissions" ON public.checkout_bank_transfer_submissions
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- ── 3. Update checkout_invoice_live_amount view ───────────────────────────────
DROP VIEW IF EXISTS public.checkout_invoice_live_amount;
CREATE VIEW public.checkout_invoice_live_amount
WITH (security_invoker = true) AS
SELECT
  ci.id                                            AS invoice_id,
  ci.booking_id,
  ci.customer_id,
  ci.subtotal_cents,
  ci.advance_applied_cents,
  ci.total_paid_cents,
  ci.status,
  ci.checkout_outcome,
  ci.checkout_duration_hours,
  ci.checkout_landing_subtotal_cents,
  ci.payment_method,
  ci.online_payment_surcharge_cents,
  ci.stripe_gross_amount_cents,
  ci.invoice_number,
  COALESCE(ccb.balance_cents, 0)                   AS current_credit_balance_cents,
  GREATEST(
    ci.subtotal_cents
    - ci.advance_applied_cents
    - ci.total_paid_cents
    - COALESCE(ccb.balance_cents, 0)
  , 0)                                             AS display_amount_due_cents
FROM public.checkout_invoices ci
LEFT JOIN public.customer_credit_balances ccb ON ccb.customer_id = ci.customer_id
WHERE ci.invoice_type = 'checkout';

COMMENT ON VIEW public.checkout_invoice_live_amount IS
  'Read-only display view including payment methods and surcharge details.';

-- ── 4. Update prepare_checkout_payment_atomic ─────────────────────────────────
DROP FUNCTION IF EXISTS public.prepare_checkout_payment_atomic(uuid, uuid);

CREATE OR REPLACE FUNCTION public.prepare_checkout_payment_atomic(
  p_invoice_id      uuid,
  p_customer_id     uuid,
  p_fee_rate_bps    integer DEFAULT 170,
  p_fee_fixed_cents integer DEFAULT 30,
  p_apply_surcharge boolean DEFAULT true
)
RETURNS TABLE (
  out_final_amount_cents integer,
  out_invoice_status     text,
  out_settled_by_credit  boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invoice            record;
  v_balance_cents      integer := 0;
  v_remaining_cents    integer := 0;
  v_additional_credit  integer := 0;
  v_final_amount_cents integer := 0;
  v_surcharge_cents    integer := 0;
  v_gross_amount_cents integer := 0;
BEGIN
  IF auth.uid() != p_customer_id THEN
    RAISE EXCEPTION 'Unauthorized: invoice does not belong to this user';
  END IF;

  SELECT * INTO v_invoice FROM public.checkout_invoices
  WHERE id = p_invoice_id AND customer_id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found: %', p_invoice_id; END IF;

  IF v_invoice.status = 'paid' THEN
    RETURN QUERY SELECT 0::integer, 'paid'::text, true; RETURN;
  END IF;

  IF v_invoice.status NOT IN ('payment_required') THEN
    RAISE EXCEPTION 'Invoice is not in payment_required state (status: %)', v_invoice.status;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_customer_id::text));

  SELECT COALESCE(balance_cents, 0) INTO v_balance_cents
  FROM public.customer_credit_balances WHERE customer_id = p_customer_id;
  v_balance_cents := GREATEST(COALESCE(v_balance_cents, 0), 0);

  v_remaining_cents    := GREATEST(v_invoice.subtotal_cents - v_invoice.advance_applied_cents - v_invoice.total_paid_cents, 0);
  v_additional_credit  := GREATEST(LEAST(v_balance_cents, v_remaining_cents), 0);
  v_final_amount_cents := GREATEST(v_remaining_cents - v_additional_credit, 0);

  IF v_additional_credit > 0 THEN
    UPDATE public.checkout_invoices
    SET advance_applied_cents = advance_applied_cents + v_additional_credit, updated_at = now()
    WHERE id = p_invoice_id;

    INSERT INTO public.customer_payment_ledger (
      customer_id, booking_id, invoice_id, amount_cents, entry_type, note, created_by
    ) VALUES (
      p_customer_id, v_invoice.booking_id, p_invoice_id,
      -v_additional_credit, 'advance_applied',
      'Additional credit applied at payment time', p_customer_id
    );
  END IF;

  -- Gross up logic for Stripe online payment surcharge
  IF v_final_amount_cents > 0 AND p_apply_surcharge THEN
    -- grossAmountCents = ceil((baseAmountDueCents + fixedFeeCents) / (1 - percentageFee))
    v_gross_amount_cents := ceil((v_final_amount_cents + p_fee_fixed_cents) / (1.0 - (p_fee_rate_bps / 10000.0)))::integer;
    v_surcharge_cents := v_gross_amount_cents - v_final_amount_cents;
  ELSE
    v_gross_amount_cents := v_final_amount_cents;
    v_surcharge_cents := 0;
  END IF;

  IF v_final_amount_cents = 0 THEN
    -- Invoice fully settled by account credit — not an admin waiver.
    UPDATE public.checkout_invoices
    SET status = 'paid', paid_at = now(), stripe_amount_due_cents = 0,
        payment_method = 'account_credit', updated_at = now()
    WHERE id = p_invoice_id;
    UPDATE public.bookings SET status = 'completed', updated_at = now() WHERE id = v_invoice.booking_id;
    UPDATE public.profiles SET pilot_clearance_status = v_invoice.checkout_outcome, updated_at = now()
    WHERE id = p_customer_id;
    INSERT INTO public.verification_events (user_id, actor_role, event_type, title, body, is_read, email_status)
    VALUES (p_customer_id, 'system', 'approved',
      'Checkout invoice settled using account credit',
      'Your checkout invoice has been fully settled using your account credit. Your pilot status has been updated.',
      false, 'skipped');
    RETURN QUERY SELECT 0::integer, 'paid'::text, true; RETURN;
  END IF;

  UPDATE public.checkout_invoices
  SET
    stripe_amount_due_cents        = v_final_amount_cents,
    online_payment_surcharge_cents = v_surcharge_cents,
    stripe_fee_rate_bps            = p_fee_rate_bps,
    stripe_fee_fixed_cents         = p_fee_fixed_cents,
    stripe_gross_amount_cents      = v_gross_amount_cents,
    updated_at                     = now()
  WHERE id = p_invoice_id;

  RETURN QUERY SELECT v_gross_amount_cents, 'payment_required'::text, false;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_checkout_payment_atomic(uuid, uuid, integer, integer, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.prepare_checkout_payment_atomic(uuid, uuid, integer, integer, boolean) TO authenticated;

-- ── 5. Update mark_checkout_invoice_paid_atomic ───────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_checkout_invoice_paid_atomic(
  p_invoice_id                 uuid,
  p_stripe_payment_intent_id   text,
  p_stripe_checkout_session_id text,
  p_amount_paid_cents          integer
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
    IF NOT EXISTS (
      SELECT 1 FROM public.customer_payment_ledger
      WHERE stripe_checkout_session_id = p_stripe_checkout_session_id AND entry_type = 'stripe_payment'
    ) THEN
      INSERT INTO public.customer_payment_ledger (
        customer_id, booking_id, invoice_id, amount_cents, entry_type, payment_method,
        stripe_checkout_session_id, stripe_payment_intent_id, note, created_by
      ) VALUES (
        v_invoice.customer_id, v_invoice.booking_id, p_invoice_id,
        v_invoice.stripe_amount_due_cents, 'stripe_payment', 'stripe',
        p_stripe_checkout_session_id, p_stripe_payment_intent_id,
        'Stripe checkout payment received (recovery path)', NULL
      );
    END IF;
    RETURN;
  END IF;

  -- Amount mismatch guard against gross amount
  IF v_invoice.stripe_gross_amount_cents IS NOT NULL
    AND v_invoice.stripe_gross_amount_cents > 0
    AND p_amount_paid_cents != v_invoice.stripe_gross_amount_cents
  THEN
    RAISE EXCEPTION
      'Payment amount mismatch for invoice %: expected % cents (gross), received % cents. Refusing to mark paid.',
      p_invoice_id, v_invoice.stripe_gross_amount_cents, p_amount_paid_cents;
  END IF;

  -- The ledger and total_paid_cents should only reflect the BASE amount.
  v_base_amount := v_invoice.stripe_amount_due_cents;

  UPDATE public.checkout_invoices
  SET
    status                     = 'paid',
    paid_at                    = now(),
    payment_method             = 'stripe',
    stripe_payment_intent_id   = p_stripe_payment_intent_id,
    stripe_checkout_session_id = p_stripe_checkout_session_id,
    total_paid_cents           = total_paid_cents + v_base_amount,
    stripe_amount_due_cents    = 0,
    updated_at                 = now()
  WHERE id = p_invoice_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.customer_payment_ledger
    WHERE stripe_checkout_session_id = p_stripe_checkout_session_id AND entry_type = 'stripe_payment'
  ) THEN
    INSERT INTO public.customer_payment_ledger (
      customer_id, booking_id, invoice_id, amount_cents, entry_type, payment_method,
      stripe_checkout_session_id, stripe_payment_intent_id, note, created_by
    ) VALUES (
      v_invoice.customer_id, v_invoice.booking_id, p_invoice_id,
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

-- ── 6. Add Bank Transfer Approval/Rejection RPCs ──────────────────────────────
-- auth.uid() is resolved server-side inside each function.
-- No admin ID is accepted from the client; the caller's identity cannot be spoofed.
DROP FUNCTION IF EXISTS public.approve_bank_transfer_atomic(uuid, uuid);

CREATE OR REPLACE FUNCTION public.approve_bank_transfer_atomic(
    p_submission_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_caller_id   uuid;
    v_submission  record;
    v_invoice     record;
    v_base_amount integer;
BEGIN
    -- Resolve the caller's identity from the JWT; never trust a client-supplied ID.
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: not authenticated';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: must be an admin';
    END IF;

    SELECT * INTO v_submission FROM public.checkout_bank_transfer_submissions
        WHERE id = p_submission_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found'; END IF;
    IF v_submission.status != 'pending_review' THEN
        RAISE EXCEPTION 'Submission is not pending review (status: %)', v_submission.status;
    END IF;

    SELECT * INTO v_invoice FROM public.checkout_invoices
        WHERE id = v_submission.invoice_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found for submission %', p_submission_id;
    END IF;

    -- Validate invoice/submission relationship integrity before touching any data.
    IF v_invoice.status != 'payment_required' THEN
        RAISE EXCEPTION 'Invoice % is not in payment_required state (status: %)',
            v_invoice.id, v_invoice.status;
    END IF;
    IF v_invoice.customer_id != v_submission.customer_id THEN
        RAISE EXCEPTION 'Invoice customer does not match submission customer';
    END IF;
    IF v_invoice.booking_id != v_submission.booking_id THEN
        RAISE EXCEPTION 'Invoice booking does not match submission booking';
    END IF;
    IF v_invoice.invoice_type IS DISTINCT FROM 'checkout' THEN
        RAISE EXCEPTION 'Invoice % is not a checkout invoice', v_invoice.id;
    END IF;

    v_base_amount := GREATEST(
        v_invoice.subtotal_cents - v_invoice.advance_applied_cents - v_invoice.total_paid_cents,
        0
    );

    UPDATE public.checkout_bank_transfer_submissions
    SET status = 'approved', reviewed_by = v_caller_id, reviewed_at = now()
    WHERE id = p_submission_id;

    -- Mark invoice paid and clear all card-surcharge fields (not applicable to bank transfer).
    UPDATE public.checkout_invoices
    SET
        status                         = 'paid',
        paid_at                        = now(),
        payment_method                 = 'bank_transfer',
        total_paid_cents               = total_paid_cents + v_base_amount,
        stripe_amount_due_cents        = 0,
        online_payment_surcharge_cents = 0,
        stripe_fee_rate_bps            = NULL,
        stripe_fee_fixed_cents         = NULL,
        stripe_gross_amount_cents      = NULL,
        updated_at                     = now()
    WHERE id = v_invoice.id;

    -- Duplicate guard: skip ledger insert if a bank_transfer row already exists for this invoice.
    IF NOT EXISTS (
        SELECT 1 FROM public.customer_payment_ledger
        WHERE invoice_id = v_invoice.id AND entry_type = 'bank_transfer'
    ) THEN
        INSERT INTO public.customer_payment_ledger (
            customer_id, booking_id, invoice_id, amount_cents,
            entry_type, payment_method, note, created_by
        ) VALUES (
            v_invoice.customer_id, v_invoice.booking_id, v_invoice.id, v_base_amount,
            'bank_transfer', 'bank_transfer', 'Bank transfer approved', v_caller_id
        );
    END IF;

    UPDATE public.bookings SET status = 'completed', updated_at = now()
        WHERE id = v_invoice.booking_id;

    UPDATE public.profiles
    SET pilot_clearance_status = v_invoice.checkout_outcome, updated_at = now()
    WHERE id = v_invoice.customer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_bank_transfer_atomic(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.approve_bank_transfer_atomic(uuid) TO authenticated;


DROP FUNCTION IF EXISTS public.reject_bank_transfer_atomic(uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.reject_bank_transfer_atomic(
    p_submission_id uuid,
    p_admin_note    text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_caller_id    uuid;
    v_cleaned_note text;
BEGIN
    -- Resolve the caller's identity from the JWT; never trust a client-supplied ID.
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: not authenticated';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: must be an admin';
    END IF;

    -- Rejection note is required and must not be whitespace-only.
    v_cleaned_note := btrim(p_admin_note);
    IF v_cleaned_note IS NULL OR v_cleaned_note = '' THEN
        RAISE EXCEPTION 'Rejection note must not be empty';
    END IF;

    UPDATE public.checkout_bank_transfer_submissions
    SET status = 'rejected', admin_note = v_cleaned_note,
        reviewed_by = v_caller_id, reviewed_at = now()
    WHERE id = p_submission_id AND status = 'pending_review';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Submission not found or not pending review';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_bank_transfer_atomic(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reject_bank_transfer_atomic(uuid, text) TO authenticated;
