-- ============================================================
-- 004_admin_review_metadata.sql
-- Add admin review metadata capabilities to profiles
-- ============================================================

ALTER TABLE public.profiles
ADD COLUMN reviewed_at timestamptz,
ADD COLUMN reviewed_by uuid references auth.users(id),
ADD COLUMN admin_review_note text;
