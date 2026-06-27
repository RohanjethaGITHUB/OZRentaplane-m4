-- ============================================================
-- 094_invoice_pdfs_storage.sql
--
-- Storage bucket and access policies for invoice PDF files.
-- Each invoice PDF is stored at:
--   {user_id}/{invoice_number}.pdf
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoice_pdfs',
  'invoice_pdfs',
  true,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Customers can upload own invoice pdfs" ON storage.objects;
CREATE POLICY "Customers can upload own invoice pdfs"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'invoice_pdfs'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "Customers can read own invoice pdfs" ON storage.objects;
CREATE POLICY "Customers can read own invoice pdfs"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoice_pdfs'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "Admins can read all invoice pdfs" ON storage.objects;
CREATE POLICY "Admins can read all invoice pdfs"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoice_pdfs'
    AND public.get_own_role() = 'admin'
  );
