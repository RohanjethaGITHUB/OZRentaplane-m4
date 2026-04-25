-- ============================================================
-- 022_checkout_system.sql
--
-- Introduces the checkout onboarding system:
--
--   1. pilot_clearance_status column on profiles
--      Tracks where a pilot sits in the checkout + solo-hire process.
--
--   2. booking_type column on bookings ('checkout' | 'standard')
--
--   3. New booking statuses for checkout + first solo reservation
--      — bookings_status_check constraint is dropped and recreated.
--
--   4. create_checkout_booking_atomic RPC
--      Creates a checkout booking + schedule blocks in one transaction.
--      Does NOT require verification_status = 'verified'.
--      Requires:
--        • pilot_clearance_status IN ('checkout_required',
--            'additional_supervised_time_required', 'reschedule_required')
--        • No currently active checkout booking (checkout_requested or
--            checkout_confirmed) — one active at a time, not one ever.
--      Sets pilot_clearance_status = 'checkout_requested' on success.
--
--   5. create_provisional_solo_booking function (first solo reservation)
--      Creates one pending-clearance first solo reservation per user.
--      Requires active checkout booking + 24h buffer after checkout end.
--
--   6. Backward compatibility: existing verified users
--      All profiles with verification_status = 'verified' that received the
--      default 'checkout_required' are updated to 'cleared_for_solo_hire'
--      so existing approved pilots can continue booking without re-checkout.
-- ============================================================


-- ── 1. pilot_clearance_status on profiles ────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pilot_clearance_status text NOT NULL DEFAULT 'checkout_required';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_pilot_clearance_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pilot_clearance_status_check
  CHECK (pilot_clearance_status IN (
    'checkout_required',
    'checkout_requested',
    'checkout_confirmed',
    'checkout_completed_under_review',
    'cleared_for_solo_hire',
    'additional_supervised_time_required',
    'reschedule_required',
    'not_currently_eligible'
  ));


-- ── 2. booking_type on bookings ──────────────────────────────────────────────

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_type text NOT NULL DEFAULT 'standard';

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_type_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_type_check
  CHECK (booking_type IN ('checkout', 'standard'));


-- ── 3. Expand booking status constraint ──────────────────────────────────────
-- Must drop and recreate — PostgreSQL has no ALTER CONSTRAINT ADD VALUE.

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN (
    -- Standard booking lifecycle (unchanged)
    'draft', 'pending_confirmation', 'confirmed', 'ready_for_dispatch',
    'dispatched', 'awaiting_flight_record', 'flight_record_overdue',
    'pending_post_flight_review', 'needs_clarification', 'post_flight_approved',
    'invoice_generated', 'payment_pending', 'paid', 'completed',
    'cancelled', 'no_show', 'overdue', 'admin_hold',
    -- Checkout booking statuses
    'checkout_requested',
    'checkout_confirmed',
    'checkout_completed_under_review',
    -- First solo reservation (pending checkout clearance)
    'pending_checkout_clearance',
    -- Released because checkout outcome was not cleared
    'released_due_to_checkout'
  ));


-- ── 4. create_checkout_booking_atomic ────────────────────────────────────────
-- Accepts only a start time — end time is always computed as start + 1 hour.
-- Checkout sessions are a fixed 1-hour block at $290/hour.
--
-- Booking rules enforced here (defence-in-depth — TypeScript also validates):
--   • Authentication required.
--   • pilot_clearance_status IN ('checkout_required',
--       'additional_supervised_time_required', 'reschedule_required')
--     → allows repeat checkout sessions after additional training
--   • No currently active checkout booking (one at a time, not one ever)
--     → active means status IN ('checkout_requested', 'checkout_confirmed')
--   • Aircraft must not be inactive or grounded.
--   • No overlapping schedule blocks (including buffers).
--
-- On success:
--   • Inserts checkout booking (booking_type='checkout', status='checkout_requested',
--     duration=1h, estimated_amount=$290)
--   • Inserts flight + buffer schedule_blocks
--   • Inserts booking_status_history and booking_audit_events rows
--   • Sets pilot_clearance_status = 'checkout_requested'

