BEGIN;

ALTER TABLE public.booking_invoices
  DROP CONSTRAINT IF EXISTS booking_invoices_status_check;

ALTER TABLE public.booking_invoices
  ADD CONSTRAINT booking_invoices_status_check
  CHECK (status IN ('payment_required', 'bank_transfer_pending_review', 'paid', 'waived', 'void', 'failed'));

COMMIT;
