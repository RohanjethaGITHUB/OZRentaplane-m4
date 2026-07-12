# Assumptions & Judgment Calls — Post-Flight Records: Block-Time Branching, Admin Submission, No Manual Dispatch (July 2026)

Prerequisites verified before starting: migration 101 is applied to the live database and the top-up suite now runs green (63 assertions), and both the top-up feature and single-active-package enforcement are committed (`661abf6`, `d4248a4`).

## Working tree note

- **Uncommitted changes to `app/dashboard/bookings/new/` were found and left untouched.** They are a display-only "rate context" panel (block time balance vs PAYF rate on the booking form) from other in-flight work. Nothing in this task depends on them; the overage gate for new bookings was installed server-side in `createBooking()`, which that form calls, so the gate holds regardless of that panel's fate.
- **The post-flight hydration fix uses a new shared short-date helper.** I chose a deterministic `10 Jul`-style formatter instead of keeping `toLocaleDateString`, because the bug was caused by SSR/CSR locale drift and the page already had a compact short-date affordance. That keeps the visible format stable without widening the UI beyond the original no-year treatment.

## Post-flight review routing

- **`/admin/bookings/post-flight/[id]` is a separate live review route, not a dead alias for `requests/[id]`.** The sidebar still exposes both the "Awaiting Flight Records" queue and the "Post-flight Review" queue, and the post-flight detail page reuses `AdminStandardBillingPanel` by composition. Its bug was route-level context wiring: it was passing the aircraft default rate instead of the shared PAYF fallback and was not supplying the active block-time purchase row that the shared billing panel uses to lock the rate for block-time customers.
- **The duration source should be the canonical booking row, not the nested `record.bookings` relation.** For this route, I switched the panel inputs to a direct `bookings` lookup keyed by `record.booking_id` so the scheduled window and `bookingSlotHours` come from the same booking row shape used by the requests flow.
- **The previous ID-shape fallback verification was on substitute data and did not prove this literal booking.** On `/admin/bookings/post-flight/af46e50a-06fe-47d0-9eee-4a5498446fc2`, the page now resolves as a real flight record (`vdo_total = 10.0h`) linked to booking `4afaa974-8c3a-4a11-b4fc-ad8ce6283933` with `scheduled_start = 2026-10-01T23:15:00Z` and `scheduled_end = 2026-10-04T13:45:00Z`; the helper computes `bookingSlotHours = 62.5`, `bookingDays = 2`, and `minimumVdoHours = 8.0`. Because `actualVdoHours` is above the minimum, the yellow below-minimum box should not render for this specific booking.

## Step 1 — Remove manual dispatch

- **`ready_for_dispatch` stays; only the Mark Dispatched action is gone.** The brief removed the dispatch step, not the "aircraft prepared" marker. The operational panel now offers Mark Aircraft Returned from `confirmed`, `ready_for_dispatch`, and (for legacy rows) `dispatched`; `adminMarkAircraftReturned()` accepts those three prior states. The `dispatched` status value, the customer submission path's allowed-status list, and all display-only labels are untouched per the audit.
- **The queue/badge count status sets keep `'dispatched'` in their `.in(...)` filters.** Legacy dispatched bookings must still be counted while they drain out of the system; the sets already include the states the new flow actually uses. The only UI change was removing the now-dead "In Progress (dispatched)" tab from the admin booking list filter.

## Step 2 — Admin-initiated submission

- **Reuse is by composition, not extraction of the billing logic.** The record-creation logic was extracted into a shared core (`lib/booking/flight-record-submission.ts`) used by both the customer and admin actions. The billing/branching logic already lived in `finaliseStandardBookingInvoice()` (not inline in `submitFlightRecord()` as the brief suspected), so `adminSubmitFlightRecord()` simply calls the core and then that same finalisation function — zero duplicated billing code.
- **Admin submission is one step: record + billing together.** The readings are admin-entered, so a separate review pass would be the admin reviewing themselves. The action creates the record via the shared core (booking briefly passes through `pending_post_flight_review`, exactly like a customer submission) and immediately finalises billing with the same rate/landing inputs. The customer receives the same "flight record submitted" email (sent by the shared core to the booking owner) plus the same billing-outcome email.
- **"Any status" reads as any status where no record is already in the pipeline.** Allowed: pending_confirmation, confirmed, ready_for_dispatch, dispatched, awaiting_flight_record, flight_record_overdue, on_hold_pending_documents. Excluded: cancelled/cancellation-requested (nothing to bill), and every post-submission state (a record already exists — the existing billing/clarification panels handle those). Checkout bookings are excluded: they have their own outcome-recording flow and no flight-record pipeline.
- **Early submission releases the booking's remaining schedule blocks.** If the admin submits before `scheduled_end`, the flight evidently already happened; a completed booking holding a future slot would block other customers, so active blocks linked to the booking are cancelled (same mechanism the cancellation flow uses).

## Step 3 — Overage gate + separate invoices (migration 104, NOT YET APPLIED)

