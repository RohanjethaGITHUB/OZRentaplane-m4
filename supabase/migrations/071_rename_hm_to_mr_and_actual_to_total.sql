BEGIN;

-- ============================================================================
-- 1. aircraft_flight_logs
-- ============================================================================

DO $$
DECLARE
  v_count integer;
BEGIN
  -- hm_start -> mr_start
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'aircraft_flight_logs' AND column_name = 'hm_start') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'aircraft_flight_logs' AND column_name = 'mr_start') THEN
      RAISE EXCEPTION 'Both hm_start and mr_start exist in aircraft_flight_logs. Cannot safely rename.';
    ELSE
      ALTER TABLE public.aircraft_flight_logs RENAME COLUMN hm_start TO mr_start;
    END IF;
  END IF;

  -- hm_stop -> mr_stop
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'aircraft_flight_logs' AND column_name = 'hm_stop') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'aircraft_flight_logs' AND column_name = 'mr_stop') THEN
      RAISE EXCEPTION 'Both hm_stop and mr_stop exist in aircraft_flight_logs. Cannot safely rename.';
    ELSE
      ALTER TABLE public.aircraft_flight_logs RENAME COLUMN hm_stop TO mr_stop;
    END IF;
  END IF;

  -- hm_total -> mr_total
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'aircraft_flight_logs' AND column_name = 'hm_total') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'aircraft_flight_logs' AND column_name = 'mr_total') THEN
      RAISE EXCEPTION 'Both hm_total and mr_total exist in aircraft_flight_logs. Cannot safely rename.';
    ELSE
      ALTER TABLE public.aircraft_flight_logs RENAME COLUMN hm_total TO mr_total;
    END IF;
  END IF;

  -- oil_actual -> oil_total
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'aircraft_flight_logs' AND column_name = 'oil_actual') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'aircraft_flight_logs' AND column_name = 'oil_total') THEN
      EXECUTE 'SELECT count(*) FROM public.aircraft_flight_logs WHERE oil_total IS NOT NULL AND oil_actual IS NOT NULL AND oil_total <> oil_actual' INTO v_count;
      IF v_count > 0 THEN
        RAISE EXCEPTION 'Data conflict detected in aircraft_flight_logs.oil_total and oil_actual. % conflicts found.', v_count;
      ELSE
        EXECUTE 'UPDATE public.aircraft_flight_logs SET oil_total = COALESCE(oil_actual, oil_total)';
        ALTER TABLE public.aircraft_flight_logs DROP COLUMN oil_actual;
      END IF;
    ELSE
      ALTER TABLE public.aircraft_flight_logs RENAME COLUMN oil_actual TO oil_total;
    END IF;
  END IF;

  -- fuel_actual -> fuel_total
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'aircraft_flight_logs' AND column_name = 'fuel_actual') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'aircraft_flight_logs' AND column_name = 'fuel_total') THEN
      EXECUTE 'SELECT count(*) FROM public.aircraft_flight_logs WHERE fuel_total IS NOT NULL AND fuel_actual IS NOT NULL AND fuel_total <> fuel_actual' INTO v_count;
      IF v_count > 0 THEN
        RAISE EXCEPTION 'Data conflict detected in aircraft_flight_logs.fuel_total and fuel_actual. % conflicts found.', v_count;
      ELSE
        EXECUTE 'UPDATE public.aircraft_flight_logs SET fuel_total = COALESCE(fuel_actual, fuel_total)';
        ALTER TABLE public.aircraft_flight_logs DROP COLUMN fuel_actual;
      END IF;
    ELSE
      ALTER TABLE public.aircraft_flight_logs RENAME COLUMN fuel_actual TO fuel_total;
    END IF;
  END IF;

  -- constraint rename
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aircraft_flight_logs_hm_check') THEN
    ALTER TABLE public.aircraft_flight_logs RENAME CONSTRAINT aircraft_flight_logs_hm_check TO aircraft_flight_logs_mr_check;
  END IF;
END $$;


-- ============================================================================
-- 2. flight_records
-- ============================================================================

DO $$
DECLARE
  v_count integer;
BEGIN
  -- hm_start -> mr_start
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'flight_records' AND column_name = 'hm_start') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'flight_records' AND column_name = 'mr_start') THEN
      RAISE EXCEPTION 'Both hm_start and mr_start exist in flight_records. Cannot safely rename.';
    ELSE
      ALTER TABLE public.flight_records RENAME COLUMN hm_start TO mr_start;
    END IF;
  END IF;

  -- hm_stop -> mr_stop
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'flight_records' AND column_name = 'hm_stop') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'flight_records' AND column_name = 'mr_stop') THEN
      RAISE EXCEPTION 'Both hm_stop and mr_stop exist in flight_records. Cannot safely rename.';
    ELSE
      ALTER TABLE public.flight_records RENAME COLUMN hm_stop TO mr_stop;
    END IF;
  END IF;

  -- hm_total -> mr_total
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'flight_records' AND column_name = 'hm_total') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'flight_records' AND column_name = 'mr_total') THEN
      RAISE EXCEPTION 'Both hm_total and mr_total exist in flight_records. Cannot safely rename.';
    ELSE
      ALTER TABLE public.flight_records RENAME COLUMN hm_total TO mr_total;
    END IF;
  END IF;

  -- oil_actual -> oil_total
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'flight_records' AND column_name = 'oil_actual') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'flight_records' AND column_name = 'oil_total') THEN
      EXECUTE 'SELECT count(*) FROM public.flight_records WHERE oil_total IS NOT NULL AND oil_actual IS NOT NULL AND oil_total <> oil_actual' INTO v_count;
      IF v_count > 0 THEN
        RAISE EXCEPTION 'Data conflict detected in flight_records.oil_total and oil_actual. % conflicts found.', v_count;
      ELSE
        EXECUTE 'UPDATE public.flight_records SET oil_total = COALESCE(oil_actual, oil_total)';
        ALTER TABLE public.flight_records DROP COLUMN oil_actual;
      END IF;
    ELSE
      ALTER TABLE public.flight_records RENAME COLUMN oil_actual TO oil_total;
    END IF;
  END IF;

  -- fuel_actual -> fuel_total
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'flight_records' AND column_name = 'fuel_actual') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'flight_records' AND column_name = 'fuel_total') THEN
      EXECUTE 'SELECT count(*) FROM public.flight_records WHERE fuel_total IS NOT NULL AND fuel_actual IS NOT NULL AND fuel_total <> fuel_actual' INTO v_count;
      IF v_count > 0 THEN
        RAISE EXCEPTION 'Data conflict detected in flight_records.fuel_total and fuel_actual. % conflicts found.', v_count;
      ELSE
        EXECUTE 'UPDATE public.flight_records SET fuel_total = COALESCE(fuel_actual, fuel_total)';
        ALTER TABLE public.flight_records DROP COLUMN fuel_actual;
      END IF;
    ELSE
      ALTER TABLE public.flight_records RENAME COLUMN fuel_actual TO fuel_total;
    END IF;
  END IF;

END $$;

COMMIT;
