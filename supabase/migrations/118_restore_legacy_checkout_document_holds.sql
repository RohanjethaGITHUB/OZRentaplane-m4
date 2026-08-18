-- Legacy document triggers could leave checkout requests in
-- on_hold_pending_documents. Checkout requests are reviewed in place and
-- must remain actionable regardless of document status.

DO $$
DECLARE
  v_booking record;
BEGIN
  FOR v_booking IN
    SELECT id
    FROM public.bookings
    WHERE booking_type = 'checkout'
      AND status = 'on_hold_pending_documents'
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
        'Restored legacy checkout request so admin review can continue in place.'
      );
    END IF;
  END LOOP;
END;
$$;
