-- Run this once in the Supabase SQL Editor.
-- Fixes: column "reviewed_by" does not exist on booking_bank_transfer_submissions

ALTER TABLE public.booking_bank_transfer_submissions
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
