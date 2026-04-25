-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 016: Ensure Customer Aircraft Calendar RPC
--
-- Definitively recreates get_customer_aircraft_calendar_blocks with a clean,
-- canonical signature. Safe to re-run — DROP IF EXISTS + CREATE OR REPLACE.
--
-- Root cause addressed: migration 015 may have applied the DROP but the
-- CREATE failed, leaving the function absent from the schema cache (PGRST202).
-- This migration re-establishes it unconditionally and notifies PostgREST.
--
-- Parameters (JS callers must match exactly):
--   p_aircraft_id  uuid
--   p_from         timestamptz
--   p_to           timestamptz
--
-- Returns per row:
--   block_id       uuid
--   aircraft_id    uuid
--   start_time     timestamptz
--   end_time       timestamptz
--   label          text    (safe public label — never exposes internal_reason)
--   block_type     text
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop all known overloads so we have a clean slate.
DROP FUNCTION IF EXISTS public.get_customer_aircraft_calendar_blocks(uuid, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_customer_aircraft_calendar_blocks(
  p_aircraft_id uuid,
  p_from        timestamptz,
  p_to          timestamptz
)
RETURNS TABLE (
  block_id    uuid,
  aircraft_id uuid,
  start_time  timestamptz,
  end_time    timestamptz,
  label       text,
  block_type  text
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
    sb.id            AS block_id,
    sb.aircraft_id,
    sb.start_time,
    sb.end_time,
    -- Derive a safe public label; never expose internal_reason.
    CASE
      WHEN sb.is_public_visible = true AND sb.public_label IS NOT NULL
        THEN sb.public_label
      ELSE 'Unavailable'
    END              AS label,
    sb.block_type
  FROM public.schedule_blocks sb
  WHERE sb.aircraft_id = p_aircraft_id
    AND sb.status      = 'active'
    AND sb.start_time  < p_to
    AND sb.end_time    > p_from
    -- Exclude expired temporary holds.
    AND NOT (
      sb.block_type  = 'temporary_hold'
      AND sb.expires_at IS NOT NULL
      AND sb.expires_at <= now()
    )
  ORDER BY sb.start_time;
END;
$$;

-- Restrict execution to authenticated users only.
REVOKE EXECUTE
  ON FUNCTION public.get_customer_aircraft_calendar_blocks(uuid, timestamptz, timestamptz)
  FROM PUBLIC;

GRANT EXECUTE
  ON FUNCTION public.get_customer_aircraft_calendar_blocks(uuid, timestamptz, timestamptz)
  TO authenticated;

-- Notify PostgREST to reload its schema cache immediately.
-- Required when the function was previously absent (PGRST202 scenario).
NOTIFY pgrst, 'reload schema';
