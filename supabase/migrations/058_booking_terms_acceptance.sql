-- Enforce booking terms acceptance capture in the same atomic booking flow.

CREATE OR REPLACE FUNCTION public.create_aircraft_booking_atomic(
  p_aircraft_id                   uuid,
  p_pic_user_id                   uuid,
  p_pic_name                      text,
  p_pic_arn                       text,
  p_scheduled_start               timestamptz,
  p_scheduled_end                 timestamptz,
  p_customer_notes                text,
  p_terms_accepted                boolean,
  p_terms_acceptance_text         text,
  p_terms_acceptance_confirmed    boolean,
  p_accepted_ip                   text,
  p_user_agent                    text,
  p_risk_acknowledgement_accepted boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id                uuid;
  v_pilot_clearance_status text;
  v_aircraft               record;
  v_conflict_count         integer;
  v_expanded_start         timestamptz;
  v_expanded_end           timestamptz;
  v_booking_id             uuid;
  v_booking_reference      text;
  v_estimated_hours        numeric;
  v_estimated_amount       numeric;
  v_now                    timestamptz;
  v_terms_document_id      uuid;
  v_terms_version          text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  SELECT pilot_clearance_status INTO v_pilot_clearance_status
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_pilot_clearance_status IS DISTINCT FROM 'cleared_to_fly' THEN
    RAISE EXCEPTION 'CLEARANCE_REQUIRED: Solo hire bookings are only available to pilots cleared for solo flight.';
  END IF;

  IF p_scheduled_end <= p_scheduled_start THEN
    RAISE EXCEPTION 'VALIDATION: End time must be after start time.';
  END IF;
  IF p_scheduled_start <= now() THEN
    RAISE EXCEPTION 'VALIDATION: Booking start time must be in the future.';
  END IF;
  IF COALESCE(p_terms_accepted, false) IS NOT TRUE OR COALESCE(p_terms_acceptance_confirmed, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'VALIDATION: Terms acceptance is required.';
  END IF;

  SELECT
    id,
    status,
    default_hourly_rate,
    default_preflight_buffer_minutes,
    default_postflight_buffer_minutes
  INTO v_aircraft
  FROM public.aircraft
  WHERE id = p_aircraft_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aircraft not found.';
  END IF;
  IF v_aircraft.status = 'inactive' THEN
    RAISE EXCEPTION 'AVAILABILITY: This aircraft is not currently available for bookings.';
  END IF;
  IF v_aircraft.status = 'grounded' THEN
    RAISE EXCEPTION 'AVAILABILITY: This aircraft is currently grounded and cannot be booked.';
  END IF;

  SELECT id, version
  INTO v_terms_document_id, v_terms_version
  FROM public.terms_documents
  WHERE is_active = true
  ORDER BY effective_from DESC NULLS LAST, created_at DESC NULLS LAST
  LIMIT 1;

  IF v_terms_document_id IS NULL OR v_terms_version IS NULL THEN
    RAISE EXCEPTION 'VALIDATION: No active terms document is available.';
  END IF;

  v_expanded_start :=
    p_scheduled_start - (v_aircraft.default_preflight_buffer_minutes * interval '1 minute');
  v_expanded_end :=
    p_scheduled_end + (v_aircraft.default_postflight_buffer_minutes * interval '1 minute');

  SELECT COUNT(*) INTO v_conflict_count
  FROM public.schedule_blocks
  WHERE aircraft_id = p_aircraft_id
    AND status      = 'active'
    AND start_time  < v_expanded_end
    AND end_time    > v_expanded_start
    AND NOT (
      block_type = 'temporary_hold'
      AND expires_at IS NOT NULL
      AND expires_at <= now()
    );

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION
      'AVAILABILITY: The aircraft is not available for the requested time. % conflict(s) found.',
      v_conflict_count;
  END IF;

  v_estimated_hours :=
    EXTRACT(EPOCH FROM (p_scheduled_end - p_scheduled_start)) / 3600.0;
  v_estimated_amount :=
    ROUND(v_estimated_hours * v_aircraft.default_hourly_rate, 2);
  v_now := now();

  INSERT INTO public.bookings (
    aircraft_id,
    booking_owner_user_id,
    pic_user_id,
    pic_name,
    pic_arn,
    scheduled_start,
    scheduled_end,
    status,
    payment_status,
    estimated_hours,
    estimated_amount,
    customer_notes,
    terms_accepted_at,
    risk_acknowledgement_accepted_at
  ) VALUES (
    p_aircraft_id,
    v_user_id,
    COALESCE(p_pic_user_id, v_user_id),
    p_pic_name,
    p_pic_arn,
    p_scheduled_start,
    p_scheduled_end,
    'confirmed',
    'not_started',
    v_estimated_hours,
    v_estimated_amount,
    p_customer_notes,
    CASE WHEN p_terms_accepted THEN v_now ELSE NULL END,
    CASE WHEN p_risk_acknowledgement_accepted THEN v_now ELSE NULL END
  )
  RETURNING id, booking_reference INTO v_booking_id, v_booking_reference;

  INSERT INTO public.booking_terms_acceptances (
    booking_id,
    user_id,
    terms_document_id,
    terms_version,
    acceptance_text,
    accepted_ip,
    user_agent
  ) VALUES (
    v_booking_id,
    v_user_id,
    v_terms_document_id,
    v_terms_version,
    p_terms_acceptance_text,
    NULLIF(p_accepted_ip, ''),
    NULLIF(p_user_agent, '')
  );

  INSERT INTO public.schedule_blocks (
    aircraft_id, related_booking_id, block_type, start_time, end_time,
    created_by_user_id, created_by_role, is_public_visible, status
  ) VALUES (
    p_aircraft_id, v_booking_id, 'customer_booking', p_scheduled_start, p_scheduled_end,
    v_user_id, 'customer', false, 'active'
  );

  IF v_aircraft.default_preflight_buffer_minutes > 0 THEN
    INSERT INTO public.schedule_blocks (
      aircraft_id, related_booking_id, block_type, start_time, end_time,
      created_by_user_id, created_by_role, is_public_visible, status
    ) VALUES (
      p_aircraft_id, v_booking_id, 'buffer', v_expanded_start, p_scheduled_start,
      v_user_id, 'customer', false, 'active'
    );
  END IF;

  IF v_aircraft.default_postflight_buffer_minutes > 0 THEN
    INSERT INTO public.schedule_blocks (
      aircraft_id, related_booking_id, block_type, start_time, end_time,
      created_by_user_id, created_by_role, is_public_visible, status
    ) VALUES (
      p_aircraft_id, v_booking_id, 'buffer', p_scheduled_end, v_expanded_end,
      v_user_id, 'customer', false, 'active'
    );
  END IF;

  INSERT INTO public.booking_status_history (
    booking_id, old_status, new_status, changed_by_user_id, note
  ) VALUES (
    v_booking_id, NULL, 'confirmed', v_user_id, 'Booking auto-confirmed for cleared pilot.'
  );

  INSERT INTO public.booking_audit_events (
    booking_id, aircraft_id, actor_user_id, actor_role, event_type, event_summary, new_value
  ) VALUES (
    v_booking_id,
    p_aircraft_id,
    v_user_id,
    'customer',
    'booking_created',
    'Customer created booking (auto-confirmed): ' || p_scheduled_start || ' – ' || p_scheduled_end,
    jsonb_build_object(
      'booking_reference', v_booking_reference,
      'status', 'confirmed',
      'estimated_hours', v_estimated_hours,
      'estimated_amount', v_estimated_amount,
      'terms_document_id', v_terms_document_id,
      'terms_version', v_terms_version,
      'blocks_created', true
    )
  );

  RETURN jsonb_build_object(
    'booking_id',        v_booking_id,
    'booking_reference', v_booking_reference,
    'status',            'confirmed',
    'estimated_hours',   v_estimated_hours,
    'estimated_amount',  v_estimated_amount
  );
END;
$$;

REVOKE EXECUTE
  ON FUNCTION public.create_aircraft_booking_atomic(uuid, uuid, text, text, timestamptz, timestamptz, text, boolean, text, boolean, text, text, boolean)
  FROM PUBLIC;

GRANT EXECUTE
  ON FUNCTION public.create_aircraft_booking_atomic(uuid, uuid, text, text, timestamptz, timestamptz, text, boolean, text, boolean, text, text, boolean)
  TO authenticated;
