-- ============================================================
-- 029_checkout_payment_clearance_status.sql
--
-- Adds 'checkout_payment_required' to the pilot_clearance_status
-- constraint so the dashboard can distinguish "awaiting outcome
-- review" from "payment required after approval".
-- ============================================================

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_pilot_clearance_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pilot_clearance_status_check
  CHECK (pilot_clearance_status IN (
    'checkout_required',
    'checkout_requested',
    'checkout_confirmed',
    'checkout_completed_under_review',
    'checkout_payment_required',        -- NEW: approved, waiting for invoice payment
    'cleared_for_solo_hire',
    'additional_supervised_time_required',
    'reschedule_required',
    'not_currently_eligible'
  ));
