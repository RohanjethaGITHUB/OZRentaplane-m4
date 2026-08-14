-- Migration 119: Relax booking_bank_transfer_submissions.invoice_id foreign key
-- so it can reference either booking_invoices.id (PAYF) or invoices.id (Block Time).

ALTER TABLE public.booking_bank_transfer_submissions
  DROP CONSTRAINT IF EXISTS booking_bank_transfer_submissions_invoice_id_fkey;
