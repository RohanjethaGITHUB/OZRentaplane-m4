-- ============================================================
-- 028_profile_last_flight_date.sql
--
-- Moves last_flight_date from a per-booking field to a profile
-- field so it can be shared between the Documents page and the
-- checkout flow without needing a booking to exist first.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_flight_date date;

COMMENT ON COLUMN public.profiles.last_flight_date
  IS 'Customer-reported date of their most recent flight, shared across checkout flow and Documents page';
