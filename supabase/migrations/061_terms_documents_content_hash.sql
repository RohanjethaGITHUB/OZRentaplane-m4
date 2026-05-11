-- Ensure terms_documents stores a concrete hash for auditability.
-- Backfill existing rows with a deterministic hash based on stable fields.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.terms_documents
  ADD COLUMN IF NOT EXISTS content_hash text;

-- Backfill any missing hashes. Prefer a stable payload from id/version/url.
UPDATE public.terms_documents
SET content_hash = encode(
  digest(
    concat_ws('|',
      id::text,
      COALESCE(version, ''),
      COALESCE(public_url, ''),
      COALESCE(storage_bucket, ''),
      COALESCE(storage_path, '')
    ),
    'sha256'
  ),
  'hex'
)
WHERE content_hash IS NULL OR btrim(content_hash) = '';

CREATE INDEX IF NOT EXISTS idx_terms_documents_content_hash
  ON public.terms_documents(content_hash);
