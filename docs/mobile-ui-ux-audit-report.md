# OZ Rent A Plane Mobile UI/UX Audit Report

Date: May 24, 2026  
Auditor: Codex (investigation/reporting only; no code changes made)

## 1. Executive summary

Overall mobile UX health: **Poor to mixed (partially usable)**.

Biggest problems:
- Repeated desktop-first layouts rendered on mobile (2-4 column grids at base breakpoint).
- Dense admin data tables and wide metric/data rows causing horizontal overflow or compressed readability.
- Modal and form complexity exceeds small-screen ergonomics, especially for checkout and manual admin flows.
- Typographic scale too small in many critical form labels/help/error contexts (`9px`-`11px` usage is common).
- Long text tokens (names, emails, references, file names, invoice fields) have inconsistent wrapping/ellipsis behavior.

Customer-side severity: **High**.  
Admin-side severity: **Critical-High**.

Production-readiness on mobile:
- Customer logged-in: **Partially usable**.
- Admin logged-in: **Not production-ready for full mobile operations**.

Method note:
- Route/component audit was completed through route mapping and detailed component-level inspection across customer/admin logged-in surfaces.
- Attempted local runtime mobile pass, but persistent local serving could not be maintained in this environment; findings are therefore code/layout-driven with high confidence where responsive class patterns are explicit.
- Target viewports used for assessment criteria: `375px`, `390-430px`, `430-480px` portrait; landscape risks noted where obvious.

## 2. Route-by-route findings

### Customer: `/dashboard`
User type: Customer  
Viewports reviewed: 375, 390-430, 430-480

Main issues:
- Hero/cards and action blocks are content-dense with many long sentence blocks; high scroll load before key actions.
- Frequent extra-small labels and uppercase microcopy reduce readability on small screens.
- Status chips and multi-state UI likely wrap inconsistently with long status/outcome strings.

Severity: High  
Why it matters: Dashboard is the orientation hub; if hard to scan, users miss next action and status context.  
Suggested fix direction: Mobile-first hierarchy pass with tighter content prioritization and larger minimum text sizes.

References:
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/dashboard/DashboardContent.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/dashboard/DashboardContent.tsx)

### Customer: `/dashboard/checkout`
User type: Customer  
Viewports reviewed: 375, 390-430, 430-480

Main issues:
- Multiple modal-heavy steps and dense forms; completion effort is high on mobile.
- Document upload and terms modals are tall, multi-control UIs with many compact controls and tiny labels.
- CTA visibility risk across long sections; key submit action can be too far from context.
- Multi-option selector grids (`grid-cols-2`/`grid-cols-3`) can feel cramped at 375.

Severity: Critical  
Why it matters: This route is a core conversion path; friction blocks onboarding/checkout completion.  
Suggested fix direction: Step simplification, single-column controls by default, sticky action bars, larger target sizing.

References:
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/dashboard/checkout/CheckoutFlow.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/dashboard/checkout/CheckoutFlow.tsx)
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/dashboard/checkout/CheckoutChangeActions.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/dashboard/checkout/CheckoutChangeActions.tsx)

### Customer: `/dashboard/documents`
User type: Customer  
Viewports reviewed: 375, 390-430, 430-480

Main issues:
- Upload modal contains many fields, pills, and file result rows in compact space.
- Several 2/3-column selector groups and micro-label text sizes reduce tap confidence and readability.
- Long file names can overflow crowded rows.

Severity: High  
Why it matters: Document quality and completion are prerequisites for downstream booking/checkout.  
Suggested fix direction: Increase modal breathing room, single-column controls at small widths, robust filename truncation.

References:
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/dashboard/DocumentsPanel.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/dashboard/DocumentsPanel.tsx)

### Customer: `/dashboard/bookings`
User type: Customer  
Viewports reviewed: 375, 390-430, 430-480

Main issues:
- Status banners are long and text-heavy, causing early scroll bloat.
- Long badge labels and booking refs can produce wrapping/scan issues.
- Dense gate-state messaging competes with primary actions.

Severity: High  
Why it matters: Booking list is frequently visited; high cognitive load increases support requests and errors.  
Suggested fix direction: Collapse informational copy, promote one primary action per state, normalize badge lengths.

References:
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/dashboard/bookings/page.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/dashboard/bookings/page.tsx)

### Customer: `/dashboard/bookings/new`
User type: Customer  
Viewports reviewed: 375, 390-430, 430-480

Main issues:
- Base-level `grid-cols-2` in key date/time sections makes controls cramped on 375.
- Stepper and metadata strip are dense for small devices.
- Small uppercase labels and long form sequence increase fatigue.

Severity: Critical  
Why it matters: Directly blocks booking request submission quality and completion rate.  
Suggested fix direction: Make all key form sections single column under `sm`, simplify intro chrome, sticky submit affordance.

