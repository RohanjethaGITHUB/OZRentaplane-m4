# OZ Rent A Plane — Invoice Specification
## Format · GST Logic · Line Items · All Invoice Types

---

## Invoice Types

| Type | When created | Triggered by |
|---|---|---|
| `block_time_purchase` | Block Time package bought | Stripe webhook: payment_intent.succeeded |
| `flight` | Every completed flight (both PAYF and BT) | VDO submission |
| `credit_note` | Block Time refund processed | Admin approves refund |

---

## Invoice Numbering

**Format:** `OZ-YYYY-NNNNN`

- `OZ` — fixed prefix
- `YYYY` — 4-digit year (e.g. 2026)
- `NNNNN` — zero-padded 5-digit sequential number (e.g. 00001)

**Counter:** Global — one sequence across all invoice types.
Not per-type, not per-user. Clean audit trail.

**Reset:** Counter resets to 00001 on 1 January each year.
Scheduled job required (pg_cron or external cron).

**Examples:**
- First invoice of 2026: `OZ-2026-00001`
- 142nd invoice of 2026: `OZ-2026-00142`
- First invoice of 2027: `OZ-2027-00001`

---

## GST Calculation Rules

All prices on the platform are GST-inclusive.
When breaking out GST for a tax invoice, extract it from the total.

```
// All amounts in AUD

gst_rate       = 0.10  (10%)
gst_divisor    = 11    (standard AUD GST extraction)

// Given a GST-inclusive total:
subtotal       = ROUND(total / 1.10, 2)   // excl. GST
gst_amount     = ROUND(total - subtotal, 2)  // = total / 11 approximately
total          = subtotal + gst_amount    // always reconcile

// Example: $1,185.00 GST-inclusive
subtotal       = ROUND(1185 / 1.10, 2)  = $1,077.27
gst_amount     = 1185.00 - 1077.27      = $107.73
total          = 1077.27 + 107.73       = $1,185.00 ✓
```

**Rounding rule:** Always round to 2 decimal places.
Apply rounding at the line item level, then sum.
Do not round at the end — this prevents cent discrepancies.

---

## Line Item Types & Display

### flight_hours
```
Description:  "Aircraft Hire — VH-OZA Cessna 172N"
              "Wet hire · GST & fuel included"
              "Flight date: [date] · VDO reading: [hours]h"
Quantity:     [VDO hours]  e.g. 3.5
Unit price:   [rate]       e.g. $330.00 (PAYF) or $310.00 (block rate)
Amount:       qty × unit   e.g. $1,155.00
```

### overflow_hours
```
Description:  "Block Time Overflow — VH-OZA Cessna 172N"
              "Hours exceeding Block Time balance, charged at block rate"
Quantity:     [overflow hours]
Unit price:   [block rate]     e.g. $310.00
Amount:       qty × unit
```

### block_time_hours (Block Time purchase invoice)
```
Description:  "Block Time Package — [package name]"
              "Valid: [start date] – [expiry date]"
              "Wet hire · GST & fuel included"
Quantity:     [hours purchased]  e.g. 25
Unit price:   [rate per hour]    e.g. $310.00
Amount:       qty × unit         e.g. $7,750.00
```

### landing_fee
```
Description:  "Landing Fee — [aerodrome name] ([ICAO code])"
              "[count] x [landing type]"
              e.g. "Landing Fee — Bankstown (YSBK)"
                   "1 x touch & go · 1 x full stop"
Quantity:     [number of landings]
Unit price:   [fee per landing]   e.g. $15.00
Amount:       qty × unit          e.g. $30.00
```

### overnight_parking
```
Description:  "Overnight Parking — [aerodrome name] ([ICAO code])"
              "[count] night(s)"
Quantity:     [number of nights]
Unit price:   [fee per night]
Amount:       qty × unit
```

---

## Display Order on Invoice

Line items always appear in this order:

1. `flight_hours` or `block_time_hours`
2. `overflow_hours` (if present)
3. `landing_fee` (if present)
4. `overnight_parking` (if present)

Totals section always at bottom:
- Subtotal (excl. GST)
- GST (10%)
- **Total (incl. GST)** ← bold

---

## Invoice Header Fields

