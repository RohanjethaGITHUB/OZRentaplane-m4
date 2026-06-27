# OZ Rent A Plane — Upsell Logic & Formulas
## All triggers · Exact calculations · Pseudocode

---

## Combo Thresholds Reference

| Package       | Hours | Rate    | Trigger at (70%) |
|---------------|-------|---------|------------------|
| Starter Block | 10h   | $320/hr | 7h               |
| Regular Block | 25h   | $310/hr | 17.5h            |
| Committed     | 50h   | $300/hr | 35h              |
| Pro Block     | 100h  | $290/hr | 70h              |

---

## UPSELL 1: Booking Interstitial — New Pilot (0 completed flights)

**When:** Pilot is on PAYF, has 0 completed flights, proceeds to booking confirmation step.

**Logic:**
```
if pilot.completed_flights === 0 AND pilot.billing_mode === 'pay_as_you_fly':
  show GENERIC upsell card

  Message:
    "Flying regularly? Lock in your hours and save on every flight."
    "Instead of $330/hr each time, a 10-hour Block Time package
     locks in $320/hr — saving you $10 on every hour you fly."

  CTA: [Explore Block Time packages]
  Dismissable: yes — [Continue with Pay As You Fly]
```

**No estimates, no personalisation — pure value proposition.**
This pilot has no history so show the 10h package as the entry point.

---

## UPSELL 2: Booking Interstitial — Returning PAYF Pilot

**When:** Pilot is on PAYF, has 1+ completed flights, proceeds to booking confirmation step.

**Step 1 — Calculate average VDO hours per flight:**
```
avg_vdo_per_flight = pilot.total_vdo_hours_all_time / pilot.completed_flights

// Example: 6.5h total across 3 flights = 2.17h avg
```

**Step 2 — Project total after this flight:**
```
projected_total = pilot.total_vdo_hours_all_time + avg_vdo_per_flight

// Example: 6.5 + 2.17 = 8.67h projected
```

**Step 3 — Find applicable combo:**
```
// Check thresholds from smallest to largest
// Show upsell for the FIRST threshold where projected_total >= threshold * 0.70

thresholds = [
  { hours: 10,  rate: 320, trigger: 7.0  },
  { hours: 25,  rate: 310, trigger: 17.5 },
  { hours: 50,  rate: 300, trigger: 35.0 },
  { hours: 100, rate: 290, trigger: 70.0 },
]

applicable_combo = null
for combo in thresholds:
  if projected_total >= combo.trigger:
    applicable_combo = combo
    // Don't break — keep checking in case they qualify for a larger one
    // Use the LARGEST applicable combo (most savings)

// Use the largest applicable combo, not the smallest
```

**Step 4 — Calculate dollar saving (the hook):**
```
if applicable_combo is not null:

  // What they've already paid at PAYF rate
  already_paid_payf = pilot.total_vdo_hours_all_time * 330

  // What those same hours would have cost at block rate
  already_paid_block = pilot.total_vdo_hours_all_time * applicable_combo.rate

  // Saving so far
  saving_so_far = already_paid_payf - already_paid_block

  // Saving on remaining hours in the package
  remaining_hours = applicable_combo.hours - pilot.total_vdo_hours_all_time
  saving_remaining = remaining_hours * (330 - applicable_combo.rate)

  // Total saving if they buy now
  total_saving = saving_so_far + saving_remaining

  show PERSONALISED upsell card

  Message:
    "You've flown {total_vdo_hours}h recently."
    "A {combo.hours}-hour Block Time package at ${combo.rate}/hr
     would have already saved you ${saving_so_far}."
    "Lock in the remaining {remaining_hours}h at ${combo.rate}/hr
     and save ${saving_remaining} more."
    "Total saving: ${total_saving}"

  Package total shown: combo.hours * combo.rate
  CTA: [Buy {combo.hours}h Block Time — ${package_total}]
  Dismissable: yes — [Continue with Pay As You Fly]

else:
  // No threshold reached — show no upsell
  // Don't show a generic upsell to returning pilots — it feels tone-deaf
  show nothing
```

---

## UPSELL 3: Booking Interstitial — Block Time Pilot (Low Balance Warning)

**When:** Pilot is on Block Time, proceeds to booking confirmation step.

**Logic:**
```
booked_slot_hours = booking.slot_duration_hours

if pilot.hours_remaining < booked_slot_hours:

  shortfall = booked_slot_hours - pilot.hours_remaining
  overflow_cost = shortfall * pilot.block_rate_per_hour

  show WARNING card (not a full upsell — just a heads up)

  Message:
    "You have {hours_remaining}h left in your package."
    "This booking is for {booked_slot_hours}h."
    "If you fly the full slot, {shortfall}h will be charged
     at your block rate of ${block_rate}/hr (${overflow_cost})."

  Options:
    [Top Up my hours]        → goes to package purchase flow
    [Continue anyway]        → proceeds to booking confirmation

// Note: we do NOT block the booking.
// Overflow is handled at billing time, not at booking time.
// This is just a transparent heads-up.
```

