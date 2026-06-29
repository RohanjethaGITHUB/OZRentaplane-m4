-- ============================================================
-- 095_booking_invoices_pdf_url.sql
--
-- Adds a PDF URL column to standard booking invoices so post-flight
-- billing can persist generated invoice PDF links in the invoice row.
-- ============================================================

ALTER TABLE public.booking_invoices
  ADD COLUMN IF NOT EXISTS pdf_url text;
