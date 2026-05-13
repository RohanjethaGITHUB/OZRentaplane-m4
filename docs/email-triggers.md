# Transactional Email Triggers

All emails are sent through `lib/email/send-email.ts`.

## Checkout
- `checkout_request_submitted`, `admin_new_checkout_request`: `app/actions/checkout.ts` in `submitCheckoutRequest` after successful checkout request creation and terms acceptance insert.
- `checkout_confirmed`: `app/actions/admin-booking.ts` in `confirmCheckoutBooking` after booking and profile status update.
- `checkout_payment_required`, `cleared_to_fly`, `additional_checkout_required`, `checkout_reschedule_required`, `not_currently_eligible`: `app/actions/admin-booking.ts` in `markCheckoutOutcome` after `complete_checkout_outcome_atomic` and status/audit writes.
- `bank_transfer_proof_received`, `admin_bank_transfer_proof_uploaded`: `app/actions/payment.ts` in `submitBankTransferProof` after submission insert + invoice payment method update.
- `payment_confirmed`: `app/actions/payment.ts` in `adminApproveBankTransfer` and `app/api/stripe/webhook/route.ts` after payment RPCs succeed.

## Booking
- `booking_confirmed`, `admin_new_booking_confirmed`: `app/actions/booking.ts`/`app/actions/admin-booking.ts` via `lib/booking/notifications.ts` after booking creation/confirm success.
- `booking_cancelled`: `app/actions/admin-booking.ts` cancellation handlers via `lib/booking/notifications.ts` after booking status updates.
- `cancellation_requested`, `admin_cancellation_review_required`: emitted via existing clarification notification wrappers in `lib/booking/notifications.ts`.
- `flight_record_submitted`, `admin_flight_record_review_required`: emitted via existing post-flight clarification/resubmission notification wrappers in `lib/booking/notifications.ts`.
- `post_flight_payment_required`, `post_flight_payment_received`: `app/actions/admin-booking.ts` in `finaliseStandardBookingInvoice` and `adminConfirmStandardBankTransfer`, plus Stripe webhook for card payments.

## Dedupe + Logging
- Table migration: `supabase/migrations/063_email_events.sql`.
- Dedupe key: `(event_type, entity_type, entity_id, recipient_email)`.
- Insert/send/update flow is centralized in `lib/email/send-email.ts`.
