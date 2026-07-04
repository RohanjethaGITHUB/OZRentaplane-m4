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
