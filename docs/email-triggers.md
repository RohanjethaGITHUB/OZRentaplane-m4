# Transactional Email Triggers

All emails are sent through `lib/email/send-email.ts`.

## Checkout
- `checkout_request_submitted`, `admin_new_checkout_request`: `app/actions/checkout.ts` in `submitCheckoutRequest` after successful checkout request creation and terms acceptance insert.
- `checkout_confirmed`: `app/actions/admin-booking.ts` in `confirmCheckoutBooking` after booking and profile status update.
- `checkout_cancelled_by_customer`, `admin_checkout_cancelled_by_customer`: `app/actions/checkout.ts` in `cancelCheckoutRequest` alerting admin immediately and confirming cancellation to customer.
- `checkout_cancelled_by_admin`: `app/actions/admin-booking.ts` in `cancelCheckoutBooking` notifying customer that their checkout booking was cancelled with reason.
- `checkout_reschedule_requested`, `admin_checkout_reschedule_requested`: `app/actions/checkout.ts` in `requestCheckoutReschedule` when customer requests a new slot.
- `checkout_reschedule_approved`, `admin_checkout_reschedule_approved`: `app/actions/checkout.ts` in `approveCheckoutReschedule` when admin approves customer's requested slot.
- `checkout_reschedule_rejected`, `admin_checkout_reschedule_rejected`: `app/actions/checkout.ts` in `rejectCheckoutReschedule` when admin rejects customer's requested slot.
- `checkout_time_proposed`: `app/actions/admin-booking.ts` in `adminProposeCheckoutTime` when admin proposes an alternative flight time to customer.
- `admin_checkout_proposal_accepted`, `admin_checkout_proposal_declined`: `app/actions/checkout.ts` in `customerAcceptProposedCheckoutTime` and `customerRejectProposedCheckoutTime` notifying admin of customer's response.
- `checkout_payment_required`, `cleared_to_fly`, `additional_checkout_required`, `checkout_reschedule_required`, `not_currently_eligible`: `app/actions/admin-booking.ts` in `markCheckoutOutcome` after `complete_checkout_outcome_atomic` and status/audit writes.
- `bank_transfer_proof_received`, `admin_bank_transfer_proof_uploaded`: `app/actions/payment.ts` in `submitBankTransferProof` after submission insert + invoice payment method update.
- `payment_confirmed`: `app/actions/payment.ts` in `adminApproveBankTransfer` and `app/api/stripe/webhook/route.ts` after payment RPCs succeed.

## Rental / Standard Booking
- `booking_confirmed`, `admin_new_booking_confirmed`: `app/actions/booking.ts` in `createBooking` and `lib/booking/notifications.ts` in `notifyBookingConfirmed` immediately after booking is created/confirmed.
- `booking_rescheduled`, `admin_booking_rescheduled`: `app/actions/booking.ts` in `rescheduleFlightBooking` and `lib/booking/notifications.ts` in `notifyBookingRescheduled` when a flight is rescheduled by customer or operations, highlighting previous slot vs. new slot.
- `booking_cancelled`, `admin_booking_cancelled`: `app/actions/booking.ts` in `cancelBookingNow` (customer self-service), `app/actions/admin-booking.ts` in `cancelBookingRequest`, and `app/admin/bookings/requests/[id]/actions.ts` in `cancelBookingByAdmin`. Releases held schedule blocks and notifies both pilot and operations.
- `cancellation_requested`, `admin_cancellation_review_required`: emitted via clarification notification wrappers in `lib/booking/notifications.ts` for late cancellations (<=24h).
- `flight_record_submitted`, `admin_flight_record_review_required`: emitted via post-flight clarification/resubmission notification wrappers in `lib/booking/notifications.ts`.
- `post_flight_payment_required`, `post_flight_payment_received`: `app/actions/admin-booking.ts` in `finaliseStandardBookingInvoice` and `adminConfirmStandardBankTransfer`, plus Stripe webhook for card payments.

## Registration & Welcome
- `customer_welcome_registered`: `app/actions/auth.ts` in `notifyNewRegistration` immediately after successful registration (and verified callback fallback).
- `admin_new_customer_registered`: `app/actions/auth.ts` in `notifyNewRegistration` alerting admin with full customer details and portal link.

