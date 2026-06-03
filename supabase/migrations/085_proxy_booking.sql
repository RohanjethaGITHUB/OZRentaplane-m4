-- ============================================================================
-- 085_proxy_booking.sql
--
-- Adds admin proxy booking support:
--   1) Track bookings created by admins on behalf of customers
--   2) Extend verification_events with an admin proxy booking audit event
--   3) Provide a security definer RPC to create the booking atomically
-- ============================================================================

BEGIN;

-- ── 1. Track admin-created proxy bookings ────────────────────────────────────

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS proxy_created_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.bookings.proxy_created_by IS
  'Set when an admin creates this booking on behalf of a customer. Null for all customer-initiated bookings.';

-- ── 2. Extend verification event types for proxy booking creation ────────────

ALTER TABLE public.verification_events
  DROP CONSTRAINT IF EXISTS verification_events_event_type_check;

ALTER TABLE public.verification_events
  ADD CONSTRAINT verification_events_event_type_check
  CHECK (event_type IN (
    'submitted',
    'approved',
    'rejected',
    'on_hold',
    'resubmitted',
    'message',
    'document_uploaded',
    'admin_proxy_booking_created'
  ));

-- ── 3. Atomic RPC for proxy bookings ─────────────────────────────────────────

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
  p_customer_notes     text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conflict_count integer;
  v_booking_id     uuid;
BEGIN
  -- Availability check: no confirmed/provisional bookings overlap.
  SELECT COUNT(*) INTO v_conflict_count
  FROM public.bookings
  WHERE aircraft_id = p_aircraft_id
    AND status IN ('confirmed', 'provisional')
    AND tstzrange(scheduled_start, scheduled_end, '[)')
        && tstzrange(p_scheduled_start, p_scheduled_end, '[)');

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'aircraft_unavailable'
      USING HINT = 'The selected aircraft has a conflicting booking in this time window.';
  END IF;

  -- Insert booking directly as confirmed.
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
    'confirmed',
    'not_started',
    p_estimated_hours,
    p_estimated_amount,
    p_customer_notes,
    p_admin_notes,
    p_admin_id
  )
  RETURNING id INTO v_booking_id;

  -- Audit the proxy booking creation on the customer timeline.
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
    'Booking ' || v_booking_id::text || ' was created by an admin on behalf of the customer.'
  );

  RETURN v_booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_proxy_booking_atomic(
  uuid,
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  timestamptz,
  numeric,
  numeric,
  text,
  text
) TO authenticated;

COMMIT;
