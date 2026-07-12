BEGIN;

ALTER TABLE public.booking_bank_transfer_submissions
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.booking_invoices
  DROP CONSTRAINT IF EXISTS booking_invoices_status_check;

ALTER TABLE public.booking_invoices
  ADD CONSTRAINT booking_invoices_status_check
  CHECK (status IN ('payment_required', 'bank_transfer_pending_review', 'paid', 'waived', 'void', 'failed'));

CREATE OR REPLACE FUNCTION public.submit_standard_bank_transfer_proof_atomic(
  p_invoice_id uuid,
  p_booking_id uuid,
  p_reference text,
  p_receipt_storage_path text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_submission_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT bi.id
  INTO v_invoice_id
  FROM public.booking_invoices bi
  JOIN public.bookings b ON b.id = bi.booking_id
  WHERE bi.id = p_invoice_id
    AND bi.booking_id = p_booking_id
    AND bi.customer_id = auth.uid()
    AND b.booking_owner_user_id = auth.uid()
    AND b.booking_type = 'standard'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking invoice not found.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.booking_invoices bi
    WHERE bi.id = v_invoice_id
      AND bi.status IN ('paid', 'waived', 'void', 'failed')
  ) THEN
    RAISE EXCEPTION 'This invoice is not eligible for bank transfer submission.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.booking_bank_transfer_submissions s
    WHERE s.invoice_id = v_invoice_id
      AND s.status = 'pending_review'
  ) THEN
    RAISE EXCEPTION 'A bank transfer proof is already awaiting review.';
  END IF;

  INSERT INTO public.booking_bank_transfer_submissions (
    invoice_id,
    booking_id,
    customer_id,
    reference,
    receipt_storage_path,
    status
  ) VALUES (
    p_invoice_id,
    p_booking_id,
    auth.uid(),
    NULLIF(trim(p_reference), ''),
    p_receipt_storage_path,
    'pending_review'
  )
  RETURNING id INTO v_submission_id;

  UPDATE public.booking_invoices
  SET status = 'bank_transfer_pending_review',
      payment_method = 'bank_transfer',
      updated_at = now()
  WHERE id = v_invoice_id;

  RETURN v_submission_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_standard_bank_transfer_proof_atomic(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_standard_bank_transfer_proof_atomic(uuid, uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_standard_bank_transfer_atomic(
  p_submission_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
  v_invoice RECORD;
  v_caller_id uuid := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT id, invoice_id, booking_id, customer_id, status, submitted_at, created_at
  INTO v_sub
  FROM public.booking_bank_transfer_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found: %', p_submission_id;
  END IF;
  IF v_sub.status <> 'pending_review' THEN
    RAISE EXCEPTION 'Submission is not pending review: %', v_sub.status;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.booking_bank_transfer_submissions s
    WHERE s.invoice_id = v_sub.invoice_id
      AND (
        COALESCE(s.submitted_at, s.created_at, '-infinity'::timestamptz),
        COALESCE(s.created_at, s.submitted_at, '-infinity'::timestamptz),
        s.id
      ) > (
        COALESCE(v_sub.submitted_at, v_sub.created_at, '-infinity'::timestamptz),
        COALESCE(v_sub.created_at, v_sub.submitted_at, '-infinity'::timestamptz),
        v_sub.id
      )
  ) THEN
    RAISE EXCEPTION 'A newer submission exists for this invoice and must be reviewed instead.';
  END IF;

  SELECT id, status, subtotal_cents, advance_applied_cents
  INTO v_invoice
  FROM public.booking_invoices
  WHERE id = v_sub.invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found: %', v_sub.invoice_id;
  END IF;
  IF v_invoice.status NOT IN ('payment_required', 'bank_transfer_pending_review') THEN
    RAISE EXCEPTION 'Invoice is not awaiting payment review: %', v_invoice.status;
  END IF;

  UPDATE public.booking_bank_transfer_submissions
  SET status = 'approved',
      reviewed_by = v_caller_id,
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_submission_id;

  UPDATE public.booking_invoices
  SET status = 'paid',
      payment_method = 'bank_transfer',
      total_paid_cents = subtotal_cents - advance_applied_cents,
      paid_at = now(),
      updated_at = now()
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
    v_caller_id
  );

  UPDATE public.bookings
  SET status = 'completed', updated_at = now()
  WHERE id = v_sub.booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_standard_bank_transfer_atomic(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_standard_bank_transfer_atomic(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_standard_bank_transfer_atomic(
  p_submission_id uuid,
  p_admin_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
  v_caller_id uuid := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT id, invoice_id, status, submitted_at, created_at
  INTO v_sub
  FROM public.booking_bank_transfer_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found: %', p_submission_id;
  END IF;
  IF v_sub.status <> 'pending_review' THEN
    RAISE EXCEPTION 'Submission not found or not in pending_review state: %', p_submission_id;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.booking_bank_transfer_submissions s
    WHERE s.invoice_id = v_sub.invoice_id
      AND (
        COALESCE(s.submitted_at, s.created_at, '-infinity'::timestamptz),
        COALESCE(s.created_at, s.submitted_at, '-infinity'::timestamptz),
        s.id
      ) > (
        COALESCE(v_sub.submitted_at, v_sub.created_at, '-infinity'::timestamptz),
        COALESCE(v_sub.created_at, v_sub.submitted_at, '-infinity'::timestamptz),
        v_sub.id
      )
  ) THEN
    RAISE EXCEPTION 'A newer submission exists for this invoice and must be reviewed instead.';
  END IF;

  UPDATE public.booking_bank_transfer_submissions
  SET status = 'rejected',
      admin_note = p_admin_note,
      reviewed_by = v_caller_id,
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_submission_id;

  UPDATE public.booking_invoices
  SET status = 'payment_required',
      paid_at = NULL,
      updated_at = now()
  WHERE id = v_sub.invoice_id
    AND status IN ('payment_required', 'bank_transfer_pending_review');
END;
$$;

REVOKE ALL ON FUNCTION public.reject_standard_bank_transfer_atomic(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_standard_bank_transfer_atomic(uuid, text) TO authenticated;

UPDATE public.booking_invoices bi
SET status = 'bank_transfer_pending_review',
    payment_method = COALESCE(bi.payment_method, 'bank_transfer'),
    updated_at = now()
WHERE bi.status = 'payment_required'
  AND bi.paid_at IS NULL
  AND bi.status NOT IN ('paid', 'waived', 'void', 'failed')
  AND COALESCE(bi.total_paid_cents, 0) = 0
  AND EXISTS (
    SELECT 1
    FROM public.booking_bank_transfer_submissions s
    WHERE s.invoice_id = bi.id
      AND s.status = 'pending_review'
  );

COMMIT;
