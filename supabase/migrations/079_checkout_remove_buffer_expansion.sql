-- 079_checkout_remove_buffer_expansion.sql
-- Checkout bookings reserve an exact 2-hour window with no hidden aircraft
-- pre/post buffer expansion.

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
  v_customer_id         uuid;
  v_scheduled_end       timestamptz;
  v_booking_id          uuid;
  v_booking_reference   text;
  v_aircraft            RECORD;
  v_default_hourly_rate numeric;
  v_estimated_hours     numeric;
  v_estimated_amount    numeric;
  v_clearance_status    text;
  v_existing_checkout   uuid;
BEGIN
  v_customer_id := auth.uid();
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'AUTH: Not authenticated';
  END IF;

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

  SELECT b.id INTO v_existing_checkout
  FROM public.bookings b
  WHERE b.booking_owner_user_id = v_customer_id
    AND b.booking_type = 'checkout'
    AND b.status IN ('checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review');

  IF FOUND THEN
    RAISE EXCEPTION 'VALIDATION: You already have an active checkout booking.';
  END IF;

  v_scheduled_end := p_scheduled_start + interval '2 hours';

  IF p_scheduled_start <= now() THEN
    RAISE EXCEPTION 'VALIDATION: Checkout start time must be in the future.';
  END IF;

  SELECT
    a.id,
    a.status,
    a.default_hourly_rate
  INTO v_aircraft
  FROM public.aircraft a
  WHERE a.id = p_aircraft_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VALIDATION: Aircraft not found.';
  END IF;

  IF v_aircraft.status = 'inactive' THEN
    RAISE EXCEPTION 'VALIDATION: Aircraft % has status %, not bookable', p_aircraft_id, v_aircraft.status;
  END IF;

  v_default_hourly_rate := v_aircraft.default_hourly_rate;

  -- Exact 2-hour overlap check only (no hidden pre/post buffer expansion).
  IF EXISTS (
    SELECT 1 FROM public.schedule_blocks sb
    WHERE sb.aircraft_id = p_aircraft_id
      AND sb.start_time < v_scheduled_end
      AND sb.end_time   > p_scheduled_start
      AND NOT (
        sb.block_type = 'temporary_hold'
        AND sb.expires_at IS NOT NULL
        AND sb.expires_at <= now()
      )
  ) THEN
    RAISE EXCEPTION 'AVAILABILITY: That 2-hour checkout window is no longer available. Please select another time.';
  END IF;

  v_booking_reference := 'CKO-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' ||
    upper(substring(gen_random_uuid()::text, 1, 6));

  v_estimated_hours  := 2.0;
  v_estimated_amount := v_estimated_hours * v_default_hourly_rate;

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

  INSERT INTO public.schedule_blocks (
    aircraft_id, related_booking_id, block_type,
    start_time, end_time,
    created_by_user_id, created_by_role, public_label
  ) VALUES (
    p_aircraft_id, v_booking_id, 'customer_booking',
    p_scheduled_start, v_scheduled_end,
    v_customer_id, 'customer', 'Checkout flight'
  );

  UPDATE public.profiles
  SET pilot_clearance_status = 'checkout_requested',
      updated_at             = now()
  WHERE id = v_customer_id;

  INSERT INTO public.booking_status_history (
    booking_id, old_status, new_status, changed_by_user_id, note
  ) VALUES (
    v_booking_id, NULL, 'checkout_requested', v_customer_id,
    'Customer submitted 2-hour checkout booking request.'
  );

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
