# Checkout Billing Flow — Full Expansion & Fix

## Background

The current system only triggers the invoice/billing flow when the admin selects `cleared_for_solo_hire`. All other outcomes (`additional_supervised_time_required`, `reschedule_required`, `not_currently_eligible`) bypass billing entirely and jump straight to `completed` status. This contradicts the business rule that the checkout flight itself is always billable regardless of clearance outcome.

Additionally, `stripe_amount_due_cents` is written once at outcome time and never refreshed — meaning credits added after the invoice is created are not reflected. The customer dashboard also lacks a full invoice breakdown and does not show landing charges at all.

---

## User Review Required

> [!IMPORTANT]
> The new RPC `complete_checkout_outcome_atomic` will be replaced with a new version that accepts a `p_checkout_outcome` parameter and a `p_landing_charges` JSON array. The old 5-parameter signature will be dropped. Any in-flight checkout bookings in `checkout_completed_under_review` state will need to be re-recorded using the new admin UI after migration.

> [!WARNING]
> The `stripe_amount_due_cents` column on `checkout_invoices` will be kept for audit/Stripe session creation but will no longer be treated as the source of truth for customer-facing amount due. A new Postgres view/RPC `get_checkout_invoice_amount_due` will calculate it live from the ledger. Existing invoices will show the correct live amount after migration without needing backfill.

> [!CAUTION]
> All 4 checkout outcomes will now create a checkout invoice and move the booking to `checkout_payment_required`. This means pilots with outcomes other than `cleared_for_solo_hire` will not have their clearance status promoted until payment clears. The `pilot_clearance_status` will be set to `checkout_payment_required` for all outcomes — the final clearance (e.g. `additional_supervised_time_required`) is only set after payment. Please confirm this is the intended UX.

---

## Open Questions

> [!IMPORTANT]
> **Q1 — Post-payment clearance status for non-cleared outcomes:** After the customer pays for a `reschedule_required` or `additional_supervised_time_required` outcome, should the system automatically promote `pilot_clearance_status` to that outcome (e.g. `additional_supervised_time_required`) so they can re-book a supervised session? Or should the admin manually update clearance after payment? **Assumed: yes, payment webhook auto-promotes to the stored checkout outcome.**

> [!IMPORTANT]
> **Q2 — Zero Stripe session for credit-covered invoices:** The spec says "do not create a $0 Stripe session unless the existing payment flow explicitly supports it." If credit fully covers the invoice, the system will mark the booking as paid without Stripe. The admin sees this as settled. Is there any notification you want sent to the customer when credit fully covers the invoice? **Assumed: send a `verification_event` notification only.**

---

## Proposed Changes

### Migration 036 — Airports Table + Landing Charges

---

#### [NEW] `036_airports_and_landing_charges.sql`

**1. `airports` table**
```
id, icao_code, name, is_active, default_landing_fee_cents, created_at
```
Seeded with 17 Sydney/NSW airports. Western Sydney International (`YSWS`) seeded with `is_active = false`.

**2. `checkout_landing_charges` table**
```
id, booking_id, airport_id, landing_count, unit_amount_cents (default 2500), total_amount_cents, created_at, updated_at
```
- FK to `bookings(id)` and `airports(id)`
- RLS: admin full access, customer SELECT own booking's charges

**3. Add `checkout_outcome` column to `checkout_invoices`**
```sql
ALTER TABLE checkout_invoices ADD COLUMN IF NOT EXISTS checkout_outcome text;
```
Stores the admin-selected outcome so the post-payment webhook knows what clearance to promote to.

**4. Add `checkout_landing_subtotal_cents` to `checkout_invoices`**
```sql
ALTER TABLE checkout_invoices ADD COLUMN IF NOT EXISTS checkout_landing_subtotal_cents integer NOT NULL DEFAULT 0;
```
Stores the sum of landing charges at invoice creation time.

**5. Live amount-due view/RPC**
```sql
CREATE OR REPLACE VIEW public.checkout_invoice_live_amount AS
SELECT
  ci.id AS invoice_id,
  ci.booking_id,
  ci.customer_id,
  ci.subtotal_cents,                        -- gross invoice total (never changes)
  COALESCE(ccb.balance_cents, 0) AS current_credit_cents,
  GREATEST(ci.subtotal_cents - COALESCE(ccb.balance_cents, 0), 0) AS amount_due_now_cents,
  ci.status,
  ci.checkout_outcome
FROM public.checkout_invoices ci
LEFT JOIN public.customer_credit_balances ccb ON ccb.customer_id = ci.customer_id
WHERE ci.invoice_type = 'checkout';
```
Note: this view uses `security_invoker = true` so RLS applies.

**6. Replace `complete_checkout_outcome_atomic` (drop + recreate)**

