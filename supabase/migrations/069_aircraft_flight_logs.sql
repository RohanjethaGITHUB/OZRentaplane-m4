BEGIN;

CREATE TABLE IF NOT EXISTS public.aircraft_flight_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id uuid NOT NULL REFERENCES public.aircraft(id) ON DELETE CASCADE,
  log_number integer NOT NULL,
  flight_date date NOT NULL,

  pic_name text NOT NULL,
  pic_arn text,

  vdo_start numeric(10,1),
  vdo_stop numeric(10,1),
  vdo_total numeric(10,1),

  tacho_start numeric(10,1),
  tacho_stop numeric(10,1),
  tacho_total numeric(10,1),

  air_switch_start numeric(10,1),
  air_switch_stop numeric(10,1),
  air_switch_total numeric(10,1),

  hm_start numeric(10,1),
  hm_stop numeric(10,1),
  hm_total numeric(10,1),

  oil_added numeric(10,1),
  oil_actual numeric(10,1),

  fuel_added numeric(10,1),
  fuel_actual numeric(10,1),

  landings integer,

  pic_signature_name text,
  pic_signature_image_url text,

  notes text,

  source text NOT NULL DEFAULT 'manual_admin_entry',
  related_booking_id uuid NULL REFERENCES public.bookings(id) ON DELETE SET NULL,

  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT aircraft_flight_logs_aircraft_log_number_uniq UNIQUE (aircraft_id, log_number),
  CONSTRAINT aircraft_flight_logs_landings_check CHECK (landings IS NULL OR landings >= 0),
  CONSTRAINT aircraft_flight_logs_vdo_check CHECK (vdo_start IS NULL OR vdo_stop IS NULL OR vdo_stop >= vdo_start),
  CONSTRAINT aircraft_flight_logs_tacho_check CHECK (tacho_start IS NULL OR tacho_stop IS NULL OR tacho_stop >= tacho_start),
  CONSTRAINT aircraft_flight_logs_air_switch_check CHECK (air_switch_start IS NULL OR air_switch_stop IS NULL OR air_switch_stop >= air_switch_start),
  CONSTRAINT aircraft_flight_logs_hm_check CHECK (hm_start IS NULL OR hm_stop IS NULL OR hm_stop >= hm_start)
);

CREATE INDEX IF NOT EXISTS aircraft_flight_logs_aircraft_id_idx
  ON public.aircraft_flight_logs (aircraft_id);

CREATE INDEX IF NOT EXISTS aircraft_flight_logs_flight_date_idx
  ON public.aircraft_flight_logs (flight_date);

CREATE INDEX IF NOT EXISTS aircraft_flight_logs_related_booking_id_idx
  ON public.aircraft_flight_logs (related_booking_id);

ALTER TABLE public.aircraft_flight_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aircraft_flight_logs_admin_select ON public.aircraft_flight_logs;
CREATE POLICY aircraft_flight_logs_admin_select
  ON public.aircraft_flight_logs
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS aircraft_flight_logs_admin_insert ON public.aircraft_flight_logs;
CREATE POLICY aircraft_flight_logs_admin_insert
  ON public.aircraft_flight_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS aircraft_flight_logs_admin_update ON public.aircraft_flight_logs;
CREATE POLICY aircraft_flight_logs_admin_update
  ON public.aircraft_flight_logs
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS aircraft_flight_logs_admin_delete ON public.aircraft_flight_logs;
CREATE POLICY aircraft_flight_logs_admin_delete
  ON public.aircraft_flight_logs
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

COMMIT;
