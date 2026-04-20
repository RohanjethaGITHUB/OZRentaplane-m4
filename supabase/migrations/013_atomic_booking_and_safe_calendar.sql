-- ============================================================
-- 013_atomic_booking_and_safe_calendar.sql
--
-- Two hardening changes:
--
--   1. Atomic booking creation
--      create_aircraft_booking_atomic(...) — SECURITY DEFINER PL/pgSQL function.
--      Booking + schedule blocks + audit event in one transaction.
--      Replaces the non-atomic JS insert path in app/actions/booking.ts.
--
--   2. Prevent internal_reason leakage
--      - Customers lose direct SELECT/INSERT on schedule_blocks.
--      - Admins retain full access.
--      - get_customer_aircraft_calendar_blocks(...) exposes safe calendar fields
--        (no internal_reason, no created_by_user_id) for customer-facing UI.
--
-- Both new RPC functions are SECURITY DEFINER with SET search_path = ''.
-- EXECUTE is revoked from PUBLIC and granted to authenticated only.
-- ============================================================


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 — Tighten schedule_blocks policies
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop combined SELECT policy — replaced with admin-only version below.
DROP POLICY IF EXISTS "Users can view schedule blocks"
  ON public.schedule_blocks;

-- Drop customer INSERT policy — customers now create blocks exclusively through
-- the atomic RPC (which is SECURITY DEFINER and bypasses RLS).
DROP POLICY IF EXISTS "Customers can create blocks for own bookings"
  ON public.schedule_blocks;

-- Admin-only SELECT
CREATE POLICY "Admins can view schedule blocks"
  ON public.schedule_blocks FOR SELECT TO authenticated
  USING (public.get_own_role() = 'admin');

-- Admin-only INSERT (covers createAdminScheduleBlock in app/actions/admin-booking.ts)
CREATE POLICY "Admins can insert schedule blocks"
  ON public.schedule_blocks FOR INSERT TO authenticated
  WITH CHECK (public.get_own_role() = 'admin');


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — Tighten existing security-definer helper from migration 012
-- ═══════════════════════════════════════════════════════════════════════════

-- get_aircraft_last_meter_stops was created in 012 without an explicit GRANT.
-- PostgreSQL defaults to EXECUTE for PUBLIC — revoke that and restrict to
-- authenticated users only.

REVOKE EXECUTE
  ON FUNCTION public.get_aircraft_last_meter_stops(uuid)
  FROM PUBLIC;

GRANT EXECUTE
  ON FUNCTION public.get_aircraft_last_meter_stops(uuid)
  TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3 — Safe customer calendar RPC
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Returns only calendar-safe fields for customer-facing availability UI.
--   - No internal_reason
--   - No created_by_user_id or admin metadata
--   - Expired temporary_holds automatically excluded
--   - Cancelled / completed / expired blocks automatically excluded (status filter)

CREATE OR REPLACE FUNCTION public.get_customer_aircraft_calendar_blocks(
  p_aircraft_id  uuid,
  p_from         timestamptz,
  p_to           timestamptz
)
RETURNS TABLE (
  block_id     uuid,
  start_time   timestamptz,
  end_time     timestamptz,
  block_type   text,
  public_label text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  -- Require authenticated caller.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    sb.id          AS block_id,
    sb.start_time,
    sb.end_time,
    sb.block_type,
    sb.public_label
  FROM public.schedule_blocks sb
  WHERE sb.aircraft_id = p_aircraft_id
    AND sb.status      = 'active'
    AND sb.start_time  < p_to
    AND sb.end_time    > p_from
    -- Exclude expired temporary holds
    AND NOT (
      sb.block_type = 'temporary_hold'
      AND sb.expires_at IS NOT NULL
      AND sb.expires_at <= now()
    )
  ORDER BY sb.start_time;
END;
$$;

REVOKE EXECUTE
  ON FUNCTION public.get_customer_aircraft_calendar_blocks(uuid, timestamptz, timestamptz)
  FROM PUBLIC;

GRANT EXECUTE
  ON FUNCTION public.get_customer_aircraft_calendar_blocks(uuid, timestamptz, timestamptz)
  TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4 — Atomic booking creation RPC
-- ═══════════════════════════════════════════════════════════════════════════
--
-- All steps execute in one implicit PL/pgSQL transaction.
-- If any step raises an exception the entire operation rolls back.
--
-- Steps:
--   1. Authenticate caller (auth.uid())
--   2. Validate scheduled_start < scheduled_end and start is in the future
--   3. Fetch aircraft; reject if inactive or grounded
--   4. Expand proposed window by aircraft pre/post-flight buffer minutes
--   5. Count active overlapping schedule_blocks (expired temp holds excluded)
--   6. Reject if any conflicts found
--   7. Calculate estimated hours and amount
--   8. INSERT bookings row
--   9. INSERT main customer_booking schedule_block
--  10. INSERT pre-flight buffer block (if buffer > 0)
--  11. INSERT post-flight buffer block (if buffer > 0)
--  12. INSERT booking_audit_events row
--  13. Return JSONB result { booking_id, status, estimated_hours, estimated_amount }
--
-- Error prefixes (preserved in error.message for TypeScript callers):
--   UNAUTHORIZED: — not authenticated
--   VALIDATION:   — bad input (dates)
--   AVAILABILITY: — aircraft status or schedule conflict

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

  -- ── 1. Auth check ───────────────────────────────────────────────────────
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
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
    p_scheduled_start - (v_aircraft.default_preflight_buffer_minutes  * interval '1 minute');
  v_expanded_end   :=
    p_scheduled_end   + (v_aircraft.default_postflight_buffer_minutes * interval '1 minute');

  -- ── 5–6. Availability check ─────────────────────────────────────────────
  -- Counts active blocks overlapping the expanded window.
  -- Overlap:  block.start_time < expanded_end AND block.end_time > expanded_start
  -- Excludes: expired temporary_holds (expires_at <= now())
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
  v_estimated_hours  :=
    EXTRACT(EPOCH FROM (p_scheduled_end - p_scheduled_start)) / 3600.0;
  v_estimated_amount :=
    ROUND(v_estimated_hours * v_aircraft.default_hourly_rate, 2);
  v_now := now();

  -- ── 8. Insert booking ───────────────────────────────────────────────────
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
    CASE WHEN p_terms_accepted             THEN v_now ELSE NULL END,
    CASE WHEN p_risk_acknowledgement_accepted THEN v_now ELSE NULL END
  )
  RETURNING id INTO v_booking_id;

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
      'status',           'pending_confirmation',
      'estimated_hours',  v_estimated_hours,
      'estimated_amount', v_estimated_amount,
      'blocks_created',   true
    )
  );

  -- ── 13. Return result ───────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'booking_id',        v_booking_id,
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
