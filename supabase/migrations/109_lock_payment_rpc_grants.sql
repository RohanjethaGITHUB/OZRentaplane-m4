-- 109_lock_payment_rpc_grants.sql
--
-- STAGE 2 of the payment-RPC lockdown (security fix).
--
-- DO NOT APPLY THIS MIGRATION until STAGE 1 is deployed and verified:
--   1. The application code change (app/actions/payment.ts +
--      app/actions/admin-booking.ts route manual settlement through the
--      service-role client) is deployed to the running environment, AND
--   2. Migration 108 (block-time RPC admin guards) is applied, AND
--   3. The Stage 1 manual tests all pass (see task notes).
--
-- Applying this before the code change WILL break the checkout / booking
-- "mark paid" manual-settlement flow, because those flows currently call the
-- settlement RPCs via the authenticated session role.
--
-- Root cause this migration addresses: the project's ALTER DEFAULT PRIVILEGES
-- rule auto-grants EXECUTE to anon + authenticated on every function created by
-- the postgres role in `public`. A plain `REVOKE ... FROM PUBLIC` never removed
-- those grants, so several SECURITY DEFINER financial RPCs were directly
-- callable via PostgREST by anon/authenticated. The correct idiom for this
-- project is to explicitly name all three: PUBLIC, anon, authenticated.
--
-- All function signatures below were verified against the live database via
-- pg_get_function_identity_arguments (they differ from the first-draft audit).

BEGIN;

-- ── service_role-only RPCs (no internal caller validation) ───────────────────

-- mark_checkout_invoice_paid_atomic: Critical. Callable by anon today; marks any
-- checkout invoice paid, completes the booking, and promotes pilot_clearance_status
-- with no validation. Webhook (service_role) and manual-settle (now service_role
-- after Stage 1) are the only legitimate callers.
REVOKE EXECUTE ON FUNCTION public.mark_checkout_invoice_paid_atomic(uuid, text, text, integer, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.mark_checkout_invoice_paid_atomic(uuid, text, text, integer, boolean)
  TO service_role;

-- apply_block_time_topup: adds block-time hours; only caller is the Stripe
-- webhook (service_role). No code change was required for this one.
REVOKE EXECUTE ON FUNCTION public.apply_block_time_topup(uuid, numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_block_time_topup(uuid, numeric, text)
  TO service_role;

-- mark_booking_invoice_paid_atomic is already service_role-only (postgres,
-- service_role) — no change needed. Reasserted here as documentation only;
-- the REVOKE is a no-op if anon/authenticated already lack the grant.
REVOKE EXECUTE ON FUNCTION public.mark_booking_invoice_paid_atomic(uuid, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.mark_booking_invoice_paid_atomic(uuid, text, text, integer)
  TO service_role;

-- ── Block-time admin RPCs (internal admin guard added in migration 108) ──────
-- These retain the `authenticated` grant because they are invoked with the
-- admin's session client and now self-guard on auth.uid(); only anon/PUBLIC are
-- removed.
REVOKE EXECUTE ON FUNCTION public.process_block_time_flight(uuid, uuid, numeric, numeric)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.begin_block_time_refund(uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.finalise_block_time_refund(uuid, text)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revert_block_time_refund(uuid)
  FROM PUBLIC, anon;

-- ── Defense-in-depth: self-guarded admin RPCs (already validate auth.uid() +
--    admin role internally). Revoke anon/PUBLIC, keep authenticated. Low risk.
--    Signatures corrected against live pg_proc.
REVOKE EXECUTE ON FUNCTION public.approve_bank_transfer_atomic(uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_standard_bank_transfer_atomic(uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_bank_transfer_atomic(uuid, text)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_standard_bank_transfer_atomic(uuid, text)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_customer_refund_atomic(uuid, integer, text, text, text)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reverse_customer_credit_atomic(uuid, text)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_credit_to_standard_booking_atomic(uuid, integer, numeric, uuid, text, text)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.finalise_standard_booking_invoice_atomic(uuid, uuid, numeric, integer, jsonb, text)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.complete_checkout_outcome_atomic(uuid, uuid, numeric, text, jsonb, text, boolean, text, integer)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_post_flight_review_atomic(uuid, boolean, text, text, text)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_flight_record_atomic(uuid, date, text, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, integer, text, boolean, text, text, jsonb)
  FROM PUBLIC, anon;

COMMIT;
