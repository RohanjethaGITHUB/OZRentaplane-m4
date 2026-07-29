# Socket.io Integration Map — OZ Rent A Plane

**Status:** Implemented (Socket.io only — no Redis)  
**Setup:** [`docs/socket-io-setup.md`](./socket-io-setup.md)  
**Current behaviour:** Dedicated Socket.io process + HTTP emit bridge from server actions / Stripe webhook. Clients join role/ownership rooms and debounced-`router.refresh()`. Email + `revalidatePath` unchanged. If the socket server is down, mutations still succeed (fail-open).

**Rooms:**
- `admin:ops` — all admins (queues, badges, inbox)
- `user:{userId}` — one customer
- `booking:{bookingId}` — both sides on open booking/checkout detail
- `thread:{userId}` — chat between admin and that customer

Emit from server actions / Stripe webhook **after** DB writes succeed. Clients listen and call `router.refresh()` or re-fetch thread actions.

---

## Priority 1 — Must have (live ops)

### 1. Messaging / chat
| Side | Pages / components | Trigger actions | Socket event (suggested) | What to update |
|------|--------------------|-----------------|--------------------------|----------------|
| Admin | `/admin/messages` (`AdminInbox`), `/admin/users/[id]` (`AdminChatPanel`), sidebar unread | `sendCustomerReply`, `markCustomerMessagesRead` | `chat:message`, `chat:read` | Thread list, open thread, `getAdminUnreadCount` badge |
| Customer | `/dashboard/messages` (`CustomerChatPanel`), nav unread | `sendAdminChatMessage`, `placeCustomerOnHold`, `markAdminChatRead` | same | Message list, unread badge, dashboard verification events |

**Store today:** `verification_events`  
**Actions:** `app/actions/admin.ts`, `app/actions/verification.ts`

### 2. Admin operational badges & command board
| Side | Pages | Trigger | Event | What to update |
|------|-------|---------|-------|----------------|
| Admin | `/admin` command board, `AdminOperationalCounts` in layout | Any customer submit (docs, checkout, booking, flight record, bank proof, cancel, chat) | `ops:counts`, `ops:queue` | Sidebar badges + action queue rows |

Without this, badges only refresh on full layout re-render / navigation.

### 3. Booking & checkout status (open detail pages)
| Trigger (who) | Action(s) | Notify | Pages |
|---------------|-----------|--------|-------|
| Customer creates booking | `createBooking` | Admin | `/admin/bookings/flights`, calendar, queues |
| Admin confirms / cancels / dispatch / complete | `confirmBookingRequest`, `cancelBookingRequest`, `adminMarkReadyForDispatch`, `adminMarkCompleted`, … | Customer | `/dashboard/bookings`, `/dashboard/bookings/[id]`, dashboard home |
| Customer checkout request | `submitCheckoutRequest` | Admin | checkout queues, command board |
| Admin checkout confirm / outcome / no-show / manual complete | `confirmCheckoutBooking`, `markCheckoutOutcome`, `markCheckoutNoShow`, `manuallyCompleteCheckout` | Customer | `/dashboard/checkout`, dashboard phase / clearance |
| Reschedule request ↔ approve/reject | `requestCheckoutReschedule`, `approveCheckoutReschedule`, `rejectCheckoutReschedule` | Other role | checkout + admin reschedule queue |
| Admin proxy booking | `createProxyBooking` | Customer | bookings list/detail |

**Key files:** `app/actions/booking.ts`, `checkout.ts`, `admin-booking.ts`, `admin-proxy-booking.ts`  
**Rooms:** `booking:{id}` + `user:{id}` + `admin:ops`

