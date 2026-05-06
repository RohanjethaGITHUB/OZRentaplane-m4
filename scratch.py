import re

with open('supabase/migrations/049_standard_booking_billing.sql', 'r') as f:
    content = f.read()

# 1. complete_checkout_outcome_atomic
# Add v_unit_amount_cents
content = content.replace('v_airport_active         boolean;', 'v_airport_active         boolean;\n  v_unit_amount_cents      integer;')

# Add Admin Check
admin_check = """
  -- ── Auth check ────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- ── Idempotency guard ─────────────────────────────────────────────────────"""
content = content.replace('  -- ── Idempotency guard ─────────────────────────────────────────────────────', admin_check, 1)

# Correct literals
content = content.replace("'cleared_to_fly', 'additional_checkout_required',\n    'checkout_reschedule_required', 'not_currently_eligible'",
"'cleared_to_fly', 'additional_supervised_time_required',\n    'reschedule_required', 'not_currently_eligible'")

# Validate booking_owner_user_id
owner_check = """  IF v_booking.status <> 'checkout_completed_under_review' THEN
    RAISE EXCEPTION 'Booking status must be checkout_completed_under_review, got: %', v_booking.status;
  END IF;
  IF v_booking.booking_owner_user_id <> p_customer_id THEN
    RAISE EXCEPTION 'Customer ID mismatch';
  END IF;"""
content = content.replace("  IF v_booking.status <> 'checkout_completed_under_review' THEN\n    RAISE EXCEPTION 'Booking status must be checkout_completed_under_review, got: %', v_booking.status;\n  END IF;", owner_check)

# Server-side airport fee lookup (validation loop)
old_lookup1 = """    SELECT is_active INTO v_airport_active FROM airports WHERE id = v_airport_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Airport not found: %', v_airport_id;
    END IF;
    IF NOT v_airport_active THEN
      RAISE EXCEPTION 'Airport is not active: %', v_airport_id;
    END IF;
    v_landing_subtotal_cents := v_landing_subtotal_cents + (v_landing_rate_cents * v_airport_count);"""
new_lookup1 = """    SELECT is_active, default_landing_fee_cents INTO v_airport_active, v_unit_amount_cents FROM airports WHERE id = v_airport_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Airport not found: %', v_airport_id;
    END IF;
    IF NOT v_airport_active THEN
      RAISE EXCEPTION 'Airport is not active: %', v_airport_id;
    END IF;
    v_landing_subtotal_cents := v_landing_subtotal_cents + (v_unit_amount_cents * v_airport_count);"""
content = content.replace(old_lookup1, new_lookup1)

# Server-side airport fee lookup (insert loop)
old_insert_loop1 = """  -- ── Insert landing charges ────────────────────────────────────────────────
  FOR v_landing IN SELECT * FROM jsonb_array_elements(p_landing_charges) LOOP
    v_airport_id    := (v_landing->>'airport_id')::uuid;
    v_airport_count := (v_landing->>'landing_count')::integer;
    INSERT INTO checkout_landing_charges (
      booking_id, airport_id, landing_count, unit_amount_cents, total_amount_cents
    ) VALUES (
      p_booking_id, v_airport_id, v_airport_count,
      v_landing_rate_cents, v_landing_rate_cents * v_airport_count
    );
  END LOOP;"""
new_insert_loop1 = """  -- ── Insert landing charges ────────────────────────────────────────────────
  FOR v_landing IN SELECT * FROM jsonb_array_elements(p_landing_charges) LOOP
    v_airport_id    := (v_landing->>'airport_id')::uuid;
    v_airport_count := (v_landing->>'landing_count')::integer;
    SELECT default_landing_fee_cents INTO v_unit_amount_cents FROM airports WHERE id = v_airport_id;
    INSERT INTO checkout_landing_charges (
      booking_id, airport_id, landing_count, unit_amount_cents, total_amount_cents
    ) VALUES (
      p_booking_id, v_airport_id, v_airport_count,
      v_unit_amount_cents, v_unit_amount_cents * v_airport_count
    );
  END LOOP;"""
content = content.replace(old_insert_loop1, new_insert_loop1)

# Fix checkout_completed_by
content = content.replace("p_customer_id, now()", "auth.uid(), now()", 1)

# Fix ledger insert in complete_checkout_outcome_atomic
old_ledger1 = """  IF v_advance_applied > 0 THEN
    INSERT INTO customer_payment_ledger (
      customer_id, event_type, amount_cents, related_invoice_type, related_invoice_id, note
    ) VALUES (
      p_customer_id, 'debit', v_advance_applied, 'checkout', v_invoice_id,
      'Credit applied to checkout invoice'
    );
  END IF;"""
new_ledger1 = """  IF v_advance_applied > 0 THEN
    INSERT INTO public.customer_payment_ledger (
      customer_id, booking_id, invoice_id, amount_cents, entry_type, note, created_by
    ) VALUES (
      p_customer_id, p_booking_id, v_invoice_id, -v_advance_applied, 'advance_applied',
      'Credit applied to checkout invoice', auth.uid()
    );
  END IF;"""
content = content.replace(old_ledger1, new_ledger1)


# 2. finalise_standard_booking_invoice_atomic
content = content.replace('v_airport_active         boolean;', 'v_airport_active         boolean;\n  v_unit_amount_cents      integer;')

admin_check_2 = """  -- ── Auth check ────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- ── Idempotency guard ─────────────────────────────────────────────────────"""
content = content.replace('  -- ── Idempotency guard ─────────────────────────────────────────────────────', admin_check_2, 1)