```
Business:     OZ Rent A Plane
Address:      Bankstown Airport, Sydney NSW 2200
ABN:          [to be confirmed — do not assume]
Phone:        [to be confirmed]
Email:        [to be confirmed]

Document:     TAX INVOICE
Invoice No:   OZ-2026-00001
Date:         [created_at formatted as DD MMM YYYY]
Due:          [same as date for paid invoices — immediate payment]
Status:       PAID / AWAITING / REFUNDED

Bill To:
  [pilot full name]
  [pilot email]
  [pilot phone — if stored]

Booking Ref:  BK-XXXXX  (flight invoices only)
Billing Mode: Pay As You Fly / Block Time  (flight invoices only)
```

---

## Invoice Footer

Standard footer on all invoices:
```
"All prices include GST. ABN: [ABN].
 Landing fees are subject to aerodrome charges and may vary.
 For queries contact [email]."
```

For Block Time purchase invoices, add:
```
"Hours are valid until [expiry date].
 Unused hours at expiry are forfeited per Terms & Conditions."
```

For credit notes, add:
```
"This credit note references invoice [original invoice number].
 Refund processed to original payment method."
```

---

## Invoice — Full Specimens

### TYPE 1: Block Time Purchase Invoice

```
┌─────────────────────────────────────────────────────────┐
│ OZ Rent A Plane                    TAX INVOICE          │
│ Bankstown Airport, Sydney NSW      Invoice: OZ-2026-00001│
│ ABN: XX XXX XXX XXX                Date: 22 Jun 2026    │
│                                    Status: PAID          │
├─────────────────────────────────────────────────────────┤
│ Bill To:                                                 │
│ Rohan Jetha                                              │
│ rohan@example.com                                        │
├──────────────────────────┬──────┬──────────┬────────────┤
│ Description              │ Qty  │ Unit     │ Amount     │
├──────────────────────────┼──────┼──────────┼────────────┤
│ Block Time Package —     │      │          │            │
│ Regular Block (25 hrs)   │ 25h  │ $310.00  │ $7,750.00  │
│ Valid: 22 Jun – 22 Sep   │      │          │            │
│ Wet hire · GST & fuel    │      │          │            │
├──────────────────────────┴──────┴──────────┼────────────┤
│                          Subtotal (excl. GST)│ $7,045.45 │
│                          GST (10%)           │   $704.55 │
│                          Total (incl. GST)   │ $7,750.00 │
└──────────────────────────────────────────────┴───────────┘
│ Payment processed via Stripe.                            │
│ Hours valid until 22 Sep 2026. Unused hours at expiry   │
│ are forfeited per Terms & Conditions.                    │
└─────────────────────────────────────────────────────────┘
```

### TYPE 2: PAYF Flight Invoice

```
┌─────────────────────────────────────────────────────────┐
│ OZ Rent A Plane                    TAX INVOICE          │
│ Bankstown Airport, Sydney NSW      Invoice: OZ-2026-00002│
│ ABN: XX XXX XXX XXX                Date: 25 Jun 2026    │
│                                    Booking: BK-00089    │
│                                    Status: PAID          │
├─────────────────────────────────────────────────────────┤
│ Bill To:                           Billing: Pay As You  │
│ Rohan Jetha                                 Fly         │
│ rohan@example.com                                        │
├──────────────────────────┬──────┬──────────┬────────────┤
│ Description              │ Qty  │ Unit     │ Amount     │
├──────────────────────────┼──────┼──────────┼────────────┤
│ Aircraft Hire — VH-OZA   │      │          │            │
│ Cessna 172N              │ 3.5h │ $330.00  │ $1,155.00  │
│ 25 Jun 2026 · VDO: 3.5h  │      │          │            │
│ Wet hire · GST & fuel    │      │          │            │
├──────────────────────────┼──────┼──────────┼────────────┤
│ Landing Fee — YSBK       │  2   │  $15.00  │    $30.00  │
│ 1x touch & go            │      │          │            │
│ 1x full stop             │      │          │            │
├──────────────────────────┴──────┴──────────┼────────────┤
│                          Subtotal (excl. GST)│ $1,077.27 │
│                          GST (10%)           │   $107.73 │
│                          Total (incl. GST)   │ $1,185.00 │
└──────────────────────────────────────────────┴───────────┘
```

### TYPE 3: Block Time Flight Invoice (deduction — no charge)

