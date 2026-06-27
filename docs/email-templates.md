# OZ Rent A Plane — Email Templates
## All 5 transactional emails · Subject lines · Copy · Dynamic variables

---

## Variable Reference

All dynamic variables use {curly_brace} notation.
These map to data available at send time.

### User variables
```
{pilot_first_name}      — e.g. "Rohan"
{pilot_full_name}       — e.g. "Rohan Jetha"
{pilot_email}           — e.g. "rohan@example.com"
```

### Package variables
```
{package_name}          — e.g. "Regular Block"
{package_hours}         — e.g. "25"
{package_rate}          — e.g. "$310.00"
{package_total}         — e.g. "$7,750.00"
{package_expiry_date}   — e.g. "22 September 2026"
{hours_remaining}       — e.g. "18.5"
{balance_percentage}    — e.g. "74"  (% of hours remaining)
```

### Flight variables
```
{booking_reference}     — e.g. "BK-00089"
{flight_date}           — e.g. "25 June 2026"
{aircraft_registration} — e.g. "VH-OZA"
{vdo_hours}             — e.g. "3.5"
{billing_mode}          — "Pay As You Fly" or "Block Time"
{flight_total}          — e.g. "$1,185.00" (incl. GST)
{landing_fee_total}     — e.g. "$30.00"
{hours_deducted}        — e.g. "3.5" (Block Time only)
{hours_after_flight}    — e.g. "21.5" (Block Time only)
```

### Invoice variables
```
{invoice_number}        — e.g. "OZ-2026-00001"
{invoice_date}          — e.g. "22 June 2026"
{invoice_pdf_url}       — Supabase Storage URL for PDF download
```

### Refund variables
```
{hours_flown}           — e.g. "6"
{hours_refunded}        — e.g. "19"
{amount_paid_original}  — e.g. "$7,750.00"
{amount_charged_at_330} — e.g. "$1,980.00"
{refund_amount}         — e.g. "$5,770.00"
{original_invoice_number} — e.g. "OZ-2026-00001"
```

---

## EMAIL 1: Block Time Purchase Confirmation

**Trigger:** Stripe webhook `payment_intent.succeeded` for purchase_type = block_time

**Subject:** Your {package_hours}-hour Block Time package is active — OZ Rent A Plane

---

Hi {pilot_first_name},

Your Block Time package is confirmed and your hours are ready to use.

**Package details**
- Package: {package_name} ({package_hours} hours)
- Rate: {package_rate}/hr (GST & fuel included)
- Total paid: {package_total}
- Hours credited: {package_hours}h
- Valid until: {package_expiry_date}

**How it works**
Every time you fly, the actual hours from your VDO meter reading will be automatically deducted from your balance. You can view your remaining balance and usage history anytime in your dashboard.

Landing fees and overnight parking are charged separately per flight and are not included in your package.

**[View your Block Time balance →]**
(link to /dashboard/block-time)

Your tax invoice ({invoice_number}) is attached to this email.

If you have any questions, reply to this email or contact us directly.

Safe flying,
The OZ Rent A Plane Team

---

*This is a tax invoice. ABN: [ABN]. All prices include GST.*

---

## EMAIL 2: Flight Receipt — Pay As You Fly

**Trigger:** VDO submission confirmed + Stripe payment succeeded for billing_mode = pay_as_you_fly

**Subject:** Flight receipt — {booking_reference} · {flight_date}

---

Hi {pilot_first_name},

Thanks for flying with us. Here's your receipt for today's flight.

**Flight summary**
- Booking: {booking_reference}
- Date: {flight_date}
- Aircraft: {aircraft_registration}
- Hours flown (VDO): {vdo_hours}h
- Rate: $330.00/hr

**Amount charged**
- Aircraft hire ({vdo_hours}h × $330): {flight_hire_total}
- Landing fees: {landing_fee_total}
- **Total charged: {flight_total}**

Your tax invoice ({invoice_number}) is attached to this email.

**[View invoice →]**
(link to /dashboard/invoices/{invoice_number})

---

*Flying regularly? A Block Time package could save you money.*
*At your current flying rate, a {upsell_package_name} at {upsell_rate}/hr*
*would save you {upsell_saving} compared to Pay As You Fly.*
*[Explore Block Time packages →]*

---
Note: {upsell_block} is only shown if pilot is within 70–80% of a
combo threshold. Omit entirely if not applicable.

---

Safe flying,
The OZ Rent A Plane Team

