-- ============================================================================
-- 082_document_flow_redesign.sql
--
-- Adds booking hold/restoration support for document review failures.
-- Creates automated helpers that move future bookings onto hold when a
-- required document is rejected, and restores them once all required
-- documents are approved again.
-- ============================================================================

BEGIN;

-- ── 1. bookings.status support for document-review hold ─────────────────────

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
    CHECK (status IN (
      -- Standard booking lifecycle
      'draft',
      'pending_confirmation',
      'confirmed',
      'ready_for_dispatch',
      'dispatched',
      'awaiting_flight_record',
      'flight_record_overdue',
      'pending_post_flight_review',
      'needs_clarification',
      'post_flight_approved',
      'invoice_generated',
      'payment_pending',
      'paid',
      'completed',
      'cancelled',
      'no_show',
      'overdue',
      'admin_hold',
      -- Checkout booking statuses
      'checkout_requested',
      'checkout_confirmed',
      'checkout_completed_under_review',
      'checkout_payment_required',
      -- Document-review hold
      'on_hold_pending_documents',
      -- Provisional first-solo reservation
      'pending_checkout_clearance',
      -- Released because checkout outcome was not clearance
      'released_due_to_checkout',
      -- Late cancellation submitted by customer, awaiting admin review
      'cancellation_requested'
    ));

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS pre_hold_status text;

-- ── 2. profiles terms acceptance tracking ───────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_version text;

-- ── 3. Put future bookings on hold when documents are rejected ─────────────

CREATE OR REPLACE FUNCTION public.set_bookings_on_hold_for_customer(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking record;
BEGIN
  FOR v_booking IN
    SELECT
      id,
      status
    FROM public.bookings
    WHERE booking_owner_user_id = p_customer_id
      AND scheduled_start > now()
      AND status IN (
        'confirmed',
        'checkout_confirmed',
        'ready_for_dispatch',
        'checkout_requested',
        'pending_confirmation'
      )
    ORDER BY scheduled_start ASC, created_at ASC
  LOOP
    UPDATE public.bookings
    SET pre_hold_status = v_booking.status,
        status = 'on_hold_pending_documents',
        updated_at = now()
    WHERE id = v_booking.id
      AND status = v_booking.status
      AND status <> 'on_hold_pending_documents';

    IF FOUND THEN
      INSERT INTO public.booking_status_history (
        booking_id,
        old_status,
        new_status,
        changed_by_user_id,
        note
      ) VALUES (
        v_booking.id,
        v_booking.status,
        'on_hold_pending_documents',
        auth.uid(),
        'Booking placed on hold pending required documents.'
      );
    END IF;
  END LOOP;
END;
$$;

-- ── 4. Restore bookings once all required docs are approved ─────────────────

CREATE OR REPLACE FUNCTION public.restore_bookings_from_hold_for_customer(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_all_required_docs_approved boolean := false;
  v_booking record;
BEGIN
  WITH latest_required_docs AS (
    SELECT DISTINCT ON (document_type)
      document_type,
      status
    FROM public.user_documents
    WHERE user_id = p_customer_id
      AND document_type IN (
        'pilot_licence',
        'medical_certificate',
        'photo_id'
      )
    ORDER BY document_type, created_at DESC, updated_at DESC, id DESC
  )
  SELECT
    COUNT(*) = 3
    AND COALESCE(BOOL_AND(status = 'approved'), false)
  INTO v_all_required_docs_approved
  FROM latest_required_docs;

  IF NOT v_all_required_docs_approved THEN
    RETURN;
  END IF;

  FOR v_booking IN
    SELECT
      id,
      status,
      pre_hold_status
    FROM public.bookings
    WHERE booking_owner_user_id = p_customer_id
      AND scheduled_start > now()
      AND status = 'on_hold_pending_documents'
    ORDER BY scheduled_start ASC, created_at ASC
  LOOP
    UPDATE public.bookings
    SET status = COALESCE(v_booking.pre_hold_status, 'confirmed'),
        pre_hold_status = NULL,
        updated_at = now()
    WHERE id = v_booking.id
      AND status = 'on_hold_pending_documents';

    IF FOUND THEN
      INSERT INTO public.booking_status_history (
        booking_id,
        old_status,
        new_status,
        changed_by_user_id,
        note
      ) VALUES (
        v_booking.id,
        'on_hold_pending_documents',
        COALESCE(v_booking.pre_hold_status, 'confirmed'),
        auth.uid(),
        'Booking restored after required documents were approved.'
      );
    END IF;
  END LOOP;
END;
$$;

-- ── 5. Trigger user_documents updates into booking hold changes ────────────

CREATE OR REPLACE FUNCTION public.sync_booking_hold_state_from_user_documents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'rejected' THEN
    PERFORM public.set_bookings_on_hold_for_customer(NEW.user_id);
  ELSIF NEW.status = 'approved' THEN
    PERFORM public.restore_bookings_from_hold_for_customer(NEW.user_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_documents_sync_booking_hold_state ON public.user_documents;

CREATE TRIGGER trg_user_documents_sync_booking_hold_state
  AFTER INSERT OR UPDATE ON public.user_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_booking_hold_state_from_user_documents();

NOTIFY pgrst, 'reload schema';

COMMIT;
