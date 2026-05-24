-- ─────────────────────────────────────────────────────────────────────────────
-- 074_fix_checkout_atomic_rpc_exception_prefixes.sql
--
-- The four RAISE EXCEPTION messages in create_checkout_booking_atomic that were
-- missing VALIDATION:/AVAILABILITY: prefixes caused the client error handler to
-- show a generic fallback message instead of a user-readable one:
--
--   'You already have an active checkout booking'
--     → VALIDATION: prefix added
--
--   'Checkout start time must be in the future'
--     → VALIDATION: prefix added
--
--   'Aircraft not found'
--     → VALIDATION: prefix added
--
--   'That 2-hour checkout window is no longer available...'
--     → AVAILABILITY: prefix added
--
-- No logic changes — only the exception message strings are updated.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

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
  SELECT p.pilot_clearance_status INTO v_clearance_status
  FROM public.profiles p
  WHERE p.id = v_customer_id;

  IF v_clearance_status NOT IN (
    'checkout_required',
    'additional_checkout_required',
    'checkout_reschedule_required'
  ) THEN
    RAISE EXCEPTION 'VALIDATION: Your current status does not allow submitting a checkout request.';
  END IF;

  -- ── One active checkout at a time ─────────────────────────────────────────
  SELECT b.id INTO v_existing_checkout
  FROM public.bookings b
  WHERE b.booking_owner_user_id = v_customer_id
    AND b.booking_type = 'checkout'
    AND b.status IN ('checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review');

  IF FOUND THEN
    RAISE EXCEPTION 'VALIDATION: You already have an active checkout booking.';
  END IF;

  -- ── Fixed 2-hour end time ─────────────────────────────────────────────────
  v_scheduled_end := p_scheduled_start + interval '2 hours';

  -- ── Validate time window ──────────────────────────────────────────────────
  IF p_scheduled_start <= now() THEN
    RAISE EXCEPTION 'VALIDATION: Checkout start time must be in the future.';
  END IF;

  -- ── Fetch and lock aircraft ───────────────────────────────────────────────
  SELECT
    a.id,
    a.status,
    a.default_hourly_rate,
    a.default_preflight_buffer_minutes,
    a.default_postflight_buffer_minutes
  INTO v_aircraft
  FROM public.aircraft a
  WHERE a.id = p_aircraft_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VALIDATION: Aircraft not found.';
  END IF;

  -- Aircraft table uses 'available' for bookable aircraft.
  -- Block only inactive aircraft, matching the standard booking flow.
  IF v_aircraft.status = 'inactive' THEN
    RAISE EXCEPTION 'VALIDATION: Aircraft % has status %, not bookable', p_aircraft_id, v_aircraft.status;
  END IF;

  v_default_hourly_rate := v_aircraft.default_hourly_rate;

  -- ── Expand window by buffers (0 by default) ───────────────────────────────
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
    RAISE EXCEPTION 'AVAILABILITY: That 2-hour checkout window is no longer available. Please select another time.';
  END IF;

  -- ── Generate booking reference ────────────────────────────────────────────
  v_booking_reference := 'CKO-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' ||
    upper(substring(gen_random_uuid()::text, 1, 6));

  -- ── Estimated billing ─────────────────────────────────────────────────────
  v_estimated_hours  := 2.0;
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

  -- ── Insert schedule blocks ────────────────────────────────────────────────
  INSERT INTO public.schedule_blocks (
    aircraft_id, related_booking_id, block_type,
    start_time, end_time,
    created_by_user_id, created_by_role, public_label
  ) VALUES (
    p_aircraft_id, v_booking_id, 'customer_booking',
    p_scheduled_start, v_scheduled_end,
    v_customer_id, 'customer', 'Checkout flight'
  );

  IF v_aircraft.default_preflight_buffer_minutes > 0 THEN
    INSERT INTO public.schedule_blocks (
      aircraft_id, related_booking_id, block_type,
      start_time, end_time,
      created_by_user_id, created_by_role, public_label
    ) VALUES (
      p_aircraft_id, v_booking_id, 'buffer',
      v_expanded_start, p_scheduled_start,
      v_customer_id, 'customer', 'Pre-flight buffer (checkout)'
    );
  END IF;

  IF v_aircraft.default_postflight_buffer_minutes > 0 THEN
    INSERT INTO public.schedule_blocks (
      aircraft_id, related_booking_id, block_type,
      start_time, end_time,
      created_by_user_id, created_by_role, public_label
    ) VALUES (
      p_aircraft_id, v_booking_id, 'buffer',
      v_scheduled_end, v_expanded_end,
      v_customer_id, 'customer', 'Post-flight buffer (checkout)'
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

NOTIFY pgrst, 'reload schema';

COMMIT;
