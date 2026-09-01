# ✈️ OZ Rent A Plane

> **Full-stack aircraft rental, pilot checkout onboarding, and fleet management platform for Cessna 172 operations at Bankstown Airport (YSBK), Sydney, Australia.**

[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?style=flat-square&logo=supabase)](https://supabase.com/)
[![Stripe](https://img.shields.io/badge/Stripe-Payments-635bff?style=flat-square&logo=stripe)](https://stripe.com/)

---

## 📖 Overview

**OZ Rent A Plane** is a purpose-built web application designed for aircraft hire and flight operations. It automates the entire pilot journey — from first-time student pilot checkout flights, document verification, and flight clearance, to recurring licensed pilot aircraft bookings, post-flight VDO logging, billing, and automated notifications.

---

## ✨ Key Features

### 1. 🌐 Public Marketing & Fleet Showcase
- **Cinematic Experience**: 430dvh scroll-scrubbed interactive video hero ([`components/HomeHeroScrollSequence.tsx`](components/HomeHeroScrollSequence.tsx)).
- **Aircraft Specifications**: Detailed avionics, weight & balance, performance charts, and hourly wet hire rates for the Cessna 172 fleet.
- **Transparent Pricing**: Breakdown of dry/wet rates, block-time discounts, and checkout packages.

### 2. 👨‍✈️ Pilot Portal & Onboarding (`app/dashboard/`)
- **Checkout Flight Onboarding**: 5-stage verification pathway (`not_started` → `pending_review` → `documents_verified` → `cleared_to_fly`).
- **Document Management**: Pilot Licence, Medical Certificate, ARN (Aviation Reference Number), Photo ID, and Flight Review tracking with expiry monitoring.
- **Flight Booking System**: Interactive booking calendar with Sydney timezone (`Australia/Sydney`) daylight VFR validation.
- **Prepaid Block-Time Packages**: Purchase discounted flight hour blocks with automatic balance tracking and usage deductions.
- **Payment & Invoicing**: Integrated Stripe checkout, invoice downloads, and credit ledger.

### 3. 🛡️ Admin & Fleet Operations Dashboard (`app/admin/`)
- **Bookings & Dispatch Queue**: Complete booking lifecycle management (`draft` → `confirmed` → `dispatched` → `post_flight_review` → `paid` → `completed`).
- **Post-Flight Review System**: Flight scoring rubric for student checkouts (takeoff, landing, trim, fuel management, airmanship) prior to granting clearance.
- **Document Verification Queue**: Fast-track admin verification of uploaded pilot credentials.
- **Fleet Maintenance Logs**: Track aircraft total time in service (TTIS), 100-hourly inspections, maintenance holds, and component life limits.
- **Financial Ledger**: Account balances, prepaid credit adjustments, invoice management, and Stripe sync.

### 4. ⚡ Real-Time Updates & Automated Crons
- **Live Notifications**: Real-time dispatch, chat messages, and booking state synchronization via WebSockets.
- **Automated Cron Framework**:
  - **Email Outbox Drain**: Transactional emails sent via Resend with exponential retry backoff.
  - **Day-Before Flight Reminders**: Pre-flight checklist emails dispatched at 07:00 AM Sydney time.
  - **Daily Maintenance**: Automatic scans for overdue flight records, stale hold expirations, document expiry notices (30/14/7/1 days), new user onboarding inactivity alerts, and unpaid invoice chases.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 14 (App Router), React 18, TypeScript 5 |
| **Styling & Animation** | Tailwind CSS, Framer Motion, GSAP, Lucide Icons |
| **Database & Auth** | Supabase (PostgreSQL, Row Level Security, Auth SSR) |
| **Payments** | Stripe Checkout & Webhooks |
| **Email Service** | Resend (Transactional Outbox Queue) |
| **Charts & Metrics** | Recharts |
| **Realtime Service** | Socket.io / Supabase Realtime |
| **Task Scheduling** | Vercel Cron (`vercel.json`) |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v18.17+` or `v20+`
- **npm** or **pnpm**
- Active **Supabase** project and **Stripe** account

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/RohanjethaGITHUB/OZRentaplane-m4.git
cd OZRentaplane-m4
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env.local` and populate the required keys:
```bash
cp .env.example .env.local
```

Key variables:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Resend
RESEND_API_KEY=re_...
EMAIL_FROM=bookings@ozrentaplane.com
ADMIN_EMAIL=admin@ozrentaplane.com

# Cron & Realtime
CRON_SECRET=your-secure-cron-secret
SOCKET_EMIT_SECRET=your-socket-secret
```

### 3. Run Development Server
```bash
# Runs Next.js dev server and the local Socket.io realtime server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 📁 Repository Structure

```
OZRentaplane-m4/
├── app/
│   ├── (marketing)/         # Public marketing pages & fleet showcase
│   ├── dashboard/           # Customer / Pilot authenticated portal
│   ├── admin/               # Admin operations dashboard (70+ pages)
│   ├── actions/             # Next.js Server Actions (all backend mutation logic)
│   ├── api/
│   │   ├── cron/            # Scheduled cron job endpoints (/email-outbox, /daily-maintenance, etc.)
│   │   └── stripe/webhook/  # Stripe payment webhook handler
│   └── auth/                # Supabase auth callbacks & flows
├── components/              # UI components & design system building blocks
├── lib/
│   ├── booking/             # State machines, daylight VFR logic, flight record review
│   ├── email/               # Email outbox queue, Resend integration, and HTML templates
│   ├── jobs/                # Cron handlers, registry, and Sydney time helpers
│   ├── payments/            # Stripe session creation and invoice settlement
│   └── supabase/            # Supabase server/client/admin instances and TypeScript schemas
├── realtime/                # Standalone Socket.io server
├── supabase/migrations/     # Database schema and SQL migration files
├── docs/                    # Architecture, design specs, and integration guides
├── SETUP_GUIDE.md           # Deployment & Cron/Socket setup instructions
└── vercel.json              # Vercel Cron schedule configuration
```

---

## 📚 Documentation & Guides

Detailed operational guides and technical specifications are located in [`docs/`](docs/) and [`SETUP_GUIDE.md`](SETUP_GUIDE.md):

- 🚀 [**Deployment & Setup Guide**](SETUP_GUIDE.md) — Step-by-step setup for Vercel Cron and Socket.io / Supabase Realtime
- ⏰ [**Cron Framework Guide**](docs/cron-framework-guide.md) — Architecture and schedule specifications for automated background jobs
- ☁️ [**Vercel Cron Setup Guide**](docs/vercel-cron-setup-guide.md) — Configuring Vercel Hobby / Pro cron triggers
- ✉️ [**Email Triggers & Outbox Guide**](docs/email-triggers.md) — Event-driven transactional email workflows
- 🎨 [**Design System Specification**](docs/DESIGN.md) — Design tokens, typography (Newsreader & Manrope), and component guidelines
- 💼 [**Product & Brand Strategy**](docs/PRODUCT.md) — Brand voice, user personas, and booking lifecycle rules
- 🏗️ [**Architecture Audit Report**](docs/ARCHITECTURE_REPORT.txt) — Comprehensive codebase and schema overview

---

## 📄 License & Contact

Private repository — **OZ Rent A Plane**, Bankstown Airport (YSBK), Sydney, NSW, Australia.
