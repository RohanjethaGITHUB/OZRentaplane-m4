BEGIN;

-- Drop any existing CHECK constraint on user_documents that controls document_type.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.user_documents'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%document_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.user_documents DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.user_documents
  ADD CONSTRAINT user_documents_document_type_check
  CHECK (
    document_type IN (
      'pilot_licence',
      'medical_certificate',
      'photo_id',
      'night_vfr_evidence'
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;