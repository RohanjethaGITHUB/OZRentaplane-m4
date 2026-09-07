-- 120_instructor_clearances_and_checkout_types.sql
--
-- Adds support for Instructor Checkout flights, aircraft-specific instructor clearances,
-- and foundational student-instructor linking.

BEGIN;

-- 1. Add checkout_type column to public.bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS checkout_type text NOT NULL DEFAULT 'standard';

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_checkout_type_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_checkout_type_check
  CHECK (checkout_type IN ('standard', 'instructor', 'renewal'));

CREATE INDEX IF NOT EXISTS idx_bookings_checkout_type ON public.bookings(checkout_type);


-- 2. Create instructor_aircraft_clearances table
CREATE TABLE IF NOT EXISTS public.instructor_aircraft_clearances (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  aircraft_id       uuid NOT NULL REFERENCES public.aircraft(id) ON DELETE CASCADE,
  clearance_status  text NOT NULL DEFAULT 'pending'
                    CHECK (clearance_status IN ('pending', 'approved', 'suspended', 'revoked', 'expired')),
  cleared_at        timestamptz,
  cleared_by        uuid REFERENCES auth.users(id),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_instructor_aircraft UNIQUE (instructor_id, aircraft_id)
);

CREATE INDEX IF NOT EXISTS idx_instructor_aircraft_clearances_instructor 
  ON public.instructor_aircraft_clearances(instructor_id);
CREATE INDEX IF NOT EXISTS idx_instructor_aircraft_clearances_aircraft 
  ON public.instructor_aircraft_clearances(aircraft_id);

-- Enable RLS
ALTER TABLE public.instructor_aircraft_clearances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access on instructor_aircraft_clearances" ON public.instructor_aircraft_clearances;
CREATE POLICY "Admins full access on instructor_aircraft_clearances"
  ON public.instructor_aircraft_clearances
  FOR ALL TO authenticated
  USING (public.get_own_role() = 'admin')
  WITH CHECK (public.get_own_role() = 'admin');

DROP POLICY IF EXISTS "Instructors read own clearances" ON public.instructor_aircraft_clearances;
CREATE POLICY "Instructors read own clearances"
  ON public.instructor_aircraft_clearances
  FOR SELECT TO authenticated
  USING (auth.uid() = instructor_id);


