-- Exclude checkout_requested bookings from auto document-hold.
-- Admins review/reject docs on the checkout request page in place; putting
-- those bookings on hold was swapping the UI to the cancel-booking panel.

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

-- Restore checkout requests that were incorrectly held after a document rejection.
DO $$
DECLARE
  v_booking record;
BEGIN
  FOR v_booking IN
    SELECT
      id,
      pre_hold_status
    FROM public.bookings
    WHERE status = 'on_hold_pending_documents'
      AND pre_hold_status = 'checkout_requested'
  LOOP
    UPDATE public.bookings
    SET status = 'checkout_requested',
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
        'checkout_requested',
        auth.uid(),
        'Restored checkout_requested after excluding it from document-hold sync.'
      );
    END IF;
  END LOOP;
END;
$$;
