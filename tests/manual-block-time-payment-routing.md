# Manual test script — Block Time payment routing via the Case 1/2/3 chooser

**Prerequisite:** apply `supabase/migrations/106_block_time_landing_payment_routing.sql` in the Supabase dashboard SQL editor (104 and 105 must already be applied). Run `npm run dev`, use a Stripe test-mode key, and a test customer with an active block time package.

For every scenario below, also verify the constant: **no Stripe charge is ever made against a stored card** (check the Stripe test dashboard — the only charges should be ones the customer initiates via Checkout).

## A. Block time landing fee — Case 1 (customer submits, admin reviews)

1. As the customer (active package, balance > flight hours), submit a flight record with photos from the booking page.
2. As admin, open the booking (`/admin/bookings/requests/<id>`) → "Flight Billing" panel. Add ≥1 landing row.
3. **A1 — Send invoice + Stripe:** finalise. Expect: booking `completed`; hours deducted; landing invoice `awaiting`, `payment_method='stripe'`; customer Purchases page shows an amber "Landing fee invoice" card with a **Pay now** button; paying via Stripe test card marks it paid (webhook) and the card disappears.
4. **A2 — Send invoice + Bank transfer:** (new flight) expect the Purchases card to show bank details + invoice-number reference and NO pay button. As admin, customer profile → Billing → "Block time flight invoices" → **Mark settled** → "Bank transfer (verified)". Invoice becomes paid; customer gets notification/email.
5. **A3 — Mark paid:** (new flight) finalise with Mark paid. Expect: landing invoice immediately `paid` with `payment_method='card_in_person'` (or `bank_transfer` if that method selected), a `customer_payment_ledger` row with `invoice_source_type='block_time'`, and no card touched.

## B. Block time landing fee — Case 2 and Case 3 via admin proactive submission

1. As admin, open a booking with no flight record yet → "Submit Post-Flight Record" panel.
2. Confirm the **C. Payment Options** section is now VISIBLE for a block-time customer, with the green note explaining the options apply to the landing fee.
3. Repeat A1 (send invoice + Stripe), A2 (bank transfer), A3 (mark paid) through this panel. Same expectations.
4. **Waived:** choose Waived + a reason. Expect: landing invoice `status='waived'`, reason in `booking_audit_events.new_value.landing_waiver_reason`, no ledger entry, no Purchases card.

## C. Block time overage — admin mark-settled lifts the gate

1. Set the customer's balance below the flight hours; finalise a flight (any submission path). Expect an overage invoice `awaiting` + the rose gate banner on the customer's Purchases page.
2. As the customer, try to create a new booking → blocked with the OVERAGE_UNPAID message.
3. As admin, customer profile → "Block time flight invoices" → the overage row shows **Mark settled**. Settle it as Cash with a note.
4. Expect: invoice `paid` (`payment_method='cash'`), ledger row (`invoice_source_type='block_time'`), customer notification "overage paid — account unlocked".
5. As the customer, create a new booking → **succeeds** (gate lifted with no Stripe involvement).
6. Also verify the Stripe self-service path still works: create another overage, pay via the Purchases page button, gate lifts.

## D. PAYF regression (no behaviour change)

Run all three cases for a customer with NO active package, from both panels:
1. Send invoice + Stripe → booking `payment_pending`, customer pays from booking page via Stripe.
2. Send invoice + Bank transfer → customer uploads proof; admin confirms via the existing bank-transfer panel.
3. Mark paid → booking `completed` immediately, manual ledger entry via `recordManualPayment`.
4. Waived → booking `completed`, invoice `waived`.
Expect identical behaviour to before this change (booking statuses, emails, ledger entries).

## E. Failure-path visibility

1. (Optional, destructive-free) Temporarily revoke the `waived` status value (or settle the landing invoice out-of-band mid-flow) and finalise with Waived: the finalisation should COMPLETE (booking `completed`) and then show a visible error in the admin panel saying the landing invoice could not be routed and pointing to the customer-profile settle control. Nothing should be silently logged-only.
2. Double-settle guard: open Mark settled in two tabs, settle in one, then the other — the second must fail with "settled by another process", no duplicate ledger row.

## F. Removed code check

`grep -rn "block_time_landing_fee\|off_session" app lib` → no matches in app code (only the historical migration/comments). No `Stripe` usage remains in `app/actions/admin-booking.ts`.
