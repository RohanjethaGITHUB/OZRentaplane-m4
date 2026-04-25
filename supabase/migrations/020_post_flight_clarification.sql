-- ============================================================
-- 020_post_flight_clarification.sql
--
-- Adds the flight_record_clarifications table for structured
-- post-flight review clarification requests.
--
-- Design notes:
--   • booking.status stays 'pending_post_flight_review' throughout.
--   • Only flight_record.status changes (needs_clarification /
--     resubmitted).
--   • Customers read their own rows via the booking ownership RLS.
--   • Admins have full access.
--   • The is_resolved + resolved_at columns let us track whether
--     the customer has formally resubmitted after each request,
--     supporting multiple clarification cycles cleanly.
-- ============================================================

CREATE TABLE public.flight_record_clarifications (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_record_id  uuid        NOT NULL REFERENCES public.flight_records(id)  ON DELETE CASCADE,
  booking_id        uuid        NOT NULL REFERENCES public.bookings(id)         ON DELETE CASCADE,
  requested_by      uuid        NOT NULL REFERENCES auth.users(id),
  category          text        NOT NULL,
  message           text        NOT NULL,
  is_resolved       boolean     NOT NULL DEFAULT false,
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_frc_flight_record   ON public.flight_record_clarifications (flight_record_id);
CREATE INDEX idx_frc_booking         ON public.flight_record_clarifications (booking_id);
CREATE INDEX idx_frc_unresolved      ON public.flight_record_clarifications (flight_record_id)
  WHERE NOT is_resolved;

ALTER TABLE public.flight_record_clarifications ENABLE ROW LEVEL SECURITY;

-- Customers can read clarifications for their own bookings.
CREATE POLICY "customers_read_own_flight_record_clarifications"
  ON public.flight_record_clarifications
  FOR SELECT TO authenticated
  USING (
    booking_id IN (
      SELECT id FROM public.bookings
      WHERE booking_owner_user_id = auth.uid()
    )
  );

-- Admins have full access.
CREATE POLICY "admins_all_flight_record_clarifications"
  ON public.flight_record_clarifications
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