-- 3. Create foundational instructor_students table
CREATE TABLE IF NOT EXISTS public.instructor_students (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'inactive', 'transferred')),
  assigned_at    timestamptz NOT NULL DEFAULT now(),
  notes          text,
  CONSTRAINT uq_instructor_student UNIQUE (instructor_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_instructor_students_instructor ON public.instructor_students(instructor_id);
CREATE INDEX IF NOT EXISTS idx_instructor_students_student ON public.instructor_students(student_id);

ALTER TABLE public.instructor_students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access on instructor_students" ON public.instructor_students;
CREATE POLICY "Admins full access on instructor_students"
  ON public.instructor_students
  FOR ALL TO authenticated
  USING (public.get_own_role() = 'admin')
  WITH CHECK (public.get_own_role() = 'admin');

DROP POLICY IF EXISTS "Instructors read own students" ON public.instructor_students;
CREATE POLICY "Instructors read own students"
  ON public.instructor_students
  FOR SELECT TO authenticated
  USING (auth.uid() = instructor_id);

DROP POLICY IF EXISTS "Students read own instructor" ON public.instructor_students;
CREATE POLICY "Students read own instructor"
  ON public.instructor_students
  FOR SELECT TO authenticated
  USING (auth.uid() = student_id);


-- 4. Update create_checkout_booking_atomic function to support instructor checkouts
DROP FUNCTION IF EXISTS public.create_checkout_booking_atomic(uuid, timestamptz, text);
DROP FUNCTION IF EXISTS public.create_checkout_booking_atomic(uuid, timestamptz, text, text);

CREATE OR REPLACE FUNCTION public.create_checkout_booking_atomic(
  p_aircraft_id     uuid,
  p_scheduled_start timestamptz,
  p_customer_notes  text DEFAULT NULL,
  p_checkout_type   text DEFAULT 'standard'
)
RETURNS TABLE (
  booking_id        uuid,
  booking_reference text,
  scheduled_start   timestamptz,
  scheduled_end     timestamptz,
  status            text,
  estimated_hours   numeric,
  estimated_amount  numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id         uuid;
  v_scheduled_end       timestamptz;
  v_booking_id          uuid;
  v_booking_reference   text;
  v_aircraft            RECORD;
  v_default_hourly_rate numeric;
  v_estimated_hours     numeric;
  v_estimated_amount    numeric;
  v_clearance_status    text;
  v_existing_checkout   uuid;
  v_checkout_type       text;
BEGIN
  v_customer_id := auth.uid();
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'AUTH: Not authenticated';
  END IF;

  v_checkout_type := COALESCE(p_checkout_type, 'standard');
  IF v_checkout_type NOT IN ('standard', 'instructor', 'renewal') THEN
    RAISE EXCEPTION 'VALIDATION: Invalid checkout type %', v_checkout_type;
  END IF;

  SELECT p.pilot_clearance_status INTO v_clearance_status
  FROM public.profiles p
  WHERE p.id = v_customer_id;

  -- Clearance status gating:
  -- Standard checkouts require checkout_required / additional_checkout_required / checkout_reschedule_required.
  -- Instructor checkouts allow standard cleared pilots OR new pilots applying directly for instructor checkout.
  IF v_checkout_type = 'standard' THEN
    IF v_clearance_status NOT IN (
      'checkout_required',
      'additional_checkout_required',
      'checkout_reschedule_required'
    ) THEN
      RAISE EXCEPTION 'VALIDATION: Your current status does not allow submitting a checkout request.';
    END IF;
  ELSIF v_checkout_type = 'instructor' THEN
    IF v_clearance_status IN ('not_currently_eligible') THEN
      RAISE EXCEPTION 'VALIDATION: Your account is not currently eligible to submit an instructor checkout request.';
    END IF;
  END IF;

  -- Active checkout check:
  IF v_checkout_type = 'instructor' THEN
    SELECT b.id INTO v_existing_checkout
    FROM public.bookings b
    WHERE b.booking_owner_user_id = v_customer_id
      AND b.booking_type = 'checkout'
      AND b.checkout_type = 'instructor'
      AND b.aircraft_id = p_aircraft_id
      AND b.status IN ('checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review');
  ELSE
    SELECT b.id INTO v_existing_checkout
    FROM public.bookings b
    WHERE b.booking_owner_user_id = v_customer_id
      AND b.booking_type = 'checkout'
      AND COALESCE(b.checkout_type, 'standard') = 'standard'
      AND b.status IN ('checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review');
  END IF;

  IF FOUND THEN
    RAISE EXCEPTION 'VALIDATION: You already have an active checkout booking.';
  END IF;

  v_scheduled_end := p_scheduled_start + interval '2 hours';

  IF p_scheduled_start <= now() THEN
    RAISE EXCEPTION 'VALIDATION: Checkout start time must be in the future.';
  END IF;

  SELECT
    a.id,
    a.status,
    a.default_hourly_rate
  INTO v_aircraft
  FROM public.aircraft a
  WHERE a.id = p_aircraft_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VALIDATION: Aircraft not found.';
  END IF;

  IF v_aircraft.status = 'inactive' THEN
    RAISE EXCEPTION 'VALIDATION: Aircraft % has status %, not bookable', p_aircraft_id, v_aircraft.status;
  END IF;

  v_default_hourly_rate := v_aircraft.default_hourly_rate;

  -- Exact 2-hour overlap check against ACTIVE schedule blocks only
  -- (matches get_customer_aircraft_calendar_blocks / selection UI).
  IF EXISTS (
    SELECT 1 FROM public.schedule_blocks sb
    WHERE sb.aircraft_id = p_aircraft_id
      AND sb.status = 'active'
      AND sb.start_time < v_scheduled_end
      AND sb.end_time   > p_scheduled_start
      AND NOT (
        sb.block_type = 'temporary_hold'
        AND sb.expires_at IS NOT NULL
        AND sb.expires_at <= now()
      )
  ) THEN
    RAISE EXCEPTION 'AVAILABILITY: That 2-hour checkout window is no longer available. Please select another time.';
  END IF;

  -- Also block when an active booking overlaps without a usable schedule_block
  -- (cancelled/missing blocks previously caused selection vs submit mismatch).
  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.aircraft_id = p_aircraft_id
      AND b.status IN (
        'checkout_requested',
        'checkout_confirmed',
        'checkout_completed_under_review',
        'pending_confirmation',
        'confirmed',
        'ready_for_dispatch',
        'dispatched',
        'awaiting_flight_record',
        'on_hold_pending_documents',
        'pending_post_flight_review',
        'payment_pending',
        'cancellation_requested'
      )
      AND b.scheduled_start < v_scheduled_end
      AND b.scheduled_end   > p_scheduled_start
  ) THEN
    RAISE EXCEPTION 'AVAILABILITY: That 2-hour checkout window is no longer available. Please select another time.';
  END IF;

  v_booking_reference := 'CKO-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' ||
    upper(substring(gen_random_uuid()::text, 1, 6));

  v_estimated_hours  := 2.0;
  v_estimated_amount := v_estimated_hours * v_default_hourly_rate;

  INSERT INTO public.bookings (
    aircraft_id,
    booking_owner_user_id,
    booking_type,
    checkout_type,
    booking_reference,
    status,
    scheduled_start,
    scheduled_end,
    customer_notes,
    final_amount
  ) VALUES (
    p_aircraft_id,
    v_customer_id,
    'checkout',
    v_checkout_type,
    v_booking_reference,
    'checkout_requested',
    p_scheduled_start,
    v_scheduled_end,
    p_customer_notes,
    v_estimated_amount
  )
  RETURNING id INTO v_booking_id;

  INSERT INTO public.schedule_blocks (
    aircraft_id, related_booking_id, block_type,
    start_time, end_time,
    created_by_user_id, created_by_role, public_label
  ) VALUES (
    p_aircraft_id, v_booking_id, 'customer_booking',
    p_scheduled_start, v_scheduled_end,
    v_customer_id, 'customer',
    CASE WHEN v_checkout_type = 'instructor' THEN 'Instructor checkout flight' ELSE 'Checkout flight' END
  );

  -- Only update pilot_clearance_status if standard checkout or user is still checkout_required
  IF v_checkout_type = 'standard' OR v_clearance_status = 'checkout_required' THEN
    UPDATE public.profiles
    SET pilot_clearance_status = 'checkout_requested',
        updated_at             = now()
    WHERE id = v_customer_id;
  END IF;

  -- Create or update pending instructor aircraft clearance record if instructor checkout
  IF v_checkout_type = 'instructor' THEN
    INSERT INTO public.instructor_aircraft_clearances (
      instructor_id,
      aircraft_id,
      clearance_status
    )
    VALUES (
      v_customer_id,
      p_aircraft_id,
      'pending'
    )
    ON CONFLICT (instructor_id, aircraft_id) DO UPDATE
    SET clearance_status = 'pending',
        updated_at = now();
  END IF;

  INSERT INTO public.booking_status_history (
    booking_id, old_status, new_status, changed_by_user_id, note
  ) VALUES (
    v_booking_id, NULL, 'checkout_requested', v_customer_id,
    CASE
      WHEN v_checkout_type = 'instructor' THEN 'Customer submitted 2-hour instructor checkout booking request.'
      ELSE 'Customer submitted 2-hour checkout booking request.'
    END
  );

  RETURN QUERY SELECT
    v_booking_id,
    v_booking_reference,
    p_scheduled_start,
    v_scheduled_end,
    'checkout_requested'::text,
    v_estimated_hours,
    v_estimated_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.create_checkout_booking_atomic(uuid, timestamptz, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_checkout_booking_atomic(uuid, timestamptz, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
