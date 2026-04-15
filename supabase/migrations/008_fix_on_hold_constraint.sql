-- ============================================================
-- 008_fix_on_hold_constraint.sql
-- ============================================================
-- Run this in the Supabase dashboard → SQL Editor.
--
-- This is the authoritative fix for the "Failed to place
-- customer on hold" bug.
--
-- ROOT CAUSE:
--   The profiles_verification_status_check constraint was
--   created in 001_profiles.sql with only 4 valid values:
--     not_started | pending_review | verified | rejected
--   Any UPDATE setting verification_status = 'on_hold' was
--   rejected by Postgres at the constraint level, causing the
--   server action to throw before any event was written.
--
-- WHAT THIS MIGRATION DOES:
--   1. Replaces the constraint to include 'on_hold'
--   2. Ensures the email column exists on profiles
--   3. Ensures the verification_events table exists with RLS
--
-- All statements are idempotent — safe to re-run even if
-- 006 or 007 was previously applied.
-- ============================================================


-- ── 1. Fix the check constraint ───────────────────────────────

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


-- ── 2. Ensure email column exists ─────────────────────────────

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

UPDATE public.profiles p
SET    email = u.email
FROM   auth.users u
WHERE  p.id = u.id
  AND  p.email IS NULL;

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
    NEW.raw_user_meta_data ->>'full_name',
    NEW.email,
    'customer',
    'not_started'
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;


-- ── 3. Ensure verification_events table exists ────────────────

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


-- ── 4. RLS for verification_events (idempotent) ───────────────

ALTER TABLE public.verification_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies WHERE schemaname='public'
    AND tablename='verification_events'
    AND policyname='Customers can read own verification events'
  ) THEN
    CREATE POLICY "Customers can read own verification events"
      ON public.verification_events FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies WHERE schemaname='public'
    AND tablename='verification_events'
    AND policyname='Admins can read all verification events'
  ) THEN
    CREATE POLICY "Admins can read all verification events"
      ON public.verification_events FOR SELECT TO authenticated
      USING (public.get_own_role() = 'admin');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies WHERE schemaname='public'
    AND tablename='verification_events'
    AND policyname='Admins can insert verification events'
  ) THEN
    CREATE POLICY "Admins can insert verification events"
      ON public.verification_events FOR INSERT TO authenticated
      WITH CHECK (public.get_own_role() = 'admin');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies WHERE schemaname='public'
    AND tablename='verification_events'
    AND policyname='Customers can insert own verification events'
  ) THEN
    CREATE POLICY "Customers can insert own verification events"
      ON public.verification_events FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id AND actor_role = 'customer');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies WHERE schemaname='public'
    AND tablename='verification_events'
    AND policyname='Customers can update own event read state'
  ) THEN
    CREATE POLICY "Customers can update own event read state"
      ON public.verification_events FOR UPDATE TO authenticated
      USING   (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies WHERE schemaname='public'
    AND tablename='verification_events'
    AND policyname='Admins can update verification events'
  ) THEN
    CREATE POLICY "Admins can update verification events"
      ON public.verification_events FOR UPDATE TO authenticated
      USING (public.get_own_role() = 'admin');
  END IF;
END $$;
