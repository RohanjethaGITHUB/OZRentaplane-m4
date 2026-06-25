BEGIN;

ALTER TABLE public.booking_invoices
  DROP CONSTRAINT IF EXISTS booking_invoices_status_check;

ALTER TABLE public.booking_invoices
  ADD CONSTRAINT booking_invoices_status_check
  CHECK (status IN ('payment_required', 'bank_transfer_pending_review', 'paid', 'void', 'failed'));

CREATE OR REPLACE FUNCTION public.approve_standard_bank_transfer_atomic(
  p_submission_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub     RECORD;
  v_invoice RECORD;
BEGIN
  -- ── Auth check ────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT id, invoice_id, booking_id, customer_id, status
  INTO v_sub
  FROM booking_bank_transfer_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found: %', p_submission_id;
  END IF;
  IF v_sub.status <> 'pending_review' THEN
    RAISE EXCEPTION 'Submission is not pending review: %', v_sub.status;
  END IF;

  -- Lock invoice
  SELECT id, status, subtotal_cents, advance_applied_cents
  INTO v_invoice
  FROM booking_invoices
  WHERE id = v_sub.invoice_id FOR UPDATE;

  -- ── Auth check ────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  UPDATE booking_bank_transfer_submissions
  SET status = 'approved', reviewed_at = now(), updated_at = now()
  WHERE id = p_submission_id;

  UPDATE booking_invoices
  SET status           = 'paid',
      payment_method   = 'bank_transfer',
      total_paid_cents = subtotal_cents - advance_applied_cents,
      paid_at          = now(),
      updated_at       = now()
  WHERE id = v_sub.invoice_id;

  INSERT INTO public.customer_payment_ledger (
    customer_id,
    booking_id,
    invoice_id,
    invoice_source_type,
    amount_cents,
    entry_type,
    payment_method,
    note,
    created_by
  ) VALUES (
    v_sub.customer_id,
    v_sub.booking_id,
    v_sub.invoice_id,
    'booking',
    v_invoice.subtotal_cents - v_invoice.advance_applied_cents,
    'bank_transfer',
    'bank_transfer',
    'Bank transfer approved by admin',
    auth.uid()
  );

  UPDATE bookings
  SET status = 'completed', updated_at = now()
  WHERE id = v_sub.booking_id;
END;
$$;

COMMIT;