- **The overage is no longer auto-charged to the saved card.** The previous drawdown charged overage off-session immediately. The brief's confirmed spec describes an *invoice* that is *flagged* and *gates* future purchases/bookings "until paid" — an automatic charge would make the gate meaningless, and the (still-queued) combined-checkout brief only makes sense against an unpaid invoice. The overage invoice is created as `awaiting` with `is_block_time_overage = true` at the package's locked rate.
- **How the customer pays it:** a "Pay now" button on /dashboard/block-time starts a Stripe Checkout session (`purchase_type=block_time_overage_payment`); the webhook marks the invoice paid, which lifts the gate automatically. The gate itself is enforced server-side in `createBooking()`, `createBlockTimePurchaseIntent()`, and `createBlockTimeTopupIntent()` (top-ups count as "future purchases"), with the shared query in `lib/payments/block-time-overage.ts`.
- **The booking still completes even with an unpaid overage.** The hours were flown and deducted; the debt is tracked on the invoice and enforced by the gate, not by holding the booking in a payment state (the PAYF `payment_pending` machinery is a different invoice table and flow).
- **One drawdown now creates up to three invoices** (usage/overage/landing) instead of one combined document: usage is created `paid` (settled by block time), overage `awaiting` + flagged, landing fees `awaiting` and then collected off-session against the saved card exactly as before — but now marked paid only after the charge actually succeeds (previously the combined invoice was marked paid before the charge was attempted). Landing-fee collection failure alerts the admin as before; the landing invoice does not gate.
- **Landing fees invoiced separately applies to the block-time path only.** Flow 2 (PAYF) is explicitly "unchanged", so the PAYF invoice keeps hours + landing fees on one document as today; "regardless of hours billing path" is read as: within Flow 1, the landing invoice is created whether or not the flight overflowed (both covered in the suite).
- **A GST-breakdown helper was added in the migration** because the invoices table enforces `gst = ROUND(subtotal/10, 2)` and `total = subtotal + gst`, and the previous `subtotal = ROUND(total/1.1)` derivation violates that constraint for some totals (e.g. exactly $500.00 — the old function only survived because catalogue rates never produced such a total). The helper finds a constraint-consistent split preserving the target total, shifting the total by at most one cent when no exact split exists (line items always keep the exact hours × rate amount).
- **Admin flagging** is a high-visibility `verification_events` alert at finalisation ("BLOCK TIME OVERAGE — unpaid overage invoice issued"), a red flag block + per-invoice OVERAGE badges in the admin customer profile's Billing tab (new "Block time flight invoices" section), and the invoice itself carries the flag in its line description, PDF billing-mode label, and footer.
- **The booking-form gate is server-side only for now.** The uncommitted in-flight work on `bookings/new` made adding a UI banner there risky; the gate error from `createBooking()` surfaces through the form's normal error display, and the Block Time page carries the full outstanding-overage banner with the payment button.

## Step 5 — Testing

- **The suite (`scripts/test_post_flight_billing_suite.mjs`, port 3035) follows the prior suites' conventions**: linked remote database, disposable users, real signed Stripe events at the real webhook route, emails suppressed, full cleanup.
- **The shared submission core is tested as production code**: compiled from TypeScript and driven directly against the database (with only `next/cache` and `server-only` stubbed), covering admin-initiated submission for both billing types, the audit trail, and the confirmation-email firing (asserted via the `email_events` row the email pipeline writes even when sending is suppressed).
- **The server actions' glue** (auth guards, status gates, and the `adminSubmitFlightRecord` composition) isn't drivable outside a browser session, matching the prior suites' documented limitation; the composition itself is asserted at source level, and every decision-making layer (shared core, drawdown RPC, PAYF RPC, webhook) is exercised for real.
- **Suite status at hand-off: written but not yet green — it aborts at preflight because migration 104 has not been applied to the remote database** (schema changes are applied manually by the project owner). Once 104 is applied, run `node scripts/test_post_flight_billing_suite.mjs`; the task isn't complete until it passes.

---

# Assumptions & Judgment Calls — Block Time Top-Up (July 2026, second run)

Prerequisites re-verified before starting: the live database now has the corrected validity periods and rejects a second active package (probed with a disposable user, cleaned up), and both are committed (`d4248a4`).

## Step 0 — Booking documents lock redesign

- **State mapping for the 3-step indicator is judgment-based.** I mapped `missing` documents to step 1 as the current step, `needs_review` to step 2 as the current step, and fully `complete` document sets to all three steps complete so the lock lifts. That keeps the visual ladder aligned with the actual document gate states already returned by `evaluateBookingDocumentsReadiness()`.
- **Missing-document copy is intentionally different from the under-review copy.** When documents are missing entirely, the banner says `Please upload your documents` and explains that booking unlocks after the team reviews and approves them. When uploads exist but are still pending review, the banner switches to `Your documents are under review` with the review-time label `Up to 24 hours`.
- **The locked booking-type cards use a dark overlay instead of blur.** The reference image reads as a muted, legible lock state rather than a softened background effect, so the booking-type cards now use a navy overlay with per-card lock captions at the bottom instead of a large shared lock icon.

## Step 1 — Database (migration 101)

- **The atomic update is a database function, not application logic.** A top-up must change three fields on the purchase row (hours purchased, hours remaining, expiry) plus write a history row, all-or-nothing, while flights may be drawing the same balance down concurrently. The app talks to the database through an API that can't lock rows across calls, so this lives in `apply_block_time_topup()`, which locks the purchase row the same way `process_block_time_flight()` does. Concurrent top-ups and flights therefore queue up one at a time instead of overwriting each other.
- **A payment can only ever be applied once, at the database level.** Each top-up records its Stripe payment id in a column that refuses duplicates, and the function returns the already-recorded result instead of applying twice. This is a second seatbelt under the existing webhook event-id dedupe.
- **The history table records more than the brief listed.** Besides the required fields, each top-up stores the balance before/after and the expiry before/after. Cost is negligible and it turns the table into a real audit trail (and gives the admin view its "resulting extension" column for free).
- **Top-up receipts get their own invoice type (`block_time_topup`).** Reusing the existing `block_time_purchase` type would make every report or screen that counts package purchases silently include top-ups. The allowed-types rule on the invoices table is extended instead.
- **`amount_paid` on the purchase row grows with each top-up.** The database enforces `amount_paid = hours_purchased × rate`, so extending hours requires extending the amount too. The row's `amount_paid` therefore means "total paid into this package including top-ups" from now on (in rare cases this can differ from the sum of individual charges by one cent due to rounding — the row is recomputed from total hours so the database rule always holds).
- **Expiry extension rounds up on odd validity periods.** Half of the package's validity is added per top-up; if a package ever has an odd validity (none does today: 30→15, 60→30, 90→45, 180→90), the customer gets the extra day.
- **A package that hit zero hours while the payment was in flight can still receive its top-up.** If the customer flies their last hours in the minutes between starting a top-up and the payment confirming, the package is 'exhausted' when the money arrives. The function accepts that case and revives the package (which also puts it back at the end of the FIFO queue, per the existing trigger). Expired or refunded packages are refused. Edge case: if the customer had somehow activated a *new* package in that window, reviving the old one would violate the one-active-package rule and the webhook would alert the admin rather than apply silently.
- **No role check inside the function**, following the existing convention (`process_block_time_flight` works the same way): it is only callable in practice by the server-side webhook using the service key, and the customer-facing entry point does its own ownership checks.

## Step 2 — Server action + Stripe flow