---

## EMAIL 3: Flight Receipt — Block Time

**Trigger:** VDO submission confirmed for billing_mode = block_time

**Subject:** Flight record — {booking_reference} · {vdo_hours}h deducted

---

Hi {pilot_first_name},

Your flight record has been confirmed. Here's a summary of your Block Time usage.

**Flight summary**
- Booking: {booking_reference}
- Date: {flight_date}
- Aircraft: {aircraft_registration}
- Hours flown (VDO): {vdo_hours}h
- Deducted from: {package_name}

**Block Time balance**
- Hours deducted this flight: {hours_deducted}h
- Remaining balance: **{hours_after_flight}h**
- Package expires: {package_expiry_date}

[Show overflow section only if overflow_hours > 0:]
**Overflow charge**
Your balance covered {balance_covered}h of this flight.
The remaining {overflow_hours}h were charged at your block rate of {package_rate}/hr.
Overflow charge: {overflow_amount} — charged to your card on file.

**Landing fees**
Landing fees of {landing_fee_total} have been charged separately.

Your flight record ({invoice_number}) is attached to this email.

**[View your balance →]**
(link to /dashboard/block-time)

[Show low balance warning only if hours_after_flight < 20% of package_hours:]
---
**Your balance is running low.**
You have {hours_after_flight}h remaining. Top up now to keep your
{package_rate}/hr rate locked in.
**[Top up your hours →]**
---

Safe flying,
The OZ Rent A Plane Team

---

## EMAIL 4: Package Expiry Reminder (7 days)

**Trigger:** Scheduled job — fires 7 days before expires_at for all status = active packages

**Subject:** Your Block Time package expires in 7 days — {hours_remaining}h remaining

---

Hi {pilot_first_name},

Just a heads up — your Block Time package expires in 7 days on {package_expiry_date}.

**Your current balance**
- Package: {package_name}
- Hours remaining: {hours_remaining}h
- Expires: {package_expiry_date}

Any unused hours will expire on this date.

**Want to keep flying at your locked rate?**
Top up now and your {package_rate}/hr rate continues for another
{validity_period}. You only need to add a minimum top-up to renew
your validity window.

**[Top up your hours →]**
(link to /dashboard/block-time)

If you have any questions about your package, reply to this email.

Safe flying,
The OZ Rent A Plane Team

---

*Note: Unused hours at expiry are forfeited per our Terms & Conditions.*

---

## EMAIL 5: Post-Expiry Win-Back

**Trigger:** Fired after a pilot's first completed PAYF flight following a Block Time package expiry

**Subject:** You flew today — here's what your old rate would have saved you

---

Hi {pilot_first_name},

Great to see you flying again.

Your Block Time package expired on {package_expiry_date}, so today's
flight was charged at the standard Pay As You Fly rate of $330/hr.

**Today's flight**
- Hours flown: {vdo_hours}h
- Charged at: $330/hr
- Amount charged: {flight_total}

**What your previous rate would have saved**
- Your old rate: {old_package_rate}/hr
- Cost at old rate: {cost_at_old_rate}
- **You could have saved: {win_back_saving}**

Ready to lock in your rate again?

**[View Block Time packages →]**
(link to /block-time)

Safe flying,
The OZ Rent A Plane Team

---

## Implementation Notes

### Send timing
| Email | When to send |
|---|---|
| Purchase confirmation | Immediately on Stripe webhook success |
| PAYF flight receipt | Immediately on VDO submission + Stripe success |
| Block Time flight record | Immediately on VDO submission |
| Expiry reminder | 7 days before expires_at — run daily cron at 8am AEST |
| Win-back | After first PAYF flight post-expiry — triggered in billing logic |

### Attachments
Emails 1, 2, 3 attach the invoice PDF.
Emails 4 and 5 have no attachment.

### From address
All emails sent from the same address currently used in the codebase.
Confirm at audit — do not assume.

### Resend implementation
Each email is a separate Resend template or React Email component.
Dynamic variables injected at send time from server-side data.
No sensitive data (card numbers, full payment details) in email body —
those live on the invoice PDF only.

### Upsell block in Email 2 (PAYF receipt)
Only include the upsell block if:
```
pilot.cumulative_vdo_hours >= (combo_threshold * 0.70)
```
Calculate closest applicable combo threshold at send time.
If no threshold is reached, omit the upsell block entirely.
Never show a generic upsell in the receipt — only show it if the
numbers actually make sense for that pilot.
