-- 122_block_time_remaining_check_includes_bonus.sql
--
-- Black Friday bonus hours: a 25 hr package with +1 bonus is activated with
-- hours_remaining = 26 while hours_purchased stays 25 (paid hours; refunds and
-- invoices rely on that). The original check from migration 092
--   hours_remaining <= hours_purchased
-- rejects that row, so the Stripe webhook could not activate any promo package
-- that carries bonus hours (and the admin "grant bonus hours" tool failed too).
--
-- New rule: remaining hours may not exceed paid hours + bonus hours.
-- The webhook now writes bonus_hours in the same UPDATE as hours_remaining.

BEGIN;

ALTER TABLE public.pilot_block_time_purchases
  DROP CONSTRAINT IF EXISTS bt_pilot_block_time_purchases_remaining_check;

ALTER TABLE public.pilot_block_time_purchases
  ADD CONSTRAINT bt_pilot_block_time_purchases_remaining_check
  CHECK (hours_remaining <= hours_purchased + COALESCE(bonus_hours, 0));

COMMIT;
