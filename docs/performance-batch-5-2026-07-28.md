# OZRentaplane Performance Batch 5

Objective: measure and reduce user-visible latency for standard booking creation, checkout request submission, and admin checkout confirmation without changing booking, checkout, payment, authorization, notification, or lifecycle behaviour.

## Lifecycle Map

### 1. Customer standard rental creation: `createBooking`

- Client click/form submission: `BookingRequestForm.handleReviewConfirm`; required and blocking.
- Pending-state activation: review modal confirm handler owns pending/disabled state; required and blocking.
- Server action invocation: `app/actions/booking.ts#createBooking`; required and blocking.
- Authentication: `create_booking_auth`; required and blocking.
- Profile/role/clearance authorization: `create_booking_authorization`; required and blocking, includes profile, checkout clearance evidence, document readiness, terms acceptance.
- Input validation: `create_booking_validation`; required and blocking.
- Availability/pricing reads: `create_booking_availability_pricing_reads`; required and blocking, currently overage gate before RPC. RPC still authoritatively checks availability/pricing.
- Database RPC/write: `create_booking_rpc_write`; required and blocking.
- Follow-up database writes: `create_booking_profile_update`; non-critical but currently awaited to preserve existing behaviour.
- Post-write identity reads: `create_booking_post_write_identity_reads`; previously repeated and redundant, now eliminated by reusing authenticated profile email/name.
- Notification write: `create_booking_notification_write`; no durable verification notification exists in this path, logged with row count 0.
- Email preparation: `create_booking_email_preparation`; required by existing notification behaviour, blocking.
- Email delivery: `create_booking_email_delivery`; currently awaited to avoid serverless fire-and-forget loss.
- Revalidation: `create_booking_revalidation`; required and blocking, unchanged broad `/dashboard` and `/admin`.
- Response ready/UI success: `create_booking_response_ready`; customer modal shows success without a full-page refresh.

### 2. Customer checkout-request submission: `submitCheckoutRequest`

- Client click/form submission: `CheckoutFlow.handleSubmit`; required and blocking.
- Pending-state activation: `setIsSubmitting(true)` before transition; duplicate submits are blocked by `isSubmitting || isPending`; required and blocking.
- Server action invocation: `app/actions/checkout.ts#submitCheckoutRequest`; required and blocking.
- Authentication: `checkout_submit_auth`; required and blocking.
- Profile authorization: `checkout_submit_profile_authorization`; required and blocking, uses profile returned from auth guard.
- Documents read: `checkout_submit_documents_read`; required and blocking.
- Terms read: `checkout_submit_terms_read`; required and blocking. Primary document and terms reads are now parallelized.
- Availability read: `checkout_submit_availability_read`; required and blocking, includes exact idempotency lookup and conflict diagnostic reads before RPC.
- Database RPC/write: `checkout_submit_rpc_write`; required and blocking.
- Terms acceptance write: `checkout_submit_terms_acceptance_write`; required and blocking, rollback behaviour preserved on failure.
- Notification write: `checkout_submit_notification_write`; durable verification event, required but non-fatal.
- Customer/admin email: `checkout_submit_customer_email`, `checkout_submit_admin_email`; existing awaited delivery preserved, now independent sends run in parallel.
- Revalidation: `checkout_submit_revalidation`; required and blocking, unchanged.
- Response ready/UI success: `checkout_submit_response_ready`; client advances to success state without requiring a router refresh.

### 3. Admin checkout confirmation: `confirmCheckoutBooking`

- Client click/confirm: `AdminCheckoutReviewPanel.handleConfirmCheckout`; required and blocking.
- Pending-state activation: `useTransition` disables confirm controls; required and blocking.
- Server action invocation: `app/actions/admin-booking.ts#confirmCheckoutBooking`; required and blocking.
- Authentication: `checkout_approval_auth`; required and blocking.
- Authorization: `checkout_approval_authorization`; required and blocking, performed by `requireAdmin`.
- Booking read: `checkout_approval_booking_read`; required and blocking.
- Primary write: `checkout_approval_primary_write`; booking update remains the dependency gate, then history/audit/profile writes run after it.
- Notification write: `checkout_approval_notification_write`; durable verification event, non-fatal.
- Email preparation: `checkout_approval_email_preparation`; customer/aircraft reads are independent and parallelized.
- Email delivery: `checkout_approval_email_delivery`; existing awaited behaviour preserved.
- Revalidation: `checkout_approval_revalidation`; targeted paths unchanged.
- Response ready/UI success: `checkout_approval_response_ready`; client calls `router.refresh()` to render authoritative detail status.

## Privacy-Safe Log Findings

Removed target-path debug logs from checkout submission that exposed user IDs, emails, booking IDs/references, terms document IDs/hashes, document summaries, schedule block IDs, related booking IDs, owner user IDs, and exact requested times. Replaced them with `PERF_LOG=1` structured timings and code/message-only error diagnostics in the target path.

## Optimizations Applied

- Reused authenticated profile email/name in `createBooking`; removed the second Supabase client, post-write `getUser`, and profile reread.
- Reused authenticated profile email/name in checkout submission for email payloads; removed the post-write profile reread.
- Parallelized checkout document and active terms reads after auth.
- Split checkout request customer/admin email helpers and send both awaited emails in parallel.
- Parallelized admin checkout email-preparation reads for customer email and aircraft registration.
- Kept all revalidation paths unchanged because this batch did not prove any current path was unrelated.
