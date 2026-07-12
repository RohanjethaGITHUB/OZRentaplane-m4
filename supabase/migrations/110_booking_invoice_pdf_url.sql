-- 110_booking_invoice_pdf_url.sql
--
-- Adds PDF storage for standard booking invoices so the customer/admin
-- download links can point to a generated file instead of the booking detail
-- page.

BEGIN;

ALTER TABLE public.booking_invoices
  ADD COLUMN IF NOT EXISTS pdf_url text;

COMMIT;