## Cron-Driven State Onboarding Reminders (`/api/cron/daily-maintenance`)
State-driven reminders evaluated dynamically at runtime with Day 2 (~40h), Day 5 (~112h), and Day 10 (~232h) cadence:
- `onboarding_no_docs_reminder`: Customer has registered but uploaded 0 blocking documents (Licence, Medical, Photo ID).
- `onboarding_incomplete_docs_reminder`: Customer uploaded 1 or 2 blocking documents; reminds them of the remaining missing documents.
- `onboarding_request_checkout_reminder`: All 3 blocking documents uploaded and valid; prompts customer to schedule their initial checkout flight.
- `onboarding_action_required_reminder`: A blocking document was rejected or admin proposed a checkout reschedule requiring customer response.
- `admin_pending_checkout_reminder`: Checkout request is waiting for admin confirmation for >24h/48h; alerts admin to review and confirm.
- `admin_checkout_urgent_review_24h`: Urgent reminder fired when a requested checkout flight is within 24 hours of start time and still pending admin confirmation.
- `admin_checkout_outcome_pending_alert`: Fired when a checkout flight has concluded >= 24 hours ago and admin has not recorded the outcome (Cleared to Fly, Additional Checkout, Reschedule).
## Upcoming Flight Reminders (48h & 12h) (`/api/cron/daily-maintenance` & `/api/cron/day-before-flights`)
Scheduled state-based reminders for active **Checkout** and **Rental** flights:
- `upcoming_flight_reminder_48h`, `admin_upcoming_flight_alert_48h`: Enqueued 48 hours prior to scheduled departure. Includes detailed pre-flight / checkout checklists for pilots and operational overview for admins.
- `upcoming_flight_reminder_12h`, `admin_upcoming_flight_alert_12h`: Enqueued 12 hours prior to scheduled departure.
- Dynamic Reschedule & Exclusion: Idempotency keys use schedule timestamps (`${bookingId}:${scheduleHash}`), ensuring rescheduled flights receive new 48h/12h reminders for the updated date and cancelled flights are strictly excluded.

## Post-Flight Action Reminders (1+ Day Past Flight) (`/api/cron/daily-maintenance`)
Triggered when a completed flight has concluded >= 24 hours ago and has an outstanding action:
- `post_flight_record_pending_reminder`: Reminds customer to submit final VDO tachometer/Hobbs readings or respond to admin clarification.
- `admin_post_flight_record_pending_alert`: Alerts admin that post-flight record is pending after 1+ days (admin can also enter and submit readings directly).
- Stops immediately once flight record is submitted or approved.

## Post-Flight Admin Review & Payment Reminders (1+ Day) (`/api/cron/daily-maintenance`)
- `admin_flight_record_pending_review_alert`: Triggered when customer submitted flight record >24h ago and admin has not reviewed or issued invoice. Direct CTA to `/admin/bookings/requests/[bookingId]`.
- `unpaid_invoice_customer_reminder` / `admin_unpaid_invoice_alert`: Triggered when an issued Checkout or Solo Hire invoice is unpaid after 24h. If the customer already uploaded bank transfer proof awaiting review, customer reminder is suppressed.
- `admin_bank_transfer_pending_verification_alert`: Triggered when customer submitted bank transfer proof >24h ago and admin has not verified/approved it. Direct CTA to `/admin/bookings/requests/[bookingId]` or `/admin/bookings/payments`.

## Block Time Notifications
- `block_time_purchase_confirmed`: `app/api/stripe/webhook/route.ts` when a customer successfully purchases a block-time package. Displays package name, hours credited, current balance, locked rate, validity days, amount paid, and invoice PDF link.
- `block_time_low_balance_reminder`: `/api/cron/daily-maintenance` inside `runBlockTimeMaintenance`. Fired when remaining balance drops to <= 2.0 hours on an active package. Deduplication key `block-time-low-balance:${purchaseId}:${hoursPurchased}` ensures no duplicate sends within the same cycle, but allows sending again once replenished.
- `block_time_expiry_reminder`: `/api/cron/daily-maintenance` inside `runBlockTimeMaintenance` sent 7 days prior to package expiration.

## Weekly Operations Digest (Friday 6:00 AM Sydney Time) (`/api/cron/admin-weekly-digest`)
- `admin_weekly_operations_digest`: Scheduled every Friday at 6:00 AM Sydney time (AEST/AEDT) with schedule `0 20 * * 4` in `vercel.json`.
- **Reporting Window**: Exactly 7 complete days (Previous Friday 00:00:00 through Thursday 23:59:59 Sydney local time).
- **Section 1 - Flights**: Total flights, Checkout vs Rental breakdown, and complete flight list with reference, aircraft, date/time, customer, and CURRENT status (completed, cancelled, confirmed, etc.).
- **Section 2 - New Customers**: Total newly registered customers, current onboarding/clearance status, and concise lifecycle timeline (`Registered -> Docs uploaded -> Checkout requested -> Cleared`).
- **Empty-state Resilience**: Explicitly reports `Flights: 0` / `New customers: 0` if zero activity occurred and still dispatches the digest to operations.

## Dedupe + Logging
- Table migration: `supabase/migrations/063_email_events.sql` & `supabase/migrations/072_email_outbox.sql`.
- Dedupe / Idempotency keys prevent double sends across all cron runs.
- Insert/send/update flow is centralized in `lib/email/outbox.ts` and `lib/email/send-email.ts`.