References:
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/dashboard/bookings/new/BookingRequestForm.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/dashboard/bookings/new/BookingRequestForm.tsx)
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/dashboard/bookings/new/BookingReadinessInlinePanel.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/dashboard/bookings/new/BookingReadinessInlinePanel.tsx)

### Customer: `/dashboard/bookings/[id]`
User type: Customer  
Viewports reviewed: 375, 390-430, 430-480

Main issues:
- Booking detail includes many conditional cards with dense content and micro-typography.
- Payment cards use two-column method selector and long bank details blocks; long values risk overflow.
- Flight record submission has desktop-biased row structure (`grid-cols-[1fr_120px]`) for landing rows.

Severity: Critical  
Why it matters: This page handles post-flight compliance and payments; mobile breakdown causes task failure.  
Suggested fix direction: Mobile-specific card layouts for payment details, stacked landing rows, stronger action anchoring.

References:
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/dashboard/bookings/[id]/page.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/dashboard/bookings/[id]/page.tsx)
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/dashboard/bookings/[id]/FlightRecordForm.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/dashboard/bookings/[id]/FlightRecordForm.tsx)
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/dashboard/bookings/[id]/CheckoutPaymentCard.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/dashboard/bookings/[id]/CheckoutPaymentCard.tsx)
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/dashboard/bookings/[id]/BookingPaymentCard.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/dashboard/bookings/[id]/BookingPaymentCard.tsx)

### Customer: `/dashboard/settings`, `/dashboard/messages`
User type: Customer  
Viewports reviewed: 375, 390-430, 430-480

Main issues:
- Shared pattern risk: compact spacing + small labels across form-heavy portal components.
- Secondary navigation context relies on hidden desktop subnav and top-nav patterns; discoverability risk on mobile.

Severity: Medium  
Why it matters: Not always blocker-level, but adds friction across frequent account tasks.  
Suggested fix direction: Standardize mobile form rhythm and clarify current-location breadcrumbs.

References:
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/dashboard/layout.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/dashboard/layout.tsx)
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/components/customer/CustomerPortalSubNavSimple.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/components/customer/CustomerPortalSubNavSimple.tsx)

### Admin: `/admin` (Actions dashboard)
User type: Admin  
Viewports reviewed: 375, 390-430, 430-480

Main issues:
- Very large headings and dense multi-card summaries consume excessive vertical space before actionable queue rows.
- Action cards contain long descriptive text blocks with weak mobile scannability.

Severity: High  
Why it matters: Admin triage speed is reduced on small screens.  
Suggested fix direction: Compact mobile summary mode with terse copy and fast action grouping.

References:
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/admin/page.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/admin/page.tsx)

### Admin: list surfaces (`/admin/checkouts/*`, `/admin/bookings/*`, `/admin/customers/all`, `/admin/checkouts/payments`)
User type: Admin  
Viewports reviewed: 375, 390-430, 430-480

Main issues:
- Several pages still rely on full-width multi-column tables without mobile card fallback.
- Payment table in checkout payments has many columns and no mobile alternative.
- Filter chips and controls can dominate first viewport height.

Severity: Critical  
Why it matters: Mobile admin users cannot reliably scan and act on high-volume lists.  
Suggested fix direction: Universal mobile list-card pattern + collapsible filters + progressive disclosure of metadata.

References:
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/admin/bookings/components/AdminBookingList.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/admin/bookings/components/AdminBookingList.tsx)
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/admin/checkouts/payments/page.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/admin/checkouts/payments/page.tsx)
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/admin/customers/all/CustomerDirectoryTable.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/admin/customers/all/CustomerDirectoryTable.tsx)
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/admin/components/AdminListView.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/admin/components/AdminListView.tsx)

### Admin: booking/checkout detail (`/admin/bookings/requests/[id]`)
User type: Admin  
Viewports reviewed: 375, 390-430, 430-480

Main issues:
- Page is functionally dense and includes many side-by-side data groups and action modules.
- Manual completion modal contains desktop-grid meter entry (`grid-cols-[5rem_1fr_1fr_1fr]`) unsuitable for 375.
- High risk of modal overflow, cramped controls, and error-prone data entry.

Severity: Critical  
Why it matters: This is a core admin decision/operation page; mobile mistakes have operational consequences.  
Suggested fix direction: Split into mobile task subflows; avoid spreadsheet-like grids in modal contexts.

References:
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/admin/bookings/requests/[id]/page.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/admin/bookings/requests/[id]/page.tsx)
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/admin/bookings/requests/[id]/AdminManualCheckoutCompletion.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/admin/bookings/requests/[id]/AdminManualCheckoutCompletion.tsx)

### Admin: calendar/schedule (`/admin/calendar`, `/admin/bookings/calendar`)
User type: Admin  
Viewports reviewed: 375, 390-430, 430-480

