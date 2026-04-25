-- ============================================================
-- 024_document_and_checkout_metadata.sql
--
-- Additive changes only — no existing columns altered.
--
-- Adds:
--   user_documents.issue_date       — Date of issue (medical_certificate)
--   user_documents.document_number  — Document reference number (photo_id)
--   bookings.last_flight_date       — Customer's last flight before checkout
-- ============================================================


-- ── 1. user_documents: date of issue ────────────────────────────────────────
-- Stores the issue date for aviation medical certificates.
-- Nullable; only relevant for medical_certificate documents.

ALTER TABLE public.user_documents
  ADD COLUMN IF NOT EXISTS issue_date date;

COMMENT ON COLUMN public.user_documents.issue_date
  IS 'Date the document was issued (used for medical certificate)';


-- ── 2. user_documents: document reference number ─────────────────────────────
-- Stores a numeric/alphanumeric reference for the document.
-- Used for photo ID number (passport number, driver licence number, etc.).
-- Nullable; only relevant for photo_id documents.

ALTER TABLE public.user_documents
  ADD COLUMN IF NOT EXISTS document_number text;

COMMENT ON COLUMN public.user_documents.document_number
  IS 'Document reference number (e.g. passport number, driver licence number for photo_id)';


-- ── 3. bookings: last flight date ────────────────────────────────────────────
-- Customer-reported date of their most recent flight before the checkout request.
-- Stored on the checkout booking for admin review.
-- Nullable; populated when the customer submits their checkout request.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS last_flight_date date;

COMMENT ON COLUMN public.bookings.last_flight_date
  IS 'Customer-reported date of their most recent flight before submitting a checkout request';
