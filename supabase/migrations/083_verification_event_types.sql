-- ============================================================================
-- 083_verification_event_types.sql
--
-- Extends verification_events.event_type to support document upload notifications.
-- Keeps all existing allowed values exactly as they are.
-- ============================================================================

ALTER TABLE public.verification_events
  DROP CONSTRAINT IF EXISTS verification_events_event_type_check;

ALTER TABLE public.verification_events
  ADD CONSTRAINT verification_events_event_type_check
    CHECK (event_type IN (
      'submitted',
      'approved',
      'rejected',
      'on_hold',
      'resubmitted',
      'message',
      'document_uploaded'
    ));

