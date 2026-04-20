-- ============================================================
-- 014_atomic_booking_hardening.sql
-- ============================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 — Database Constraints and Indexes
-- ═══════════════════════════════════════════════════════════════════════════

-- Ensure only one active flight record per booking to prevent duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS flight_records_single_active_idx
ON public.flight_records (booking_id)
WHERE status IN (
  'draft', 'submitted', 'pending_review', 'needs_clarification',
  'resubmitted', 'approved', 'approved_with_correction', 'locked'
);

-- Ensure idempotency on approvals so Meter entries are not duplicated.
CREATE UNIQUE INDEX IF NOT EXISTS aircraft_meter_history_dup_idx
ON public.aircraft_meter_history (flight_record_id, meter_type)
WHERE flight_record_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — UPDATE create_aircraft_booking_atomic (Customer)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_aircraft_booking_atomic(
  p_aircraft_id                   uuid,
  p_pic_user_id                   uuid,
  p_pic_name                      text,
  p_pic_arn                       text,
  p_scheduled_start               timestamptz,
  p_scheduled_end                 timestamptz,
  p_customer_notes                text,
  p_terms_accepted                boolean,
  p_risk_acknowledgement_accepted boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id          uuid;
  v_aircraft         record;
  v_conflict_count   integer;
  v_expanded_start   timestamptz;
  v_expanded_end     timestamptz;
  v_booking_id       uuid;
  v_estimated_hours  numeric;
  v_estimated_amount numeric;
  v_now              timestamptz;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  IF p_scheduled_end <= p_scheduled_start THEN
    RAISE EXCEPTION 'VALIDATION: End time must be after start time.';
  END IF;
  IF p_scheduled_start <= now() THEN
    RAISE EXCEPTION 'VALIDATION: Booking start time must be in the future.';
  END IF;

  -- ── Transaction-Scoped Advisory Lock ────────────────────────────────────
  PERFORM pg_advisory_xact_lock(('x' || substr(md5(p_aircraft_id::text), 1, 16))::bit(64)::bigint);

  SELECT id, status, default_hourly_rate, default_preflight_buffer_minutes, default_postflight_buffer_minutes
  INTO v_aircraft FROM public.aircraft WHERE id = p_aircraft_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aircraft not found.';
  END IF;
  IF v_aircraft.status = 'inactive' THEN
    RAISE EXCEPTION 'AVAILABILITY: This aircraft is not currently available for bookings.';
  END IF;
  IF v_aircraft.status = 'grounded' THEN
    RAISE EXCEPTION 'AVAILABILITY: This aircraft is currently grounded and cannot be booked.';
  END IF;

  v_expanded_start := p_scheduled_start - (v_aircraft.default_preflight_buffer_minutes  * interval '1 minute');
  v_expanded_end   := p_scheduled_end   + (v_aircraft.default_postflight_buffer_minutes * interval '1 minute');

  SELECT COUNT(*) INTO v_conflict_count FROM public.schedule_blocks
  WHERE aircraft_id = p_aircraft_id AND status = 'active'
    AND start_time < v_expanded_end AND end_time > v_expanded_start
    AND NOT (block_type = 'temporary_hold' AND expires_at IS NOT NULL AND expires_at <= now());

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'AVAILABILITY: The aircraft is not available for the requested time. % conflict(s) found.', v_conflict_count;
  END IF;

  v_estimated_hours  := EXTRACT(EPOCH FROM (p_scheduled_end - p_scheduled_start)) / 3600.0;
  v_estimated_amount := ROUND(v_estimated_hours * v_aircraft.default_hourly_rate, 2);
  v_now := now();

  INSERT INTO public.bookings (
    aircraft_id, booking_owner_user_id, pic_user_id, pic_name, pic_arn,
    scheduled_start, scheduled_end, status, payment_status,
    estimated_hours, estimated_amount, customer_notes,
    terms_accepted_at, risk_acknowledgement_accepted_at
  ) VALUES (
    p_aircraft_id, v_user_id, COALESCE(p_pic_user_id, v_user_id), p_pic_name, p_pic_arn,
    p_scheduled_start, p_scheduled_end, 'pending_confirmation', 'not_started',
    v_estimated_hours, v_estimated_amount, p_customer_notes,
    CASE WHEN p_terms_accepted THEN v_now ELSE NULL END,
    CASE WHEN p_risk_acknowledgement_accepted THEN v_now ELSE NULL END
  ) RETURNING id INTO v_booking_id;

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

  INSERT INTO public.booking_audit_events (
    booking_id, aircraft_id, actor_user_id, actor_role, event_type, event_summary, new_value
  ) VALUES (
    v_booking_id, p_aircraft_id, v_user_id, 'customer', 'booking_created',
    'Customer created booking: ' || p_scheduled_start || ' – ' || p_scheduled_end,
    jsonb_build_object('status', 'pending_confirmation', 'estimated_hours', v_estimated_hours, 'estimated_amount', v_estimated_amount, 'blocks_created', true)
  );

  RETURN jsonb_build_object('booking_id', v_booking_id, 'status', 'pending_confirmation', 'estimated_hours', v_estimated_hours, 'estimated_amount', v_estimated_amount);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_aircraft_booking_atomic(uuid, uuid, text, text, timestamptz, timestamptz, text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_aircraft_booking_atomic(uuid, uuid, text, text, timestamptz, timestamptz, text, boolean, boolean) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3 — CREATE create_admin_schedule_block_atomic (Admin)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_admin_schedule_block_atomic(
  p_aircraft_id                   uuid,
  p_related_booking_id            uuid,
  p_block_type                    text,
  p_start_time                    timestamptz,
  p_end_time                      timestamptz,
  p_public_label                  text,
  p_internal_reason               text,
  p_is_public_visible             boolean,
  p_expires_at                    timestamptz,
  p_exclude_booking_id            uuid,
  p_force_override                boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id         uuid;
  v_role             text;
  v_aircraft_exists  boolean;
  v_conflict_json    jsonb;
  v_block_id         uuid;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  v_role := public.get_own_role();
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin role required';
  END IF;

  IF p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'VALIDATION: End time must be after start time.';
  END IF;

  -- ── Transaction-Scoped Advisory Lock ────────────────────────────────────
  PERFORM pg_advisory_xact_lock(('x' || substr(md5(p_aircraft_id::text), 1, 16))::bit(64)::bigint);

  SELECT EXISTS(SELECT 1 FROM public.aircraft WHERE id = p_aircraft_id) INTO v_aircraft_exists;
  IF NOT v_aircraft_exists THEN
    RAISE EXCEPTION 'Aircraft not found.';
  END IF;

  -- Availability checks exactly match TS checkAircraftAvailability excluding the buffer math.
  SELECT jsonb_agg(jsonb_build_object('id', sb.id, 'start_time', sb.start_time, 'end_time', sb.end_time, 'block_type', sb.block_type))
  INTO v_conflict_json
  FROM public.schedule_blocks sb
  WHERE sb.aircraft_id = p_aircraft_id AND sb.status = 'active'
    AND ('[' || p_start_time || ',' || p_end_time || ')') :: tstzrange && ('[' || sb.start_time || ',' || sb.end_time || ')') :: tstzrange
    AND (p_exclude_booking_id IS NULL OR sb.related_booking_id IS DISTINCT FROM p_exclude_booking_id)
    AND NOT (sb.block_type = 'temporary_hold' AND sb.expires_at IS NOT NULL AND sb.expires_at <= now());

  IF v_conflict_json IS NOT NULL AND jsonb_array_length(v_conflict_json) > 0 THEN
    IF NOT p_force_override THEN
      RETURN jsonb_build_object('created', false, 'conflicts', v_conflict_json);
    END IF;
    IF trim(COALESCE(p_internal_reason, '')) = '' THEN
      RAISE EXCEPTION 'VALIDATION: An internal reason is required when overriding scheduling conflicts.';
    END IF;
  END IF;

  INSERT INTO public.schedule_blocks (
    aircraft_id, related_booking_id, block_type, start_time, end_time,
    public_label, internal_reason, created_by_user_id, created_by_role, 
    is_public_visible, status, expires_at
  ) VALUES (
    p_aircraft_id, p_related_booking_id, p_block_type, p_start_time, p_end_time,
    p_public_label, p_internal_reason, v_admin_id, 'admin',
    p_is_public_visible, 'active', p_expires_at
  ) RETURNING id INTO v_block_id;

  INSERT INTO public.booking_audit_events (
    aircraft_id, related_record_type, related_record_id, actor_user_id, actor_role, event_type, event_summary, new_value
  ) VALUES (
    p_aircraft_id, 'schedule_block', v_block_id, v_admin_id, 'admin', 'admin_block_created',
    'Admin created ''' || p_block_type || ''' block: ' || p_start_time || ' – ' || p_end_time,
    jsonb_build_object('block_type', p_block_type, 'is_public_visible', p_is_public_visible, 'force_override', p_force_override, 'had_conflicts', (v_conflict_json IS NOT NULL), 'internal_reason', p_internal_reason)
  );

  RETURN jsonb_build_object('created', true, 'blockId', v_block_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_admin_schedule_block_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_admin_schedule_block_atomic TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4 — CREATE submit_flight_record_atomic (Customer)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.submit_flight_record_atomic(
  p_booking_id              uuid,
  p_date                    date,
  p_pic_name                text,
  p_pic_arn                 text,
  p_tacho_start             numeric,
  p_tacho_stop              numeric,
  p_vdo_start               numeric,
  p_vdo_stop                numeric,
  p_air_switch_start        numeric,
  p_air_switch_stop         numeric,
  p_add_to_mr               numeric,
  p_oil_added               numeric,
  p_oil_total               numeric,
  p_fuel_added              numeric,
  p_fuel_actual             numeric,
  p_landings                integer,
  p_customer_notes          text,
  p_declaration_accepted    boolean,
  p_signature_type          text,
  p_signature_value         text,
  p_review_flags            jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id      uuid;
  v_booking      record;
  v_active_fr_id uuid;
  v_active_fr_st text;
  v_fr_id        uuid;
  v_now          timestamptz := now();
  v_role         text;
  v_has_error    boolean := false;
  v_flag_count   integer := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;
  
  v_role := public.get_own_role();

  SELECT id, aircraft_id, booking_owner_user_id, status INTO v_booking
  FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or access denied.';
  END IF;

  IF v_booking.booking_owner_user_id <> v_user_id AND v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Cannot submit flight record for another user''s booking.';
  END IF;

  IF v_booking.status NOT IN ('dispatched', 'awaiting_flight_record', 'flight_record_overdue') THEN
    RAISE EXCEPTION 'VALIDATION: Cannot submit flight record for a booking with status "%".', v_booking.status;
  END IF;

  -- ── Duplicate Guard
  SELECT id, status INTO v_active_fr_id, v_active_fr_st FROM public.flight_records 
  WHERE booking_id = p_booking_id AND status NOT IN ('rejected') LIMIT 1;
  IF FOUND THEN
    IF v_active_fr_st NOT IN ('needs_clarification') THEN
      RAISE EXCEPTION 'VALIDATION: An active flight record already exists and is not pending clarification. Duplicate submissions rejected.';
    END IF;
    -- If there's already an active one that IS needs clarification, 
    -- realistically they should UPDATE it. But if the design expects INSERT,
    -- then the unique partial index `flight_records_single_active_idx` will fail.
    -- For safety, we enforce updating the existing UI, or we mark old as rejected.
    -- Assuming they insert a new one, we must reject the old one safely first:
    UPDATE public.flight_records SET status = 'rejected' WHERE id = v_active_fr_id;
  END IF;

  IF p_review_flags IS NOT NULL THEN
    v_flag_count := jsonb_array_length(p_review_flags);
    -- We can rough check if there's any error severity inside p_review_flags
    -- Just using a quick regex check on jsonb cast
    IF p_review_flags::text LIKE '%"severity": "error"%' THEN
      v_has_error := true;
    END IF;
  END IF;

  INSERT INTO public.flight_records (
    booking_id, aircraft_id, date, pic_name, pic_arn,
    tacho_start, tacho_stop, vdo_start, vdo_stop,
    air_switch_start, air_switch_stop, add_to_mr,
    oil_added, oil_total, fuel_added, fuel_actual, landings,
    customer_notes, declaration_accepted_at, signature_type, signature_value,
    submitted_by_user_id, submitted_at, status, review_flags
  ) VALUES (
    p_booking_id, v_booking.aircraft_id, p_date, p_pic_name, p_pic_arn,
    p_tacho_start, p_tacho_stop, p_vdo_start, p_vdo_stop,
    p_air_switch_start, p_air_switch_stop, p_add_to_mr,
    p_oil_added, p_oil_total, p_fuel_added, p_fuel_actual, p_landings,
    p_customer_notes, CASE WHEN p_declaration_accepted THEN v_now ELSE NULL END,
    p_signature_type, p_signature_value,
    v_user_id, v_now, 'pending_review', p_review_flags
  ) RETURNING id INTO v_fr_id;

  UPDATE public.bookings 
  SET status = 'pending_post_flight_review', updated_at = v_now
  WHERE id = p_booking_id;

  INSERT INTO public.booking_audit_events (
    booking_id, aircraft_id, related_record_type, related_record_id, 
    actor_user_id, actor_role, event_type, event_summary, new_value
  ) VALUES (
    p_booking_id, v_booking.aircraft_id, 'flight_record', v_fr_id,
    v_user_id, 'customer', 'flight_record_submitted',
    'Customer submitted flight record. ' || v_flag_count || ' review flag(s) generated.',
    jsonb_build_object('flight_record_id', v_fr_id, 'booking_status', 'pending_post_flight_review', 'review_flag_count', v_flag_count, 'has_errors', v_has_error)
  );

  RETURN v_fr_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_flight_record_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_flight_record_atomic TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 5 — CREATE approve_post_flight_review_atomic (Admin)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.approve_post_flight_review_atomic(
  p_flight_record_id        uuid,
  p_with_correction         boolean,
  p_admin_notes             text,
  p_correction_reason       text,
  p_admin_booking_notes     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id    uuid;
  v_role        text;
  v_fr          record;
  v_ac          record;
  v_now         timestamptz := now();
  v_billed_hrs  numeric;
  v_final_amt   numeric;
  v_fr_status   text;
  v_meter_cnt   integer := 0;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;
  
  v_role := public.get_own_role();
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin role required';
  END IF;

  SELECT * INTO v_fr FROM public.flight_records WHERE id = p_flight_record_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Flight record not found.';
  END IF;

  IF v_fr.status IN ('approved', 'approved_with_correction', 'locked', 'rejected') THEN
    RAISE EXCEPTION 'VALIDATION: Flight record is already % and cannot be approved.', v_fr.status;
  END IF;
  IF v_fr.status NOT IN ('pending_review', 'needs_clarification', 'resubmitted') THEN
    RAISE EXCEPTION 'VALIDATION: Cannot approve flight record with status "%".', v_fr.status;
  END IF;
  IF v_fr.booking_id IS NULL THEN
    RAISE EXCEPTION 'Flight record has no associated booking.';
  END IF;

  SELECT billing_meter_type, default_hourly_rate INTO v_ac FROM public.aircraft WHERE id = v_fr.aircraft_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aircraft not found.';
  END IF;

  IF v_ac.billing_meter_type = 'tacho' AND v_fr.tacho_total IS NOT NULL THEN
    v_billed_hrs := v_fr.tacho_total;
  ELSIF v_ac.billing_meter_type = 'vdo' AND v_fr.vdo_total IS NOT NULL THEN
    v_billed_hrs := v_fr.vdo_total;
  ELSIF v_ac.billing_meter_type = 'air_switch' AND v_fr.air_switch_total IS NOT NULL THEN
    v_billed_hrs := v_fr.air_switch_total;
  ELSIF v_ac.billing_meter_type = 'add_to_mr' AND v_fr.add_to_mr IS NOT NULL THEN
    v_billed_hrs := v_fr.add_to_mr;
  END IF;

  v_final_amt := CASE WHEN v_billed_hrs IS NOT NULL THEN ROUND(v_billed_hrs * v_ac.default_hourly_rate, 2) ELSE NULL END;
  
  v_fr_status := CASE WHEN p_with_correction THEN 'approved_with_correction' ELSE 'approved' END;

  UPDATE public.flight_records SET
    status = v_fr_status, approved_by_user_id = v_admin_id, approved_at = v_now,
    admin_notes = p_admin_notes, correction_reason = p_correction_reason, updated_at = v_now
  WHERE id = p_flight_record_id;

  IF p_admin_booking_notes IS NOT NULL THEN
    UPDATE public.bookings SET status = 'post_flight_approved', final_amount = v_final_amt, admin_notes = p_admin_booking_notes, updated_at = v_now WHERE id = v_fr.booking_id;
  ELSE
    UPDATE public.bookings SET status = 'post_flight_approved', final_amount = v_final_amt, updated_at = v_now WHERE id = v_fr.booking_id;
  END IF;

  -- ── Insert meters explicitly without add_to_mr (add_to_mr requires schema support for null starts)
  -- TODO(George): Confirm if add_to_mr means injecting dummy 0s, or modify aircraft_meter_history schema.
  IF v_fr.tacho_start IS NOT NULL AND v_fr.tacho_stop IS NOT NULL AND v_fr.tacho_total IS NOT NULL THEN
    INSERT INTO public.aircraft_meter_history (aircraft_id, source_type, source_record_id, booking_id, flight_record_id, meter_type, start_reading, stop_reading, total, is_official, is_correction, correction_reason, entered_by_user_id, approved_by_user_id, approved_at)
    VALUES (v_fr.aircraft_id, 'customer_booking', p_flight_record_id, v_fr.booking_id, p_flight_record_id, 'tacho', v_fr.tacho_start, v_fr.tacho_stop, v_fr.tacho_total, true, p_with_correction, p_correction_reason, v_admin_id, v_admin_id, v_now);
    v_meter_cnt := v_meter_cnt + 1;
  END IF;

  IF v_fr.vdo_start IS NOT NULL AND v_fr.vdo_stop IS NOT NULL AND v_fr.vdo_total IS NOT NULL THEN
    INSERT INTO public.aircraft_meter_history (aircraft_id, source_type, source_record_id, booking_id, flight_record_id, meter_type, start_reading, stop_reading, total, is_official, is_correction, correction_reason, entered_by_user_id, approved_by_user_id, approved_at)
    VALUES (v_fr.aircraft_id, 'customer_booking', p_flight_record_id, v_fr.booking_id, p_flight_record_id, 'vdo', v_fr.vdo_start, v_fr.vdo_stop, v_fr.vdo_total, true, p_with_correction, p_correction_reason, v_admin_id, v_admin_id, v_now);
    v_meter_cnt := v_meter_cnt + 1;
  END IF;

  IF v_fr.air_switch_start IS NOT NULL AND v_fr.air_switch_stop IS NOT NULL AND v_fr.air_switch_total IS NOT NULL THEN
    INSERT INTO public.aircraft_meter_history (aircraft_id, source_type, source_record_id, booking_id, flight_record_id, meter_type, start_reading, stop_reading, total, is_official, is_correction, correction_reason, entered_by_user_id, approved_by_user_id, approved_at)
    VALUES (v_fr.aircraft_id, 'customer_booking', p_flight_record_id, v_fr.booking_id, p_flight_record_id, 'air_switch', v_fr.air_switch_start, v_fr.air_switch_stop, v_fr.air_switch_total, true, p_with_correction, p_correction_reason, v_admin_id, v_admin_id, v_now);
    v_meter_cnt := v_meter_cnt + 1;
  END IF;

  INSERT INTO public.booking_audit_events (
    booking_id, aircraft_id, related_record_type, related_record_id, actor_user_id, actor_role, event_type, event_summary, new_value
  ) VALUES (
    v_fr.booking_id, v_fr.aircraft_id, 'flight_record', p_flight_record_id, v_admin_id, 'admin', 'post_flight_approved',
    'Admin approved post-flight review. ' || v_meter_cnt || ' meter record(s) committed. Final amount: ' || CASE WHEN v_final_amt IS NOT NULL THEN '$' || v_final_amt ELSE 'not calculated' END || '.',
    jsonb_build_object('flight_record_status', v_fr_status, 'booking_status', 'post_flight_approved', 'billed_hours', v_billed_hrs, 'final_amount', v_final_amt, 'meter_entries_created', v_meter_cnt, 'with_correction', p_with_correction)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.approve_post_flight_review_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_post_flight_review_atomic TO authenticated;
