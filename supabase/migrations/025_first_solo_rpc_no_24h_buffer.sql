-- ============================================================
-- 025_first_solo_rpc_no_24h_buffer.sql
--
-- Replaces create_provisional_solo_booking with an updated version that:
--
--   1. Removes the 24-hour minimum buffer requirement.
--      The customer may reserve their first solo flight for any time
--      at or after their checkout flight ends.
--      Minimum start: p_scheduled_start >= v_checkout_end (not +24h).
--
--   2. Excludes the customer's own checkout booking schedule blocks
--      from the conflict check. This allows the first solo reservation
--      to start immediately after the checkout flight ends, even though
--      the checkout booking holds a post-flight buffer block in that slot.
--
--      Without this exclusion, the first solo reservation's pre-flight
--      buffer would conflict with the checkout flight block, and the
--      checkout's post-flight buffer would conflict with the first solo's
--      flight block — making back-to-back scheduling impossible.
--
-- All other invariants are preserved:
--   • pilot_clearance_status must be in-progress (not yet cleared)
--   • Only one pending_checkout_clearance booking per user
--   • No conflict with OTHER customers' or admin blocks
-- ============================================================


DROP FUNCTION IF EXISTS public.create_provisional_solo_booking(uuid, timestamptz, timestamptz, text);


