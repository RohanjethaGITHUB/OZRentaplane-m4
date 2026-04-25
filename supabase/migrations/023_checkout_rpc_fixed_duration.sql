-- ============================================================
-- 023_checkout_rpc_fixed_duration.sql
--
-- Replaces create_checkout_booking_atomic with a clean 3-parameter
-- version that computes end_time internally as start + 1 hour.
--
-- Context: migration 022 introduced the checkout system with a
-- 4-parameter function (including p_scheduled_end). The app was
-- updated to call a 3-parameter version, but the old function may
-- still exist in Supabase under the original signature. This
-- migration explicitly drops both signatures and recreates the
-- correct one so there is no ambiguity.
--
-- What this migration does:
--   1. Drop old 4-param function (uuid, timestamptz, timestamptz, text)
--   2. Drop 3-param function if it exists (uuid, timestamptz, text)
--   3. Recreate with correct 3-param signature — p_customer_notes
--      is optional (DEFAULT NULL) so callers may omit it.
--   4. Inside the function: v_scheduled_end = p_scheduled_start + 1h
--      (never accepted from client)
--   5. Checkout rules preserved:
--      - one active checkout booking at a time
--      - repeat checkout allowed for additional_supervised_time_required
--        and reschedule_required clearance statuses
--      - booking_type = 'checkout', status = 'checkout_requested'
--      - pilot_clearance_status set to 'checkout_requested'
--      - fixed amount: $290.00 (numeric, not cents)
--   6. NOTIFY pgrst to reload PostgREST schema cache.
-- ============================================================


-- ── 1. Drop old 4-parameter signature ────────────────────────────────────────

DROP FUNCTION IF EXISTS public.create_checkout_booking_atomic(
  uuid, timestamptz, timestamptz, text
);


-- ── 2. Drop 3-parameter signature if it exists ────────────────────────────────

DROP FUNCTION IF EXISTS public.create_checkout_booking_atomic(
  uuid, timestamptz, text
);


-- ── 3. Recreate with correct signature ───────────────────────────────────────
--
-- Parameter names match the Supabase JS client call in checkout.ts:
--   supabase.rpc('create_checkout_booking_atomic', {
--     p_aircraft_id,
--     p_scheduled_start,
--     p_customer_notes,       ← optional, defaults to NULL
--   })
--
-- end_time is computed inside as p_scheduled_start + interval '1 hour'.
-- $290.00 is the fixed checkout rate stored in the numeric(10,2) amount column.

