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
