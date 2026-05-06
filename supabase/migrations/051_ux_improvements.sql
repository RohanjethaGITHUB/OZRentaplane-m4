-- ─────────────────────────────────────────────────────────────────────────────
-- 051_ux_improvements.sql
--
-- 1. Multi-file document upload support
--    Drop the unique constraint (user_id, document_type) on user_documents
--    so multiple files can be stored per document type.
--    The application selects the latest non-rejected, non-expired row for
--    validation — allowing older rows to be kept for audit/history.
--
-- 2. Remove 30-minute pre/post-flight booking buffers
--    Set default_preflight_buffer_minutes and default_postflight_buffer_minutes
--    to 0 on all aircraft so back-to-back bookings are permitted.
--    The atomic RPCs read these values at booking creation time.
--
-- 3. Checkout booking window: 1 hour → 2 hours
--    Replace create_checkout_booking_atomic so the end time is computed as
--    start + 2 hours instead of start + 1 hour.
--    Billing still comes from admin-entered VDO reading, not this window.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. MULTI-FILE DOCUMENT UPLOAD
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop the unique constraint so multiple rows per (user_id, document_type) work.
-- Existing data is unaffected.
ALTER TABLE public.user_documents
  DROP CONSTRAINT IF EXISTS user_documents_unique_type;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. REMOVE 30-MINUTE BUFFERS
-- ═══════════════════════════════════════════════════════════════════════════

-- Set all aircraft buffers to 0 so no artificial gap is created.
-- The atomic RPCs for both standard and checkout bookings read these columns.
UPDATE public.aircraft
SET
  default_preflight_buffer_minutes  = 0,
  default_postflight_buffer_minutes = 0;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. CHECKOUT BOOKING: 2-HOUR WINDOW
-- ═══════════════════════════════════════════════════════════════════════════

-- Replace create_checkout_booking_atomic with a 2-hour version.
-- Only the duration line changes — all other logic is identical.

DROP FUNCTION IF EXISTS public.create_checkout_booking_atomic(uuid, timestamptz, text);

