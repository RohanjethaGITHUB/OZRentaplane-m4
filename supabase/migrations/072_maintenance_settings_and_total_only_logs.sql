BEGIN;

-- ============================================================================
-- 1. Extend aircraft_flight_logs source constraint
-- Adds 'opening_balance' (new baseline entries) and preserves
-- 'legacy_checkout_clearance' (may already exist in live data — the admin
-- FlightLogClient UI handles it). DROP + re-ADD is safe because we include
-- every value that was legal under the previous constraint plus the new ones.
-- ============================================================================

ALTER TABLE public.aircraft_flight_logs
  DROP CONSTRAINT IF EXISTS aircraft_flight_logs_source_check;

ALTER TABLE public.aircraft_flight_logs
  ADD CONSTRAINT aircraft_flight_logs_source_check
  CHECK (source IN (
    'manual_admin_entry',
    'checkout_completion',
    'booking_customer_post_flight',
    'legacy_checkout_clearance',
    'opening_balance'
  ));

-- ============================================================================
-- 2. Create aircraft_maintenance_settings table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.aircraft_maintenance_settings (
  id                           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id                  uuid         NOT NULL REFERENCES public.aircraft(id) ON DELETE CASCADE,

  -- Oil change tracking
  last_oil_change_mr           numeric(10,1),
  next_oil_change_due_mr       numeric(10,1),
  oil_change_interval_mr       numeric(10,1) NOT NULL DEFAULT 50,

  -- 100-hour maintenance tracking
  last_100hr_maintenance_mr    numeric(10,1),
  next_100hr_maintenance_due_mr numeric(10,1),
  maintenance_100hr_interval_mr numeric(10,1) NOT NULL DEFAULT 100,

  -- Admin notes
  notes                        text,

  -- Audit
  updated_at                   timestamptz  NOT NULL DEFAULT now(),
  updated_by                   uuid         REFERENCES auth.users(id),

  CONSTRAINT aircraft_maintenance_settings_aircraft_uniq UNIQUE (aircraft_id)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.aircraft_maintenance_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aircraft_maintenance_settings_admin_select ON public.aircraft_maintenance_settings;
CREATE POLICY aircraft_maintenance_settings_admin_select
  ON public.aircraft_maintenance_settings
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

DROP POLICY IF EXISTS aircraft_maintenance_settings_admin_insert ON public.aircraft_maintenance_settings;
CREATE POLICY aircraft_maintenance_settings_admin_insert
  ON public.aircraft_maintenance_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

DROP POLICY IF EXISTS aircraft_maintenance_settings_admin_update ON public.aircraft_maintenance_settings;
CREATE POLICY aircraft_maintenance_settings_admin_update
  ON public.aircraft_maintenance_settings
  FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

-- ============================================================================
-- 3. Seed baseline aircraft_flight_log for aircraft with no existing logs
-- ============================================================================
-- Only inserts if the aircraft has NO flight log entries at all.
-- The baseline uses 'opening_balance' source and 'admin_confirmed' review_status
-- so it acts as the finalized starting point for start/stop chain calculations.

INSERT INTO public.aircraft_flight_logs (
  aircraft_id,
  log_number,
  flight_date,
  pic_name,
  vdo_start,   vdo_stop,   vdo_total,
  tacho_start, tacho_stop, tacho_total,
  air_switch_start, air_switch_stop, air_switch_total,
  mr_start,    mr_stop,    mr_total,
  oil_added,   oil_total,
  fuel_added,  fuel_total,
  source,
  review_status,
  notes
)
SELECT
  a.id,
  COALESCE(
    (SELECT MAX(l.log_number) FROM public.aircraft_flight_logs l WHERE l.aircraft_id = a.id),
    0
  ) + 1,
  CURRENT_DATE,
  'System Baseline',
  14695.4, 14695.4, 0.0,
  377.1,   377.1,   0.0,
  477.8,   477.8,   0.0,
  19850.4, 19850.4, 0.0,
  NULL,    6.0,
  NULL,    45.0,
  'opening_balance',
  'admin_confirmed',
  'Initial aircraft log baseline from latest known readings '
    '(VDO 14695.4, Tacho 377.1, Air Switch 477.8, MR 19850.4). '
    'Oil total 6, Fuel total 45.'
FROM public.aircraft a
WHERE NOT EXISTS (
  SELECT 1 FROM public.aircraft_flight_logs l WHERE l.aircraft_id = a.id
);

-- ============================================================================
-- 4. Seed aircraft_maintenance_settings for all aircraft
-- ============================================================================
-- Next 100-hour due at MR 19903.8 (implies last maintenance at 19803.8).
-- Next oil change due at MR 19903.8 (actual last oil change MR is unconfirmed;
-- last_oil_change_mr is left NULL until admin verifies).

INSERT INTO public.aircraft_maintenance_settings (
  aircraft_id,
  last_100hr_maintenance_mr,
  next_100hr_maintenance_due_mr,
  last_oil_change_mr,
  next_oil_change_due_mr,
  oil_change_interval_mr,
  maintenance_100hr_interval_mr
)
SELECT
  a.id,
  19803.8,
  19903.8,
  NULL,
  19903.8,
  50.0,
  100.0
FROM public.aircraft a
ON CONFLICT (aircraft_id) DO NOTHING;

COMMIT;
