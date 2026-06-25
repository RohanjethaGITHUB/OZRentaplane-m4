# OZRentaplane — Project Summary

A full-stack aircraft rental platform for a Cessna 172N operation at Bankstown Airport, Sydney. Handles student pilot checkout flights and ongoing licensed pilot hire.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router), React 18, TypeScript 5 |
| Styling | Tailwind CSS + Framer Motion + GSAP |
| Database | Supabase (PostgreSQL, RLS, 91 migrations) |
| Auth | Supabase Auth (email/password, SSR JWTs) |
| Payments | Stripe (checkout sessions + webhook) |
| Email | Resend |
| Charts | Recharts |

---

## Three Main Surfaces

### 1. `app/(marketing)/` — Public Site
Landing page, fleet specs, pricing, checkout process explainer, safety, contact, terms.

### 2. `app/dashboard/` — Customer Portal (authenticated)
- Checkout onboarding (book date → upload docs → pay via Stripe)
- Flight bookings calendar
- Document management (pilot licence, medical, photo ID)
- Messages + account settings

### 3. `app/admin/` — Admin Dashboard (70+ pages)
- Bookings queue with post-flight reviews
- Checkout request management
- Customer verification & clearance
- Aircraft fleet, flight logs, maintenance records
- Customer messages & ledger

---

## Most Important Files

| File | Why It Matters |
|---|---|
| `components/HomeHeroScrollSequence.tsx` | Flagship component — 430dvh scroll-scrubbed video hero with RAF loop, Safari seek throttling, dual WebM/MP4 |
| `app/actions/` | All data mutations live here (17 server action files — checkout, booking, payment, verification, admin) |
| `lib/supabase/` | DB clients (server.ts, client.ts, admin.ts) + all TypeScript types |
| `lib/booking/` | Booking state machine, availability logic, status constants |
| `middleware.ts` | Auth refresh on every request + domain redirect (non-www → www) |
| `DESIGN.md` | Master design spec — **read this before touching any UI** |
| `PRODUCT.md` | Brand voice, user personas, product strategy |
| `ARCHITECTURE_REPORT.txt` | Full system audit — good for deep dives |

---

## Key Domain Concepts

- **Checkout** — Onboarding for *student* pilots: schedule flight → upload docs → admin reviews → pay → fly → admin clears to fly
- **Booking** — A standard flight hire for *already-cleared* licensed pilots
- **Clearance** — 5-stage verification: `not_started → pending_review → documents_verified → cleared_to_fly`
- **ARN** — Aviation Reference Number, assigned per pilot
- **Post-flight review** — After a checkout flight, admin scores the student (landing, trim, fuel, etc.) to decide clearance
- **Credit ledger** — Pilots can have prepaid credit applied to invoices

---

## Project Structure

```
app/
├── (marketing)/          # Public pages
├── dashboard/            # Customer portal
├── admin/                # Admin dashboard (70+ pages)
├── auth/                 # Auth routes (callback, confirm, password reset)
├── login/                # Login page
├── api/
│   ├── stripe/webhook/   # Payment completion webhook
│   └── diag/             # Diagnostics endpoint
└── actions/              # Server actions (17 files — all business logic)

components/               # Reusable UI (40+ files)
lib/
├── supabase/             # DB clients + types
├── email/                # Templates + Resend integration
├── booking/              # State machine, availability, status constants
└── utils/                # sydney-time.ts, day-vfr.ts, flight-review.ts

supabase/migrations/      # 91 SQL migration files
public/                   # Static assets (hero videos, aircraft photos)
```

---

## Data Mutation Pattern

All business logic goes through **Next.js Server Actions** in `app/actions/`. There are no REST API endpoints for business logic — only:
- `POST /api/stripe/webhook` — payment completion
- `GET /api/diag` — system diagnostics
- `POST /api/dev/test-email` — dev-only email testing

---

## Booking State Machines

**Checkout lifecycle:**
```
requested → confirmed → under_review → payment_required → completed
```

**Standard booking lifecycle:**
```
draft → confirmed → ready_for_dispatch → dispatched → post_flight_review → paid → completed
```

---

## Design System

Aviation-themed Tailwind tokens:

| Token | Usage |
|---|---|
| `midnight-apron` | Dark navy — primary background |
| `clearsky` | Sky blue — accents, CTAs |
| `runway-amber` | Amber — warnings, highlights |
| `service-bay` | Mid-tone — secondary surfaces |

Fonts: **Newsreader** (serif headings) + **Manrope** (sans body).

Always check `DESIGN.md` before making UI decisions.

---

## Environment Variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Resend (Email)
RESEND_API_KEY=
EMAIL_FROM=
EMAIL_REPLY_TO=
ADMIN_EMAIL=

# App URL
APP_URL=
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_SITE_URL=
```

See `.env.example` for the full list.

---

## Key Docs

| File | Contents |
|---|---|
| `DESIGN.md` | Master visual design spec (colors, typography, spacing, components, motion) |
| `PRODUCT.md` | Product strategy, user personas, brand personality |
| `HERO_CONTEXT.md` | HomeHeroScrollSequence documentation |
| `ARCHITECTURE_REPORT.txt` | Full system audit |
| `docs/email-triggers.md` | Email event architecture |
| `docs/admin-user-setup.md` | Admin onboarding instructions |
| `docs/mobile-ui-ux-audit-report.md` | Mobile usability findings |
