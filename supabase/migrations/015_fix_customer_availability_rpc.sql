-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Fix Customer Safe Availability RPC
-- Re-establishes the RPC to guarantee schema cache refresh and exact type
-- adherence required for customer bookings.
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_customer_aircraft_calendar_blocks(uuid, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_customer_aircraft_calendar_blocks(
  p_aircraft_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (
  block_id uuid,
  aircraft_id uuid,
  start_time timestamptz,
  end_time timestamptz,
  label text,
  block_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  -- Require authenticated caller.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    sb.id AS block_id,
    sb.aircraft_id,
    sb.start_time,
    sb.end_time,
    -- Determine safe public label
    CASE 
      WHEN sb.is_public_visible = true AND sb.public_label IS NOT NULL THEN sb.public_label
      ELSE 'Unavailable'
    END AS label,
    sb.block_type
  FROM public.schedule_blocks sb
  WHERE sb.aircraft_id = p_aircraft_id
    AND sb.status = 'active'
    AND sb.start_time < p_to
    AND sb.end_time > p_from
    -- Exclude expired temporary holds safely
    AND NOT (
      sb.block_type = 'temporary_hold'
      AND sb.expires_at IS NOT NULL
      AND sb.expires_at <= now()
    )
  ORDER BY sb.start_time;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_customer_aircraft_calendar_blocks(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_aircraft_calendar_blocks(uuid, timestamptz, timestamptz) TO authenticated;
