-- ============================================================
-- 012_booking_system.sql
-- Booking system foundation for OZRentAPlane
--
-- Tables (dependency order):
--   1. aircraft
--   2. bookings
--   3. schedule_blocks  (FK to usage_records added after step 4)
--   4. aircraft_usage_records
--   5. ALTER schedule_blocks: add usage_record FK
--   6. flight_records
--   7. aircraft_meter_history
--   8. squawks
--   9. booking_audit_events
--  10. flight_record_attachments
--
-- Reuses existing helpers:
--   public.set_updated_at()   (created in 001_profiles.sql)
--   public.get_own_role()     (created in 001_profiles.sql)
-- ============================================================


-- ── 1. aircraft ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.aircraft (
  id                                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  registration                      text          NOT NULL UNIQUE,
  aircraft_type                     text          NOT NULL,
  display_name                      text          NOT NULL,
  status                            text          NOT NULL DEFAULT 'available',
  default_hourly_rate               numeric(10,2) NOT NULL DEFAULT 0,
  default_preflight_buffer_minutes  integer       NOT NULL DEFAULT 30,
  default_postflight_buffer_minutes integer       NOT NULL DEFAULT 30,
  billing_meter_type                text          NOT NULL DEFAULT 'tacho',
  maintenance_meter_type            text          NOT NULL DEFAULT 'tacho',
  created_at                        timestamptz   NOT NULL DEFAULT now(),
  updated_at                        timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT aircraft_status_check
    CHECK (status IN (
      'available', 'booked', 'dispatched', 'maintenance',
      'grounded', 'admin_blocked', 'inactive'
    )),

  CONSTRAINT aircraft_billing_meter_type_check
    CHECK (billing_meter_type IN ('tacho', 'vdo', 'air_switch', 'add_to_mr')),

  CONSTRAINT aircraft_maintenance_meter_type_check
    CHECK (maintenance_meter_type IN ('tacho', 'vdo', 'air_switch', 'add_to_mr'))
);

CREATE TRIGGER set_aircraft_updated_at
  BEFORE UPDATE ON public.aircraft
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 2. bookings ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bookings (
  id                                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id                       uuid          NOT NULL REFERENCES public.aircraft(id) ON DELETE RESTRICT,
  booking_owner_user_id             uuid          NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  pic_user_id                       uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  pic_name                          text,
  pic_arn                           text,
  scheduled_start                   timestamptz   NOT NULL,
  scheduled_end                     timestamptz   NOT NULL,
  actual_dispatch_time              timestamptz,
  actual_return_time                timestamptz,
  status                            text          NOT NULL DEFAULT 'pending_confirmation',
  cancellation_category             text,
  cancellation_reason               text,
  admin_override_reason             text,
  estimated_hours                   numeric(8,2),
  estimated_amount                  numeric(10,2),
  final_amount                      numeric(10,2),
  payment_status                    text          NOT NULL DEFAULT 'not_started',
  terms_accepted_at                 timestamptz,
  risk_acknowledgement_accepted_at  timestamptz,
  eligibility_snapshot              jsonb,
  customer_notes                    text,
  admin_notes                       text,
  created_at                        timestamptz   NOT NULL DEFAULT now(),
  updated_at                        timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT bookings_time_order_check
    CHECK (scheduled_end > scheduled_start),

  CONSTRAINT bookings_status_check
    CHECK (status IN (
      'draft', 'pending_confirmation', 'confirmed', 'ready_for_dispatch',
      'dispatched', 'awaiting_flight_record', 'flight_record_overdue',
      'pending_post_flight_review', 'needs_clarification', 'post_flight_approved',
      'invoice_generated', 'payment_pending', 'paid', 'completed',
      'cancelled', 'no_show', 'overdue', 'admin_hold'
    )),

  CONSTRAINT bookings_cancellation_category_check
    CHECK (cancellation_category IS NULL OR cancellation_category IN (
      'customer', 'admin', 'weather', 'maintenance', 'safety', 'no_show', 'other'
    )),

  CONSTRAINT bookings_payment_status_check
    CHECK (payment_status IN (
      'not_required', 'not_started', 'deposit_required', 'deposit_paid',
      'hold_placed', 'final_pending', 'invoice_generated', 'paid',
      'failed', 'refunded', 'partially_refunded'
    ))
);

