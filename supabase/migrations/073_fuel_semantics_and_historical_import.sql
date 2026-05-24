BEGIN;

-- ============================================================================
-- 1. Rename fuel_total to fuel_returned in aircraft_flight_logs
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'aircraft_flight_logs' AND column_name = 'fuel_total') THEN
    ALTER TABLE public.aircraft_flight_logs RENAME COLUMN fuel_total TO fuel_returned;
  END IF;
END $$;

-- ============================================================================
-- 2. Rename fuel_total to fuel_returned in flight_records
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'flight_records' AND column_name = 'fuel_total') THEN
    ALTER TABLE public.flight_records RENAME COLUMN fuel_total TO fuel_returned;
  END IF;
END $$;

-- ============================================================================
-- 3. Extend aircraft_flight_logs source constraint for paper_log_import
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
    'opening_balance',
    'paper_log_import'
  ));

-- ============================================================================
-- 4. Update Opening Balance & Insert Historical Logs for VH-KZG
-- ============================================================================
DO $$
DECLARE
  v_aircraft_id uuid;
BEGIN
  -- Find VH-KZG
  SELECT id INTO v_aircraft_id FROM public.aircraft WHERE registration = 'VH-KZG' LIMIT 1;
  
  IF v_aircraft_id IS NOT NULL THEN
    
    -- Update existing opening_balance to be the start point BEFORE the paper logs
    UPDATE public.aircraft_flight_logs
    SET 
      flight_date = '2026-04-04',
      pic_name = 'System Baseline',
      vdo_start = 14683.7, vdo_stop = 14683.7, vdo_total = 0.0,
      tacho_start = 368.0, tacho_stop = 368.0, tacho_total = 0.0,
      air_switch_start = 469.4, air_switch_stop = 469.4, air_switch_total = 0.0,
      mr_start = 19842.0, mr_stop = 19842.0, mr_total = 0.0,
      oil_added = NULL, oil_total = 6.0,
      fuel_added = NULL, fuel_returned = NULL,
      notes = 'Opening readings before digitized paper flight log import',
      -- Just a placeholder, we re-sequence at the end anyway
      log_number = 1
    WHERE aircraft_id = v_aircraft_id AND source = 'opening_balance';

    -- Insert Row 1
    IF NOT EXISTS (SELECT 1 FROM public.aircraft_flight_logs WHERE aircraft_id = v_aircraft_id AND source = 'paper_log_import' AND flight_date = '2026-04-04' AND vdo_start = 14683.7) THEN
      INSERT INTO public.aircraft_flight_logs (
        aircraft_id, log_number, flight_date, pic_name, pic_arn,
        vdo_start, vdo_stop, vdo_total,
        tacho_start, tacho_stop, tacho_total,
        air_switch_start, air_switch_stop, air_switch_total,
        mr_start, mr_stop, mr_total,
        oil_added, oil_total, fuel_added, fuel_returned, landings,
        source, review_status, notes
      ) VALUES (
        v_aircraft_id, 2, '2026-04-04', 'A. Abebe', '1007498',
        14683.7, 14685.4, 1.7,
        368.0, 369.3, 1.3,
        469.4, 470.6, 1.2,
        19842.0, 19843.2, 1.2,
        NULL, 6, 40, 100, 3,
        'paper_log_import', 'admin_confirmed', 'Digitized from paper flight log.'
      );
    END IF;

    -- Row 2
    IF NOT EXISTS (SELECT 1 FROM public.aircraft_flight_logs WHERE aircraft_id = v_aircraft_id AND source = 'paper_log_import' AND flight_date = '2026-04-06' AND vdo_start = 14685.4) THEN
      INSERT INTO public.aircraft_flight_logs (
        aircraft_id, log_number, flight_date, pic_name, pic_arn,
        vdo_start, vdo_stop, vdo_total,
        tacho_start, tacho_stop, tacho_total,
        air_switch_start, air_switch_stop, air_switch_total,
        mr_start, mr_stop, mr_total,
        oil_added, oil_total, fuel_added, fuel_returned, landings,
        source, review_status, notes
      ) VALUES (
        v_aircraft_id, 3, '2026-04-06', 'R. Banks', '545933',
        14685.4, 14686.5, 1.1,
        369.3, 370.1, 0.8,
        470.6, 471.3, 0.7,
        19843.2, 19843.9, 0.7,
        NULL, 6, NULL, 60, 3,
        'paper_log_import', 'admin_confirmed', 'Digitized from paper flight log.'
      );
    END IF;

    -- Row 3
    IF NOT EXISTS (SELECT 1 FROM public.aircraft_flight_logs WHERE aircraft_id = v_aircraft_id AND source = 'paper_log_import' AND flight_date = '2026-04-14' AND vdo_start = 14686.5) THEN
      INSERT INTO public.aircraft_flight_logs (
        aircraft_id, log_number, flight_date, pic_name, pic_arn,
        vdo_start, vdo_stop, vdo_total,
        tacho_start, tacho_stop, tacho_total,
        air_switch_start, air_switch_stop, air_switch_total,
        mr_start, mr_stop, mr_total,
        oil_added, oil_total, fuel_added, fuel_returned, landings,
        source, review_status, notes
      ) VALUES (
        v_aircraft_id, 4, '2026-04-14', 'M. Swiesah', '1036150',
        14686.5, 14687.5, 1.0,
        370.1, 370.8, 0.7,
        471.3, 471.9, 0.6,
        19843.9, 19844.5, 0.6,
        NULL, 6, NULL, 30, 1,
        'paper_log_import', 'admin_confirmed', 'Digitized from paper flight log. PIC name partly unclear from handwriting.'
      );
    END IF;

    -- Row 4
    IF NOT EXISTS (SELECT 1 FROM public.aircraft_flight_logs WHERE aircraft_id = v_aircraft_id AND source = 'paper_log_import' AND flight_date = '2026-04-19' AND vdo_start = 14687.5) THEN
      INSERT INTO public.aircraft_flight_logs (
        aircraft_id, log_number, flight_date, pic_name, pic_arn,
        vdo_start, vdo_stop, vdo_total,
        tacho_start, tacho_stop, tacho_total,
        air_switch_start, air_switch_stop, air_switch_total,
        mr_start, mr_stop, mr_total,
        oil_added, oil_total, fuel_added, fuel_returned, landings,
        source, review_status, notes
      ) VALUES (
        v_aircraft_id, 5, '2026-04-19', 'R. Banks', '545933',
        14687.5, 14688.8, 1.3,
        370.8, 371.8, 1.0,
        471.9, 472.9, 1.0,
        19844.5, 19845.5, 1.0,
        NULL, 6, 70, 120, 1,
        'paper_log_import', 'admin_confirmed', 'Digitized from paper flight log.'
      );
    END IF;

    -- Row 5
    IF NOT EXISTS (SELECT 1 FROM public.aircraft_flight_logs WHERE aircraft_id = v_aircraft_id AND source = 'paper_log_import' AND flight_date = '2026-04-21' AND vdo_start = 14688.8) THEN
      INSERT INTO public.aircraft_flight_logs (
        aircraft_id, log_number, flight_date, pic_name, pic_arn,
        vdo_start, vdo_stop, vdo_total,
        tacho_start, tacho_stop, tacho_total,
        air_switch_start, air_switch_stop, air_switch_total,
        mr_start, mr_stop, mr_total,
        oil_added, oil_total, fuel_added, fuel_returned, landings,
        source, review_status, notes
      ) VALUES (
        v_aircraft_id, 6, '2026-04-21', 'A. Abebe', '1007498',
        14688.8, 14691.3, 2.5,
        371.8, 373.9, 2.1,
        472.9, 474.8, 1.9,
        19845.5, 19847.4, 1.9,
        NULL, 5.5, 30, 110, 3,
        'paper_log_import', 'admin_confirmed', 'Digitized from paper flight log.'
      );
    END IF;

    -- Row 6
    IF NOT EXISTS (SELECT 1 FROM public.aircraft_flight_logs WHERE aircraft_id = v_aircraft_id AND source = 'paper_log_import' AND flight_date = '2026-05-10' AND vdo_start = 14691.3) THEN
      INSERT INTO public.aircraft_flight_logs (
        aircraft_id, log_number, flight_date, pic_name, pic_arn,
        vdo_start, vdo_stop, vdo_total,
        tacho_start, tacho_stop, tacho_total,
        air_switch_start, air_switch_stop, air_switch_total,
        mr_start, mr_stop, mr_total,
        oil_added, oil_total, fuel_added, fuel_returned, landings,
        source, review_status, notes
      ) VALUES (
        v_aircraft_id, 7, '2026-05-10', 'V. Vaishampayan', '126446',
        14691.3, 14692.6, 1.3,
        373.9, 375.0, 1.1,
        474.8, 475.9, 1.1,
        19847.4, 19848.5, 1.1,
        1, 6, 73, NULL, 4,
        'paper_log_import', 'admin_confirmed', 'Digitized from paper flight log. Fuel returned value unclear/blank in paper log.'
      );
    END IF;

    -- Row 7
    IF NOT EXISTS (SELECT 1 FROM public.aircraft_flight_logs WHERE aircraft_id = v_aircraft_id AND source = 'paper_log_import' AND flight_date = '2026-05-10' AND vdo_start = 14692.6) THEN
      INSERT INTO public.aircraft_flight_logs (
        aircraft_id, log_number, flight_date, pic_name, pic_arn,
        vdo_start, vdo_stop, vdo_total,
        tacho_start, tacho_stop, tacho_total,
        air_switch_start, air_switch_stop, air_switch_total,
        mr_start, mr_stop, mr_total,
        oil_added, oil_total, fuel_added, fuel_returned, landings,
        source, review_status, notes
      ) VALUES (
        v_aircraft_id, 8, '2026-05-10', 'V. Vaishampayan', '126446',
        14692.6, 14693.7, 1.1,
        375.0, 375.9, 0.9,
        475.9, 476.7, 0.8,
        19848.5, 19849.3, 0.8,
        NULL, 6, NULL, NULL, 1,
        'paper_log_import', 'admin_confirmed', 'Digitized from paper flight log. Fuel values unclear/blank in paper log.'
      );
    END IF;

    -- Row 8
    IF NOT EXISTS (SELECT 1 FROM public.aircraft_flight_logs WHERE aircraft_id = v_aircraft_id AND source = 'paper_log_import' AND flight_date = '2026-05-17' AND vdo_start = 14693.7) THEN
      INSERT INTO public.aircraft_flight_logs (
        aircraft_id, log_number, flight_date, pic_name, pic_arn,
        vdo_start, vdo_stop, vdo_total,
        tacho_start, tacho_stop, tacho_total,
        air_switch_start, air_switch_stop, air_switch_total,
        mr_start, mr_stop, mr_total,
        oil_added, oil_total, fuel_added, fuel_returned, landings,
        source, review_status, notes
      ) VALUES (
        v_aircraft_id, 9, '2026-05-17', 'J. Pena', '111345',
        14693.7, 14695.4, 1.7,
        375.9, 377.1, 1.2,
        476.7, 477.8, 1.1,
        19849.3, 19850.4, 1.1,
        NULL, 6, 50, 45, 2,
        'paper_log_import', 'admin_confirmed', 'Digitized from paper flight log.'
      );
    END IF;

    -- Drop the unique constraint temporarily while re-sequencing to avoid transient collisions
    ALTER TABLE public.aircraft_flight_logs DROP CONSTRAINT IF EXISTS aircraft_flight_logs_aircraft_log_number_uniq;

    -- Re-sequence log numbers sequentially by flight_date and vdo_start, keeping opening_balance first
    -- This handles any conflicts with existing future logs (e.g. if a log was inserted at log_number 2 before this migration)
    WITH sequenced AS (
      SELECT id, ROW_NUMBER() OVER (
        ORDER BY 
          CASE WHEN source = 'opening_balance' THEN 0 ELSE 1 END,
          flight_date, 
          vdo_start,
          created_at
      ) as new_log_number
      FROM public.aircraft_flight_logs
      WHERE aircraft_id = v_aircraft_id
    )
    UPDATE public.aircraft_flight_logs a
    SET log_number = s.new_log_number
    FROM sequenced s
    WHERE a.id = s.id AND a.log_number != s.new_log_number;
    
    -- Re-add the unique constraint
    ALTER TABLE public.aircraft_flight_logs ADD CONSTRAINT aircraft_flight_logs_aircraft_log_number_uniq UNIQUE (aircraft_id, log_number);
    
  END IF;
END $$;

COMMIT;