Main issues:
- Week/month calendar grids are dense and information-compressed on mobile.
- Event labels and dense day cells become hard to tap/read at 375.
- Side drawer details can crowd essential actions.

Severity: High  
Why it matters: Schedule clarity is mission-critical for dispatch and conflict handling.  
Suggested fix direction: Mobile-first agenda/list mode default, optional grid mode secondary.

References:
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/admin/calendar/AdminCalendarClient.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/admin/calendar/AdminCalendarClient.tsx)

### Admin: aircraft flight log (`/admin/aircraft/[aircraftId]/flight-log`)
User type: Admin  
Viewports reviewed: 375, 390-430, 430-480

Main issues:
- Explicitly wide table (`min-w-[1180px]`) forces horizontal scrolling.
- Modal edit/create flow is data-dense and not optimized for small touch interactions.
- Filter/action bar includes many controls in one wrap context.

Severity: Critical  
Why it matters: Flight log accuracy is high-stakes; poor mobile UX increases entry/review error risk.  
Suggested fix direction: Mobile summary cards + segmented detailed editor, defer full matrix table to desktop.

References:
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/admin/aircraft/[aircraftId]/flight-log/FlightLogClient.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/admin/aircraft/[aircraftId]/flight-log/FlightLogClient.tsx)

### Admin: maintenance/squawks (`/admin/aircraft/[aircraftId]/maintenance`, `/admin/aircraft/maintenance`)
User type: Admin  
Viewports reviewed: 375, 390-430, 430-480

Main issues:
- Metric panels use multi-column numeric grids that become tight at smaller widths.
- Editing sections have many numeric fields and compact labels.
- Critical buttons can be spatially disconnected from the values they affect.

Severity: High  
Why it matters: Maintenance actions are operationally sensitive and should be low-friction on mobile.  
Suggested fix direction: One metric per row on small widths with action directly adjacent.

References:
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/admin/aircraft/[aircraftId]/maintenance/MaintenanceClient.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/admin/aircraft/[aircraftId]/maintenance/MaintenanceClient.tsx)

### Admin navigation shell (`/admin/*`)
User type: Admin  
Viewports reviewed: 375, 390-430, 430-480

Main issues:
- Mobile menu trigger is fixed near top; can conflict with top content and consume first viewport attention.
- Deep nested nav with badges and expansion adds cognitive load in drawer context.

Severity: Medium-High  
Why it matters: Repeated nav effort compounds across all admin tasks.  
Suggested fix direction: Flatten high-frequency paths and simplify badge density on mobile.

References:
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/admin/layout.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/admin/layout.tsx)
- [/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/admin/AdminSidebar.tsx](/Users/rohanjetha/Documents/OZ/M2/OZRentaplane-m4/app/admin/AdminSidebar.tsx)

## 3. Top priority issues (Top 10)

1. **Critical**: Checkout and booking core forms use cramped multi-column controls at small widths, reducing completion success.
2. **Critical**: Admin detail/manual checkout completion modal uses desktop-like meter grids not viable on mobile.
3. **Critical**: Admin payment/list/table pages lack consistent mobile card fallbacks.
4. **Critical**: Flight log table (`min-w-[1180px]`) is fundamentally desktop-first on mobile.
5. **High**: Excessive `9px-11px` typographic usage for labels/help/status across critical forms.
6. **High**: Modal content density too high (documents, checkout terms, reschedule, admin dialogs).
7. **High**: Long content blocks before primary action on customer dashboard/booking surfaces.
8. **High**: Bank transfer/payment detail cards vulnerable to overflow and poor scanability.
9. **Medium-High**: Admin and customer navigation patterns consume too much vertical/cognitive space on mobile.
10. **Medium**: Inconsistent long-string handling (names, emails, refs, filenames) across cards, badges, and rows.

## 4. Customer journey risk assessment

Can customer smoothly:
- Log in: **Mostly yes**.
- Understand dashboard status: **Partially** (high cognitive load).
- Request checkout: **At risk** (critical mobile form/modal complexity).
- Upload documents: **At risk** (dense modal with compact controls).
- Accept terms: **Partially** (long modal scroll flow; workable but heavy).
- Book a flight: **At risk** (cramped date/time form layout and long flow).
- Submit post-flight records: **At risk** (landing row/editor patterns are tight on mobile).
- Pay invoice/upload bank proof: **Partially** (possible, but error-prone due dense payment cards).
- Submit maintenance request/squawk: **Medium risk** (form density pattern likely similar across admin-maintenance style components).

Overall customer journey risk: **High** for first-time and compliance-critical tasks.

## 5. Admin workflow risk assessment