### 4. Payments (Stripe + bank transfer)
| Trigger | Action / route | Notify | UI |
|---------|----------------|--------|-----|
| Customer starts Stripe / submits bank proof | `create*PaymentSession`, `submitBankTransferProof`, `submitStandardBankTransferProof` | Admin | payment queues, booking detail |
| Admin approve/reject bank / manual settle | `adminApproveBankTransfer`, `adminRejectBankTransfer`, `recordManualPayment`, `adminSettleBlockTimeInvoice` | Customer | booking payment card, purchases |
| Stripe succeeds | `app/api/stripe/webhook/route.ts` | Both | invoices paid, block-time balances, dashboard CTAs |

**Event:** `payment:updated`  
Emit from webhook **and** payment actions.

### 5. Documents & verification
| Trigger | Action | Notify | UI |
|---------|--------|--------|-----|
| Customer upload / submit for review | `uploadVerificationDocument`, `replaceVerificationDocument`, `submitForReview` | Admin | pending-verifications, command board `document_review`, `/admin/users/[id]` |
| Admin approve/reject docs or customer | `updateDocumentStatus`, `bulkUpdateDocumentStatus`, `approveCustomer`, `rejectCustomer`, `placeCustomerOnHold` | Customer | `/dashboard/documents`, dashboard action state / booking gates |

**Event:** `verification:updated`

### 6. Post-flight loop
| Trigger | Action | Notify | UI |
|---------|--------|--------|-----|
| Customer return / submit flight record | `markFlightReturned`, `submitFlightRecord` | Admin | awaiting-flight-records, post-flight queues |
| Admin request clarification / approve review | `requestPostFlightClarification`, `approvePostFlightReview` | Customer | booking detail clarification / payment |
| Customer resubmit / clarify | `resubmitFlightRecord`, `submitClarificationResponse` | Admin | post-flight detail |
| Admin finalise invoice | `finaliseStandardBookingInvoice` | Customer | payment_pending on booking |

**Event:** `flight_record:updated` / `booking:status`

---

## Priority 2 — Should have

### 7. Clearance / dashboard hero CTAs
When `pilot_clearance_status` or verification phase changes, push to `user:{id}` so `/dashboard` CTAs update without reload (`lib/dashboard/dashboard-action-state.ts` phases: blocked → documents → checkout → … → completed).

### 8. Block time & credit ledger
| Trigger | Action / webhook | Notify |
|---------|------------------|--------|
| Purchase / top-up paid | Stripe webhook | Customer purchases/pricing; admin user block-time panel |
| Refund / settle overage | `refundBlockTimePurchase`, `adminSettleBlockTimeInvoice` | Customer balances |
| Ledger credit/refund | `recordAdvancePayment`, `recordRefund`, `reverseCreditEntry` | Customer dashboard / invoices |

**Event:** `block_time:updated`, `ledger:updated`

### 9. Cancellations
| Trigger | Action | Notify |
|---------|--------|--------|
| Customer cancel / late cancel request | `cancelBookingNow`, `requestLateCancellation`, `cancelCheckoutRequest` | Admin cancellations queue |
| Admin waive / charge | `adminApproveCancellationWaived`, `adminApproveCancellationCharged` | Customer booking detail |

---

## Priority 3 — Nice to have

### 10. Calendar & availability
Admin schedule blocks (`createAdminScheduleBlock`), confirmations, proxy bookings → refresh `/admin/calendar` and customer availability checks. Lower urgency if list/detail sockets already cover bookings.

### 11. Aircraft / maintenance (admin-only)
Flight log / maintenance / squawks — only needed if multiple admins edit the same aircraft at once.

### 12. Settings / profile
Usually no socket needed (same user refreshes after own save).

---

## Suggested emit map (by file)

