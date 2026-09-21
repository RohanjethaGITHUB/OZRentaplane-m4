-- Migration 120: Post-Flight Immediate Invoice Payment & Verification Redesign
-- Adds payment_verification_required to booking_invoices status check constraint

BEGIN;

ALTER TABLE public.booking_invoices
  DROP CONSTRAINT IF EXISTS booking_invoices_status_check;

ALTER TABLE public.booking_invoices
  ADD CONSTRAINT booking_invoices_status_check
  CHECK (status IN (
    'draft',
    'issued',
    'payment_required',
    'payment_verification_required',
    'bank_transfer_pending_review',
    'paid',
    'waived',
    'void',
    'failed'
  ));

COMMIT;
