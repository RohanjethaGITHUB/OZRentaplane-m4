-- ─────────────────────────────────────────────────────────────────────────────
-- 055_fix_checkout_schedule_blocks_related_booking_id.sql
--
-- Fixes three invalid column references in the schedule_blocks INSERTs inside
-- create_checkout_booking_atomic (introduced in migration 052):
--
--   booking_id          → related_booking_id   (correct FK column)
--   booking_owner_user_id → created_by_user_id (correct creator column)
--   label               → public_label          (correct label column)
--   block_type 'checkout' → 'customer_booking'  ('checkout' fails the CHECK constraint)
--
-- No business logic is changed.  The 2-hour window, zero-buffer behaviour,
-- aircraft status gate, table aliases, and overlap check are all preserved.
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
    RAISE EXCEPTION 'You already have an active checkout booking';
  END IF;

  -- ── Fixed 2-hour end time ─────────────────────────────────────────────────
  v_scheduled_end := p_scheduled_start + interval '2 hours';

  -- ── Validate time window ──────────────────────────────────────────────────
  IF p_scheduled_start <= now() THEN
    RAISE EXCEPTION 'Checkout start time must be in the future';
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
    RAISE EXCEPTION 'Aircraft not found';
  END IF;

  IF v_aircraft.status NOT IN ('active') THEN
    RAISE EXCEPTION 'Aircraft is not available for booking';
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
    RAISE EXCEPTION 'That 2-hour checkout window is no longer available. Please select another time.';
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
  -- FIX: use related_booking_id (not booking_id), created_by_user_id (not
  -- booking_owner_user_id), public_label (not label), and block_type
  -- 'customer_booking' (not 'checkout' which is not in the CHECK constraint).
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