- **No "pending" row is created when a top-up starts.** A new purchase reserves a pending database row before payment; a top-up doesn't need one because the purchase row already exists — everything the webhook needs travels in the Stripe payment metadata. This also means an abandoned top-up checkout leaves no clutter behind (no "pending top-up" states to explain to customers).
- **The 10% minimum is measured against the row's current `hours_purchased`.** Since top-ups increase `hours_purchased`, the minimum for the *next* top-up grows accordingly (top up a 10h package by 5h and the next minimum is 1.5h, not 1h). The brief's wording contrasts "purchased" with "remaining" rather than "original catalogue size", and this reading keeps the rule proportional to the package's real size. Fractional hours are allowed to two decimals, matching how flight hours are recorded.
- **Expired-but-not-yet-swept packages are refused at the start.** A package still marked 'active' whose expiry date has passed can't begin a top-up (the customer would be paying to extend something that's about to be marked expired). The expiry sweep will catch it; the customer buys fresh instead.
- **The shared minimum/extension math lives in `lib/payments/block-time-topup.ts`**, used by both the server action and the customer preview, so the two can't drift apart. (It can't live in the actions file itself — that file only exports server actions.)
- **Webhook failure handling: money-taken-but-not-applied raises an admin alert.** If the payment succeeds but the hours can't be credited (bad metadata, package refunded in the meantime, the exhausted-then-new-package edge), the webhook posts a high-visibility follow-up to the existing admin alert channel (same pattern as failed off-session charges) instead of failing silently. Where a retry could plausibly succeed, the webhook also returns an error so Stripe retries.
- **A replayed event never re-sends the confirmation email**: the receipt invoice is looked up by payment id, and the email/PDF step only runs when the top-up was newly applied.
- **One-line safety fix to the existing purchase webhook branch (logged as the exception to "touch nothing else"):** its "has this purchase already been invoiced?" lookup fetched by purchase id alone and errors if more than one invoice matches. Flight invoices already share that purchase id (latent bug), and top-up receipts now do too, so the lookup is filtered to purchase-type invoices only. Behavior is otherwise identical.

## Step 3 — Customer-facing UI

- **The top-up form lives inside the "Current balance" summary card**, directly under the active package's balance bar, replacing the "coming soon" pill (which is now a link that scrolls to the form). Rationale: the top-up belongs visually to the package it extends, not to the "buy new package" grid below.
- **The preview is computed in the browser from the same shared rules module the server uses**, so what the customer sees (hours added, cost at the locked-in rate, new balance, new expiry with the "+N days" chip) is exactly what the server will charge and apply. The server still re-validates everything on submission.
- **The input defaults to the minimum top-up** with a 0.5-hour stepper, and the confirm button itself states the commitment ("Top up 2h for $640.00") so there's no surprise at Stripe checkout.
- **Amber confirm button.** Following the page's own established convention that amber is the block-time "commit money" accent (featured package buy button), while navy stays for navigation.
- **The package cards' action slot now points active-package holders at the top-up form** instead of the old "coming soon" text — buying a second package is still impossible, but the dead end now has an exit.
- **After Stripe redirects back, the page shows a "payment received / hours being added" banner** rather than pretending the update is instant — the hours land when Stripe's webhook fires, usually within seconds, and the banner says so. A cancelled checkout gets a "no payment taken" banner.
- **No clearance re-check for top-ups.** Buying block time requires checkout clearance; a top-up requires an *active package*, which could only have been bought while cleared. The form only renders when an active package exists, and the server action's ownership + active-status checks are the real gate.

## Step 4 — Admin-facing UI

- **The top-up history is its own card directly under "Block time purchases"** in the Billing tab, cloning that section's structure (white card, thin border, uppercase heading, row-separated list). It is read-only — there is no admin action to take on a historical top-up, so unlike the purchases section it carries no buttons.
- **Each row shows slightly more than the brief's minimum**: hours added, amount, date, and validity extension as required, plus the locked rate it was charged at and the balance before → after (the audit columns from Step 1), because "did the customer really get their hours?" is the first question an admin will ask when looking here.

## Step 5 — Testing

