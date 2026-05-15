-- ============================================================
-- 065 — Red Card metadata fields on user_documents
-- ============================================================
-- Adds pilot-licence metadata for Red Card status and expiry.
-- Safe additive migration.

BEGIN;

ALTER TABLE public.user_documents
  ADD COLUMN IF NOT EXISTS has_red_card boolean,
  ADD COLUMN IF NOT EXISTS red_card_expiry_month smallint,
  ADD COLUMN IF NOT EXISTS red_card_expiry_year smallint;

ALTER TABLE public.user_documents
  DROP CONSTRAINT IF EXISTS user_documents_red_card_expiry_month_check,
  DROP CONSTRAINT IF EXISTS user_documents_red_card_expiry_year_check;

ALTER TABLE public.user_documents
  ADD CONSTRAINT user_documents_red_card_expiry_month_check
  CHECK (red_card_expiry_month IS NULL OR red_card_expiry_month BETWEEN 1 AND 12),
  ADD CONSTRAINT user_documents_red_card_expiry_year_check
  CHECK (red_card_expiry_year IS NULL OR red_card_expiry_year BETWEEN 1900 AND 2100);

COMMENT ON COLUMN public.user_documents.has_red_card IS 'Pilot licence metadata: whether pilot holds a Red Card.';
COMMENT ON COLUMN public.user_documents.red_card_expiry_month IS 'Pilot licence metadata: Red Card expiry month (1-12).';
COMMENT ON COLUMN public.user_documents.red_card_expiry_year IS 'Pilot licence metadata: Red Card expiry year (YYYY).';

NOTIFY pgrst, 'reload schema';

COMMIT;