---

## UPSELL 4: Post-Flight — Low Balance Nudge (Block Time)

**When:** VDO submitted, Block Time deduction processed, hours_remaining drops below 20% of hours_purchased.

**Threshold:**
```
low_balance_threshold = purchase.hours_purchased * 0.20

// Examples:
// 10h package → alert at < 2h remaining
// 25h package → alert at < 5h remaining
// 50h package → alert at < 10h remaining
// 100h package → alert at < 20h remaining

if purchase.hours_remaining < low_balance_threshold:
  show low balance nudge in post-flight screen AND send in flight receipt email
```

**Message:**
```
"Your balance is running low — {hours_remaining}h remaining."
"Top up now to keep your ${rate}/hr rate locked in."

CTA: [Top Up]  → package purchase flow
```

---

## UPSELL 5: Post-Flight — Upgrade Nudge (High Burn Rate)

**When:** VDO submitted, Block Time deduction processed. Check if pilot is burning through their package faster than expected.

**Logic:**
```
days_since_activation = now() - purchase.activated_at (in days)
validity_midpoint = purchase.validity_days * 0.50
hours_used = purchase.hours_purchased - purchase.hours_remaining
hours_used_percentage = hours_used / purchase.hours_purchased

// Trigger: used more than 50% of hours before 50% of validity period
if days_since_activation < validity_midpoint AND hours_used_percentage > 0.50:

  // Find the next package tier up
  current_tier = purchase.package  // e.g. 10h
  next_tier = get_next_tier(current_tier)  // e.g. 25h

  if next_tier exists:

    saving_per_hour = current_tier.rate - next_tier.rate
    // e.g. $320 - $310 = $10/hr

    // Project remaining hours at current burn rate
    burn_rate = hours_used / days_since_activation  // hrs per day
    projected_days_until_exhausted = hours_remaining / burn_rate
    projected_total_hours_this_period = burn_rate * purchase.validity_days

    saving_on_projected = projected_total_hours_this_period * saving_per_hour

    show upgrade nudge in post-flight screen

    Message:
      "You used {hours_used}h in {days_since_activation} days."
      "At this rate, a {next_tier.hours}-hour package at
       ${next_tier.rate}/hr would save you ~${saving_on_projected}
       over the same period."

    CTA: [Upgrade to {next_tier.hours}h — ${next_tier_total}]
    Dismissable: yes
```

---

## UPSELL 6: Post-Expiry Win-Back (Email Only)

**When:** Pilot's first PAYF flight after a Block Time package has expired.

**Trigger point:**
```
// In the PAYF billing logic, after VDO submission:

recent_expired_purchase = query pilot_block_time_purchases
  WHERE user_id = pilot.id
  AND status = 'expired'
  AND expires_at > now() - interval '90 days'  // Only within last 90 days
  ORDER BY expires_at DESC
  LIMIT 1

if recent_expired_purchase exists
AND pilot.last_payf_invoice_before_this IS NULL:
  // This is their first PAYF flight since expiry
  trigger win-back email (Email 5)
```

**Calculation for email:**
```
vdo_hours = this_flight.vdo_hours
old_rate = recent_expired_purchase.rate_per_hour
payf_rate = 330

cost_at_payf = vdo_hours * payf_rate
cost_at_old_rate = vdo_hours * old_rate
win_back_saving = cost_at_payf - cost_at_old_rate

// Example: flew 3h
// At $330 = $990
// At $310 = $930
// Saving = $60 — show this in the email
```

---

## General Rules Across All Upsells

1. **Never block a booking or flight** — all upsells are dismissable.
   The pilot always has a clear "Continue anyway" path.

2. **Always show dollar amounts, not just percentages.**
   "$75 saving" converts better than "save 3%".

3. **Never show a generic upsell to a returning PAYF pilot**
   if no threshold calculation applies.
   Silence is better than an irrelevant nudge.

4. **Never show a Block Time upsell to a pilot who already has**
   an active Block Time package (except the upgrade nudge).

5. **Interstitials appear between Step 2 (slot selection)**
   **and Step 3 (booking confirmation) only.**
   Never on Step 1 (date selection) — too early.
   Never after Step 3 (confirmation) — too late.

6. **All upsell components are client components** —
   they require state for dismiss interaction.
   Keep them thin and isolated to avoid affecting booking flow performance.