- **The suite (`scripts/test_block_time_topup_suite.mjs`) follows the prior suite's conventions**: linked remote database, disposable clearly-named test users, real signed Stripe events POSTed at the actual webhook route on a local dev server (port 3034 so it can't collide with the older suite), emails suppressed, everything cleaned up afterwards.
- **The 10%-minimum boundary is tested against the production code, not a copy.** The shared rules module is compiled from its TypeScript source at test time and the compiled output is exercised directly (below minimum rejected, at/above accepted, minimum grows after a top-up). The server action's surrounding glue (login, ownership, active-status, expiry checks) mirrors the existing purchase action's glue and, like it, isn't drivable outside a browser session — the parts of it that make decisions are exactly the shared module and the database function, both covered.
- **Locked-rate coverage creates a purchase whose stored rate deliberately differs from the catalogue rate** ($250 vs the package's current price) rather than editing the shared catalogue mid-test; the suite then proves the top-up charged and recorded $250.
- **Double-fire is covered twice over**: the same event id (event dedupe) and the same payment under a fresh event id (the database-level idempotency), since Stripe can do both.
- **Suite status at hand-off: written but not yet green — it aborts at preflight because migration 101 has not been applied to the remote database** (schema changes are applied manually by the project owner, per standing workflow). The rules-module assertions were verified independently and pass. Once 101 is applied, run `node scripts/test_block_time_topup_suite.mjs`; per the brief the task isn't complete until it passes.

---

# Assumptions & Judgment Calls — Overage Invoice Gate + Combined Checkout (July 2026)

## Prerequisite check — task stopped before Step 1

- **The brief required the top-up feature (prior brief) to be complete and committed before starting. It is neither**, so per the brief the task was stopped before any code was written.
- **What was actually found.** Since the top-up brief was first blocked (see the section below), someone has applied that brief's *prerequisites*: the live database now has the corrected validity periods (Starter 30 / Regular 60 / Committed 90 / Pro 180), the customer who held two active packages has been resolved (only one active purchase exists system-wide now), migration files 099 (single-active enforcement) and 100 (validity update) exist in the repo, and the purchase flow now refuses a second package with a "top up instead" message. But the top-up feature itself — the top-up history table, the `createBlockTimeTopupIntent` action, the webhook branch, the customer and admin UI, and its test suite — does not exist; the dashboard shows a "top-up coming soon" placeholder.
- **None of that prerequisite work is committed either** — it sits as uncommitted/untracked changes on `feature/block-time-billing-v2`.
- **Why this matters for this brief specifically:** the combined-checkout flow (Step 4) is defined as settling an outstanding overage invoice *inside a new purchase or top-up checkout*, and Step 2 modifies `createBlockTimePurchaseIntent` in ways that must compose with the top-up action. Building that against a purchase flow that is about to change under it would produce rework and merge conflicts, which is presumably why the brief ordered them this way.

---

# Assumptions & Judgment Calls — Block Time Top-Up (July 2026)

## Prerequisite check — task stopped before Step 1

- **The brief required two things to already be in place before building top-ups: single-active-package enforcement, and corrected package validity periods (Starter 30 / Regular 60 / Committed 90 / Pro 180 days). Neither is in place**, so per the brief the task was stopped before any code was written.
- **How this was verified.** The live database (the source of truth, since schema changes are applied manually through the Supabase dashboard) was checked directly. The package validity periods still show the old values (Regular 90, Committed 180, Pro 270). For the single-active rule, a disposable probe user was created, two 'active' purchases were inserted for it, and the database accepted both — proving no enforcement exists. The probe user and its rows were deleted immediately afterwards.
- **A real customer currently holds two active packages** (one of three active purchases in the system belongs to a user with two). This matters because whoever applies the single-active enforcement will have to decide what to do with that existing data first — a unique constraint cannot be applied while it's violated.

---

# Assumptions & Judgment Calls — Block Time Dashboard, Refunds, Webhook Dedupe

This file logs every decision made during this task that wasn't explicitly spelled out in the brief, in plain language.

## Checkout payment source flag

- **`mark_checkout_invoice_paid_atomic` is now source-aware instead of Stripe-only.** I added a boolean source flag so the Stripe webhook keeps the existing recovery behavior while manual admin checkout settlements skip the fabricated `stripe_payment` ledger insert and leave the invoice payment method set by the manual caller.
- **Manual checkout settlement leaves `checkout_invoices.payment_method` untouched.** The manual source is captured on the ledger row instead, because the checkout invoice column is still constrained to non-cash values and the paid RPC already records the actual settled state.
- **Customer profile billing should reflect money-in rows, not spendable credit.** The Overview tab billing stat now sums positive payment-ledger inflows so it tracks actual paid revenue instead of the separate credit balance.

## Step 1 — PackageCard

- **Theme prop instead of fixed themes.** The brief described /pricing as "light theme" and the dashboard as "dark theme", but in the actual site the pricing page's block-time section sits on a dark navy background, and the customer dashboard uses white cards on a light blue background. Rather than hard-coding either look, PackageCard takes a `variant` prop (`"dark"` or `"light"`) so it renders correctly wherever it's used.
- **The card doesn't own its buy button.** Where the card is used decides what happens when you click "buy" (marketing page sends you to login; dashboard starts a Stripe purchase). So the card accepts the button as a slot (`action`) from the page using it, keeping the card reusable.
- **Static and live data have different shapes.** The marketing page uses pre-written text like "$310/hr" while the database stores numbers like 310. The card accepts both and formats numbers itself; the per-hour saving vs Pay As You Fly ($330/hr) is only shown when the rate is a real number.

## Step 2 — /dashboard/block-time

- **Added a sidebar link.** A new page nobody can find isn't useful, so a "Block Time" link was added to the customer sidebar under the Bookings group (locked until the pilot is cleared to fly, same as other booking links).
- **Pending purchases can't be "resumed".** When a purchase is started but payment never completed, we don't keep the Stripe payment link around. The pending section explains the situation and tells the customer to simply start a new purchase (or that the row will activate automatically if payment did go through). It does not try to reopen the old payment page.
- **Purchase gating matches the existing dashboard.** Only pilots cleared to fly can buy block time (same rule as the existing purchase flow on /dashboard).
- **Buy-button colour.** The brief reserves amber for accent/override indicators, but every existing block-time purchase button in the app is amber. Compromise following the pricing page's own convention: only the highlighted "best value" package gets an amber button; the others use the standard navy button.
- **"Best value" highlight.** The live database has no "featured" flag on packages, so the page highlights the second-largest package ("Committed Block" today), matching what the marketing page presents as featured.
- **OPEN QUESTION (not decided here, per the brief):** should the block-time balance banner stay on the main /dashboard page as a small summary linking to the new page, or be removed entirely now that a dedicated page exists? Left untouched for now — needs a product decision.

## Step 3 — Refunds

- **Only fully unused packages can be refunded.** If any hours have been flown against a package, the refund button is disabled and the server refuses the refund. Reasoning: a partially-used package has already produced flight invoices at the discounted block rate; refunding the remainder would mean re-billing those flights at the standard rate and issuing credit notes — real accounting work that should be a deliberate business decision, not something this task invents. Exceptional cases can still be handled manually in the Stripe dashboard.
- **Refunds are full refunds.** Because only untouched packages qualify, the refund is always for the full amount paid. Stripe is asked to refund the original payment in full.
- **Order of operations protects against double-spending.** The package is first marked "refunded" in the database (which immediately stops it being used for flights), then the money is refunded in Stripe. If Stripe fails, the package is put back to "active". If the final bookkeeping write fails after Stripe already refunded, an admin alert is raised so it can be fixed by hand — the money side is never silently wrong.
- **Only 'active' packages qualify.** 'Pending' purchases were never paid, so there's nothing to refund; 'exhausted'/'expired' packages were consumed, so they don't qualify either.
- **The purchase invoice is marked "refunded"** (the invoices table already supports that status). No credit-note PDF is generated — that machinery doesn't exist yet and wasn't asked for.
- **A failed refund attempt moves the package to the back of the queue.** If Stripe rejects the refund and the package is restored to active, the existing queue trigger gives it a fresh (last) queue position instead of its original one. Considered acceptable for a rare failure case, since the package was untouched anyway.
- **Refund database functions follow the existing convention of no built-in role check** (the drawdown function works the same way); admin-only access is enforced in the server action, which is the only caller.

## Step 4 — Webhook dedupe

- **Dedupe insert is not literally in the same database transaction** for most webhook paths, because the webhook handler makes several separate database calls from JavaScript rather than one transaction. The brief said "where possible" — the event ID is recorded immediately after the critical payment update succeeds and before the optional email/notification work, and the existing purchase/invoice-based checks are kept as a second line of defence. Putting everything in one transaction would have meant rewriting the payment RPCs, which felt too invasive for an "additive protection" step.
- **A failed run can be retried.** The event ID is only recorded after successful processing, so if processing fails halfway, Stripe's retry will be allowed through (and the existing per-purchase checks make the retry safe).

## Testing

- **Tests run against the project's linked remote Supabase database** (the same one the app uses in development), because that's how every previous test script in this repo works (`scripts/*.mjs`) and there is no local database running. Tests create disposable users/purchases with clearly-marked test emails and delete everything they created afterwards. Confirmed with the project owner before running.
- **Migrations are applied manually by the project owner** through the Supabase dashboard (per their standing workflow) — the test suite checks they're in place before running and aborts with instructions if not.
- **Webhook tests hit the real webhook route.** The suite starts a local dev server and POSTs correctly-signed Stripe test events at /api/stripe/webhook, rather than re-implementing the webhook's logic in the test. Confirmation emails are suppressed during the test run by blanking the email API key for the test server.
- **Pending-purchase visibility is verified at the data layer** (the exact query the new page runs), not by rendering the page in a browser — a full logged-in browser test was out of proportion for checking one list.
- **The refund test exercises the database side of the refund** (validation, status changes, revert, finalise) with a simulated Stripe refund id. The one-line Stripe API call itself isn't tested because there is no real payment to refund without charging a card.

---

# Assumptions & Judgment Calls — Unify Block Time Payment Routing with the Case 1/2/3 Chooser (2026-07-07)

## 1. `recordManualPayment` could NOT be reused as-is — a sibling action was added
The brief said to reuse `recordManualPayment` "if this one fits". It does not: its standard-booking path looks up a `booking_invoices` row by booking id and calls `mark_booking_invoice_paid_atomic` (`app/actions/payment.ts` ~1159-1193). Block time invoices live in the `invoices` table and block-time bookings have no `booking_invoices` row, so it would throw "Booking invoice not found." Instead, `adminSettleBlockTimeInvoice` (new, in `app/actions/payment.ts`) follows the exact same recipe (ledger entry → invoice marked paid with a status guard → notification → email) but targets `invoices`. `customer_payment_ledger.invoice_source_type` needed a new `'block_time'` value (migration 106) because its CHECK only allowed `('checkout','booking')`.

## 2. Booking status stays `completed` for block-time flights, even with an unpaid landing invoice
PAYF sets the booking to `payment_pending` until the invoice is paid. For block time, the flight hours are settled from the balance at finalisation; only the landing fee (and any overage) can remain outstanding. Keeping the booking `completed` (existing behaviour) avoids rewiring the customer booking page (whose payment card reads `booking_invoices`, which block-time bookings don't have). Outstanding landing/overage invoices are surfaced and payable on the customer's **Purchases** page instead. If unpaid landing fees should hold the booking open, that is a follow-up change.

## 3. Case 2 "bank transfer" for block-time landing fees has no proof-upload step
The PAYF bank-transfer flow (proof upload → `adminConfirmStandardBankTransfer`) is built entirely on `booking_invoices` + its submissions table. Rebuilding that pipeline for the `invoices` table was judged beyond "surgical". Instead: choosing *Send invoice + Bank transfer* stamps the landing invoice `payment_method = 'bank_transfer'`, the customer sees the bank details + invoice-number reference on the Purchases page, and the admin verifies the transfer by using the new **Mark settled** control (method: "Bank transfer (verified)") on the customer profile. Same admin-verifies-transfer semantics, one shared control.

## 4. "Waived" for a block-time customer waives the landing fee only — never the overage
The overage invoice is deliberately excluded from the chooser: it always stays `awaiting` and gates the account until paid (Stripe self-service) or marked settled by the admin (new action). Waiving an overage would silently forgive hours flown beyond the package, contradicting the confirmed gate behaviour of migration 104. The admin panel states this explicitly. A waived landing fee sets the invoice `status = 'waived'` (added to the `invoices` status CHECK in migration 106, mirroring `booking_invoices` migration 105). The waiver reason is recorded in `booking_audit_events.new_value.landing_waiver_reason` (the `invoices` table has no notes column).

## 5. `default_payment_method_id` was NOT deleted
Decision 1 said to flag rather than delete. The finalisation path no longer reads it (the only charging reader was the removed auto-charge). It is still **written** by the Stripe webhook (route.ts ~528, ~884, ~1015 — block-time purchase/top-up flows, out of scope) and still **selected** in the block-time purchase flow (`app/actions/payment.ts` ~172). The column, its webhook writers, and the `profiles` type stay untouched. It is now unused for charging; removing it is a separate cleanup decision.

## 6. Landing-fee settlement failures surface as a thrown error AFTER finalisation completes
If routing the landing invoice fails, the drawdown is already committed — aborting would strand the booking in `pending_post_flight_review` with hours already deducted. So the finalisation completes (flight record, booking status, PDFs, emails) and then **throws** a descriptive error that the admin panel displays: the invoice is still `awaiting` with no payment method and can be settled/re-routed from the customer profile ("Block time flight invoices" section). This replaces the old log-and-swallow behaviour; nothing is silent, and nothing is left half-committed.

## 7. The Stripe payment session + webhook branch were generalised, not duplicated
`createBlockTimeOveragePaymentSession` and the `block_time_overage_payment` webhook branch now accept any awaiting block-time flight invoice (overage or landing fee), keyed by `billing_mode='block_time' AND type='flight'`. The metadata `purchase_type` string keeps its old name so historical Stripe records stay interpretable. Notification/email copy branches on `is_block_time_overage`. Judged in scope: this is the flight-record finalisation path's settlement leg, and generalising is safer than a parallel near-identical branch.

## 8. `AdminStandardBillingPanel` (Case 1 review) was not modified
It already sends `paymentMethod`/`submissionMode`/`waiverReason`; the server-side fix makes them respected for block-time customers. Pre-existing cosmetic gap left alone (out of scope): its rate field defaults to $290 and its summary prices all hours at that rate even for block-time customers — the server ignores that rate for block time (locked package rate applies), so the maths is correct, but the preview can mislead. Follow-up UI polish candidate.

## 9. The expired-package PAYF fallback still ignores the submission mode
`finaliseStandardBookingInvoice`'s fallback (package expired/exhausted mid-review → bill at PAYF) issues an invoice-and-wait regardless of the chooser. Pre-existing behaviour, untouched: in that surprise scenario an explicit invoice the customer can see is the safer default. Flagged, not changed.

## 10. The customer pay surface for landing invoices is the Purchases page only
The pricing page also lists overage invoices but was left unchanged — one canonical pay surface keeps the change minimal. The finalisation email/notification points customers to the Purchases page.

## 11. Migration 106 must be applied before this code is deployed
The TypeScript now assumes: landing invoices arrive with `payment_method NULL`; `invoices.status` accepts `'waived'`; `invoices.payment_method` accepts `'cash'`/`'card_in_person'`; `customer_payment_ledger.invoice_source_type` accepts `'block_time'`. Until migration 106 runs, mark-paid/waived block-time submissions will fail with CHECK-constraint errors (visibly, per item 6). Migration 106 redefines `process_block_time_flight` on top of 104's signature — 104 must be applied first.

## 12. Unit tests + manual script
The settlement routing is exercised by pure-function unit tests (`tests/unit/block-time-settlement.spec.ts`, existing `npx playwright test tests/unit` harness). The DB/Stripe legs cannot be automated in this session; a step-by-step manual verification script is at `tests/manual-block-time-payment-routing.md` and should be walked through in a browser after migration 106 is applied.

# Assumptions & Judgment Calls — Make the 4-hour-per-day minimum VDO rule visible and admin-controlled (2026-07-07)

## 1. Shared helper for the minimum rule
The 4-hour-per-day minimum is treated as shared business logic, not duplicated UI math. I will centralise the day-count calculation in the shared standard-booking billing helper and reuse it from the admin finaliser and the customer/admin forms so the server and UI cannot drift.

## 2. Admin choice is explicit and recorded
When actual VDO hours are below the minimum, the finaliser will require an explicit admin choice of `enforce_minimum` or `bill_actual`. The decision will be recorded in `booking_audit_events.new_value` alongside the actual hours, the minimum hours, and the booking-day count, rather than creating a new table or migration.

## 3. Customer warning stays non-blocking
The customer-facing warning will reuse the same helper and only inform the pilot before submit; it will not block submission. The actual billed value remains the admin's responsibility in the shared finaliser path.

# Assumptions & Judgment Calls — Stop checkout "mark paid in person" from creating spendable credit (2026-07-07)

## 1. Reuse an existing non-credit ledger type
The checkout admin "mark paid in person" path should keep its current invoice-settlement flow, but the ledger entry must not be `manual_adjustment` because that is included in `customer_credit_balances`. `bank_transfer` is the least disruptive existing entry type that is excluded from the spendable-credit view, so I will reuse it for this audit row rather than adding a migration.

# Assumptions & Judgment Calls — Standard booking "Mark Paid" credit leak fix (2026-07-09)

## 1. Follow the checkout pattern for the ledger row only
The standard-booking admin "Mark Paid" path should keep the same settlement and UI flow, but its ledger row must not stay `manual_adjustment` because that is counted by `customer_credit_balances`. I treated `bank_transfer` as the correct non-spendable audit type here too, and left checkout and block-time settlement paths unchanged.

## 2. Preserve the descriptive audit trail
The admin-facing note and `payment_method` field will continue to describe the actual in-person payment method, so operations can still see that the invoice was settled in person even though the ledger entry itself is non-credit-bearing.

# Assumptions & Judgment Calls — Restore Billing Summary visibility in post-flight submit panel (2026-07-09)

## 1. Section D should follow the same readiness gate as the standard billing panel
The submit-flight panel should render the billing summary whenever the readings are valid and the hourly rate is valid, even when actual VDO is `0.0h`. Hiding the section behind `vdoReading > 0` was the regression, and the sibling standard billing panel already uses the broader `totals && validHourlyRate` condition.

# Assumptions & Judgment Calls — Hide submit UI after booking is closed (2026-07-09)

## 1. Closed standard bookings should lose the submit affordance entirely
Once the lifecycle resolves to `paid_closed`, the green post-flight summary stays read-only and the admin submit panel is no longer mounted. The backend finaliser still has to reject stale retries, but the UI should no longer offer the action on a booking that is already paid and closed.

# Assumptions & Judgment Calls — Standard booking charges card should read finalized invoice data (2026-07-09)

## 1. Use `booking_invoices` for finalized standard bookings
The "Charges & payment" card on the admin booking page should read the settled standard booking invoice from `booking_invoices`, not the checkout-only invoice table. For closed standard bookings, the billed VDO hours can be derived from the finalized invoice base amount and hourly rate, while the paid state comes from the finalized invoice status/paid amount.

# Assumptions & Judgment Calls — Standard booking PDF generation and download fallback (2026-07-09)

## 1. A waived standard booking invoice does not get a PDF
I treated `waived` as a no-document case rather than inventing a zero-due receipt, because the customer did not pay anything and the PDF should stay truthful about settlement state.

## 2. Missing PDFs regenerate on demand
For older standard bookings that predate this feature, the fallback route regenerates the PDF from `booking_invoices` on first click and then redirects to the stored file, so the customer and admin links always have a real target without adding a dead button.

# Assumptions & Judgment Calls — Show checkout in-person payments in the admin Transactions panel (2026-07-07)

## 1. Reuse the shared credit-transaction query
The admin billing Transactions panel and the admin customer-ledger page both read through `getCustomerCreditTransactions`, so the cleanest fix is to widen that shared query to include `bank_transfer` rows rather than introducing a second bespoke fetch path.

## 2. Surface source details in the billing tab
The billing-tab Transactions panel now shows the invoice source and payment method alongside the entry type/date. That keeps the checkout in-person payment understandable as a checkout payment, while still leaving the spendable-credit math unchanged because `bank_transfer` remains excluded from `customer_credit_balances`.

# Assumptions & Judgment Calls — Checkout "Mark as Already Paid" silent settle failure (2026-07-08)

## 1. Root cause is two-layered; only the structural layer needed a code fix
The concrete failures on 2026-07-07 happened because `recordManualPayment` was already passing `p_is_stripe_payment` to `mark_checkout_invoice_paid_atomic` while migration 107 had not yet been applied — PostgREST rejected the 5-argument call, throwing *after* the ledger insert. Migration 107 is now applied (verified live: the 5-arg RPC executes and settles). No new migration is needed. The code fix targets the structural layer: the mark-paid flow was two sequential client-side server-action awaits, and the first action's `revalidatePath` unmounts `AdminCheckoutActions` (it only renders for pre-outcome statuses), so any error from the second call landed on an unmounted component and was never shown.

## 2. Combine outcome + settle into one server action rather than fixing error display
Per the task brief, `markCheckoutOutcome` now accepts an optional `manualPayment` input and performs the manual settlement server-side after the outcome RPC. The settle logic was extracted verbatim into `lib/payments/settle-checkout-invoice.ts` and is shared with `recordManualPayment`'s checkout branch, so the standalone settle path (used by other panels) cannot drift from the outcome path.

## 3. Settlement failure surfaces by throwing before revalidatePath
If the settle step fails after the outcome is recorded, the action throws a contextual error *before* any `revalidatePath` call. Because a thrown server action returns no RSC payload, the panel stays mounted and the admin sees the error, which directs them to refresh and use the payment panel (the existing `AdminBankTransferPanel` recovery path for `checkout_payment_required`). This follows the codebase-wide convention of throwing `Error` from server actions and displaying `error.message` client-side.

## 4. Credit-settled invoices skip the manual settlement
If the outcome RPC settles the invoice fully from account credit (booking returns `completed`), a provided `manualPayment` is skipped instead of double-recording a payment. The client already blocks submitting a zero amount, so this is defence-in-depth.

## 5. Ledger row still precedes the RPC inside the settle helper
Kept the existing order (ledger insert → settle RPC) unchanged, per the instruction not to alter `recordManualPayment`'s core logic. A failure between the two can still leave an audit ledger row alongside an unpaid invoice (visible in Transactions), but it is now always accompanied by a visible admin error.

## 6. Test fixtures left in the live dev database
Live verification used a disposable admin (`fable-repro-admin@example.com`) and the prior session's repro customer/booking `7b98b637` (left in the send-invoice awaiting-payment state after the final regression run). Stuck booking `725384ba` (which had a real cash ledger row from 2026-07-07) was settled during verification by replaying the RPC. Stuck booking `b8f7c7bf` has *no* ledger row — whether payment was actually received in person is unknown, so it was intentionally left in `checkout_payment_required` for a human decision.

---

# Payment RPC permission lockdown (security fix, staged) — 2026-07-08

## 7. Migration numbering: two files, not one
The task illustrated the grant migration as `108_lock_payment_rpc_grants.sql`, but Section C (adding internal admin guards to the four block-time RPCs) is itself a DB change that must be live **before** the grant revoke, and its own testing (Stage 1 test #4) requires it applied. So it is split into two files with the temporal order encoded in the numbers: `108_block_time_rpc_admin_guard.sql` (Stage 1, apply first) and `109_lock_payment_rpc_grants.sql` (Stage 2, apply only after Stage 1 code is deployed + 108 applied + all Stage 1 tests pass).

## 8. Whole booking-branch of recordManualPayment routed through the service-role client
The task (Section B) said to use `createAdminClient()` "for this call" (the `mark_booking_invoice_paid_atomic` RPC). I routed the entire booking-type branch's privileged operations (ledger insert, the RPC, status-history insert, verification_events insert, profile read) through the admin client, not just the RPC line. Reason: the checkout branch (Section A) already runs *all* of its writes on the admin client via `settleCheckoutInvoiceManually`, and a half-session/half-service-role settlement risks a latent RLS block on the `customer_payment_ledger` insert that could not be verified without running the app. Running these writes as service_role is correct because `requireAdmin()` still authorizes the caller via the session client first. The read of `bookings` at the top of `recordManualPayment` and the `requireAdmin()` check remain on the session client.

## 9. mark_booking_invoice_paid_atomic reasserted (idempotent), not comment-only
The task said mark_booking_invoice_paid_atomic needs "no change, confirm it stays that way." Live state is already `{postgres, service_role}`. Migration 109 includes an explicit idempotent `REVOKE ... FROM PUBLIC, anon, authenticated` + `GRANT ... TO service_role` for it rather than a bare comment, to assert the desired end-state against future drift. Both statements are no-ops given current state and cannot error.

## 10. Stage 2 function signatures corrected against live pg_proc
The signatures in the task's proposed Stage-2 SQL were mostly wrong (as the task warned they might be). Corrected via `pg_get_function_identity_arguments`: `approve_bank_transfer_atomic(uuid)`, `approve_standard_bank_transfer_atomic(uuid)`, `record_customer_refund_atomic(uuid, integer, text, text, text)`, `reverse_customer_credit_atomic(uuid, text)`, `apply_credit_to_standard_booking_atomic(uuid, integer, numeric, uuid, text, text)`, `finalise_standard_booking_invoice_atomic(uuid, uuid, numeric, integer, jsonb, text)`, `complete_checkout_outcome_atomic(uuid, uuid, numeric, text, jsonb, text, boolean, text, integer)`, `approve_post_flight_review_atomic(uuid, boolean, text, text, text)`, `submit_flight_record_atomic(uuid, date, text, text, numeric×11?, integer, text, boolean, text, text, jsonb)`. No overloads exist for any targeted function, so each REVOKE is unambiguous.

## 11. Stage 1 functional verification (tests 2–5) not run by the agent
Only test #1 (`npx tsc --noEmit`) was executed (clean). Tests 2–5 require a running app, an admin login, Stripe test-mode, and — for test #4 — migration 108 applied to the DB. These cannot be performed autonomously in this environment. They are handed to Rohan; Stage 2 (migration 109) must NOT be applied until Rohan confirms all five pass.

# Assumptions & Judgment Calls — Finalise Flight Billing spinner hang investigation (2026-07-08)

## 12. The visible hang was the panel waiting for post-save navigation, not the write itself
Live repro on fresh `pending_post_flight_review` bookings showed the billing write completing and the button flipping to `Saved` in 3.7–4.8s across three cases, with redirect completion in 4.7–5.5s. The earlier 3+ minute complaint was not reproducible in this environment, but the panel was still coupling its loading state to `router.replace()` / `router.refresh()`, so any slow follow-up route would keep the spinner alive after the data was already committed.

## 13. Non-critical email delivery should stay off the critical path
Both `finaliseStandardBookingInvoice` and the booking manual-payment helper were awaiting confirmation emails after the database writes had already succeeded. Those emails now fire-and-forget with error logging, which removes the external mail API from the user-visible critical path while preserving the write and the email audit rows.

# Assumptions & Judgment Calls — Admin flight billing defaults and manual payment disclosure (2026-07-08)

## 14. Checkout and PAYF defaults should come from shared constants
The checkout review path now uses a shared checkout-rate constant instead of a magic `290`, and the standard billing path keeps using the shared PAYF constant for non-block-time flights. That keeps the admin defaults aligned with the same source of truth the rest of the booking code uses.

## 15. Block time rate is informational in the review UI
For block-time customers, the panel now displays the locked package rate and treats it as read-only. The server already branches on the active block-time purchase, so this change is a display and guardrail fix rather than a billing-behavior change.

## 16. Manual payment is opt-in only
The manual-payment card is now wrapped in a disclosure and starts collapsed. Reusing the existing proof-related trigger text keeps the secondary path obvious without showing the card on initial page load.

# Assumptions & Judgment Calls — Minimum VDO billing preview sync (2026-07-08)

## 17. The admin panels should preview the same billed VDO that the server already finalises
For below-minimum standard bookings, both admin billing panels now derive the summary amount from `minimumVdoDecision` instead of the raw submitted VDO total. I verified the live server path with disposable bookings: `bill_actual` produced `booking_invoices.vdo_reading = 10` and `stripe_amount_due_cents = 330000`, while `enforce_minimum` produced `booking_invoices.vdo_reading = 12` and `stripe_amount_due_cents = 396000`, with matching `booking_audit_events.new_value.billed_vdo_hours` values.

# Assumptions & Judgment Calls — Billing decision preview sync and confirmation copy (2026-07-08)

## 18. The billed-hours preview should be the same value used for submission
The yellow warning box and the summary now both read from the same derived billed-hours value, so the dropdown, preview text, and server submission stay aligned when the admin switches between `bill_actual` and `enforce_minimum`.

# Assumptions & Judgment Calls — Remove the admin payment-method selector from standard-booking billing (2026-07-08)

## 19. Standard-booking send-invoice flows now leave `payment_method` null
The admin panels no longer surface a Stripe/bank-transfer choice, and the standard-booking finaliser now creates the invoice without preselecting a payment method so the customer chooses it later on their own payment page.

## 20. Standard-booking mark-paid flows now record a generic manual settlement
The booking invoice is marked paid, the ledger row uses a null payment method, and the audit trail says manual payment without inventing a cash/card/bank-transfer split.

## 21. Block-time landing fees follow the same no-preselection pattern
The drawdown still routes to await payment / settle manual / waive, but the landing invoice no longer gets a forced payment-method stamp from the admin side.

# Assumptions & Judgment Calls — Admin customer bookings tab should show full standard-booking history (2026-07-09)

## 22. The admin customer-detail bookings tab is a history view, not a three-row preview
I removed the `.limit(3)` cap from the standard-bookings query in `app/admin/users/[id]/page.tsx` so the Bookings tab shows the customer's full standard-booking history, including `pending_post_flight_review` rows like the under-review booking surfaced in the post-flight queue. I left the existing status badges and ordering intact, so completed, in-review, and cancelled rows all remain visible with their real status labels.

## 23. Uncapped Action Queue Fetching
open-action queries now fetch uncapped; acceptable at single-airport / single-aircraft volume; revisit pagination only if open-action counts routinely exceed ~50 in a category.

# Assumptions & Judgment Calls — Launch-blocker fixes from the 2026-07-10 checkpoint audit (2026-07-11)

## 24. The credit balance view is now an explicit allowlist (migration 111 — pending manual apply)
`customer_credit_balances` previously counted `manual_adjustment` toward the spendable balance, which is what let three separate settlement paths mint phantom credit this week. Migration `111_credit_balance_allowlist.sql` restricts the view to the four credit-lifecycle entry types (`advance_credit`, `advance_applied`, `credit_reversed`, `credit_refunded`) so no settlement-shaped ledger row can ever be spendable, regardless of what entry_type a future call site picks. This is safe because nothing legitimate writes `manual_adjustment` (the only code writer was the block-time settle bug) and the live table contains zero such rows. Note the allowlist cannot be `advance_credit` alone: `advance_applied` / `credit_reversed` / `credit_refunded` are the negative offsets that make the balance decrease. **The migration must be applied manually via the Supabase dashboard; until then the code-level fix below already prevents the bug.**

## 25. Block-time manual settles are audit-only ledger rows, like the other two mark-paid paths
`adminSettleBlockTimeInvoice` now always writes `entry_type: 'bank_transfer'` (the established "audit trail, not credit" pattern from the checkout and standard-booking fixes) and preserves the real method in `payment_method`. A fourth occurrence of this bug class at a new call site is still possible until migration 111 is applied — the view fix is the systemic guard, the entry_type is the convention.

## 26. Mark-paid now captures how the money was received (supersedes part of #20/#21)
Both admin billing panels show a "Payment method received" selector (cash / card in person / bank transfer, defaulting to cash like the checkout panel) only when "Mark paid" is selected. The method flows through `finaliseStandardBookingInvoice` / `adminSubmitFlightRecord` into the ledger row, the landing-fee invoice's `payment_method`, and the booking audit event. Send-invoice and waived flows still record no method (#19 unchanged).

## 27. The PAYF fallback fires only on the literal "no active block time package" error
`finaliseStandardBookingInvoice` previously fell back to PAYF billing on any Postgres `P0001` from `process_block_time_flight`; migration 108's `Unauthorized` guard shares that code, so a guard failure would have silently billed the pilot at $330/hr. The fallback now matches only the "No active block time package" message (the expired/exhausted race it was designed for); every other drawdown error aborts the finalisation with an explicit "NO billing was performed" error and leaves the booking in post-flight review. Live-verified both branches by driving the compiled server action against the real database with an intercepted RPC.

## 28. The billing suite drives the drawdown as an authenticated admin
`test_post_flight_billing_suite.mjs` `drawdown()` now uses the suite's authenticated admin session client instead of service-role, because migration 108's guard requires `auth.uid()` to resolve to an admin (service-role calls have a NULL `auth.uid()`). This matches how the app itself calls the RPC. Suite re-verified at 78/78 against the live database.
