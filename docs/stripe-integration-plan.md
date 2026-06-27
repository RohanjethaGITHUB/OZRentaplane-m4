# OZ Rent A Plane — Stripe Integration Plan
## Block Time Purchase + Pay As You Fly

---

## Overview of Stripe objects needed

| Object | Purpose |
|---|---|
| Customer | One per pilot — created at registration or first payment |
| PaymentIntent | Block Time purchase (upfront lump sum) |
| PaymentIntent | PAYF flight charge (after VDO submission) |
| Webhook endpoint | Listens for payment events |
| Refund | Block Time partial refund |

No Stripe Products or Prices needed — all amounts are calculated
dynamically (VDO hours × rate). We use PaymentIntents directly,
not Checkout Sessions or Subscriptions.

---

## 1. Stripe Customer Object

Create one Stripe Customer per pilot at registration (or lazily
on first payment attempt — audit will confirm current behaviour).

Store `stripe_customer_id` on the user record in Supabase.

```
stripe.customers.create({
  email: user.email,
  name:  user.full_name,
  metadata: {
    supabase_user_id: user.id,
  }
})
```

**Why this matters:** Stripe Customer object enables:
- Saved payment methods (card on file for PAYF charges)
- Payment history visible in Stripe dashboard per pilot
- Refunds tied to the correct customer

---

## 2. Block Time Purchase — PaymentIntent

Created when pilot confirms package selection and proceeds to pay.
Amount is always the full package total (hours × rate).

```
stripe.paymentIntents.create({
  amount:   package.total_price * 100,  // Stripe uses cents
  currency: 'aud',
  customer: user.stripe_customer_id,

  // Save card for future PAYF charges
  setup_future_usage: 'off_session',

  metadata: {
    purchase_type:    'block_time',
    supabase_user_id:  user.id,
    package_id:        package.id,
    package_name:      package.name,         // e.g. "Regular Block"
    hours_purchased:   package.hours,        // e.g. 25
    rate_per_hour:     package.rate_per_hour, // e.g. 310.00
    validity_days:     package.validity_days, // e.g. 90
  },

  description: `OZ Rent A Plane — ${package.name} (${package.hours}h Block Time)`,
})
```

**Important:** Store `stripe_payment_intent_id` on the
`pilot_block_time_purchases` record immediately when the
PaymentIntent is created — before payment is confirmed.
This allows the webhook to find the purchase record.

**Do NOT activate the purchase record at this point.**
Activation only happens when the webhook fires.

---

## 3. PAYF Flight Charge — PaymentIntent

Created after pilot submits VDO reading and billing_mode = pay_as_you_fly.

```
stripe.paymentIntents.create({
  amount:   calculated_total * 100,  // VDO hours × $330 + landing fees
  currency: 'aud',
  customer: user.stripe_customer_id,

  // Charge saved card off-session (pilot already on ground, card on file)
  confirm:              true,
  off_session:          true,
  payment_method:       user.default_payment_method_id,

  metadata: {
    purchase_type:   'payf_flight',
    supabase_user_id: user.id,
    booking_id:       booking.id,
    vdo_hours:        vdo_hours,          // e.g. 3.5
    hourly_rate:      330,
    landing_fees:     landing_fee_total,  // e.g. 30.00
    invoice_number:   invoice.invoice_number,
  },

  description: `OZ Rent A Plane — Flight ${booking.reference} (${vdo_hours}h)`,
})
```

**off_session: true** means the charge fires without the pilot
being present — they're on the ground after landing.

**Error handling:** If the off-session charge fails (expired card,
insufficient funds), the invoice status stays 'awaiting' and admin
is alerted. Do not silently fail.

---

## 4. Block Time Overflow Charge — PaymentIntent

Created when VDO hours exceed remaining Block Time balance.
Overflow hours charged at the pilot's block rate (not $330).

```
stripe.paymentIntents.create({
  amount:   overflow_amount * 100,  // overflow_hours × rate_per_hour
  currency: 'aud',
  customer: user.stripe_customer_id,

  confirm:              true,
  off_session:          true,
  payment_method:       user.default_payment_method_id,

  metadata: {
    purchase_type:      'block_time_overflow',
    supabase_user_id:    user.id,
    booking_id:          booking.id,
    block_time_purchase_id: purchase.id,
    overflow_hours:      overflow_hours,
    rate_per_hour:       purchase.rate_per_hour,  // block rate, not $330
    invoice_number:      invoice.invoice_number,
  },

  description: `OZ Rent A Plane — Block Time Overflow ${booking.reference} (${overflow_hours}h)`,
})
```

---

## 5. Refund — Block Time Partial Refund

Created when admin approves a Block Time refund request.

```
stripe.refunds.create({
  payment_intent: purchase.stripe_payment_intent_id,
  amount:         refund_amount * 100,  // Partial refund — see formula below

  reason: 'requested_by_customer',

  metadata: {
    supabase_user_id:       user.id,
    block_time_purchase_id: purchase.id,
    hours_flown:            hours_flown,
    hours_refunded:         hours_remaining,
    recalc_rate:            330,  // Hours repriced at standard $330 rate
  },
})
```

