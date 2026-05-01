-- ============================================================
-- 042_bank_transfer_storage.sql
--
-- Create the storage bucket for bank transfer receipts and
-- configure the appropriate RLS policies.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'bank_transfer_receipts',
    'bank_transfer_receipts',
    false,
    5242880, -- 5MB limit
    '{image/jpeg,image/png,image/webp,application/pdf}'
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── RLS Policies ────────────────────────────────────────────────────────────
-- 1. Customers can upload receipts to their own folder (folder = customer_id)
DROP POLICY IF EXISTS "Customers can upload own receipts" ON storage.objects;
CREATE POLICY "Customers can upload own receipts" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'bank_transfer_receipts'
        AND auth.role() = 'authenticated'
        AND split_part(name, '/', 1) = auth.uid()::text
    );

-- 2. Customers can read their own receipts
DROP POLICY IF EXISTS "Customers can read own receipts" ON storage.objects;
CREATE POLICY "Customers can read own receipts" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'bank_transfer_receipts'
        AND auth.role() = 'authenticated'
        AND split_part(name, '/', 1) = auth.uid()::text
    );

-- 3. Admins can read all receipts
DROP POLICY IF EXISTS "Admins can read all receipts" ON storage.objects;
CREATE POLICY "Admins can read all receipts" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'bank_transfer_receipts'
        AND EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );
