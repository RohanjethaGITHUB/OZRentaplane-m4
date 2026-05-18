BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_lock_reason text,
  ADD COLUMN IF NOT EXISTS account_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_locked_by_admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS account_unlocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_unlocked_by_admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_account_lock_reason_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_account_lock_reason_check
  CHECK (
    account_lock_reason IS NULL
    OR account_lock_reason IN ('checkout_no_show')
  );

COMMIT;
