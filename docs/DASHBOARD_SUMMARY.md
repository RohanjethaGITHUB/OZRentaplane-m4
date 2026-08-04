# Customer Dashboard — Detailed Summary

---

## Structure & Layout

**`app/dashboard/layout.tsx`**
- Authenticates user via Supabase — redirects to `/login` if not logged in
- Redirects admins to `/admin`
- Enforces password change gate (`must_change_password` flag on profile)
- Renders `CustomerPortalNav` with `firstName` and `email` for personalization
- Background: gradient (blue theme) with atmospheric cloud layers

**`app/dashboard/page.tsx`** (main home, Server Component)

Fetches in parallel:
- User profile + clearance status
- User documents (readiness tracking)
- Verification events (recent activity)
- Active booking + upcoming confirmed bookings
- Post-flight required / under review bookings
- Checkout snapshot + checkout invoice (payment pending)
- Bank transfer submissions

Renders `DashboardContent.tsx` (Client) with:
- **Hero** — welcome message, clearance status pill, CTA buttons
- **Pilot Journey Strip** — visual progress: Account Created → Documents → Checkout → Approved → Ready to Fly (color-coded: blue = done, amber = current, grey = upcoming)
- **Three-column grid**:
  1. Next Action Card (status-driven prompt)
  2. Upcoming Booking Card (next flight or CTA to book)
  3. Document Readiness Card (circular progress, per-doc status badges)
- **Recent Activity Strip** — last 3 verification events

---

## Pilot Clearance Status Flow

This is the most important state machine in the dashboard. Every screen is driven by it.

```
checkout_required
  → checkout_requested         (after booking checkout flight)
    → checkout_confirmed       (admin approves request)
      → checkout_completed_under_review   (after checkout flight)
        → checkout_payment_required       (admin clears the pilot)
          → cleared_to_fly               (after payment)

Side branches:
  additional_checkout_required   (admin requires another checkout)
  checkout_reschedule_required   (admin asks pilot to reschedule)
  not_currently_eligible         (training required first)
```

---

## Full User Journey: New Pilot → First Rental

```
1. Sign Up
2. Login → Dashboard (clearance_status = checkout_required)
   - Primary CTA: Request Checkout (not Documents first)
3. Book Checkout Flight
   - Pick date/time → upload required documents (Pilot Licence, Medical, Photo ID)
     → confirm Night VFR rating → accept terms → submit
   [Status: checkout_requested]
4. Admin reviews request → confirms
   [Status: checkout_confirmed]
5. Checkout flight day
   [Status: checkout_completed_under_review]
6. Admin reviews checkout result → clears pilot
   [Status: checkout_payment_required]
7. Pay Checkout Invoice (credit card or bank transfer)
   [Status: cleared_to_fly]
8. Book Aircraft Rental
   - Pick date/time → confirm flight recency → accept terms → submit
   [Status: pending_confirmation]
9. Admin confirms rental
   [Status: confirmed → ready_for_dispatch → dispatched]
10. Post-flight: submit VDO & tacho readings
    [Status: awaiting_flight_record → pending_post_flight_review]
11. Admin reviews → completes booking
    [Status: completed]
```

---

## Checkout Flow (`app/dashboard/checkout/`)

Three-step wizard inside `CheckoutFlow.tsx` (1650+ lines, Client Component).

### Step 1 — Time Selection
- Date picker (min: today Sydney time)
- **Night VFR Rating toggle** — must be explicitly set (Yes/No), affects available time windows
- Departure time picker (15-min increments, auto end = start + 2 hrs)
- **Availability timeline** — visual day view showing:
  - Day VFR windows (when Night VFR = No)
  - Existing booking conflicts (red)
  - Draggable selection block
- Debounced availability check (600ms) on time change
- Validation: future time only, within Day VFR window if Night VFR = No

### Step 2 — Documents & Terms Check
- Live doc gate check via `getCheckoutDocumentGateState()`
- Shows: Pilot Licence, Medical Certificate, Photo ID statuses
- Terms & Conditions checkbox (must accept)
- Refresh button to re-check
- **Blocks continue** until all docs approved + terms accepted

