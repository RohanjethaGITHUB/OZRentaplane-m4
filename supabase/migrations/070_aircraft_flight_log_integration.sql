BEGIN;

ALTER TABLE public.flight_records
  ADD COLUMN IF NOT EXISTS hm_start numeric(10,2),
  ADD COLUMN IF NOT EXISTS hm_stop numeric(10,2),
  ADD COLUMN IF NOT EXISTS oil_actual numeric(8,2);

ALTER TABLE public.flight_records
  ADD COLUMN IF NOT EXISTS hm_total numeric(10,2)
  GENERATED ALWAYS AS (
    CASE WHEN hm_stop IS NOT NULL AND hm_start IS NOT NULL
      THEN hm_stop - hm_start
      ELSE NULL
    END
  ) STORED;

ALTER TABLE public.aircraft_flight_logs
  ADD COLUMN IF NOT EXISTS pic_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'admin_confirmed',
  ADD COLUMN IF NOT EXISTS continuity_warning boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS continuity_warning_details text;

ALTER TABLE public.aircraft_flight_logs
  DROP COLUMN IF EXISTS pic_signature_name,
  DROP COLUMN IF EXISTS pic_signature_image_url;

ALTER TABLE public.aircraft_flight_logs
  DROP CONSTRAINT IF EXISTS aircraft_flight_logs_review_status_check;

ALTER TABLE public.aircraft_flight_logs
  ADD CONSTRAINT aircraft_flight_logs_review_status_check
  CHECK (review_status IN ('pending_admin_review', 'admin_confirmed', 'admin_adjusted'));

ALTER TABLE public.aircraft_flight_logs
  DROP CONSTRAINT IF EXISTS aircraft_flight_logs_source_check;

ALTER TABLE public.aircraft_flight_logs
  ADD CONSTRAINT aircraft_flight_logs_source_check
  CHECK (source IN ('manual_admin_entry', 'checkout_completion', 'booking_customer_post_flight'));

CREATE UNIQUE INDEX IF NOT EXISTS aircraft_flight_logs_related_booking_unique_idx
  ON public.aircraft_flight_logs(related_booking_id)
  WHERE related_booking_id IS NOT NULL;

COMMIT;
