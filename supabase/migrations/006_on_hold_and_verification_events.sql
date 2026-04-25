-- ============================================================
-- 006_on_hold_and_verification_events.sql
-- ============================================================
-- Changes:
--   1. Add email column to profiles (for sending notification emails)
--   2. Update handle_new_user trigger to capture email at signup
--   3. Extend verification_status check constraint to include on_hold
--   4. Create public.verification_events table (customer-visible events)
--   5. Add indexes + full RLS for verification_events
-- ============================================================


-- ── 1. Add email to profiles ─────────────────────────────────
-- Email is used by admin server actions to send notification emails
-- without needing the Supabase service-role admin API.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Backfill existing rows from auth.users (migration runs as postgres superuser)
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND p.email IS NULL;

-- Update the auto-create trigger to also persist email going forward.
-- Uses CREATE OR REPLACE to update the function that 001_profiles.sql created.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, verification_status)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    'customer',
    'not_started'
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;


-- ── 2. Extend verification_status to include on_hold ─────────
-- Drop the old constraint and replace it with one that includes on_hold.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_verification_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_verification_status_check
    CHECK (verification_status IN (
      'not_started',
      'pending_review',
      'verified',
      'rejected',
      'on_hold'
    ));


-- ── 3. Create verification_events table ──────────────────────
-- Stores durable, customer-visible records of every verification
-- status change and admin communication.
--
-- Design notes:
--   • title + body are customer-facing (never store internal admin notes here)
--   • actor_role distinguishes who triggered the event
--   • from_status / to_status enable full transition history
--   • is_read supports unread badges in the customer dashboard
--   • email_status tracks delivery without blocking the main workflow

CREATE TABLE IF NOT EXISTS public.verification_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_user_id uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role    text        NOT NULL DEFAULT 'system',
  event_type    text        NOT NULL,
  from_status   text,
  to_status     text,
  title         text        NOT NULL,
  body          text,
  is_read       boolean     NOT NULL DEFAULT false,
  email_status  text        NOT NULL DEFAULT 'pending',
  email_sent_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT verification_events_actor_role_check
    CHECK (actor_role IN ('admin', 'system', 'customer')),

  CONSTRAINT verification_events_event_type_check
    CHECK (event_type IN ('submitted', 'approved', 'rejected', 'on_hold', 'resubmitted', 'message')),

  CONSTRAINT verification_events_email_status_check
    CHECK (email_status IN ('pending', 'sent', 'failed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_verification_events_user_id
  ON public.verification_events(user_id);

CREATE INDEX IF NOT EXISTS idx_verification_events_created_at
  ON public.verification_events(created_at DESC);


-- ── 4. RLS for verification_events ───────────────────────────

ALTER TABLE public.verification_events ENABLE ROW LEVEL SECURITY;

-- Customers read only their own events
CREATE POLICY "Customers can read own verification events"
  ON public.verification_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admins read all events
CREATE POLICY "Admins can read all verification events"
  ON public.verification_events FOR SELECT TO authenticated
  USING (public.get_own_role() = 'admin');

-- Admins insert events for any user (user_id can be any customer)
CREATE POLICY "Admins can insert verification events"
  ON public.verification_events FOR INSERT TO authenticated
  WITH CHECK (public.get_own_role() = 'admin');

-- Customers insert their own events (resubmit, etc.)
CREATE POLICY "Customers can insert own verification events"
  ON public.verification_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND actor_role = 'customer');

-- Customers mark their own events as read
CREATE POLICY "Customers can update own event read state"
  ON public.verification_events FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins update events (e.g. email_status after send attempt)
CREATE POLICY "Admins can update verification events"
  ON public.verification_events FOR UPDATE TO authenticated
  USING (public.get_own_role() = 'admin');