```
┌─────────────────────────────────────────────────────────┐
│ OZ Rent A Plane                    FLIGHT RECORD        │
│ Bankstown Airport, Sydney NSW      Invoice: OZ-2026-00003│
│ ABN: XX XXX XXX XXX                Date: 26 Jun 2026    │
│                                    Booking: BK-00090    │
│                                    Status: DEDUCTED      │
├─────────────────────────────────────────────────────────┤
│ Bill To:                           Billing: Block Time  │
│ Rohan Jetha                        Package: Regular     │
│ rohan@example.com                           Block       │
├──────────────────────────┬──────┬──────────┬────────────┤
│ Description              │ Qty  │ Unit     │ Amount     │
├──────────────────────────┼──────┼──────────┼────────────┤
│ Aircraft Hire — VH-OZA   │      │          │            │
│ Cessna 172N              │ 2.0h │ $310.00  │   $620.00  │
│ 26 Jun 2026 · VDO: 2.0h  │      │          │            │
│ Block Time deduction     │      │          │            │
├──────────────────────────┼──────┼──────────┼────────────┤
│ Landing Fee — YSBK       │  1   │  $15.00  │    $15.00  │
├──────────────────────────┴──────┴──────────┼────────────┤
│                          Subtotal (excl. GST)│   $577.27 │
│                          GST (10%)           │    $57.73 │
│                          Total (incl. GST)   │   $635.00 │
├─────────────────────────────────────────────────────────┤
│ Block Time balance: 23.0h remaining (expires 22 Sep)    │
│ Note: Flight hours deducted from Block Time balance.    │
│ Landing fee charged separately via Stripe.              │
└─────────────────────────────────────────────────────────┘
```

Note on Block Time flight invoices: the flight hours are
a deduction record (no Stripe charge for those hours).
However landing fees ARE still charged via Stripe even on
Block Time bookings — they are not covered by the package.

### TYPE 4: Credit Note (Refund)

```
┌─────────────────────────────────────────────────────────┐
│ OZ Rent A Plane                    CREDIT NOTE          │
│ Bankstown Airport, Sydney NSW      Credit: OZ-2026-00050 │
│ ABN: XX XXX XXX XXX                Date: 30 Jun 2026    │
│                                    Ref: OZ-2026-00001   │
│                                    Status: REFUNDED      │
├─────────────────────────────────────────────────────────┤
│ Credit To:                                               │
│ Rohan Jetha · rohan@example.com                          │
├──────────────────────────┬──────┬──────────┬────────────┤
│ Description              │ Qty  │ Unit     │ Amount     │
├──────────────────────────┼──────┼──────────┼────────────┤
│ Refund — Regular Block   │      │          │            │
│ Original: 25h @ $310/hr  │      │          │            │
│ Hours flown: 6h          │      │          │            │
│ Hours refunded: 19h      │ 19h  │ n/a      │            │
├──────────────────────────┴──────┴──────────┼────────────┤
│ Amount originally paid                      │ $7,750.00 │
│ Hours flown (6h) repriced @ $330/hr         │ -$1,980.00│
│ Refund amount                               │ $5,770.00 │
└──────────────────────────────────────────────┴───────────┘
│ Refund processed to original Stripe payment method.     │
│ This credit note references invoice OZ-2026-00001.      │
└─────────────────────────────────────────────────────────┘
```

---

## PDF Generation Notes

- Generate PDF server-side (not client-side)
- Recommended library: `@react-pdf/renderer` or `puppeteer`
  (audit will confirm which is already available or preferred)
- Store generated PDF in Supabase Storage:
  Path: `invoices/{user_id}/{invoice_number}.pdf`
- Store public URL in `invoices.pdf_url` column
- Generate PDF immediately after invoice record is created
- Attach PDF to confirmation email

---

## Important Business Rule — Block Time Landing Fees

Landing fees are NOT covered by Block Time packages.
Packages cover: aircraft hire hours only (wet hire, GST, fuel).

Landing fees are always an additional Stripe charge,
regardless of billing mode.

This means a Block Time flight invoice has:
- Flight hours line item → deduction (no Stripe charge)
- Landing fee line item → Stripe charge fires
- These may need to be two separate Stripe PaymentIntents,
  or one PaymentIntent for landing fees only on BT flights.
  Confirm approach at audit stage.
