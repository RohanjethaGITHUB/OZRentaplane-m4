-- ============================================================
-- Fix: Allow admins to read all verification documents in storage.
--
-- Root cause: 003_admin_rls.sql added admin RLS for public.profiles
-- and public.user_documents tables but did not add a matching storage
-- object policy. The only storage SELECT policy (from 002_user_documents.sql)
-- allows users to read their own files only:
--   (storage.foldername(name))[1] = auth.uid()::text
--
-- When an admin calls createSignedUrl for a customer document stored at
-- {customerId}/{docType}, the storage RLS denies it because the first
-- folder segment (customerId) does not match the admin's auth.uid().
-- This causes the "Open File" button to throw "Could not generate secure
-- file URL" on the admin user detail page.
--
-- Fix: add a SELECT policy for admins on storage.objects using the same
-- get_own_role() security-definer helper already used in table policies.
-- ============================================================

create policy "Admins can read all verification documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'verification_documents'
  and public.get_own_role() = 'admin'
);
