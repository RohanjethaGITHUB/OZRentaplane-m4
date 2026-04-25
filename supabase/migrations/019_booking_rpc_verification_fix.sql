-- ============================================================
-- 019_booking_rpc_verification_fix.sql
--
-- Patches create_aircraft_booking_atomic to enforce
-- verification_status = 'verified' at the database layer.
--
-- Why this is needed:
--   Migration 018 added booking_reference + booking_status_history
--   and updated the RPC.  The initial 018 version that was applied
--   to the database did not include the verification check below.
--   This migration applies that single security fix only.
--
-- What changed vs the 018 version in the database:
--   DECLARE block — adds v_verification_status text
--   After step 1 (auth check) — new step 1a queries public.profiles
--   and raises VERIFICATION_REQUIRED if account is not 'verified'
--
-- All other logic is identical to the 018 version already in the DB.
-- CREATE OR REPLACE is idempotent — safe to re-run.
-- ============================================================

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
  v_user_id              uuid;
  v_verification_status  text;          -- NEW in 019
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

  -- ── 1. Auth check ───────────────────────────────────────────────────────
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  -- ── 1a. Verification status check (defence-in-depth) ────────────────────
  -- The TypeScript server action also enforces this, but the RPC is callable
  -- directly via the Supabase client with any valid JWT.  Checking here
  -- guarantees that unverified users cannot create bookings regardless of
  -- how the RPC is invoked.
  SELECT verification_status INTO v_verification_status
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_verification_status IS DISTINCT FROM 'verified' THEN
    RAISE EXCEPTION 'VERIFICATION_REQUIRED: Your account must be verified before making bookings.';
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

  -- ── 8. Insert booking (trigger sets booking_reference automatically) ────
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
    'pending_confirmation',
    'not_started',
    v_estimated_hours,
    v_estimated_amount,
    p_customer_notes,
    CASE WHEN p_terms_accepted              THEN v_now ELSE NULL END,
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
    'pending_confirmation',
    v_user_id,
    'Booking request submitted by customer.'
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
    'Customer created booking: ' || p_scheduled_start || ' – ' || p_scheduled_end,
    jsonb_build_object(
      'booking_reference', v_booking_reference,
      'status',            'pending_confirmation',
      'estimated_hours',   v_estimated_hours,
      'estimated_amount',  v_estimated_amount,
      'blocks_created',    true
    )
  );

  -- ── 13. Return result ───────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'booking_id',        v_booking_id,
    'booking_reference', v_booking_reference,
    'status',            'pending_confirmation',
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