CREATE FUNCTION public.create_provisional_solo_booking(
  p_aircraft_id     uuid,
  p_scheduled_start timestamptz,
  p_scheduled_end   timestamptz,
  p_customer_notes  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id              uuid;
  v_clearance_status     text;
  v_checkout_booking_id  uuid;
  v_checkout_end         timestamptz;
  v_existing_count       integer;
  v_aircraft             record;
  v_conflict_count       integer;
  v_expanded_start       timestamptz;
  v_expanded_end         timestamptz;
  v_booking_id           uuid;
  v_booking_reference    text;
  v_estimated_hours      numeric;
  v_estimated_amount     numeric;
  v_now                  timestamptz;
BEGIN

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  -- ── Clearance check ───────────────────────────────────────────────────────
  SELECT pilot_clearance_status INTO v_clearance_status
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_clearance_status NOT IN (
    'checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review'
  ) THEN
    RAISE EXCEPTION 'VALIDATION: A first solo reservation requires an active checkout booking.';
  END IF;

  -- ── One first solo reservation at a time ──────────────────────────────────
  -- Only pending_checkout_clearance counts — released/cancelled do not block.
  SELECT COUNT(*) INTO v_existing_count
  FROM public.bookings
  WHERE booking_owner_user_id = v_user_id
    AND status                = 'pending_checkout_clearance';

  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'VALIDATION: You already have a first solo reservation pending checkout clearance.';
  END IF;

  -- ── Get checkout booking ID and end time ──────────────────────────────────
  -- Both are needed: end time sets the minimum start, ID exempts the
  -- checkout booking's own schedule blocks from the conflict check.
  SELECT id, scheduled_end
  INTO   v_checkout_booking_id, v_checkout_end
  FROM   public.bookings
  WHERE  booking_owner_user_id = v_user_id
    AND  booking_type          = 'checkout'
    AND  status IN ('checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_checkout_end IS NULL THEN
    RAISE EXCEPTION 'VALIDATION: No active checkout booking found.';
  END IF;

  -- ── Minimum start: at or after checkout end (no 24-hour buffer) ───────────
  -- The first solo flight can begin exactly when the checkout flight ends.
  IF p_scheduled_start < v_checkout_end THEN
    RAISE EXCEPTION
      'VALIDATION: Your first solo flight must start at or after your checkout flight ends.';
  END IF;

  -- ── Standard date validation ──────────────────────────────────────────────
  IF p_scheduled_end <= p_scheduled_start THEN
    RAISE EXCEPTION 'VALIDATION: End time must be after start time.';
  END IF;

  IF p_scheduled_start <= now() THEN
    RAISE EXCEPTION 'VALIDATION: Flight time must be in the future.';
  END IF;

  -- ── Fetch aircraft ────────────────────────────────────────────────────────
  SELECT
    id, status,
    default_hourly_rate,
    default_preflight_buffer_minutes,
    default_postflight_buffer_minutes
  INTO v_aircraft
  FROM public.aircraft
  WHERE id = p_aircraft_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aircraft not found.';
  END IF;

  IF v_aircraft.status IN ('inactive', 'grounded') THEN
    RAISE EXCEPTION 'AVAILABILITY: This aircraft is not currently available.';
  END IF;

  -- ── Buffer-expanded window ────────────────────────────────────────────────
  v_expanded_start := p_scheduled_start
    - (v_aircraft.default_preflight_buffer_minutes  || ' minutes')::interval;
  v_expanded_end   := p_scheduled_end
    + (v_aircraft.default_postflight_buffer_minutes || ' minutes')::interval;

  -- ── Conflict check — excludes customer's own checkout booking blocks ──────
  -- The checkout booking's pre/post buffers and flight block can legally
  -- overlap with the first solo's buffer zone when scheduling back-to-back.
  -- All other active blocks (other customers, admin blocks) still conflict.
  SELECT COUNT(*) INTO v_conflict_count
  FROM public.schedule_blocks
  WHERE aircraft_id = p_aircraft_id
    AND status      = 'active'
    AND start_time  < v_expanded_end
    AND end_time    > v_expanded_start
    -- Exclude expired temporary holds
    AND NOT (
      block_type = 'temporary_hold'
      AND expires_at IS NOT NULL
      AND expires_at <= now()
    )
    -- Exclude blocks belonging to this customer's own checkout booking
    -- (allows back-to-back checkout → first solo scheduling)
    AND (
      related_booking_id IS NULL
      OR related_booking_id != v_checkout_booking_id
    );

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'AVAILABILITY: The selected time overlaps with an existing booking or block.';
  END IF;

  -- ── Estimate ──────────────────────────────────────────────────────────────
  v_now             := now();
  v_estimated_hours := EXTRACT(EPOCH FROM (p_scheduled_end - p_scheduled_start)) / 3600.0;
  v_estimated_amount := ROUND(v_estimated_hours * v_aircraft.default_hourly_rate, 2);

  -- ── Insert first solo reservation ─────────────────────────────────────────
  INSERT INTO public.bookings (
    aircraft_id,
    booking_owner_user_id,
    scheduled_start,
    scheduled_end,
    status,
    booking_type,
    estimated_hours,
    estimated_amount,
    customer_notes,
    payment_status,
    created_at,
    updated_at
  ) VALUES (
    p_aircraft_id,
    v_user_id,
    p_scheduled_start,
    p_scheduled_end,
    'pending_checkout_clearance',
    'standard',
    v_estimated_hours,
    v_estimated_amount,
    p_customer_notes,
    'not_started',
    v_now,
    v_now
  )
  RETURNING id, booking_reference INTO v_booking_id, v_booking_reference;

  -- ── Schedule blocks ───────────────────────────────────────────────────────
  INSERT INTO public.schedule_blocks (
    aircraft_id, related_booking_id, block_type,
    start_time, end_time,
    public_label, internal_reason,
    created_by_user_id, created_by_role,
    is_public_visible, status
  ) VALUES
    (p_aircraft_id, v_booking_id, 'customer_booking',
     p_scheduled_start, p_scheduled_end,
     'Solo Flight (Pending Checkout Clearance)', NULL,
     v_user_id, 'customer', true, 'active'),
    (p_aircraft_id, v_booking_id, 'buffer',
     v_expanded_start, p_scheduled_start,
     NULL, 'Pre-flight buffer (first solo reservation)',
     v_user_id, 'customer', false, 'active'),
    (p_aircraft_id, v_booking_id, 'buffer',
     p_scheduled_end, v_expanded_end,
     NULL, 'Post-flight buffer (first solo reservation)',
     v_user_id, 'customer', false, 'active');

  -- ── Status history ────────────────────────────────────────────────────────
  INSERT INTO public.booking_status_history (
    booking_id, old_status, new_status, changed_by_user_id, note
  ) VALUES (
    v_booking_id, NULL, 'pending_checkout_clearance', v_user_id,
    'First solo reservation created. Will be confirmed or released based on checkout outcome.'
  );

  -- ── Audit event ───────────────────────────────────────────────────────────
  INSERT INTO public.booking_audit_events (
    booking_id, aircraft_id, actor_user_id, actor_role,
    event_type, event_summary, new_value
  ) VALUES (
    v_booking_id, p_aircraft_id, v_user_id, 'customer',
    'first_solo_reservation_created',
    'Customer reserved first solo flight pending checkout clearance.',
    jsonb_build_object(
      'booking_id',        v_booking_id,
      'booking_reference', v_booking_reference,
      'status',            'pending_checkout_clearance',
      'booking_type',      'standard'
    )
  );

  RETURN jsonb_build_object(
    'booking_id',        v_booking_id,
    'booking_reference', v_booking_reference,
    'status',            'pending_checkout_clearance',
    'booking_type',      'standard',
    'estimated_hours',   v_estimated_hours,
    'estimated_amount',  v_estimated_amount
  );

END;
$$;

REVOKE EXECUTE
  ON FUNCTION public.create_provisional_solo_booking(uuid, timestamptz, timestamptz, text)
  FROM PUBLIC;

GRANT EXECUTE
  ON FUNCTION public.create_provisional_solo_booking(uuid, timestamptz, timestamptz, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
