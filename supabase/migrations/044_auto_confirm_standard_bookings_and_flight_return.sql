-- ============================================================
-- 044_auto_confirm_standard_bookings_and_flight_return.sql
--
-- 1. Update create_aircraft_booking_atomic to auto-confirm
--    standard aircraft bookings (status 'confirmed' instead of
--    'pending_confirmation').
--    Cleared customers no longer require admin approval before
--    their booking is confirmed.
--
-- 2. Create flight_record_landings table to store per-airport
--    landing details submitted with each standard flight record.
--
-- Based on migration 043 (clearance gate version). All other RPC
-- logic is identical to that version.
-- ============================================================

-- ── 1. Update create_aircraft_booking_atomic ──────────────────────────────────

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
BEGIN

  -- ── 1. Auth check ───────────────────────────────────────────────────────
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  -- ── 1a. Checkout clearance check (defence-in-depth) ─────────────────────
  SELECT pilot_clearance_status INTO v_pilot_clearance_status
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_pilot_clearance_status IS DISTINCT FROM 'cleared_to_fly' THEN
    RAISE EXCEPTION 'CLEARANCE_REQUIRED: Solo hire bookings are only available to pilots cleared for solo flight.';
  END IF;

  -- ── 2. Date validation ──────────────────────────────────────────────────
  IF p_scheduled_end <= p_scheduled_start THEN
    RAISE EXCEPTION 'VALIDATION: End time must be after start time.';
  END IF;

  IF p_scheduled_start <= now() THEN
    RAISE EXCEPTION 'VALIDATION: Booking start time must be in the future.';
  END IF;

  -- ── 3. Fetch aircraft ───────────────────────────────────────────────────
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
    RAISE EXCEPTION
      'AVAILABILITY: This aircraft is not currently available for bookings.';
  END IF;

  IF v_aircraft.status = 'grounded' THEN
    RAISE EXCEPTION
      'AVAILABILITY: This aircraft is currently grounded and cannot be booked.';
  END IF;

  -- ── 4. Expand window by aircraft buffer values ──────────────────────────
  v_expanded_start :=
    p_scheduled_start - (v_aircraft.default_preflight_buffer_minutes * interval '1 minute');
  v_expanded_end :=
    p_scheduled_end + (v_aircraft.default_postflight_buffer_minutes * interval '1 minute');

  -- ── 5–6. Availability check ─────────────────────────────────────────────
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

  -- ── 7. Estimates ────────────────────────────────────────────────────────
  v_estimated_hours :=
    EXTRACT(EPOCH FROM (p_scheduled_end - p_scheduled_start)) / 3600.0;
  v_estimated_amount :=
    ROUND(v_estimated_hours * v_aircraft.default_hourly_rate, 2);
  v_now := now();

  -- ── 8. Insert booking — status 'confirmed' (auto-confirmed for cleared pilots)
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
    CASE WHEN p_terms_accepted               THEN v_now ELSE NULL END,
    CASE WHEN p_risk_acknowledgement_accepted THEN v_now ELSE NULL END
  )
  RETURNING id, booking_reference INTO v_booking_id, v_booking_reference;

  -- ── 9. Main customer_booking schedule block ─────────────────────────────
  INSERT INTO public.schedule_blocks (
    aircraft_id,
    related_booking_id,
    block_type,
    start_time,
    end_time,
    created_by_user_id,
    created_by_role,
    is_public_visible,
    status
  ) VALUES (
    p_aircraft_id,
    v_booking_id,
    'customer_booking',
    p_scheduled_start,
    p_scheduled_end,
    v_user_id,
    'customer',
    false,
    'active'
  );

  -- ── 10. Pre-flight buffer block ─────────────────────────────────────────
  IF v_aircraft.default_preflight_buffer_minutes > 0 THEN
    INSERT INTO public.schedule_blocks (
      aircraft_id,
      related_booking_id,
      block_type,
      start_time,
      end_time,
      created_by_user_id,
      created_by_role,
      is_public_visible,
      status
    ) VALUES (
      p_aircraft_id,
      v_booking_id,
      'buffer',
      v_expanded_start,
      p_scheduled_start,
      v_user_id,
      'customer',
      false,
      'active'
    );
  END IF;

  -- ── 11. Post-flight buffer block ────────────────────────────────────────
  IF v_aircraft.default_postflight_buffer_minutes > 0 THEN
    INSERT INTO public.schedule_blocks (
      aircraft_id,
      related_booking_id,
      block_type,
      start_time,
      end_time,
      created_by_user_id,
      created_by_role,
      is_public_visible,
      status
    ) VALUES (
      p_aircraft_id,
      v_booking_id,
      'buffer',
      p_scheduled_end,
      v_expanded_end,
      v_user_id,
      'customer',
      false,
      'active'
    );
  END IF;

  -- ── 9a. Initial status history entry ────────────────────────────────────
  INSERT INTO public.booking_status_history (
    booking_id,
    old_status,
    new_status,
    changed_by_user_id,
    note
  ) VALUES (
    v_booking_id,
    NULL,
    'confirmed',
    v_user_id,
    'Booking auto-confirmed for cleared pilot.'
  );

  -- ── 12. Audit event ─────────────────────────────────────────────────────
  INSERT INTO public.booking_audit_events (
    booking_id,
    aircraft_id,
    actor_user_id,
    actor_role,
    event_type,
    event_summary,
    new_value
  ) VALUES (
    v_booking_id,
    p_aircraft_id,
    v_user_id,
    'customer',
    'booking_created',
    'Customer created booking (auto-confirmed): ' || p_scheduled_start || ' – ' || p_scheduled_end,
    jsonb_build_object(
      'booking_reference', v_booking_reference,
      'status',            'confirmed',
      'estimated_hours',   v_estimated_hours,
      'estimated_amount',  v_estimated_amount,
      'blocks_created',    true
    )
  );

  -- ── 13. Return result ───────────────────────────────────────────────────
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
  ON FUNCTION public.create_aircraft_booking_atomic(uuid, uuid, text, text, timestamptz, timestamptz, text, boolean, boolean)
  FROM PUBLIC;