### Step 3 — Review & Submit
- Summary: date/time, last flight review date (editable), Night VFR confirmation, optional team message, terms acknowledgment
- Submit calls `submitCheckoutRequest()`
- Handles errors: validation, availability conflict, account blocked, auth failure

### Active Checkout State
- If checkout already booked: shows scheduled time + `CheckoutChangeActions`
- Reschedule/cancel require >12 hours before flight (self-service cutoff)
- Reschedule opens modal-based rescheduling flow

---

## Bookings (`app/dashboard/bookings/`)

### Bookings List (`bookings/page.tsx`)

**Stats row (5 columns):**
- Checkout Requests, Pending Review, Upcoming Flights, Completed Flights, Total Flight Hours (cleared pilots only)

**Clearance Gate Banner** — renders different UI per status:

| Status | UI Shown |
|---|---|
| `checkout_required` | "Book Checkout Flight" CTA |
| `checkout_requested` | "Under review" + booking ref |
| `checkout_confirmed` | "Confirmed" + flight details |
| `checkout_payment_required` | "Payment required" CTA |
| `checkout_completed_under_review` | "Awaiting outcome" message |
| `additional_checkout_required` | "Book another checkout" CTA |
| `checkout_reschedule_required` | "Reschedule checkout" CTA |
| `not_currently_eligible` | "Training required" message |
| `cleared_to_fly` + active booking | "You're ready to fly" |
| `cleared_to_fly` + no booking | "Book your next flight" |

**Upcoming Flights Section:**
- Checkouts + standard bookings in progress
- Shows aircraft image, registration, status badge
- Actions: VIEW DETAILS, MODIFY BOOKING, CANCEL REQUEST

**Flight History Section:**
- Completed/past bookings
- Checkout outcome badge (Cleared to Fly, Additional Checkout Required, etc.)
- Actions: VIEW DETAILS, DOWNLOAD INVOICE, DOWNLOAD RECEIPT

### New Booking (`bookings/new/page.tsx`)

Sequential gate checks before rendering the booking form:

1. **Account blocked** (no-show) → lock modal, contact team
2. **checkout_required** → lock gate: "Complete checkout first"
3. **Unpaid checkout invoice** → lock gate: "Pay checkout invoice first"
4. **Checkout in progress** (requested/confirmed/under_review) → lock gate
5. **Booking readiness gate** (cleared pilots):
   - Checks documents, flight recency date, terms acceptance
   - If not ready: `BookingReadinessInlinePanel`
   - If ready: `BookingRequestForm`

`BookingRequestForm` (Client):
- Aircraft info (registration, type, hourly rate)
- Date/time selection with same availability timeline as checkout
- Terms acceptance, PIC name auto-populated
- Submit creates standard booking

### Individual Booking (`bookings/[id]/page.tsx`)

Renders different UI per booking status:

**Checkout statuses:**
- `checkout_requested` — status overview + action buttons
- `checkout_confirmed` — flight details + countdown
- `checkout_completed_under_review` — waiting message
- `checkout_payment_required` — `CheckoutPaymentCard` (Stripe + bank transfer)

**Standard booking statuses:**
- `pending_confirmation` — awaiting ops team
- `confirmed` — flight details, pre-flight checklist
- `ready_for_dispatch` — final pre-flight checks
- `dispatched` — flight in progress
- `awaiting_flight_record` — `FlightRecordForm` (VDO hrs, tacho, fuel, oil, Hobbs)
- `flight_record_overdue` — red alert + `FlightRecordForm`
- `pending_post_flight_review` — waiting on admin
- `needs_clarification` — `ClarificationResponseForm`
- `completed` — invoice/receipt download links

---

## Documents (`app/dashboard/documents/`)

**`documents/page.tsx`** fetches docs + passes to `DocumentsPanelV2` (Client).

**Required Documents (3):**
- Pilot Licence (+ expiry month/year, red card tracking)
- Medical Certificate (+ expiry date)
- Photo ID

