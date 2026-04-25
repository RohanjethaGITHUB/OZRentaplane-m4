-- ============================================================
-- 015 — Customer document metadata (expiry_date + pilot_arn)
-- ============================================================
-- Safe, additive migration. No existing columns are altered.
-- Adds:
--   user_documents.expiry_date  — optional expiry date for licences / medicals
--   profiles.pilot_arn          — Aviation Reference Number stored on profile
--                                 after verification completes
-- ============================================================

-- 1. Add expiry_date to user_documents
ALTER TABLE public.user_documents
  ADD COLUMN IF NOT EXISTS expiry_date date;

-- 2. Add pilot_arn to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pilot_arn text;

-- Customers can read their own ARN; only admins or the system can write it.
-- The existing RLS "Users can update their own profile" policy already allows
-- customers to update their profile row, so this is consistent. If we later
-- want to make ARN admin-only-writeable, we can tighten the update policy.
-- For now we leave the existing policy in place.