CREATE FUNCTION public.create_checkout_booking_atomic(
  p_aircraft_id     uuid,
  p_scheduled_start timestamptz,
  p_customer_notes  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  CHECKOUT_RATE            constant numeric(10,2) := 290.00;
  v_user_id                uuid;
  v_clearance_status       text;
  v_active_checkout_count  integer;
  v_aircraft               record;
  v_scheduled_end          timestamptz;
  v_conflict_count         integer;
  v_expanded_start         timestamptz;
  v_expanded_end           timestamptz;
  v_booking_id             uuid;
  v_booking_reference      text;
  v_now                    timestamptz;
BEGIN

  -- ── Auth ────────────────────────────────────────────────────────────────────
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  -- ── Fixed 1-hour duration ─────────────────────────────────────────────────
  v_scheduled_end := p_scheduled_start + interval '1 hour';

  -- ── Clearance status gate ─────────────────────────────────────────────────
  -- Allowed states:
  --   checkout_required                  → first-time checkout
  --   additional_supervised_time_required → repeat session after more training
  --   reschedule_required                → repeat session after reschedule
  -- All other states (checkout_requested, checkout_confirmed,
  -- checkout_completed_under_review, cleared_for_solo_hire,
  -- not_currently_eligible) are blocked.
  SELECT pilot_clearance_status
  INTO   v_clearance_status
  FROM   public.profiles
  WHERE  id = v_user_id;

  IF v_clearance_status NOT IN (
    'checkout_required',
    'additional_supervised_time_required',
    'reschedule_required'
  ) THEN
    RAISE EXCEPTION 'VALIDATION: Your current status does not allow submitting a checkout request.';
  END IF;

  -- ── One active checkout at a time ─────────────────────────────────────────
  -- Prevents duplicate submissions. "Active" means the booking is waiting for
  -- admin confirmation or has been confirmed but not yet flown.
  SELECT COUNT(*)
  INTO   v_active_checkout_count
  FROM   public.bookings
  WHERE  booking_owner_user_id = v_user_id
    AND  booking_type          = 'checkout'
    AND  status IN ('checkout_requested', 'checkout_confirmed');

  IF v_active_checkout_count > 0 THEN
    RAISE EXCEPTION 'VALIDATION: You already have an active checkout booking. Please wait for it to be resolved before submitting a new request.';
  END IF;

  -- ── Date validation ────────────────────────────────────────────────────────
  IF p_scheduled_start <= now() THEN
    RAISE EXCEPTION 'VALIDATION: Checkout flight time must be in the future.';
  END IF;

  -- ── Fetch aircraft ─────────────────────────────────────────────────────────
  SELECT id,
         status,
         default_preflight_buffer_minutes,
         default_postflight_buffer_minutes
  INTO   v_aircraft
  FROM   public.aircraft
  WHERE  id = p_aircraft_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aircraft not found.';
  END IF;

  IF v_aircraft.status IN ('inactive', 'grounded') THEN
    RAISE EXCEPTION 'AVAILABILITY: This aircraft is not currently available.';
  END IF;

  -- ── Buffer-expanded window ────────────────────────────────────────────────
  v_expanded_start := p_scheduled_start
    - (v_aircraft.default_preflight_buffer_minutes  || ' minutes')::interval;
  v_expanded_end   := v_scheduled_end
    + (v_aircraft.default_postflight_buffer_minutes || ' minutes')::interval;

  -- ── Conflict check ────────────────────────────────────────────────────────
  SELECT COUNT(*)
  INTO   v_conflict_count
  FROM   public.schedule_blocks
  WHERE  aircraft_id = p_aircraft_id
    AND  status      = 'active'
    AND  start_time  < v_expanded_end
    AND  end_time    > v_expanded_start
    AND  NOT (
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
  ) VALUES (
    p_aircraft_id,
    v_user_id,
    p_scheduled_start,
    v_scheduled_end,
    'checkout_requested',
    'checkout',
    1,               -- 1 hour, fixed
    CHECKOUT_RATE,   -- $290.00
    p_customer_notes,
    'not_required',
    v_now,
    v_now
  )
  RETURNING id, booking_reference
  INTO v_booking_id, v_booking_reference;

  -- ── Schedule blocks ───────────────────────────────────────────────────────
  INSERT INTO public.schedule_blocks (
    aircraft_id, related_booking_id, block_type,
    start_time, end_time,
    public_label, internal_reason,
    created_by_user_id, created_by_role,
    is_public_visible, status
  ) VALUES
    -- Flight block
    (p_aircraft_id, v_booking_id, 'customer_booking',
     p_scheduled_start, v_scheduled_end,
     'Checkout Flight', NULL,
     v_user_id, 'customer', true, 'active'),
    -- Pre-flight buffer
    (p_aircraft_id, v_booking_id, 'buffer',
     v_expanded_start, p_scheduled_start,
     NULL, 'Pre-flight buffer (checkout)',
     v_user_id, 'customer', false, 'active'),
    -- Post-flight buffer
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
    'Customer submitted 1-hour checkout booking ($290).',
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
  SET    pilot_clearance_status = 'checkout_requested',
         updated_at             = v_now
  WHERE  id = v_user_id;

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


-- ── 4. Permissions ────────────────────────────────────────────────────────────

REVOKE EXECUTE
  ON FUNCTION public.create_checkout_booking_atomic(uuid, timestamptz, text)
  FROM PUBLIC;

GRANT EXECUTE
  ON FUNCTION public.create_checkout_booking_atomic(uuid, timestamptz, text)
  TO authenticated;


-- ── 5. Reload PostgREST schema cache ─────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
