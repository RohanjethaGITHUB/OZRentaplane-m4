-- ============================================================
-- 033_account_status.sql (hardened)
--
-- Adds profiles.account_status with values:
--   active   → normal customer account (default)
--   blocked  → customer cannot book any flights
--   archived → inactive/old customer, hidden from normal lists
--
-- Also hardens pilot_clearance_status constraint to match the
-- current full allowed set (no DB values renamed — UI labels
-- handle the mapping in the application layer):
--   checkout_confirmed  → UI label: "Checkout Scheduled"
--   reschedule_required → UI label: "Checkout Reschedule Required"
--
-- checkout_payment_required IS kept in the constraint because
-- admin-booking.ts sets profiles.pilot_clearance_status =
-- 'checkout_payment_required' when a checkout outcome is approved
-- but an invoice is outstanding (migration 029 introduced this).
--
-- handle_new_user() is updated to include account_status and
-- pilot_clearance_status, preserving all existing logic:
--   • COALESCE(full_name, name) for OAuth providers (011)
--   • email captured at signup with ON CONFLICT DO UPDATE (008)
--
-- All steps are safe to run against a live database:
--   • ADD COLUMN IF NOT EXISTS — no-ops if column exists
--   • Backfill before NOT NULL constraint is applied
--   • Constraint drop/recreate is idempotent
--   • Data mapping is conservative — unknown/NULL values
--     become 'checkout_required' (the safe initial state)
-- ============================================================


-- ── 1. Add account_status column (nullable first for safety) ─────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status text;

-- Set the default so new inserts get 'active' automatically
ALTER TABLE public.profiles
  ALTER COLUMN account_status SET DEFAULT 'active';

-- ── 2. Backfill: set any NULL or invalid values to 'active' ─────────────────
-- Runs before NOT NULL is applied, so no constraint violation can occur.

UPDATE public.profiles
SET account_status = 'active'
WHERE account_status IS NULL
   OR account_status NOT IN ('active', 'blocked', 'archived');

-- ── 3. Now enforce NOT NULL ───────────────────────────────────────────────────
-- Safe because every row is guaranteed to have a valid value after step 2.

ALTER TABLE public.profiles
  ALTER COLUMN account_status SET NOT NULL;

-- ── 4. Add (or replace) the CHECK constraint ──────────────────────────────────

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_account_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_account_status_check
  CHECK (account_status IN ('active', 'blocked', 'archived'));

COMMENT ON COLUMN public.profiles.account_status IS
  'Controls whether the customer can make any bookings.
   active   = normal account
   blocked  = no bookings allowed; admin must unblock
   archived = inactive/soft-deleted, hidden from normal queues';


-- ── 5. Ensure pilot_clearance_status has the correct column default ────────────
-- Idempotent: safe to run whether the column already has this default or not.

ALTER TABLE public.profiles
  ALTER COLUMN pilot_clearance_status SET DEFAULT 'checkout_required';

-- ── 6. Map legacy pilot_clearance_status values before recreating the constraint ──
-- The existing constraint (from 022 + 029) already covers all current DB values,
-- so this UPDATE only fires for rows that somehow have a value outside the allowed
-- set (e.g. a stale value from an older migration or manual edit).
-- Mappings:
--   NULL                 → checkout_required   (safe initial state)
--   not_started          → checkout_required   (legacy pre-checkout value)
--   pending_verification → checkout_requested  (was in-review, nearest equivalent)
--   verified             → cleared_for_solo_hire
--   rejected             → not_currently_eligible
--   <any other invalid>  → checkout_required   (safe fallback — ELSE is intentional)
-- Current live values (checkout_confirmed, reschedule_required, etc.) are never
-- matched by the WHERE clause and therefore never touched.

UPDATE public.profiles
SET pilot_clearance_status = CASE
    WHEN pilot_clearance_status IS NULL                  THEN 'checkout_required'
    WHEN pilot_clearance_status = 'not_started'          THEN 'checkout_required'
    WHEN pilot_clearance_status = 'pending_verification' THEN 'checkout_requested'
    WHEN pilot_clearance_status = 'verified'             THEN 'cleared_for_solo_hire'
    WHEN pilot_clearance_status = 'rejected'             THEN 'not_currently_eligible'
    ELSE 'checkout_required'  -- catch-all: any other unrecognised value → safe default
  END
WHERE pilot_clearance_status IS NULL
   OR pilot_clearance_status NOT IN (
    'checkout_required',
    'checkout_requested',
    'checkout_confirmed',
    'checkout_completed_under_review',
    'checkout_payment_required',
    'cleared_for_solo_hire',
    'additional_supervised_time_required',
    'reschedule_required',
    'not_currently_eligible'
  );

-- ── 7. Recreate the pilot_clearance_status constraint ────────────────────────
-- Full allowed set matches 022 + 029. checkout_payment_required is retained
-- because admin-booking.ts writes it directly to profiles.pilot_clearance_status
-- when a checkout is approved with an outstanding Stripe invoice.
-- UI labels for ambiguous values are handled in lib/pilot-status.ts:
--   checkout_confirmed  → "Checkout Scheduled"
--   reschedule_required → "Checkout Reschedule Required"

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_pilot_clearance_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pilot_clearance_status_check
  CHECK (pilot_clearance_status IN (
    'checkout_required',
    'checkout_requested',
    'checkout_confirmed',                  -- UI: "Checkout Scheduled"
    'checkout_completed_under_review',
    'checkout_payment_required',           -- set by admin-booking when invoice pending
    'cleared_for_solo_hire',
    'additional_supervised_time_required',
    'reschedule_required',                 -- UI: "Checkout Reschedule Required"
    'not_currently_eligible'
  ));


-- ── 8. Update handle_new_user() ───────────────────────────────────────────────
-- Preserves ALL logic from the current authoritative version (migration 011):
--   • COALESCE(full_name, name) for OAuth providers
--   • email captured from auth.users at signup
--   • ON CONFLICT (id) DO UPDATE SET email — handles re-auth edge cases
-- Adds:
--   • account_status    = 'active'          (new field)
--   • pilot_clearance_status = 'checkout_required'  (was already the column default,
--     now made explicit in the insert for clarity and forward-safety)

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    role,
    verification_status,
    pilot_clearance_status,
    account_status
  )
  VALUES (
    NEW.id,
    -- Prefer 'full_name' (email/password signup); fall back to 'name' (OAuth providers)
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data ->> 'name'),      '')
    ),
    NEW.email,
    'customer',
    'not_started',        -- legacy field; kept for verification_events history
    'checkout_required',  -- new pilot clearance lifecycle start
    'active'              -- new account status
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email;  -- keep email in sync on re-auth (from 008)
  RETURN NEW;
END;
$$;