old_lookup2 = """      SELECT is_active INTO v_airport_active FROM airports WHERE id = v_airport_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Airport not found: %', v_airport_id;
      END IF;
      IF NOT v_airport_active THEN
        RAISE EXCEPTION 'Airport is not active: %', v_airport_id;
      END IF;
      v_landing_subtotal_cents := v_landing_subtotal_cents
        + (v_landing_rate_cents * v_airport_count);"""
new_lookup2 = """      SELECT is_active, default_landing_fee_cents INTO v_airport_active, v_unit_amount_cents FROM airports WHERE id = v_airport_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Airport not found: %', v_airport_id;
      END IF;
      IF NOT v_airport_active THEN
        RAISE EXCEPTION 'Airport is not active: %', v_airport_id;
      END IF;
      v_landing_subtotal_cents := v_landing_subtotal_cents
        + (v_unit_amount_cents * v_airport_count);"""
content = content.replace(old_lookup2, new_lookup2)

old_insert_loop2 = """      IF v_airport_id IS NOT NULL AND v_airport_count > 0 THEN
        INSERT INTO booking_landing_charges (
          booking_invoice_id, booking_id, airport_id,
          landing_count, unit_amount_cents, total_amount_cents
        ) VALUES (
          v_invoice_id, p_booking_id, v_airport_id,
          v_airport_count, v_landing_rate_cents, v_landing_rate_cents * v_airport_count
        );
      END IF;"""
new_insert_loop2 = """      IF v_airport_id IS NOT NULL AND v_airport_count > 0 THEN
        SELECT default_landing_fee_cents INTO v_unit_amount_cents FROM airports WHERE id = v_airport_id;
        INSERT INTO booking_landing_charges (
          booking_invoice_id, booking_id, airport_id,
          landing_count, unit_amount_cents, total_amount_cents
        ) VALUES (
          v_invoice_id, p_booking_id, v_airport_id,
          v_airport_count, v_unit_amount_cents, v_unit_amount_cents * v_airport_count
        );
      END IF;"""
content = content.replace(old_insert_loop2, new_insert_loop2)

content = content.replace("p_customer_id,  -- stores the acting customer reference; admin ID tracked via server action audit", "auth.uid(),")

old_ledger2 = """  IF v_advance_applied > 0 THEN
    INSERT INTO customer_payment_ledger (
      customer_id, event_type, amount_cents,
      related_invoice_type, related_invoice_id, note
    ) VALUES (
      p_customer_id, 'debit', v_advance_applied,
      'standard', v_invoice_id,
      'Credit applied to standard booking invoice'
    );
  END IF;"""
new_ledger2 = """  IF v_advance_applied > 0 THEN
    INSERT INTO public.customer_payment_ledger (
      customer_id, booking_id, invoice_id, amount_cents, entry_type, note, created_by
    ) VALUES (
      p_customer_id, p_booking_id, v_invoice_id, -v_advance_applied, 'advance_applied',
      'Credit applied to standard booking invoice', auth.uid()
    );
  END IF;"""
content = content.replace(old_ledger2, new_ledger2)


# 3. prepare_booking_payment_atomic
auth_check_3_old = """  IF v_invoice.customer_id <> p_customer_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;"""
auth_check_3_new = """  IF p_customer_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_invoice.customer_id <> p_customer_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;"""
content = content.replace(auth_check_3_old, auth_check_3_new)

old_ledger3a = """      INSERT INTO customer_payment_ledger (
        customer_id, event_type, amount_cents,
        related_invoice_type, related_invoice_id, note
      ) VALUES (
        p_customer_id, 'debit', v_new_credit,
        'standard', p_invoice_id,
        'Additional credit applied at payment time, settling invoice'
      );"""
new_ledger3a = """      INSERT INTO public.customer_payment_ledger (
        customer_id, booking_id, invoice_id, amount_cents, entry_type, note, created_by
      ) VALUES (
        p_customer_id, v_invoice.booking_id, p_invoice_id, -v_new_credit, 'advance_applied',
        'Additional credit applied at payment time, settling invoice', auth.uid()
      );"""
content = content.replace(old_ledger3a, new_ledger3a)

old_ledger3b = """    INSERT INTO customer_payment_ledger (
      customer_id, event_type, amount_cents,
      related_invoice_type, related_invoice_id, note
    ) VALUES (
      p_customer_id, 'debit', v_new_credit,
      'standard', p_invoice_id,
      'Additional credit applied at payment time'
    );"""
new_ledger3b = """    INSERT INTO public.customer_payment_ledger (
      customer_id, booking_id, invoice_id, amount_cents, entry_type, note, created_by
    ) VALUES (
      p_customer_id, v_invoice.booking_id, p_invoice_id, -v_new_credit, 'advance_applied',
      'Additional credit applied at payment time', auth.uid()
    );"""
content = content.replace(old_ledger3b, new_ledger3b)


# 4. mark_booking_invoice_paid_atomic
content = content.replace("-- Webhook uses service role — no GRANT to authenticated needed.", 
"-- Webhook uses service role — no GRANT to authenticated needed.\nREVOKE EXECUTE ON FUNCTION public.mark_booking_invoice_paid_atomic(uuid, text, text, integer) FROM PUBLIC;")

# 5. approve_standard_bank_transfer_atomic
auth_check_5 = """  -- ── Auth check ────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT id, invoice_id, booking_id, customer_id, status"""
content = content.replace("  SELECT id, invoice_id, booking_id, customer_id, status", auth_check_5, 1)

# 6. reject_standard_bank_transfer_atomic
auth_check_6 = """  -- ── Auth check ────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  UPDATE booking_bank_transfer_submissions"""
content = content.replace("  UPDATE booking_bank_transfer_submissions", auth_check_6, 1)


with open('supabase/migrations/049_standard_booking_billing.sql', 'w') as f:
    f.write(content)