New signature:
```
complete_checkout_outcome_atomic(
  p_booking_id              uuid,
  p_customer_id             uuid,
  p_checkout_fee_cents      integer,      -- admin-entered gross total (flight time + landings)
  p_checkout_duration_hours numeric,
  p_checkout_outcome        text,         -- NEW: one of 4 outcomes
  p_checkout_landing_charges jsonb,       -- NEW: [{airport_id, landing_count, unit_amount_cents, total_amount_cents}]
  p_admin_notes             text DEFAULT NULL
)
RETURNS TABLE (
  out_invoice_id              uuid,
  out_amount_due_now_cents    integer,    -- live calculation at submission time
  out_final_booking_status    text,
  out_pilot_clearance_status  text        -- always 'checkout_payment_required' if amount > 0
)
```

**Key logic changes:**
- All 4 outcomes now go through this path (no bypass for non-cleared outcomes)
- `subtotal_cents` = admin-entered gross total = flight time + landing charges. **This is fixed.**
- `stripe_amount_due_cents` = live `amount_due_now_cents` at submission time (refreshed from ledger). **This is just a snapshot for Stripe session creation.**
- `advance_applied_cents` = min(current_credit_balance, subtotal_cents) applied and debited from ledger
- Booking status always → `checkout_payment_required` (if amount > 0) or `completed` (if credit covers all)
- `pilot_clearance_status` always → `checkout_payment_required` (if amount > 0) or final outcome (if credit covers all)
- Stores `checkout_outcome` in `checkout_invoices` for post-payment promotion
- Inserts rows into `checkout_landing_charges` atomically in the same transaction
- Booking `admin_notes` updated

---

### Migration 037 — Stripe Session Live Amount + Webhook Update

---

#### [NEW] `037_checkout_payment_webhook_rpc.sql`

**RPC: `mark_checkout_invoice_paid_atomic`**
```
mark_checkout_invoice_paid_atomic(
  p_invoice_id                uuid,
  p_stripe_payment_intent_id  text,
  p_amount_paid_cents         integer
)
RETURNS void
```
- Updates `checkout_invoices.status` → `paid`, writes `paid_at`, `stripe_payment_intent_id`, `total_paid_cents`
- Inserts a `stripe_payment` ledger entry
- Updates `bookings.status` → `completed`
- Promotes `profiles.pilot_clearance_status` to the stored `checkout_outcome`
- Writes `booking_status_history` + `booking_audit_events` entries
- SECURITY DEFINER — callable from service role only (Stripe webhook)

---

### App Layer Changes

---

#### [MODIFY] `app/actions/admin-booking.ts`

**`markCheckoutOutcome` — full rewrite:**
- Remove the `cleared_for_solo_hire`-only invoice branch
- All 4 outcomes now call `complete_checkout_outcome_atomic` with `p_checkout_outcome`
- Pass `p_checkout_landing_charges` as JSON array built from `landingCharges[]` input
- Input type extended:
  ```ts
  {
    bookingId: string
    outcome: 'cleared_for_solo_hire' | 'additional_supervised_time_required' | 'reschedule_required' | 'not_currently_eligible'
    adminNote?: string
    checkoutDurationHours: number        // now required for all outcomes
    checkoutFinalAmountCents: number     // now required for all outcomes
    landingCharges?: { airportId: string; landingCount: number; unitAmountCents: number; totalAmountCents: number }[]
  }
  ```
- Customer notification updated to reflect payment-required state for all outcomes

#### [MODIFY] `app/actions/payment.ts`

**`createCheckoutPaymentSession` — live amount calculation:**
- Replace `invoice.stripe_amount_due_cents` lookup with a live query against `checkout_invoice_live_amount` view
- If `amount_due_now_cents <= 0`, apply credit and mark as paid (no Stripe), redirect to success page
- If `amount_due_now_cents > 0`, create Stripe session with the live amount
- Store the live amount used in Stripe session metadata for audit

#### [NEW] `app/api/stripe/checkout-webhook/route.ts` *(or update existing)*

- On `payment_intent.succeeded`, call `mark_checkout_invoice_paid_atomic` RPC
- Verify webhook signature
- Revalidate `/dashboard` and `/dashboard/bookings/[id]` paths

---

### Customer Dashboard Changes

---

#### [MODIFY] `app/dashboard/page.tsx`

- When `clearanceStatus === 'checkout_payment_required'`, also fetch the checkout invoice from `checkout_invoice_live_amount` view (includes `amount_due_now_cents`, `checkout_outcome`, landing charges)
- Pass `checkoutInvoice` as a new prop to `DashboardContent`

#### [MODIFY] `app/dashboard/DashboardContent.tsx`