GRANT EXECUTE
  ON FUNCTION public.create_aircraft_booking_atomic(uuid, uuid, text, text, timestamptz, timestamptz, text, boolean, boolean)
  TO authenticated;


-- ── 2. flight_record_landings table ──────────────────────────────────────────
-- Stores per-airport landing details submitted with each standard flight record.
-- The legacy flight_records.landings column remains for total count / backward compat.

CREATE TABLE IF NOT EXISTS public.flight_record_landings (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  flight_record_id uuid        NOT NULL REFERENCES public.flight_records(id)  ON DELETE CASCADE,
  airport_id       uuid        NOT NULL REFERENCES public.airports(id)         ON DELETE RESTRICT,
  landing_count    integer     NOT NULL,
  created_at       timestamptz DEFAULT now(),
  CONSTRAINT frl_landing_count_positive CHECK (landing_count > 0)
);

ALTER TABLE public.flight_record_landings ENABLE ROW LEVEL SECURITY;

-- Customers can read their own landing rows (via flight_record ownership through bookings)
DROP POLICY IF EXISTS "Customers can view own flight record landings" ON public.flight_record_landings;
CREATE POLICY "Customers can view own flight record landings" ON public.flight_record_landings
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM   public.flight_records fr
      JOIN   public.bookings b ON b.id = fr.booking_id
      WHERE  fr.id = flight_record_id
        AND  b.booking_owner_user_id = auth.uid()
    )
  );

-- Customers can insert their own rows (same ownership check)
DROP POLICY IF EXISTS "Customers can insert own flight record landings" ON public.flight_record_landings;
CREATE POLICY "Customers can insert own flight record landings" ON public.flight_record_landings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM   public.flight_records fr
      JOIN   public.bookings b ON b.id = fr.booking_id
      WHERE  fr.id = flight_record_id
        AND  b.booking_owner_user_id = auth.uid()
    )
  );

-- Admins can read and manage all rows
DROP POLICY IF EXISTS "Admin full access flight record landings" ON public.flight_record_landings;
CREATE POLICY "Admin full access flight record landings" ON public.flight_record_landings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
