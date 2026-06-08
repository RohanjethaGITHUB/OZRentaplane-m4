-- ============================================================================
-- 087_proxy_checkout_updates_clearance.sql
--
-- Ensures proxy-created checkout bookings also update the customer's
-- pilot_clearance_status to reflect that a checkout is now scheduled.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_proxy_booking_atomic(
  p_aircraft_id        uuid,
  p_customer_id        uuid,
  p_admin_id           uuid,
  p_pic_name           text,
  p_pic_arn            text,
  p_scheduled_start    timestamptz,
  p_scheduled_end      timestamptz,
  p_estimated_hours    numeric,
  p_estimated_amount   numeric,
  p_admin_notes        text DEFAULT NULL,
  p_customer_notes     text DEFAULT NULL,
  p_booking_type       text DEFAULT 'standard'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conflict_count integer;
  v_booking_id     uuid;
  v_status         text;
BEGIN
  v_status := CASE
    WHEN p_booking_type = 'checkout' THEN 'checkout_confirmed'
    ELSE 'confirmed'
  END;

  SELECT COUNT(*) INTO v_conflict_count
  FROM public.bookings
  WHERE aircraft_id = p_aircraft_id
    AND status IN ('confirmed', 'provisional', 'checkout_confirmed')
    AND tstzrange(scheduled_start, scheduled_end, '[)')
        && tstzrange(p_scheduled_start, p_scheduled_end, '[)');

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'aircraft_unavailable'
      USING HINT = 'The selected aircraft has a conflicting booking in this time window.';
  END IF;

  INSERT INTO public.bookings (
    aircraft_id,
    booking_owner_user_id,
    pic_user_id,
    pic_name,
    pic_arn,
    scheduled_start,
    scheduled_end,
    booking_type,
    status,
    payment_status,
    estimated_hours,
    estimated_amount,
    customer_notes,
    admin_notes,
    proxy_created_by
  ) VALUES (
    p_aircraft_id,
    p_customer_id,
    p_customer_id,
    p_pic_name,
    p_pic_arn,
    p_scheduled_start,
    p_scheduled_end,
    p_booking_type,
    v_status,
    'not_started',
    p_estimated_hours,
    p_estimated_amount,
    p_customer_notes,
    p_admin_notes,
    p_admin_id
  )
  RETURNING id INTO v_booking_id;

  IF p_booking_type = 'checkout' THEN
    UPDATE public.profiles
    SET pilot_clearance_status = 'checkout_confirmed',
        updated_at = now()
    WHERE id = p_customer_id;
  END IF;

  INSERT INTO public.verification_events (
    user_id,
    actor_user_id,
    actor_role,
    event_type,
    title,
    body
  ) VALUES (
    p_customer_id,
    p_admin_id,
    'admin',
    'admin_proxy_booking_created',
    'Proxy booking created',
    initcap(p_booking_type) || ' booking ' || v_booking_id::text ||
    ' was created by an admin on behalf of the customer.'
  );

  RETURN v_booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_proxy_booking_atomic(
  uuid, uuid, uuid, text, text,
  timestamptz, timestamptz, numeric, numeric,
  text, text, text
) TO authenticated;

COMMIT;