Can admin smoothly:
- Review new checkout requests: **Partially**.
- Adjust/confirm/cancel checkout requests: **At risk**.
- Manually complete a checkout: **High risk / near-blocking on small screens**.
- Record checkout outcomes: **At risk**.
- Review customers: **Partially**.
- Review bookings: **Partially**.
- Manage payments: **At risk** (table-heavy, dense rows).
- Manage flight logs: **High risk** (wide matrix + dense edit modal).
- Review maintenance/squawks: **Partially**.
- Use filters/tabs/tables effectively: **Partially to poor** depending on route.

Overall admin mobile workflow risk: **Critical-High**.

## 6. Pattern-level problems

- Tables are inconsistently mobile-optimized; some routes still desktop-table-first.
- Forms frequently retain desktop grid logic (`grid-cols-2+`) at phone widths.
- Modal dialogs are too tall/content-heavy for small viewport ergonomics.
- Typography floor is too low for mobile readability in many metadata contexts.
- Long labels/status strings are not consistently truncation/wrap-safe.
- CTA placement is inconsistent; long sections often separate action from context.
- Filter/tab bars can crowd vertical space on mobile.
- Dense visual styling (badges, borders, microcopy) adds noise over clarity.

## 7. Recommended mobile design principles for fix phase

- Default all critical forms to single-column under `sm`; opt-in multi-column only when field pairing is essential.
- Convert every admin data table route to a defined mobile card/list pattern.
- Enforce minimum text sizes for utility metadata and form labels.
- Standardize modal constraints: viewport-safe height, internal scroll regions, always-visible close and primary action.
- Use sticky bottom CTA bars in long, multi-step customer flows.
- Collapse advanced filters into expandable panels on mobile.
- Establish robust long-string rules (`truncate`, controlled wrapping, secondary metadata rows).
- Promote one “next action” per state near the top of each major screen.

## 8. Final implementation plan for later

Phase 1: Critical blockers
- Rework customer checkout and booking-request mobile form layouts.
- Rework admin manual checkout completion modal to mobile-first sections.
- Provide mobile alternatives for checkout/payment and flight-log heavy tables.

Phase 2: Forms, modals, and CTAs
- Standardize modal behavior and sticky primary actions.
- Improve error placement and immediate field-level validation visibility.
- Increase touch targets and text legibility across all high-risk forms.

Phase 3: Tables and admin list views
- Apply shared `AdminMobileListCard` pattern for all admin list/table routes.
- Consolidate row actions into clear primary/secondary controls.

Phase 4: Navigation and visual hierarchy
- Simplify admin mobile drawer depth and reduce badge noise.
- Tighten customer dashboard hierarchy and reduce status verbosity.

Phase 5: Polish and regression testing
- Full device matrix QA (375, 390, 414/430, 480 portrait + landscape smoke).
- Edge-case stress tests: long strings, empty/error/pending/cancelled/rescheduled states, multi-file uploads.
- Accessibility and tap-target verification pass.

## Coverage checklist: routes/screens reviewed

Customer logged-in area reviewed:
- `/dashboard`
- `/dashboard/checkout`
- `/dashboard/documents`
- `/dashboard/bookings`
- `/dashboard/bookings/new`
- `/dashboard/bookings/[id]`
- `/dashboard/settings`
- `/dashboard/messages`
- Shared customer navigation and portal shell components

Admin logged-in area reviewed:
- `/admin`
- `/admin/checkouts`
- `/admin/checkouts/all`
- `/admin/checkouts/new-requests`
- `/admin/checkouts/awaiting-outcome`
- `/admin/checkouts/payments`
- `/admin/checkouts/history`
- `/admin/checkouts/upcoming`
- `/admin/checkouts/cancel-reschedule`
- `/admin/checkouts/cancelled`
- `/admin/bookings`
- `/admin/bookings/flights`
- `/admin/bookings/upcoming-flights`
- `/admin/bookings/awaiting-flight-records`
- `/admin/bookings/post-flight-review`
- `/admin/bookings/payments`
- `/admin/bookings/cancellations`
- `/admin/bookings/history`
- `/admin/bookings/requests/[id]`
- `/admin/bookings/blocks/new`
- `/admin/calendar`
- `/admin/customers`
- `/admin/customers/all`
- `/admin/customers/ledger`
- `/admin/customers/blocked`
- `/admin/aircraft`
- `/admin/aircraft/flight-log`
- `/admin/aircraft/[aircraftId]/flight-log`
- `/admin/aircraft/maintenance`
- `/admin/aircraft/[aircraftId]/maintenance`
- `/admin/aircraft/availability`
- `/admin/aircraft/meter-history`
- `/admin/settings`
- `/admin/messages`
- Shared admin sidebar/layout/table primitives

Screenshot references:
- No screenshot set generated in this run. Recommend follow-up visual pass with captured annotated screenshots per critical issue after implementing a stable authenticated mobile test harness.