**Refund formula:**
```
amount_paid      = purchase.hours_purchased × purchase.rate_per_hour
recalculated     = hours_flown × 330
refund_amount    = amount_paid - recalculated

// Example:
// 50h × $300 = $15,000 paid
// 20h flown × $330 = $6,600
// Refund = $15,000 - $6,600 = $8,400
```

Stripe only allows partial refunds up to the original charge amount.
If recalculated > amount_paid (unlikely but possible if very few hours
flown at a low block rate vs $330), refund_amount = 0. No negative refunds.

---

## 6. Webhook Events to Handle

Register one webhook endpoint in Stripe dashboard:
`POST /api/webhooks/stripe`

### Events to listen for:

| Event | Action |
|---|---|
| `payment_intent.succeeded` | Activate Block Time purchase OR mark PAYF invoice paid |
| `payment_intent.payment_failed` | Surface error, keep purchase/invoice in pending/failed state |
| `charge.refunded` | Mark purchase as refunded, close purchase record |

### Webhook handler logic:

```
switch (event.type) {

  case 'payment_intent.succeeded':
    const pi = event.data.object
    const { purchase_type } = pi.metadata

    if (purchase_type === 'block_time') {
      // 1. Find pilot_block_time_purchases by stripe_payment_intent_id
      // 2. Set status → 'active'
      // 3. Set activated_at = now()
      // 4. Set expires_at = now() + validity_days
      // 5. Set hours_remaining = hours_purchased
      // 6. Create invoice record (status: paid)
      // 7. Generate invoice PDF
      // 8. Send purchase confirmation email with PDF attached
    }

    if (purchase_type === 'payf_flight') {
      // 1. Find invoice by booking_id in metadata
      // 2. Set invoice status → 'paid', paid_at = now()
      // 3. Store stripe_payment_intent_id on invoice
      // 4. Generate invoice PDF
      // 5. Send flight receipt email with PDF attached
    }

    if (purchase_type === 'block_time_overflow') {
      // 1. Find invoice by booking_id in metadata
      // 2. Update overflow line item with confirmed charge
      // 3. Set invoice status → 'paid'
      // 4. Send updated flight receipt email
    }
    break

  case 'payment_intent.payment_failed':
    const pi = event.data.object
    // Log failure
    // If block_time: keep purchase status as 'pending', alert admin
    // If payf_flight: keep invoice as 'awaiting', alert admin
    // Surface error message to pilot if they are still in session
    break

  case 'charge.refunded':
    // 1. Find purchase by stripe_payment_intent_id
    // 2. Set purchase status → 'refunded'
    // 3. Set refunded_at, refund_amount, refund_stripe_id
    // 4. Create credit_note invoice referencing original invoice
    // 5. Send refund confirmation email
    break
}
```

### Webhook security:
Always verify the Stripe signature before processing:
```
stripe.webhooks.constructEvent(
  req.body,         // raw body — must be raw Buffer, not parsed JSON
  req.headers['stripe-signature'],
  process.env.STRIPE_WEBHOOK_SECRET
)
```

**Critical:** The webhook endpoint must receive the raw request body
(not JSON-parsed). In Next.js App Router this requires disabling
the default body parser for this route.

---

## 7. Metadata Strategy — Summary

Metadata is the bridge between Stripe events and Supabase records.
Every PaymentIntent must carry enough metadata to fully reconstruct
what happened without any additional database lookups.

| Field | Always included | Why |
|---|---|---|
| `purchase_type` | ✅ | Routes webhook handler logic |
| `supabase_user_id` | ✅ | Links to user record |
| `booking_id` | Flight only | Links to booking |
| `block_time_purchase_id` | BT only | Links to purchase record |
| `invoice_number` | ✅ | Links to invoice |
| `hours` / `rate` | ✅ | Audit trail — amounts are derivable independently |

---

## 8. Environment Variables Required

```
STRIPE_SECRET_KEY=sk_live_...          // Server only, never exposed to client
STRIPE_PUBLISHABLE_KEY=pk_live_...     // Safe for client
STRIPE_WEBHOOK_SECRET=whsec_...        // Webhook signature verification
```

Test equivalents (sk_test_, pk_test_, whsec_ from Stripe CLI):
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...        // From: stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

---

## 9. Audit Notes

The following need confirming at codebase audit before
any Stripe code is written:

1. Is `stripe_customer_id` already stored on the user record?
   If so, what column name?

2. Is a Stripe Customer already created at registration, or lazily?

3. Is there an existing `/api/webhooks/stripe` route?
   If so, what events does it currently handle?

4. Is there an existing PaymentIntent creation pattern in the codebase?
   (We want to follow the same pattern, not introduce a new one)

5. What is the current payment method storage approach?
   (Is `default_payment_method_id` stored on the user record?)

6. Is the raw body parser already disabled for the webhook route,
   or does this need to be added?