CREATE INDEX IF NOT EXISTS idx_bookings_aircraft_id       ON public.bookings(aircraft_id);
CREATE INDEX IF NOT EXISTS idx_bookings_owner             ON public.bookings(booking_owner_user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_start   ON public.bookings(scheduled_start);
CREATE INDEX IF NOT EXISTS idx_bookings_status            ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_pic_user          ON public.bookings(pic_user_id);

CREATE TRIGGER set_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 3. schedule_blocks ───────────────────────────────────────────────────────
-- Calendar source-of-truth. All aircraft time is controlled here.
-- related_usage_record_id FK is added after aircraft_usage_records is created.
--
-- SECURITY NOTE: internal_reason is admin-only context but PostgreSQL RLS cannot
-- filter individual columns — it filters rows.  The SELECT policy correctly
-- limits WHICH rows customers can read, but any matching row exposes all columns
-- including internal_reason.  Server-side code (server components, server actions)
-- MUST strip internal_reason before passing schedule block data to customer-facing
-- props or API responses.  The availability checker respects includeInternalReasons
-- for this purpose; future UI layers must do the same.

CREATE TABLE IF NOT EXISTS public.schedule_blocks (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id             uuid        NOT NULL REFERENCES public.aircraft(id) ON DELETE CASCADE,
  related_booking_id      uuid        REFERENCES public.bookings(id) ON DELETE SET NULL,
  related_usage_record_id uuid,       -- FK added in step 5 below
  block_type              text        NOT NULL,
  start_time              timestamptz NOT NULL,
  end_time                timestamptz NOT NULL,
  public_label            text,
  internal_reason         text,
  created_by_user_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_role         text        NOT NULL DEFAULT 'system',
  is_public_visible       boolean     NOT NULL DEFAULT false,
  status                  text        NOT NULL DEFAULT 'active',
  expires_at              timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT schedule_blocks_time_order_check
    CHECK (end_time > start_time),

  CONSTRAINT schedule_blocks_block_type_check
    CHECK (block_type IN (
      'customer_booking', 'maintenance', 'admin_unavailable', 'owner_use',
      'inspection', 'cleaning', 'weather_hold', 'grounded', 'ferry',
      'training_check', 'temporary_hold', 'buffer', 'other'
    )),

  CONSTRAINT schedule_blocks_created_by_role_check
    CHECK (created_by_role IN ('customer', 'admin', 'system')),

  CONSTRAINT schedule_blocks_status_check
    CHECK (status IN ('active', 'cancelled', 'expired', 'completed'))
);

CREATE INDEX IF NOT EXISTS idx_schedule_blocks_aircraft_id ON public.schedule_blocks(aircraft_id);
-- Composite index for the availability overlap query:
--   WHERE aircraft_id = $1 AND status = 'active'
--   AND start_time < $end AND end_time > $start
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_avail       ON public.schedule_blocks(aircraft_id, status, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_status      ON public.schedule_blocks(status);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_booking     ON public.schedule_blocks(related_booking_id);

CREATE TRIGGER set_schedule_blocks_updated_at
  BEFORE UPDATE ON public.schedule_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 4. aircraft_usage_records ────────────────────────────────────────────────
-- Records actual aircraft use — customer bookings AND admin/owner use.
-- Meter history is only created after admin approval of a usage record.

CREATE TABLE IF NOT EXISTS public.aircraft_usage_records (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id               uuid        NOT NULL REFERENCES public.aircraft(id) ON DELETE RESTRICT,
  related_booking_id        uuid        REFERENCES public.bookings(id) ON DELETE SET NULL,
  related_schedule_block_id uuid        REFERENCES public.schedule_blocks(id) ON DELETE SET NULL,
  source_type               text        NOT NULL,
  created_by_user_id        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_role           text        NOT NULL DEFAULT 'system',
  pic_name                  text,
  pic_arn                   text,
  usage_date                date        NOT NULL,
  start_time                timestamptz,
  stop_time                 timestamptz,
  status                    text        NOT NULL DEFAULT 'draft',
  approved_by_user_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at               timestamptz,
  admin_notes               text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT usage_records_source_type_check
    CHECK (source_type IN (
      'customer_booking', 'owner_use', 'maintenance_run', 'test_flight',
      'ferry', 'engine_ground_run', 'admin_correction', 'other'
    )),

  CONSTRAINT usage_records_created_by_role_check
    CHECK (created_by_role IN ('customer', 'admin', 'system')),

  CONSTRAINT usage_records_status_check
    CHECK (status IN (
      'draft', 'submitted', 'pending_review', 'needs_clarification',
      'approved', 'approved_with_correction', 'rejected', 'locked'
    ))
);

CREATE INDEX IF NOT EXISTS idx_usage_records_aircraft_id ON public.aircraft_usage_records(aircraft_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_booking     ON public.aircraft_usage_records(related_booking_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_usage_date  ON public.aircraft_usage_records(usage_date DESC);
CREATE INDEX IF NOT EXISTS idx_usage_records_status      ON public.aircraft_usage_records(status);

CREATE TRIGGER set_usage_records_updated_at
  BEFORE UPDATE ON public.aircraft_usage_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 5. Back-fill FK: schedule_blocks → aircraft_usage_records ────────────────

ALTER TABLE public.schedule_blocks
  ADD CONSTRAINT schedule_blocks_usage_record_fk
  FOREIGN KEY (related_usage_record_id)
  REFERENCES public.aircraft_usage_records(id)
  ON DELETE SET NULL;


-- ── 6. flight_records ────────────────────────────────────────────────────────
-- Customer-submitted post-flight readings.  tacho/vdo/air_switch totals are
-- generated columns — stop minus start, NULL when either side is NULL.
-- Official meter history is NOT updated until admin approves.

CREATE TABLE IF NOT EXISTS public.flight_records (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id              uuid          REFERENCES public.bookings(id) ON DELETE SET NULL,
  usage_record_id         uuid          REFERENCES public.aircraft_usage_records(id) ON DELETE SET NULL,
  aircraft_id             uuid          NOT NULL REFERENCES public.aircraft(id) ON DELETE RESTRICT,
  date                    date          NOT NULL,
  pic_name                text,
  pic_arn                 text,

  -- Tacho
  tacho_start             numeric(10,2),
  tacho_stop              numeric(10,2),
  tacho_total             numeric(10,2)
    GENERATED ALWAYS AS (
      CASE WHEN tacho_stop IS NOT NULL AND tacho_start IS NOT NULL
        THEN tacho_stop - tacho_start
        ELSE NULL
      END
    ) STORED,

  -- VDO
  vdo_start               numeric(10,2),
  vdo_stop                numeric(10,2),
  vdo_total               numeric(10,2)
    GENERATED ALWAYS AS (
      CASE WHEN vdo_stop IS NOT NULL AND vdo_start IS NOT NULL
        THEN vdo_stop - vdo_start
        ELSE NULL
      END
    ) STORED,

  -- Air switch
  air_switch_start        numeric(10,2),
  air_switch_stop         numeric(10,2),
  air_switch_total        numeric(10,2)
    GENERATED ALWAYS AS (
      CASE WHEN air_switch_stop IS NOT NULL AND air_switch_start IS NOT NULL
        THEN air_switch_stop - air_switch_start
        ELSE NULL
      END
    ) STORED,

  add_to_mr               numeric(10,2),
  oil_added               numeric(8,2),
  oil_total               numeric(8,2),
  fuel_added              numeric(8,2),
  fuel_actual             numeric(8,2),
  landings                integer,

  customer_notes          text,
  admin_notes             text,

  declaration_accepted_at timestamptz,
  signature_type          text          NOT NULL DEFAULT 'none',
  signature_value         text,

  submitted_by_user_id    uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at            timestamptz,
  status                  text          NOT NULL DEFAULT 'draft',
  review_flags            jsonb,
  approved_by_user_id     uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at             timestamptz,
  correction_reason       text,

  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT flight_records_signature_type_check
    CHECK (signature_type IN ('typed', 'drawn', 'none')),

  CONSTRAINT flight_records_status_check
    CHECK (status IN (
      'draft', 'submitted', 'pending_review', 'needs_clarification',
      'resubmitted', 'approved', 'approved_with_correction', 'rejected', 'locked'
    ))
);

CREATE INDEX IF NOT EXISTS idx_flight_records_booking     ON public.flight_records(booking_id);
CREATE INDEX IF NOT EXISTS idx_flight_records_aircraft    ON public.flight_records(aircraft_id);
CREATE INDEX IF NOT EXISTS idx_flight_records_date        ON public.flight_records(date DESC);
CREATE INDEX IF NOT EXISTS idx_flight_records_status      ON public.flight_records(status);
CREATE INDEX IF NOT EXISTS idx_flight_records_submitted   ON public.flight_records(submitted_by_user_id);

CREATE TRIGGER set_flight_records_updated_at
  BEFORE UPDATE ON public.flight_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 7. aircraft_meter_history ────────────────────────────────────────────────
-- Official approved aircraft meter records.
-- Never written directly from customer input — always requires admin approval.
-- Corrections are auditable via correction_of_history_id + correction_reason.

CREATE TABLE IF NOT EXISTS public.aircraft_meter_history (
  id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id              uuid          NOT NULL REFERENCES public.aircraft(id) ON DELETE RESTRICT,
  source_type              text          NOT NULL,
  source_record_id         uuid          NOT NULL,
  booking_id               uuid          REFERENCES public.bookings(id) ON DELETE SET NULL,
  flight_record_id         uuid          REFERENCES public.flight_records(id) ON DELETE SET NULL,
  meter_type               text          NOT NULL,
  start_reading            numeric(10,2) NOT NULL,
  stop_reading             numeric(10,2) NOT NULL,
  total                    numeric(10,2) NOT NULL,
  is_official              boolean       NOT NULL DEFAULT true,
  is_correction            boolean       NOT NULL DEFAULT false,
  correction_of_history_id uuid          REFERENCES public.aircraft_meter_history(id) ON DELETE SET NULL,
  correction_reason        text,
  entered_by_user_id       uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by_user_id      uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at              timestamptz   NOT NULL DEFAULT now(),
  created_at               timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT meter_history_source_type_check
    CHECK (source_type IN (
      'customer_booking', 'owner_use', 'maintenance_run', 'test_flight',
      'ferry', 'engine_ground_run', 'admin_correction', 'other'
    )),

  CONSTRAINT meter_history_meter_type_check
    CHECK (meter_type IN ('tacho', 'vdo', 'air_switch', 'add_to_mr')),

  CONSTRAINT meter_history_total_nonneg_check
    CHECK (total >= 0)
);

CREATE INDEX IF NOT EXISTS idx_meter_history_aircraft_id  ON public.aircraft_meter_history(aircraft_id);
CREATE INDEX IF NOT EXISTS idx_meter_history_created_at   ON public.aircraft_meter_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meter_history_source       ON public.aircraft_meter_history(source_record_id);
CREATE INDEX IF NOT EXISTS idx_meter_history_flight       ON public.aircraft_meter_history(flight_record_id);


-- ── 8. squawks ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.squawks (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id         uuid        NOT NULL REFERENCES public.aircraft(id) ON DELETE RESTRICT,
  booking_id          uuid        REFERENCES public.bookings(id) ON DELETE SET NULL,
  flight_record_id    uuid        REFERENCES public.flight_records(id) ON DELETE SET NULL,
  reported_by_user_id uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_by_role    text        NOT NULL DEFAULT 'system',
  reported_phase      text        NOT NULL,
  severity            text        NOT NULL DEFAULT 'info_only',
  description         text        NOT NULL,
  status              text        NOT NULL DEFAULT 'open',
  resolution_notes    text,
  resolved_by_user_id uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT squawks_reported_by_role_check
    CHECK (reported_by_role IN ('customer', 'admin', 'system')),

  CONSTRAINT squawks_reported_phase_check
    CHECK (reported_phase IN (
      'pre_flight', 'during_flight', 'post_flight', 'admin_inspection', 'maintenance'
    )),

  CONSTRAINT squawks_severity_check
    CHECK (severity IN (
      'info_only', 'needs_review', 'dispatch_blocked', 'aircraft_grounded'
    )),

  CONSTRAINT squawks_status_check
    CHECK (status IN ('open', 'under_review', 'resolved', 'deferred', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_squawks_aircraft_id ON public.squawks(aircraft_id);
CREATE INDEX IF NOT EXISTS idx_squawks_booking_id  ON public.squawks(booking_id);
CREATE INDEX IF NOT EXISTS idx_squawks_status      ON public.squawks(status);
CREATE INDEX IF NOT EXISTS idx_squawks_severity    ON public.squawks(severity);

CREATE TRIGGER set_squawks_updated_at
  BEFORE UPDATE ON public.squawks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 9. booking_audit_events ──────────────────────────────────────────────────
-- Append-only audit log. No updated_at — rows are never modified.

CREATE TABLE IF NOT EXISTS public.booking_audit_events (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          uuid        REFERENCES public.bookings(id) ON DELETE SET NULL,
  aircraft_id         uuid        REFERENCES public.aircraft(id) ON DELETE SET NULL,
  related_record_type text,
  related_record_id   uuid,
  actor_user_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role          text        NOT NULL DEFAULT 'system',
  event_type          text        NOT NULL,
  event_summary       text        NOT NULL,
  old_value           jsonb,
  new_value           jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT audit_events_actor_role_check
    CHECK (actor_role IN ('customer', 'admin', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_audit_events_booking_id  ON public.booking_audit_events(booking_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_aircraft_id ON public.booking_audit_events(aircraft_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at  ON public.booking_audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_event_type  ON public.booking_audit_events(event_type);


-- ── 10. flight_record_attachments ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.flight_record_attachments (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_record_id    uuid        REFERENCES public.flight_records(id) ON DELETE CASCADE,
  squawk_id           uuid        REFERENCES public.squawks(id) ON DELETE CASCADE,
  booking_id          uuid        REFERENCES public.bookings(id) ON DELETE SET NULL,
  aircraft_id         uuid        REFERENCES public.aircraft(id) ON DELETE SET NULL,
  uploaded_by_user_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  attachment_type     text        NOT NULL,
  storage_path        text        NOT NULL,
  file_name           text        NOT NULL,
  mime_type           text        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT attachments_type_check
    CHECK (attachment_type IN (
      'tacho_photo', 'vdo_photo', 'air_switch_photo', 'fuel_photo',
      'oil_photo', 'damage_photo', 'signature', 'other'
    ))
);

CREATE INDEX IF NOT EXISTS idx_attachments_flight_record ON public.flight_record_attachments(flight_record_id);
CREATE INDEX IF NOT EXISTS idx_attachments_squawk        ON public.flight_record_attachments(squawk_id);
CREATE INDEX IF NOT EXISTS idx_attachments_uploader      ON public.flight_record_attachments(uploaded_by_user_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

-- ── aircraft ─────────────────────────────────────────────────────────────────

ALTER TABLE public.aircraft ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view aircraft"
  ON public.aircraft FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can insert aircraft"
  ON public.aircraft FOR INSERT TO authenticated
  WITH CHECK (public.get_own_role() = 'admin');

CREATE POLICY "Admins can update aircraft"
  ON public.aircraft FOR UPDATE TO authenticated
  USING (public.get_own_role() = 'admin');


-- ── bookings ──────────────────────────────────────────────────────────────────

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can view own bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (
    auth.uid() = booking_owner_user_id
    OR auth.uid() = pic_user_id
    OR public.get_own_role() = 'admin'
  );

CREATE POLICY "Customers can create own bookings"
  ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = booking_owner_user_id
    OR public.get_own_role() = 'admin'
  );

-- Customers may update their own bookings (server actions enforce field-level rules).
-- Admins may update any booking.
CREATE POLICY "Users can update bookings they own"
  ON public.bookings FOR UPDATE TO authenticated
  USING (
    auth.uid() = booking_owner_user_id
    OR public.get_own_role() = 'admin'
  );


-- ── schedule_blocks ───────────────────────────────────────────────────────────

ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;

-- Customers see public blocks plus blocks for their own bookings (without internal_reason).
-- Admins see everything.
CREATE POLICY "Users can view schedule blocks"
  ON public.schedule_blocks FOR SELECT TO authenticated
  USING (
    public.get_own_role() = 'admin'
    OR is_public_visible = true
    OR (
      related_booking_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = related_booking_id
          AND (b.booking_owner_user_id = auth.uid() OR b.pic_user_id = auth.uid())
      )
    )
  );

-- Customers can create blocks tied to their own bookings (buffer + main block on booking creation).
CREATE POLICY "Customers can create blocks for own bookings"
  ON public.schedule_blocks FOR INSERT TO authenticated
  WITH CHECK (
    public.get_own_role() = 'admin'
    OR (
      created_by_role = 'customer'
      AND created_by_user_id = auth.uid()
      AND related_booking_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = related_booking_id
          AND b.booking_owner_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Admins can update schedule blocks"
  ON public.schedule_blocks FOR UPDATE TO authenticated
  USING (public.get_own_role() = 'admin');


-- ── aircraft_usage_records ───────────────────────────────────────────────────

ALTER TABLE public.aircraft_usage_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can view own usage records"
  ON public.aircraft_usage_records FOR SELECT TO authenticated
  USING (
    public.get_own_role() = 'admin'
    OR (
      related_booking_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = related_booking_id
          AND (b.booking_owner_user_id = auth.uid() OR b.pic_user_id = auth.uid())
      )
    )
  );

CREATE POLICY "Admins can insert usage records"
  ON public.aircraft_usage_records FOR INSERT TO authenticated
  WITH CHECK (public.get_own_role() = 'admin');

CREATE POLICY "Admins can update usage records"
  ON public.aircraft_usage_records FOR UPDATE TO authenticated
  USING (public.get_own_role() = 'admin');


-- ── flight_records ───────────────────────────────────────────────────────────

ALTER TABLE public.flight_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can view own flight records"
  ON public.flight_records FOR SELECT TO authenticated
  USING (
    public.get_own_role() = 'admin'
    OR submitted_by_user_id = auth.uid()
    OR (
      booking_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = booking_id
          AND (b.booking_owner_user_id = auth.uid() OR b.pic_user_id = auth.uid())
      )
    )
  );

CREATE POLICY "Customers can submit flight records for own bookings"
  ON public.flight_records FOR INSERT TO authenticated
  WITH CHECK (
    public.get_own_role() = 'admin'
    OR (
      submitted_by_user_id = auth.uid()
      AND booking_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = booking_id
          AND b.booking_owner_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Admins can update flight records"
  ON public.flight_records FOR UPDATE TO authenticated
  USING (public.get_own_role() = 'admin');


-- ── aircraft_meter_history ───────────────────────────────────────────────────
-- Read: admins only by default. Customers have no direct access —
-- their flight record is the customer-facing representation.

ALTER TABLE public.aircraft_meter_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view meter history"
  ON public.aircraft_meter_history FOR SELECT TO authenticated
  USING (public.get_own_role() = 'admin');

CREATE POLICY "Admins can insert meter history"
  ON public.aircraft_meter_history FOR INSERT TO authenticated
  WITH CHECK (public.get_own_role() = 'admin');


-- ── squawks ───────────────────────────────────────────────────────────────────

ALTER TABLE public.squawks ENABLE ROW LEVEL SECURITY;

-- Customers see their own squawks (from bookings they own).
-- Admins see all.
CREATE POLICY "Customers can view own squawks"
  ON public.squawks FOR SELECT TO authenticated
  USING (
    public.get_own_role() = 'admin'
    OR reported_by_user_id = auth.uid()
    OR (
      booking_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = booking_id
          AND (b.booking_owner_user_id = auth.uid() OR b.pic_user_id = auth.uid())
      )
    )
  );

CREATE POLICY "Customers can report squawks for own bookings"
  ON public.squawks FOR INSERT TO authenticated
  WITH CHECK (
    public.get_own_role() = 'admin'
    OR (
      reported_by_user_id = auth.uid()
      AND reported_by_role = 'customer'
      AND booking_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = booking_id
          AND b.booking_owner_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Admins can update squawks"
  ON public.squawks FOR UPDATE TO authenticated
  USING (public.get_own_role() = 'admin');


-- ── booking_audit_events ─────────────────────────────────────────────────────

ALTER TABLE public.booking_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can view audit events for own bookings"
  ON public.booking_audit_events FOR SELECT TO authenticated
  USING (
    public.get_own_role() = 'admin'
    OR (
      booking_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = booking_id
          AND (b.booking_owner_user_id = auth.uid() OR b.pic_user_id = auth.uid())
      )
    )
  );

-- Server actions run in the caller's auth context, so customers and admins
-- both need INSERT to write audit events.
CREATE POLICY "Customers can insert audit events for own bookings"
  ON public.booking_audit_events FOR INSERT TO authenticated
  WITH CHECK (
    public.get_own_role() = 'admin'
    OR (
      actor_role = 'customer'
      AND actor_user_id = auth.uid()
      AND (
        booking_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.id = booking_id
            AND b.booking_owner_user_id = auth.uid()
        )
      )
    )
  );


-- ── flight_record_attachments ────────────────────────────────────────────────

ALTER TABLE public.flight_record_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can view own attachments"
  ON public.flight_record_attachments FOR SELECT TO authenticated
  USING (
    public.get_own_role() = 'admin'
    OR uploaded_by_user_id = auth.uid()
    OR (
      booking_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = booking_id
          AND (b.booking_owner_user_id = auth.uid() OR b.pic_user_id = auth.uid())
      )
    )
  );

CREATE POLICY "Customers can upload attachments"
  ON public.flight_record_attachments FOR INSERT TO authenticated
  WITH CHECK (
    public.get_own_role() = 'admin'
    OR uploaded_by_user_id = auth.uid()
  );

CREATE POLICY "Admins can update attachments"
  ON public.flight_record_attachments FOR UPDATE TO authenticated
  USING (public.get_own_role() = 'admin');


-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY-DEFINER HELPERS
-- ═══════════════════════════════════════════════════════════════════════════

-- get_aircraft_last_meter_stops(aircraft_id)
--
-- Returns the most recent approved stop reading for each meter type on an aircraft.
-- Used by submitFlightRecord (customer server action) to flag start-reading
-- mismatches against the previous approved flight without exposing the full
-- aircraft_meter_history table (which is admin-only via RLS).
--
-- Returns one row per meter type present in history.  Callable by any
-- authenticated user.  Reveals only stop_reading — not source, booking, or
-- correction data.

CREATE OR REPLACE FUNCTION public.get_aircraft_last_meter_stops(p_aircraft_id uuid)
RETURNS TABLE (meter_type text, stop_reading numeric)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT DISTINCT ON (meter_type)
    meter_type,
    stop_reading
  FROM public.aircraft_meter_history
  WHERE aircraft_id = p_aircraft_id
    AND is_official = true
  ORDER BY meter_type, created_at DESC
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: Default aircraft VH-KZG
-- ON CONFLICT DO NOTHING — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.aircraft (
  registration,
  aircraft_type,
  display_name,
  status,
  default_hourly_rate,
  default_preflight_buffer_minutes,
  default_postflight_buffer_minutes,
  billing_meter_type,
  maintenance_meter_type
) VALUES (
  'VH-KZG',
  'Cessna 172',
  'VH-KZG – Cessna 172',
  'available',
  250.00,
  30,
  30,
  'tacho',
  'tacho'
)
ON CONFLICT (registration) DO NOTHING;