| File | After successful mutation, emit |
|------|----------------------------------|
| `app/actions/admin.ts` | `chat:*`, `verification:updated`, `ops:counts`, `ledger:updated` |
| `app/actions/verification.ts` | `chat:*`, `verification:updated`, `ops:counts` |
| `app/actions/booking.ts` | `booking:status`, `flight_record:updated`, `ops:counts` |
| `app/actions/checkout.ts` | `booking:status`, `ops:counts` |
| `app/actions/admin-booking.ts` | `booking:status`, `payment:updated`, `ops:counts`, clearance-related |
| `app/actions/payment.ts` | `payment:updated`, `ops:counts` |
| `app/actions/upload.ts` / documents | `verification:updated`, `ops:counts` |
| `app/actions/block-time.ts` | `block_time:updated` |
| `app/actions/admin-proxy-booking.ts` | `booking:status`, `ops:counts` |
| `app/api/stripe/webhook/route.ts` | `payment:updated`, `block_time:updated`, `booking:status` |

---

## Suggested client listeners

| Client surface | Subscribe to | On event |
|----------------|--------------|----------|
| `AdminInbox` / `AdminChatPanel` | `thread:{userId}`, `admin:ops` | Append message / refresh thread list |
| `CustomerChatPanel` | `thread:{userId}` | Append message |
| `AdminSidebar` / layout counts | `admin:ops` | Refresh counts |
| `/admin` command board | `admin:ops` | Refresh queue |
| `/admin/bookings/requests/[id]` | `booking:{id}` | `router.refresh()` |
| `/dashboard/bookings/[id]` | `booking:{id}` | `router.refresh()` |
| `/dashboard` | `user:{userId}` | Refresh action state |
| `/dashboard/documents` | `user:{userId}` | Refresh doc statuses |
| `/dashboard/checkout` | `user:{userId}` / `booking:{id}` | Refresh gate / status |
| Payment cards (both) | `booking:{id}` or `user:{id}` | Refresh payment UI |

---

## What does **not** need Socket.io first

- Static settings pages  
- One-shot PDF downloads  
- Email outbox cron (keep email; socket is in-app only)  
- Marketing / public pages  
- Pure same-user form saves where `router.refresh()` after submit is enough  

---

## Implementation sketch (when ready)

1. Add a **Socket.io-only** server (separate Node process). **No Redis.**  
2. Next.js emits via HTTP `POST /internal/emit` (shared secret) → socket server broadcasts to rooms.  
3. Join rooms by role + `userId` on connect (Supabase session auth).  
4. Create `lib/realtime/emit.ts` used from server actions + Stripe webhook (fail-open).  
5. Start with **chat + unread + admin badges**, then booking/checkout detail, then payments/docs.  
6. Keep `revalidatePath` — socket should trigger refresh, not replace DB as source of truth.  
7. Full agent prompt: `docs/socket-io-implementation-prompt.md`

---

## Flow coverage checklist

| Flow | Admin sees live? | Customer sees live? | Priority |
|------|------------------|---------------------|----------|
| Chat messages | ☑ wired | ☑ wired | P1 |
| Unread badges | ☑ wired | ☑ wired | P1 |
| Command board / ops counts | ☑ wired | — | P1 |
| Checkout request → confirm → outcome | ☑ wired | ☑ wired | P1 |
| Standard booking lifecycle | ☑ wired | ☑ wired | P1 |
| Bank / Stripe payment settled | ☑ wired | ☑ wired | P1 |
| Document upload → approve/reject | ☑ wired | ☑ wired | P1 |
| Post-flight clarify loop | ☑ wired | ☑ wired | P1 |
| Clearance / dashboard CTAs | — | ☑ wired | P2 |
| Block time / ledger | ☑ wired | ☑ wired | P2 |
| Cancellations | ☑ wired | ☑ wired | P2 |
| Calendar | ☑ wired (ops refresh) | ☑ via booking events | P3 |
| Aircraft multi-admin | ☐ deferred (ops refresh may suffice) | — | P3 |

---

## Related code anchors

- Customer shell: `app/dashboard/layout.tsx`  
- Admin shell + badges: `app/admin/layout.tsx`, `AdminOperationalCounts`  
- Dashboard phases: `lib/dashboard/dashboard-action-state.ts`  
- Stripe webhook: `app/api/stripe/webhook/route.ts`  
- Email (parallel channel, keep): `lib/booking/notifications.ts`