CREATE OR REPLACE FUNCTION public.create_checkout_booking_atomic(
  p_aircraft_id     uuid,
  p_scheduled_start timestamptz,
  p_customer_notes  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  CHECKOUT_RATE           constant numeric := 290;
  v_user_id               uuid;
  v_clearance_status      text;
  v_active_checkout_count integer;
  v_aircraft              record;
  v_scheduled_end         timestamptz;
  v_conflict_count        integer;
  v_expanded_start        timestamptz;
  v_expanded_end          timestamptz;
  v_booking_id            uuid;
  v_booking_reference     text;
  v_now                   timestamptz;
BEGIN

  -- ── Auth check ─────────────────────────────────────────────────────────────
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  -- ── Fixed 1-hour end time ─────────────────────────────────────────────────
  v_scheduled_end := p_scheduled_start + interval '1 hour';

  -- ── Clearance status check ─────────────────────────────────────────────────
  SELECT pilot_clearance_status INTO v_clearance_status
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_clearance_status NOT IN (
    'checkout_required',
    'additional_supervised_time_required',
    'reschedule_required'
  ) THEN
    RAISE EXCEPTION 'VALIDATION: Your current status does not allow submitting a checkout request.';
  END IF;

  -- ── Active checkout guard ─────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_active_checkout_count
  FROM public.bookings
  WHERE booking_owner_user_id = v_user_id
    AND booking_type          = 'checkout'
    AND status IN ('checkout_requested', 'checkout_confirmed');

  IF v_active_checkout_count > 0 THEN
    RAISE EXCEPTION 'VALIDATION: You already have an active checkout booking. Please wait for it to be resolved before submitting a new request.';
  END IF;

  -- ── Date validation ────────────────────────────────────────────────────────
  IF p_scheduled_start <= now() THEN
    RAISE EXCEPTION 'VALIDATION: Checkout flight time must be in the future.';
  END IF;

  -- ── Fetch aircraft ─────────────────────────────────────────────────────────
  SELECT
    id,
    status,
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

  -- ── Expand window with buffers ────────────────────────────────────────────
  v_expanded_start := p_scheduled_start
    - (v_aircraft.default_preflight_buffer_minutes  || ' minutes')::interval;
  v_expanded_end   := v_scheduled_end
    + (v_aircraft.default_postflight_buffer_minutes || ' minutes')::interval;

  -- ── Conflict check ────────────────────────────────────────────────────────
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
    RAISE EXCEPTION 'AVAILABILITY: The selected time overlaps with an existing booking or block.';
  END IF;

  -- ── Insert booking ────────────────────────────────────────────────────────
  v_now := now();

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
  )
  VALUES (
    p_aircraft_id,
    v_user_id,
    p_scheduled_start,
    v_scheduled_end,
    'checkout_requested',
    'checkout',
    1,                          -- fixed 1-hour duration
    CHECKOUT_RATE,              -- $290 fixed rate
    p_customer_notes,
    'not_required',
    v_now,
    v_now
  )
  RETURNING id, booking_reference INTO v_booking_id, v_booking_reference;

  -- ── Insert schedule blocks (flight + pre/post buffers) ────────────────────
  INSERT INTO public.schedule_blocks (
    aircraft_id, related_booking_id, block_type,
    start_time, end_time,
    public_label, internal_reason,
    created_by_user_id, created_by_role,
    is_public_visible, status
  ) VALUES
    (p_aircraft_id, v_booking_id, 'customer_booking',
     p_scheduled_start, v_scheduled_end,
     'Checkout Flight', NULL,
     v_user_id, 'customer', true, 'active'),
    (p_aircraft_id, v_booking_id, 'buffer',
     v_expanded_start, p_scheduled_start,
     NULL, 'Pre-flight buffer (checkout)',
     v_user_id, 'customer', false, 'active'),
    (p_aircraft_id, v_booking_id, 'buffer',
     v_scheduled_end, v_expanded_end,
     NULL, 'Post-flight buffer (checkout)',
     v_user_id, 'customer', false, 'active');

  -- ── Status history ─────────────────────────────────────────────────────────
  INSERT INTO public.booking_status_history (
    booking_id, old_status, new_status, changed_by_user_id, note
  ) VALUES (
    v_booking_id, NULL, 'checkout_requested', v_user_id,
    'Checkout booking submitted by customer.'
  );

  -- ── Audit event ───────────────────────────────────────────────────────────
  INSERT INTO public.booking_audit_events (
    booking_id, aircraft_id, actor_user_id, actor_role,
    event_type, event_summary, new_value
  ) VALUES (
    v_booking_id, p_aircraft_id, v_user_id, 'customer',
    'checkout_booking_submitted',
    'Customer submitted 1-hour checkout booking request.',
    jsonb_build_object(
      'booking_id',        v_booking_id,
      'booking_reference', v_booking_reference,
      'status',            'checkout_requested',
      'booking_type',      'checkout',
      'estimated_hours',   1,
      'estimated_amount',  CHECKOUT_RATE
    )
  );

  -- ── Update pilot clearance status ─────────────────────────────────────────
  UPDATE public.profiles
  SET
    pilot_clearance_status = 'checkout_requested',
    updated_at             = v_now
  WHERE id = v_user_id;

  -- ── Return result ─────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'booking_id',        v_booking_id,
    'booking_reference', v_booking_reference,
    'scheduled_start',   p_scheduled_start,
    'scheduled_end',     v_scheduled_end,
    'status',            'checkout_requested',
    'booking_type',      'checkout',
    'estimated_hours',   1,
    'estimated_amount',  CHECKOUT_RATE
  );