CREATE OR REPLACE FUNCTION public.create_checkout_booking_atomic(
  p_aircraft_id     uuid,
  p_scheduled_start timestamptz,
  p_customer_notes  text DEFAULT NULL
)
RETURNS TABLE (
  booking_id        uuid,
  booking_reference text,
  scheduled_start   timestamptz,
  scheduled_end     timestamptz,
  status            text,
  estimated_hours   numeric,
  estimated_amount  numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id           uuid;
  v_scheduled_end         timestamptz;
  v_booking_id            uuid;
  v_booking_reference     text;
  v_aircraft              RECORD;
  v_expanded_start        timestamptz;
  v_expanded_end          timestamptz;
  v_default_hourly_rate   numeric;
  v_estimated_hours       numeric;
  v_estimated_amount      numeric;
  v_clearance_status      text;
  v_existing_checkout     uuid;
BEGIN
  -- ── Auth check ────────────────────────────────────────────────────────────
  v_customer_id := auth.uid();
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- ── Clearance status gate ─────────────────────────────────────────────────
  SELECT pilot_clearance_status INTO v_clearance_status
  FROM public.profiles WHERE id = v_customer_id;

  -- Valid statuses that allow a new checkout booking request (from migration 039):
  --   checkout_required              → first-time checkout needed
  --   additional_checkout_required   → needs another checkout after an unsatisfactory result
  --   checkout_reschedule_required   → needs to reschedule a missed/failed checkout
  -- All other states (checkout_requested, checkout_confirmed, checkout_payment_required,
  -- cleared_to_fly, not_currently_eligible) are explicitly blocked.
  IF v_clearance_status NOT IN (
    'checkout_required',
    'additional_checkout_required',
    'checkout_reschedule_required'
  ) THEN
    RAISE EXCEPTION 'VALIDATION: Your current status does not allow submitting a checkout request.';
  END IF;

  -- ── One active checkout at a time ───────────────────────────────────────
  SELECT id INTO v_existing_checkout
  FROM public.bookings
  WHERE booking_owner_user_id = v_customer_id
    AND booking_type = 'checkout'
    AND status IN ('checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review');

  IF FOUND THEN
    RAISE EXCEPTION 'You already have an active checkout booking';
  END IF;

  -- ── Fixed 2-hour end time ────────────────────────────────────────────────
  v_scheduled_end := p_scheduled_start + interval '2 hours';

  -- ── Validate time window ──────────────────────────────────────────────────
  IF p_scheduled_start <= now() THEN
    RAISE EXCEPTION 'Checkout start time must be in the future';
  END IF;

  -- ── Fetch and lock aircraft ───────────────────────────────────────────────
  SELECT
    id, status, default_hourly_rate,
    default_preflight_buffer_minutes,
    default_postflight_buffer_minutes
  INTO v_aircraft
  FROM public.aircraft
  WHERE id = p_aircraft_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aircraft not found';
  END IF;

  IF v_aircraft.status NOT IN ('active') THEN
    RAISE EXCEPTION 'Aircraft is not available for booking';
  END IF;

  v_default_hourly_rate := v_aircraft.default_hourly_rate;

  -- ── Expand window by buffers (now 0 by default) ───────────────────────────
  v_expanded_start := p_scheduled_start
    - (v_aircraft.default_preflight_buffer_minutes  || ' minutes')::interval;
  v_expanded_end   := v_scheduled_end
    + (v_aircraft.default_postflight_buffer_minutes || ' minutes')::interval;

  -- ── Conflict check ────────────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM public.schedule_blocks sb
    WHERE sb.aircraft_id = p_aircraft_id
      AND sb.start_time < v_expanded_end
      AND sb.end_time   > v_expanded_start
  ) THEN
    RAISE EXCEPTION 'Aircraft has a conflicting schedule block for this time';
  END IF;

  -- ── Generate booking reference ────────────────────────────────────────────
  v_booking_reference := 'CKO-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' ||
    upper(substring(gen_random_uuid()::text, 1, 6));

  -- ── Estimated billing ─────────────────────────────────────────────────────
  v_estimated_hours  := 2.0;   -- 2-hour reserved window
  v_estimated_amount := v_estimated_hours * v_default_hourly_rate;

  -- ── Insert booking ────────────────────────────────────────────────────────
  INSERT INTO public.bookings (
    aircraft_id,
    booking_owner_user_id,
    booking_type,
    booking_reference,
    status,
    scheduled_start,
    scheduled_end,
    customer_notes,
    final_amount
  ) VALUES (
    p_aircraft_id,
    v_customer_id,
    'checkout',
    v_booking_reference,
    'checkout_requested',
    p_scheduled_start,
    v_scheduled_end,
    p_customer_notes,
    v_estimated_amount
  )
  RETURNING id INTO v_booking_id;

  -- ── Insert schedule blocks (flight + pre/post buffers if > 0) ─────────────
  INSERT INTO public.schedule_blocks (
    aircraft_id, booking_id, block_type,
    start_time, end_time,
    booking_owner_user_id, label
  ) VALUES
    (p_aircraft_id, v_booking_id, 'checkout',
     p_scheduled_start, v_scheduled_end,
     v_customer_id, 'Checkout flight');

  IF v_aircraft.default_preflight_buffer_minutes > 0 THEN
    INSERT INTO public.schedule_blocks (
      aircraft_id, booking_id, block_type, start_time, end_time,
      booking_owner_user_id, label
    ) VALUES (
      p_aircraft_id, v_booking_id, 'buffer',
      v_expanded_start, p_scheduled_start,
      v_customer_id, 'Pre-flight buffer (checkout)'
    );
  END IF;

  IF v_aircraft.default_postflight_buffer_minutes > 0 THEN
    INSERT INTO public.schedule_blocks (
      aircraft_id, booking_id, block_type, start_time, end_time,
      booking_owner_user_id, label
    ) VALUES (
      p_aircraft_id, v_booking_id, 'buffer',
      v_scheduled_end, v_expanded_end,
      v_customer_id, 'Post-flight buffer (checkout)'
    );
  END IF;

  -- ── Set clearance status ──────────────────────────────────────────────────
  UPDATE public.profiles
  SET pilot_clearance_status = 'checkout_requested',
      updated_at             = now()
  WHERE id = v_customer_id;

  -- ── Booking status history ────────────────────────────────────────────────
  INSERT INTO public.booking_status_history (
    booking_id, old_status, new_status, changed_by_user_id, note
  ) VALUES (
    v_booking_id, NULL, 'checkout_requested', v_customer_id,
    'Customer submitted 2-hour checkout booking request.'
  );

  -- ── Return result ─────────────────────────────────────────────────────────
  RETURN QUERY SELECT
    v_booking_id,
    v_booking_reference,
    p_scheduled_start,
    v_scheduled_end,
    'checkout_requested'::text,
    v_estimated_hours,
    v_estimated_amount;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_checkout_booking_atomic(uuid, timestamptz, text)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. DELETE FUTURE BUFFER SCHEDULE BLOCKS
-- ═══════════════════════════════════════════════════════════════════════════
-- Now that aircraft buffers are set to 0, future buffer blocks are orphaned.
-- This removes only schedule_blocks with block_type = 'buffer' that have not
-- yet started, leaving historical records and actual flight/checkout blocks intact.

DELETE FROM public.schedule_blocks
WHERE block_type = 'buffer'
  AND start_time > now();

-- Reload PostgREST schema cache so the updated RPC is immediately available.
NOTIFY pgrst, 'reload schema';

COMMIT;
