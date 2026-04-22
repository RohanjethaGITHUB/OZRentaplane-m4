-- ============================================================
-- 017 — Document-level metadata fields
-- ============================================================
-- Safe, additive migration. No existing columns are altered.
-- Adds per-document metadata to user_documents so each
-- document type can store type-specific classification and
-- the upload modal can collect and persist this info.
--
-- Adds:
--   user_documents.licence_type    — RPL | PPL | CPL | Other (pilot_licence)
--   user_documents.licence_number  — Licence reference number (pilot_licence)
--   user_documents.medical_class   — Class 1 | Class 2 | Basic Class 2 | Other (medical_certificate)
--   user_documents.id_type         — Passport | Driver Licence | Other (photo_id)
-- ============================================================

ALTER TABLE public.user_documents
  ADD COLUMN IF NOT EXISTS licence_type   text,
  ADD COLUMN IF NOT EXISTS licence_number text,
  ADD COLUMN IF NOT EXISTS medical_class  text,
  ADD COLUMN IF NOT EXISTS id_type        text;

-- Add a comment so future devs know the intent of each column
COMMENT ON COLUMN public.user_documents.licence_type   IS 'Pilot licence class: RPL, PPL, CPL, or Other';
COMMENT ON COLUMN public.user_documents.licence_number IS 'Pilot licence reference number (optional)';
COMMENT ON COLUMN public.user_documents.medical_class  IS 'Aviation medical class: Class 1, Class 2, Basic Class 2, or Other';
COMMENT ON COLUMN public.user_documents.id_type        IS 'Photo ID type: Passport, Driver Licence, or Other';