END;
$$;

REVOKE EXECUTE
  ON FUNCTION public.create_checkout_booking_atomic(uuid, timestamptz, text)
  FROM PUBLIC;

GRANT EXECUTE
  ON FUNCTION public.create_checkout_booking_atomic(uuid, timestamptz, text)
  TO authenticated;


-- ── 5. create_provisional_solo_booking (first solo reservation) ───────────────
-- Creates one pending-clearance first solo flight reservation per user.
--
-- Invariants enforced here:
--   • pilot_clearance_status IN ('checkout_requested', 'checkout_confirmed',
--       'checkout_completed_under_review') — checkout must be in progress.
--   • Only one pending_checkout_clearance booking per user at a time.
--   • Scheduled start >= checkout flight end + 24 hours.
--   • No overlapping schedule blocks.
--
-- The booking is created as:
--   booking_type = 'standard', status = 'pending_checkout_clearance'
--
-- It will be automatically confirmed if outcome = cleared_for_solo_hire, or
-- released (status → released_due_to_checkout) for all other outcomes.

CREATE OR REPLACE FUNCTION public.create_provisional_solo_booking(
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
  v_checkout_end         timestamptz;
  v_min_start            timestamptz;
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
  SELECT COUNT(*) INTO v_existing_count
  FROM public.bookings
  WHERE booking_owner_user_id = v_user_id
    AND status                = 'pending_checkout_clearance';

  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'VALIDATION: You already have a first solo reservation pending checkout clearance.';
  END IF;

  -- ── Get checkout flight end time ──────────────────────────────────────────
  SELECT scheduled_end INTO v_checkout_end
  FROM public.bookings
  WHERE booking_owner_user_id = v_user_id
    AND booking_type          = 'checkout'
    AND status IN ('checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_checkout_end IS NULL THEN
    RAISE EXCEPTION 'VALIDATION: No active checkout booking found.';
  END IF;

  -- ── Enforce 24-hour minimum buffer after checkout ─────────────────────────
  v_min_start := v_checkout_end + interval '24 hours';

  IF p_scheduled_start < v_min_start THEN
    RAISE EXCEPTION
      'VALIDATION: Your first solo flight must be at least 24 hours after your checkout flight ends.';
  END IF;

  -- ── Date validation ───────────────────────────────────────────────────────
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

  -- ── Expand window with buffers ────────────────────────────────────────────
  v_expanded_start := p_scheduled_start
    - (v_aircraft.default_preflight_buffer_minutes  || ' minutes')::interval;
  v_expanded_end   := p_scheduled_end
    + (v_aircraft.default_postflight_buffer_minutes || ' minutes')::interval;

  -- ── Conflict check ────────────────────────────────────────────────────────
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
  )
  VALUES (
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


-- ── 6. Backward compatibility: set existing verified pilots to cleared ─────────
-- Pilots who were already approved before this migration is applied should not
-- have to go through the checkout flow again. Any profile with
-- verification_status = 'verified' gets pilot_clearance_status = 'cleared_for_solo_hire'.
--
-- The WHERE clause filters to only rows that received the default value, so this
-- is safe to re-run — it will not clobber any status explicitly set after migration.

UPDATE public.profiles
SET
  pilot_clearance_status = 'cleared_for_solo_hire',
  updated_at             = now()
WHERE verification_status   = 'verified'
  AND pilot_clearance_status = 'checkout_required';
