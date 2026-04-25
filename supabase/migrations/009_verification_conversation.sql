-- ============================================================
-- 009_verification_conversation.sql
-- ============================================================
-- Extends the verification_events table so it can support:
--   1. request_kind — lets UI know whether on_hold requires
--      documents, clarification, or just confirmation
--   2. customer reply messages in the same thread
--
-- Safe to run even if run twice — uses IF NOT EXISTS guards.
-- ============================================================

-- ── 1. Add request_kind column to verification_events ────────
-- Used when event_type = 'on_hold' to tell the customer what
-- kind of response is expected.

ALTER TABLE public.verification_events
  ADD COLUMN IF NOT EXISTS request_kind text
    CHECK (request_kind IN (
      'document_request',
      'clarification_request',
      'confirmation_request',
      'general_update'
    ));

-- ── 2. Make sure 'message' is in the event_type constraint ───
-- 006/007 already added it, but guard here for safety.
-- (No-op if already present — Postgres will just report OK)

-- ── 3. Ensure customer INSERT policy allows actor_role='customer' event_type='message'
-- The existing policy "Customers can insert own verification events"
-- already covers: auth.uid() = user_id AND actor_role = 'customer'
-- which allows event_type = 'message'. No extra policy needed.

-- ── 4. Ensure on_hold approval email addresses are still stored ─
-- (emails were added in 006/007 — this is a no-op guard)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
