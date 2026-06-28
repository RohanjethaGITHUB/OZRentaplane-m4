BEGIN;

ALTER TABLE public.pilot_block_time_purchases
  ADD COLUMN IF NOT EXISTS expiry_reminder_sent_at timestamptz;

COMMENT ON COLUMN public.pilot_block_time_purchases.expiry_reminder_sent_at IS
  'Set when the 7-day expiry reminder email is sent. NULL means not yet sent.
   Prevents duplicate reminder sends.';

COMMIT;