- Add a new prop: `checkoutInvoice` (invoice + live amount)
- For `checkout_payment_required` status: replace the generic "Pay Your Checkout Invoice" body text with a live breakdown card:
  ```
  Checkout Duration: 1.5 hrs
  Flight Time Subtotal: $435.00  (1.5 × $290)
  Landing Charges:
    • Sydney/Bankstown (YSBK) × 1: $25.00
    • Camden (YSCN) × 2: $50.00
  Gross Checkout Total: $510.00
  Credit Applied: −$100.00
  Amount Due Now: $410.00
  [Pay Now — $410.00]  ← links to booking detail
  ```
- `checkout_payment_required` hero copy must NOT say "checkout approved" for non-cleared outcomes. The subtitle should reflect the actual checkout outcome:
  - `cleared_for_solo_hire` → "Checkout Approved — Payment Required"
  - `additional_supervised_time_required` → "Additional Training Required — Payment Required"
  - `reschedule_required` → "Reschedule Required — Payment Required"
  - `not_currently_eligible` → "Checkout Invoice — Payment Required"
- Remove the stale `checkout_completed_under_review` body copy from showing after `checkout_payment_required` exists

#### [MODIFY] `app/dashboard/bookings/page.tsx`

- The `ClearanceGateBanner` for `checkout_payment_required` must show regardless of the clearance status — currently it only shows when `checkoutBooking?.status === 'checkout_payment_required'` which could fail if the status lookup is wrong.
- Show the same live breakdown in the gate banner (minimal version with "Pay Invoice" CTA).

#### [MODIFY] `app/dashboard/bookings/[id]/page.tsx`

- When viewing a `checkout_payment_required` booking: fetch the invoice + landing charges from `checkout_invoice_live_amount` + `checkout_landing_charges`
- Show live invoice breakdown
- "Pay Now" button calls `createCheckoutPaymentSession` with live amount

---

### Admin Outcome UI Changes

---

#### [MODIFY] Admin checkout booking detail page (wherever `markCheckoutOutcome` is called from)

The Record Checkout Outcome form needs to be expanded from the current simple form to support:

1. **Outcome selector** — all 4 options (currently only shown for `cleared_for_solo_hire` with invoice fields)
2. **Duration input** — required for ALL outcomes (hours, e.g. 1.5)
3. **Flight time reference** — auto-calculated display: duration × $290 = $X
4. **Landing charges section** (dynamic rows):
   - Airport dropdown (from `airports` table, `is_active = true`)
   - Number of landings input
   - Unit price display ($25/landing)
   - Row total display
   - [Add Row] / [Remove] buttons
   - Section total display
5. **Gross calculated total** — live: flight time + landing subtotal
6. **Admin-adjustable final amount** — defaults to gross calculated total, admin can override
7. **Available credit** — read-only display of current customer credit balance
8. **Estimated amount due** — live: max(final_amount - credit, 0)
9. **Notes field**

**Live calculation** (JavaScript, client-side):
```
flight_time_subtotal = duration_hours × 29000
landing_subtotal = sum(landing_count × unit_amount_cents)
gross_total = flight_time_subtotal + landing_subtotal
final_amount_cents = admin_override ?? gross_total
amount_due_now = max(final_amount_cents - customer_credit_cents, 0)
```

Currently the form is embedded in the admin checkout booking detail page (`/admin/bookings/requests/[id]`). This page needs to be located and updated. Based on the `AdminBookingList` link structure, checkout bookings link to `/admin/bookings/requests/[id]`.

---

## Verification Plan

### Automated / SQL Tests
- Run migration 036 + 037 in Supabase SQL editor
- Confirm `airports` seeded with 17 rows, `checkout_landing_charges` table exists
- Confirm `checkout_invoice_live_amount` view returns correct `amount_due_now_cents` for a test invoice

### Manual Test Scenarios (per spec)
1. ✅ `cleared_for_solo_hire`, no landings, no credit → invoice created, payment required
2. ✅ `additional_supervised_time_required`, no landings, no credit → invoice created, payment required
3. ✅ `reschedule_required`, no landings, no credit → invoice created, payment required
4. ✅ `not_currently_eligible`, no landings, no credit → invoice created, payment required
5. ✅ 1.5 hrs, Camden 2 landings ($50) + Bankstown 1 landing ($25) → gross $435 + $75 = $510
6. ✅ Add credit before admin records outcome → advance_applied deducted in RPC
7. ✅ Add credit after admin records outcome → `amount_due_now_cents` recalculated live, Stripe session uses updated amount
8. ✅ Credit partially covers invoice → correct split shown on dashboard
9. ✅ Credit fully covers invoice → marked paid, no Stripe session
10. ✅ Stripe session uses `checkout_invoice_live_amount.amount_due_now_cents`, not stale `stripe_amount_due_cents`
