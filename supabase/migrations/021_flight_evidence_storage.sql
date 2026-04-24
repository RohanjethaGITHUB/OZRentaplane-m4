-- ============================================================
-- 021_flight_evidence_storage.sql
--
-- 1. Adds file_size column to flight_record_attachments
--    (the table already exists from migration 012; this is
--    a safe additive change).
--
-- 2. Creates the flight_record_evidence storage bucket
--    (private, 10 MB limit, JPEG/PNG only).
--
-- 3. Adds storage RLS policies — path format is:
--       {bookingId}/{flightRecordId}/{timestamp}-{uuid}.{ext}
--    The first path component (bookingId) is used for ownership
--    checks against public.bookings.
--
-- 4. Adds DELETE policy for customers on flight_record_attachments
--    (they can remove a file they mistakenly uploaded, before the
--    record is formally approved).
-- ============================================================

-- ── 1. file_size column ──────────────────────────────────────────────────────

ALTER TABLE public.flight_record_attachments
  ADD COLUMN IF NOT EXISTS file_size bigint;

-- ── 2. DELETE policies on flight_record_attachments ──────────────────────────

-- Customers can delete attachments they uploaded themselves.
-- Prevents removing another customer's files.
CREATE POLICY "Customers can delete own attachments"
  ON public.flight_record_attachments FOR DELETE TO authenticated
  USING (uploaded_by_user_id = auth.uid());

-- Admins can delete any attachment (e.g. inappropriate content).
CREATE POLICY "Admins can delete any attachment"
  ON public.flight_record_attachments FOR DELETE TO authenticated
  USING (public.get_own_role() = 'admin');

-- ── 3. Storage bucket ────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'flight_record_evidence',
  'flight_record_evidence',
  false,             -- private: requires signed URLs
  10485760,          -- 10 MB per file
  ARRAY['image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- ── 4. Storage RLS policies ──────────────────────────────────────────────────
-- Path format: {bookingId}/{flightRecordId}/{filename}
-- split_part(name, '/', 1) extracts the bookingId (first segment).

-- Customers can upload evidence for their own bookings.
CREATE POLICY "customers_upload_flight_evidence"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'flight_record_evidence'
    AND split_part(name, '/', 1) IN (
      SELECT id::text FROM public.bookings
      WHERE booking_owner_user_id = auth.uid()
    )
  );

-- Customers can read evidence for their own bookings.
-- Admins can read all evidence (merged into one policy via OR).
CREATE POLICY "customers_read_flight_evidence"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'flight_record_evidence'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
      OR split_part(name, '/', 1) IN (
        SELECT id::text FROM public.bookings
        WHERE booking_owner_user_id = auth.uid()
      )
    )
  );

-- Customers can delete their own uploaded files.
CREATE POLICY "customers_delete_flight_evidence"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'flight_record_evidence'
    AND split_part(name, '/', 1) IN (
      SELECT id::text FROM public.bookings
      WHERE booking_owner_user_id = auth.uid()
    )
  );