**Optional Documents:**
- Night VFR Evidence (only shown if Night VFR rating = Yes)
- Instrument Rating Evidence

**Per-document UI:**
- Status badge: Approved / Awaiting Review / Rejected / Not Submitted
- Drag & drop upload area
- File list with download/delete
- Rejection reason if rejected

**Additional fields on this page:**
- Last Flight Review Date
- Night VFR Rating checkbox
- Instrument Rating checkbox
- Terms & Conditions checkbox
- "Check Document Status" refresh button
- "Continue to Booking" button (when all ready)

---

## Messages (`app/dashboard/messages/`)

Fetches `verification_events` for the user (chronological).

`CustomerChatPanel` (Client) renders a chat-style thread:

| Event Type | Badge Color | Label |
|---|---|---|
| `message` | Blue | Message from Admin |
| `on_hold` | Amber | Action needed |
| `approved` | Green | Approved |
| `rejected` | Red | Rejected |
| `resubmitted` | Purple | Resubmitted |
| `update` | Slate | Update |

Each event shows: title, body, timestamp, actor role (Admin / System), read/unread state.

---

## Settings (`app/dashboard/settings/`)

**`settings/page.tsx`** → `ProfilePageClient` (Client):
- Email (read-only), First/Last Name inputs
- Pilot ID (read-only, derived from profile or user ID)
- Member Since date, Pilot Type (display-only)
- Phone (country code + number)
- Change Password link → `/dashboard/change-password`
- Deactivate Account (modal confirmation)

**Change Password (`change-password/page.tsx`):**
- Forced here if `must_change_password === true`
- Bypassable with `?skip_password_prompt=1` (testing only)
- Success redirects to dashboard with `?passwordUpdated=1` flash

---

## Key Server Actions

| Action File | Functions Used |
|---|---|
| `actions/checkout.ts` | `submitCheckoutRequest`, `getCheckoutDocumentGateState`, `cancelCheckoutRequest`, `requestCheckoutReschedule` |
| `actions/booking.ts` | `submitBookingRequest`, `getBookingDetailsFull`, `submitFlightRecord`, `submitFlightRecordClarification` |
| `actions/documents.ts` | `uploadDocument`, `deleteDocument` |
| `actions/customer-availability.ts` | `checkCustomerAvailability`, `getDayAvailability` |
| `actions/payment.ts` | `initiateCreditCardPayment`, `submitBankTransferProof` |
| `actions/verification.ts` | `markVerificationEventAsRead` |
| `actions/booking-readiness.ts` | `saveNightVfrRatingFromReadiness` |

---

## Key `lib/` Utilities

| File | Purpose |
|---|---|
| `lib/customer-journey.ts` | `deriveJourneyState()` — calculates progress strip state |
| `lib/booking/availability.ts` | Calendar slot logic |
| `lib/booking/status-constants.ts` | All booking status enums |
| `lib/checkout-terms.ts` | Normalizes active terms from DB |
| `lib/checkout-payment-state.ts` | `getCheckoutPaymentDisplayState()` — payment UI state |
| `lib/checkout-policy.ts` | `isCheckoutSelfServiceAllowed()` — 12-hour cutoff logic |
| `lib/utils/sydney-time.ts` | All date/time ops use Sydney timezone |
| `lib/utils/day-vfr.ts` | VFR window calculation (sunrise/sunset) |

---

## Important Rules & Gates

- **Documents gate**: Cannot reach checkout Step 2 without all 3 docs approved
- **Terms gate**: Cannot submit checkout or booking without accepting current terms version
- **Flight recency gate**: Last flight review date required before standard booking
- **Night VFR logic**: Must be explicitly set; controls available booking time windows
- **Self-service cutoff**: Reschedule/cancel only allowed >12 hours before flight
- **Account block gate**: No-show blocks new booking, must message team
- **Password gate**: `must_change_password` forces `/change-password` on every login
- **Admin redirect**: Any user with admin role is redirected away from dashboard to `/admin`
