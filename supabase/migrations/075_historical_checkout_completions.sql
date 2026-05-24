BEGIN;

CREATE TABLE IF NOT EXISTS public.historical_checkout_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  checkout_date date NOT NULL,
  checkout_outcome text NOT NULL CHECK (checkout_outcome IN (
    'cleared_to_fly',
    'additional_checkout_required',
    'not_currently_eligible'
  )),
  admin_notes text,
  recorded_by_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  linked_aircraft_flight_log_id uuid REFERENCES public.aircraft_flight_logs(id) ON DELETE SET NULL,
  created_flight_log boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'historical_admin' CHECK (source = 'historical_admin'),
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS historical_checkout_completions_customer_idx
  ON public.historical_checkout_completions (customer_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS historical_checkout_completions_log_idx
  ON public.historical_checkout_completions (linked_aircraft_flight_log_id);

CREATE UNIQUE INDEX IF NOT EXISTS historical_checkout_completions_one_active_per_customer
  ON public.historical_checkout_completions (customer_id)
  WHERE is_active;

ALTER TABLE public.historical_checkout_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS historical_checkout_completions_admin_select ON public.historical_checkout_completions;
CREATE POLICY historical_checkout_completions_admin_select
  ON public.historical_checkout_completions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS historical_checkout_completions_admin_insert ON public.historical_checkout_completions;
CREATE POLICY historical_checkout_completions_admin_insert
  ON public.historical_checkout_completions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS historical_checkout_completions_admin_update ON public.historical_checkout_completions;
CREATE POLICY historical_checkout_completions_admin_update
  ON public.historical_checkout_completions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
