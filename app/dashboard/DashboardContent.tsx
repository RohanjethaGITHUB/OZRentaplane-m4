'use client'

import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import type { Profile, PilotClearanceStatus, UserDocument, VerificationEvent } from '@/lib/supabase/types'
import { fmtTimestamp } from '@/lib/utils/format'
import { CLEARANCE_LABEL_CUSTOMER } from '@/lib/pilot-status'
import { getCheckoutPaymentDisplayState } from '@/lib/checkout-payment-state'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CheckoutInvoiceData = {
  invoiceId:             string
  invoiceStatus?:        string | null
  subtotalCents:         number
  advanceAppliedCents:   number
  totalPaidCents:        number
  currentCreditCents:    number
  displayAmountDueCents: number
  checkoutOutcome:       string | null
  checkoutDurationHours: number | null
  landingSubtotalCents:  number
  bankTransferStatus?:   string | null  // status of latest bank transfer submission
  landingCharges: {
    airportIcao:      string
    airportName:      string
    landingCount:     number
    unitAmountCents:  number
    totalAmountCents: number
  }[]
}

type Props = {
  user: User
  profile: Profile | null
  documents: UserDocument[]
  events: VerificationEvent[]
  isFirstLogin: boolean
  checkoutBookingId?: string | null
  checkoutInvoice?:  CheckoutInvoiceData | null
}

// ─── Clearance-status-driven display configs ──────────────────────────────────
// pilot_clearance_status is the primary driver for all onboarding UI.
// verification_status is still used for the on-hold alert and document events.

type HeroContent = {
  subtitle: string
  title:    string
  body:     string
  cta1:     string
  cta1href: string
  cta2:     string
  cta2href: string
  icon:     string
  glowFrom: string
}

const CLEARANCE_HERO: Record<PilotClearanceStatus | string, HeroContent> = {
  checkout_required: {
    subtitle: 'Pilot Onboarding',
    title:    'Book Your Checkout Flight',
    body:     "Every new pilot completes a one-time checkout flight with our team before solo hire. Choose your preferred time to get started, documents are uploaded as part of the checkout process.",
    cta1:     'Book Checkout Flight',
    cta1href: '/dashboard/checkout',
    cta2:     'Learn More',
    cta2href: '/',
    icon:     'how_to_reg',
    glowFrom: 'from-white/10',
  },
  checkout_requested: {
    subtitle: 'Checkout Submitted',
    title:    'Request Under Review',
    body:     "Your selected checkout time has been submitted for review. Our Team may confirm this time or suggest an alternative. You will be notified once the request has been reviewed.",
    cta1:     'View My Bookings',
    cta1href: '/dashboard/bookings',
    cta2:     'Contact Support',
    cta2href: '/dashboard/messages',
    icon:     'pending_actions',
    glowFrom: 'from-blue-500/20',
  },
  checkout_confirmed: {
    subtitle: 'Checkout Confirmed',
    title:    'Checkout Flight Confirmed',
    body:     'Your checkout flight has been confirmed by our team. Check your bookings for the full details. Complete the flight to unlock bookings.',
    cta1:     'View My Bookings',
    cta1href: '/dashboard/bookings',
    cta2:     'Contact Support',
    cta2href: '/dashboard/messages',
    icon:     'event_available',
    glowFrom: 'from-blue-500/20',
  },
  checkout_completed_under_review: {
    subtitle: 'Checkout Complete',
    title:    'Awaiting Outcome Review',
    body:     "Your checkout flight has been completed. The flight operations team is reviewing the outcome and will update your clearance status shortly.",
    cta1:     'View My Bookings',
    cta1href: '/dashboard/bookings',
    cta2:     'Contact Support',
    cta2href: '/dashboard/messages',
    icon:     'rate_review',
    glowFrom: 'from-amber-500/20',
  },
  checkout_payment_required: {
    subtitle: 'Invoice Due',
    title:    'Checkout Invoice Required',
    body:     'Your checkout flight has been completed and an invoice has been issued. Please pay the invoice to proceed — your pilot status will be updated automatically after payment clears.',
    cta1:     'Pay Checkout Invoice',
    cta1href: '/dashboard/bookings',   // overridden at render time with bookingId
    cta2:     'View My Bookings',
    cta2href: '/dashboard/bookings',
    icon:     'payments',
    glowFrom: 'from-orange-500/20',
  },
  // Virtual state: checkout_payment_required + bank transfer submitted
  // Not a real DB status — derived at render time via getCheckoutPaymentDisplayState
  checkout_awaiting_manual_payment: {
    subtitle: 'Payment Submitted',
    title:    'Awaiting Payment Confirmation',
    body:     'Your bank transfer details have been submitted. An admin will verify the payment before your checkout result is finalised. No further action is required from you right now.',
    cta1:     'View Payment Details',
    cta1href: '/dashboard/bookings',   // overridden at render time with bookingId
    cta2:     'Contact Support',
    cta2href: '/dashboard/messages',
    icon:     'account_balance',
    glowFrom: 'from-blue-500/20',
  },
  cleared_to_fly: {
    subtitle: 'Access Granted',
    title:    "You're Cleared to Fly",
    body:     'Your checkout is complete and you are cleared to fly. Browse available windows and submit booking requests for the Sydney Cessna 172 fleet.',
    cta1:     'Book a Flight',
    cta1href: '/dashboard/bookings/new',
    cta2:     'View My Bookings',
    cta2href: '/dashboard/bookings',
    icon:     'flight_takeoff',
    glowFrom: 'from-green-500/20',
  },
  additional_checkout_required: {
    subtitle: 'Checkout Outcome',
    title:    'Additional Checkout Required',
    body:     'Following your checkout, the admin team has determined that an additional checkout session is required before you can be cleared to fly. Book another checkout flight to continue your progress.',
    cta1:     'Book Another Checkout',
    cta1href: '/dashboard/checkout',
    cta2:     'Contact Support',
    cta2href: '/dashboard/messages',
    icon:     'schedule',
    glowFrom: 'from-amber-500/20',
  },
  checkout_reschedule_required: {
    subtitle: 'Checkout Outcome',
    title:    'Checkout Reschedule Required',
    body:     'Your checkout could not be fully assessed this time — for example due to weather, time, or scheduling. Book another checkout session when you are ready to try again.',
    cta1:     'Book Another Checkout',
    cta1href: '/dashboard/checkout',
    cta2:     'Contact Support',
    cta2href: '/dashboard/messages',
    icon:     'event_repeat',
    glowFrom: 'from-amber-500/20',
  },
  not_currently_eligible: {
    subtitle: 'Account Status',
    title:    'Not Currently Eligible',
    body:     'Based on your checkout assessment, further training is required before you can continue with aircraft hire. Please arrange further training and contact us when you are ready to try again.',
    cta1:     'Contact Us',
    cta1href: '/dashboard/messages',
    cta2:     'View My Bookings',
    cta2href: '/dashboard/bookings',
    icon:     'block',
    glowFrom: 'from-red-500/20',
  },
}

// ─── Onboarding steps by clearance status ────────────────────────────────────

type StepState = 'done' | 'active' | 'pending' | 'failed'
type Step      = { label: string; state: StepState }

const CLEARANCE_STEPS: Record<PilotClearanceStatus, Step[]> = {
  checkout_required: [
    { label: 'Account created',      state: 'done'    },
    { label: 'Book checkout flight',  state: 'active'  },
    { label: 'Complete checkout',     state: 'pending' },
    { label: 'Cleared to fly', state: 'pending' },
  ],
  checkout_requested: [
    { label: 'Account created',             state: 'done'   },
    { label: 'Checkout request submitted',  state: 'done'   },
    { label: 'Request confirmed',           state: 'active' },
    { label: 'Complete checkout',           state: 'pending'},
    { label: 'Cleared to fly',       state: 'pending'},
  ],
  checkout_confirmed: [
    { label: 'Account created',       state: 'done'   },
    { label: 'Checkout confirmed',    state: 'done'   },
    { label: 'Complete checkout',     state: 'active' },
    { label: 'Cleared for solo hire', state: 'pending'},
  ],
  checkout_completed_under_review: [
    { label: 'Account created',       state: 'done'   },
    { label: 'Checkout completed',    state: 'done'   },
    { label: 'Outcome under review',  state: 'active' },
    { label: 'Cleared for solo hire', state: 'pending'},
  ],
  checkout_payment_required: [
    { label: 'Account created',       state: 'done'   },
    { label: 'Checkout completed',    state: 'done'   },
    { label: 'Pay checkout invoice',  state: 'active' },
    { label: 'Status updated',        state: 'pending'},
  ],
  cleared_to_fly: [
    { label: 'Account created',    state: 'done' },
    { label: 'Checkout completed', state: 'done' },
    { label: 'Cleared to fly',     state: 'done' },
  ],
  additional_checkout_required: [
    { label: 'Account created',           state: 'done'    },
    { label: 'Checkout completed',        state: 'done'    },
    { label: 'Additional checkout required', state: 'active' },
    { label: 'Cleared to fly',            state: 'pending' },
  ],
  checkout_reschedule_required: [
    { label: 'Account created',          state: 'done'   },
    { label: 'Checkout attempted',       state: 'done'   },
    { label: 'Reschedule required',      state: 'failed' },
    { label: 'Book another checkout',    state: 'active' },
  ],
  not_currently_eligible: [
    { label: 'Account created',          state: 'done'   },
    { label: 'Not currently eligible',   state: 'failed' },
    { label: 'Arrange further training', state: 'active' },
  ],
}

// ─── Step icon ───────────────────────────────────────────────────────────────

function StepIcon({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <span className="material-symbols-outlined text-blue-400 text-xl flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
        check_circle
      </span>
    )
  }
  if (state === 'active') {
    return (
      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-blue-400 ring-4 ring-blue-400/20" />
      </div>
    )
  }
  if (state === 'failed') {
    return (
      <span className="material-symbols-outlined text-red-400 text-xl flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
        cancel
      </span>
    )
  }
  return (
    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
      <div className="w-4 h-4 rounded-full border border-white/15" />
    </div>
  )
}

// ─── Event display config ────────────────────────────────────────────────────

const EVENT_DISPLAY: Record<string, { icon: string; color: string }> = {
  submitted:   { icon: 'upload_file',   color: 'text-blue-400'  },
  resubmitted: { icon: 'upload_file',   color: 'text-blue-400'  },
  approved:    { icon: 'verified_user', color: 'text-green-400' },
  rejected:    { icon: 'person_off',    color: 'text-red-400'   },
  on_hold:     { icon: 'pause_circle',  color: 'text-amber-400' },
  message:     { icon: 'chat',          color: 'text-slate-400' },
}

// ─── Shared card class ────────────────────────────────────────────────────────

const CARD = 'bg-gradient-to-br from-[#0c1525] to-[#080e1c] border border-white/[0.07] rounded-xl shadow-[0_4px_30px_rgba(0,0,0,0.35)]'

// ─── Main customer overview component ─────────────────────────────────────────

// ─── Checkout status display config ─────────────────────────────────────────

type ClearanceConfig = {
  badge:     string
  pillColor: 'green' | 'blue' | 'amber' | 'red' | 'slate'
  pulse:     boolean
}

const CLEARANCE_CONFIG: Record<PilotClearanceStatus, ClearanceConfig> = {
  checkout_required:             { badge: 'Checkout Required',          pillColor: 'amber', pulse: false },
  checkout_requested:            { badge: 'Checkout Requested',         pillColor: 'blue',  pulse: true  },
  checkout_confirmed:            { badge: 'Checkout Confirmed',         pillColor: 'blue',  pulse: false },
  checkout_completed_under_review: { badge: 'Outcome Under Review',    pillColor: 'amber', pulse: true  },
  checkout_payment_required:     { badge: 'Payment Required',          pillColor: 'amber', pulse: false },
  cleared_to_fly:                { badge: 'Cleared to Fly',            pillColor: 'green', pulse: false },
  additional_checkout_required:  { badge: 'Additional Checkout Required', pillColor: 'amber', pulse: false },
  checkout_reschedule_required:  { badge: 'Reschedule Required',       pillColor: 'amber', pulse: false },
  not_currently_eligible:        { badge: 'Not Currently Eligible',    pillColor: 'red',   pulse: false },
}

export default function DashboardContent({ user, profile, documents, events, isFirstLogin, checkoutBookingId, checkoutInvoice }: Props) {
  const router = useRouter()

  const displayName = profile?.full_name ?? user.email?.split('@')[0] ?? 'Pilot'
  const firstName   = displayName.split(' ')[0] ?? displayName
  const initials    = displayName.split(' ').filter(Boolean).map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) || '?'

  // pilot_clearance_status is the primary driver for all onboarding UI
  const clearanceStatus = (profile?.pilot_clearance_status ?? 'checkout_required') as PilotClearanceStatus
  const clearanceCfg    = CLEARANCE_CONFIG[clearanceStatus]
  const steps           = CLEARANCE_STEPS[clearanceStatus]

  // Derive checkout payment display state to determine if bank transfer has been submitted
  const checkoutPaymentDisplayState = clearanceStatus === 'checkout_payment_required'
    ? getCheckoutPaymentDisplayState(
        checkoutInvoice ? { status: checkoutInvoice.invoiceStatus ?? 'payment_required' } : null,
        checkoutInvoice?.bankTransferStatus ? { status: checkoutInvoice.bankTransferStatus } : null,
      )
    : null

  const isAwaitingManualPayment = checkoutPaymentDisplayState === 'awaiting_manual_payment_confirmation'

  // Override badge/pill when bank transfer is submitted — all customer-facing status
  // indicators must show "Awaiting Payment Confirmation" rather than "Payment Required".
  const displayCfg = isAwaitingManualPayment
    ? { ...clearanceCfg, badge: 'Awaiting Payment Confirmation', pillColor: 'blue' as const, pulse: true }
    : clearanceCfg

  // Override active onboarding step label to match the payment-pending state.
  const displaySteps = isAwaitingManualPayment
    ? steps.map(s => s.state === 'active' ? { ...s, label: 'Awaiting payment confirmation' } : s)
    : steps

  // For checkout_payment_required, the hero subtitle and body are outcome-aware.
  // We override the static CLEARANCE_HERO config dynamically.
  // When bank transfer has been submitted, we switch to the manual-payment-pending hero.
  const checkoutOutcome = checkoutInvoice?.checkoutOutcome
  const paymentHeroOverride: Partial<typeof CLEARANCE_HERO[typeof clearanceStatus]> =
    isAwaitingManualPayment
      ? {
          subtitle: 'Payment Submitted',
          title:    'Awaiting Payment Confirmation',
          body:     'Your bank transfer details have been submitted. An admin will verify the payment before your checkout result is finalised. No further action is required from you right now.',
          cta1:     'View Payment Details',
          cta1href: checkoutBookingId ? `/dashboard/bookings/${checkoutBookingId}` : '/dashboard/bookings',
          cta2:     'Contact Support',
          cta2href: '/dashboard/messages',
          icon:     'account_balance',
        }
      : clearanceStatus === 'checkout_payment_required' && checkoutOutcome
      ? {
          subtitle:
            checkoutOutcome === 'cleared_to_fly'               ? 'Checkout Approved — Invoice Due'
            : checkoutOutcome === 'additional_checkout_required' ? 'Additional Checkout Required — Invoice Due'
            : checkoutOutcome === 'checkout_reschedule_required' ? 'Reschedule Required — Invoice Due'
            : 'Checkout Invoice Due',
          title:
            checkoutOutcome === 'cleared_to_fly'               ? 'Pay Your Checkout Invoice'
            : checkoutOutcome === 'additional_checkout_required' ? 'Invoice Due — Additional Checkout Required'
            : checkoutOutcome === 'checkout_reschedule_required' ? 'Invoice Due — Reschedule Required'
            : 'Checkout Invoice',
          body:
            checkoutOutcome === 'cleared_to_fly'
              ? 'Your checkout has been approved. Please pay your checkout invoice before aircraft bookings become available.'
              : checkoutOutcome === 'additional_checkout_required'
              ? 'An invoice has been issued for your checkout flight. An additional checkout session is required — please pay the invoice, then book another checkout flight to continue your progress.'
              : checkoutOutcome === 'checkout_reschedule_required'
              ? 'An invoice has been issued for your checkout flight. Please pay the invoice — you will then be able to book another checkout session.'
              : 'An invoice has been issued for your checkout flight. Please pay the invoice. Further training is required before you can continue with aircraft hire.',
          cta1href: checkoutBookingId ? `/dashboard/bookings/${checkoutBookingId}` : '/dashboard/bookings',
        }
      : checkoutBookingId && clearanceStatus === 'checkout_payment_required'
      ? { cta1href: `/dashboard/bookings/${checkoutBookingId}` }
      : {}

  const hero = { ...CLEARANCE_HERO[clearanceStatus], ...paymentHeroOverride }
  const isCleared       = clearanceStatus === 'cleared_to_fly'
  const inCheckoutFlow  = ['checkout_required', 'checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review', 'checkout_payment_required'].includes(clearanceStatus)

  const unreadCount       = events.filter(e => !e.is_read).length

  // Pill color mapping — shared by hero badge and profile card
  type PillColor = 'green' | 'blue' | 'amber' | 'red' | 'slate'
  const PILL_BG: Record<PillColor, string> = {
    green: 'bg-green-500/15 border-green-500/30 text-green-400',
    blue:  'bg-blue-500/15 border-blue-500/30 text-blue-400',
    amber: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
    red:   'bg-red-500/15 border-red-500/30 text-red-400',
    slate: 'bg-white/[0.06] border-white/10 text-slate-400',
  }
  const DOT_BG: Record<PillColor, string> = {
    green: 'bg-green-400',
    blue:  'bg-blue-400',
    amber: 'bg-amber-400',
    red:   'bg-red-400',
    slate: 'bg-slate-500',
  }

  // Derive licence type label from documents for profile card
  const pilotLicenceDoc = documents.find(d => d.document_type === 'pilot_licence')
  const licenceTypeLabel = pilotLicenceDoc?.licence_type
    ? `${pilotLicenceDoc.licence_type} Licence`
    : null

  return (
    <div>

      {/* ══ HERO — image-backed welcome ══════════════════════════════════════ */}
      <section className="relative overflow-hidden">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/customer/customer-overview-hero.png')" }}
        />
        {/* Primary dark overlay — keeps text readable */}
        <div className="absolute inset-0 bg-[#071428]/65" />
        {/* Cinematic vignette: darken edges, lighten centre-top */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#060d18]/40 via-transparent to-[#060d18]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#060d18]/50 via-transparent to-[#060d18]/50" />
        {/* Extra deep bottom fade — blends into two-panel section */}
        <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-[#060d18] to-transparent" />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center px-6 py-24 md:py-28 max-w-2xl mx-auto">
          <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-blue-300/70 mb-4">
            Member Overview
          </p>
          <h1 className="text-4xl md:text-5xl font-serif tracking-tight text-white mb-4 leading-tight drop-shadow-lg">
            {isFirstLogin ? `Welcome, ${firstName}` : `Welcome back, ${firstName}`}
          </h1>
          <p className="text-white/65 text-[15px] leading-relaxed mb-6 max-w-lg">
            Manage your aircraft access, documents, bookings, and messages from your private pilot portal.
          </p>
          {/* Prominent status pill — amber/red for warning states, others standard */}
          <div className={`inline-flex items-center gap-2.5 px-5 py-2 rounded-full border text-[11px] font-bold uppercase tracking-widest ${
            displayCfg.pillColor === 'amber'
              ? 'bg-amber-500/20 border-amber-400/50 text-amber-200 shadow-[0_0_24px_rgba(245,158,11,0.18)]'
              : displayCfg.pillColor === 'red'
              ? 'bg-red-500/20 border-red-400/50 text-red-200 shadow-[0_0_24px_rgba(239,68,68,0.18)]'
              : PILL_BG[displayCfg.pillColor]
          }`}>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_BG[displayCfg.pillColor]} ${displayCfg.pulse ? 'animate-pulse' : ''}`} />
            {displayCfg.badge}
          </div>
        </div>
      </section>

      {/* ══ TWO-PANEL STATUS SECTION ════════════════════════════════════════ */}
      <div className="max-w-[1280px] mx-auto px-6 md:px-10 xl:px-12 -mt-2 pb-0 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_285px] xl:grid-cols-[1fr_305px] gap-5 items-stretch">

          {/* ─ Left: status card with background image ─────────────────────── */}
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] shadow-[0_8px_48px_rgba(0,0,0,0.55)] min-h-[240px]">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: "url('/customer/customer-access.png')" }}
            />
            {/* Left-heavy gradient overlay keeps text always readable */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#080f20]/95 via-[#080f20]/82 to-[#080f20]/35" />
            <div className={`absolute inset-0 bg-gradient-to-tr ${hero.glowFrom} to-transparent opacity-20`} />

            <div className="relative z-10 p-8 md:p-10 flex flex-col justify-end h-full min-h-[240px]">
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-blue-400/80 mb-2 block">
                {hero.subtitle}
              </span>
              <h2 className="text-2xl md:text-[28px] font-serif text-white leading-tight tracking-tight mb-3">
                {hero.title}
              </h2>
              <p className="text-white/55 text-sm leading-relaxed max-w-md mb-6">
                {hero.body}
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => router.push(hero.cta1href)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)]"
                >
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'wght' 400, 'FILL' 0" }}>
                    {hero.icon}
                  </span>
                  {hero.cta1}
                </button>
                <button
                  onClick={() => router.push(hero.cta2href)}
                  className="px-5 py-2.5 border border-white/20 hover:border-white/35 hover:bg-white/[0.05] text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all"
                >
                  {hero.cta2}
                </button>
              </div>
            </div>
          </div>

          {/* ─ Invoice breakdown panel (checkout_payment_required only) ────── */}
          {clearanceStatus === 'checkout_payment_required' && checkoutInvoice && (
            <div className="lg:col-span-2 bg-gradient-to-br from-[#0c1525]/80 to-[#080e1c]/80 border border-orange-500/20 rounded-2xl p-6 shadow-[0_4px_30px_rgba(0,0,0,0.35)]">
              <div className="flex items-center gap-2 mb-5">
                <span className="material-symbols-outlined text-[16px] text-orange-400" style={{ fontVariationSettings: "'FILL' 1" }}>
                  receipt_long
                </span>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-orange-400/80">
                  Checkout Invoice Breakdown
                </h3>
              </div>

              <div className="space-y-2 mb-4">
                {/* Flight time */}
                {checkoutInvoice.checkoutDurationHours && (
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-slate-400">
                      Flight time ({checkoutInvoice.checkoutDurationHours.toFixed(1)}h × $290/hr)
                    </span>
                    <span className="text-[11px] font-mono text-slate-300">
                      ${((checkoutInvoice.subtotalCents - checkoutInvoice.landingSubtotalCents) / 100).toFixed(2)}
                    </span>
                  </div>
                )}

                {/* Landing charges */}
                {checkoutInvoice.landingCharges.length > 0 && (
                  <>
                    {checkoutInvoice.landingCharges.map((lc, i) => (
                      <div key={i} className="flex justify-between items-center pl-3 border-l border-white/[0.06]">
                        <span className="text-[10px] text-slate-500">
                          {lc.airportIcao} — {lc.airportName} × {lc.landingCount} landing{lc.landingCount !== 1 ? 's' : ''}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          ${(lc.totalAmountCents / 100).toFixed(2)}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center pl-3 border-l border-white/[0.06]">
                      <span className="text-[10px] text-slate-500">Landing subtotal</span>
                      <span className="text-[10px] font-mono text-slate-400">
                        ${(checkoutInvoice.landingSubtotalCents / 100).toFixed(2)}
                      </span>
                    </div>
                  </>
                )}

                {/* Divider + gross total */}
                <div className="h-px bg-white/[0.06]" />
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-slate-400">Gross checkout total</span>
                  <span className="text-[11px] font-mono font-semibold text-white">
                    ${(checkoutInvoice.subtotalCents / 100).toFixed(2)}
                  </span>
                </div>

                {/* Credit applied (initial advance) */}
                {checkoutInvoice.advanceAppliedCents > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-slate-400">Credit applied</span>
                    <span className="text-[11px] font-mono text-emerald-400">
                      −${(checkoutInvoice.advanceAppliedCents / 100).toFixed(2)}
                    </span>
                  </div>
                )}

                {/* Available additional credit */}
                {checkoutInvoice.currentCreditCents > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-slate-400">Additional credit available</span>
                    <span className="text-[11px] font-mono text-emerald-400/70">
                      ${(checkoutInvoice.currentCreditCents / 100).toFixed(2)}
                    </span>
                  </div>
                )}

                {/* Divider + amount due */}
                <div className="h-px bg-white/[0.06]" />
                <div className="flex justify-between items-center">
                  <span className="text-[12px] font-semibold text-white">Amount Due Now</span>
                  <span className={`text-[14px] font-bold font-mono ${checkoutInvoice.displayAmountDueCents > 0 ? 'text-orange-300' : 'text-emerald-400'}`}>
                    {checkoutInvoice.displayAmountDueCents > 0
                      ? `$${(checkoutInvoice.displayAmountDueCents / 100).toFixed(2)}`
                      : 'Settled by credit'}
                  </span>
                </div>
              </div>

              {checkoutInvoice.currentCreditCents > 0 && checkoutInvoice.displayAmountDueCents > 0 && !isAwaitingManualPayment && (
                <p className="text-[9px] text-emerald-400/60 mb-3 leading-relaxed">
                  Available credit will be applied automatically when you proceed to payment.
                </p>
              )}

              {isAwaitingManualPayment ? (
                <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <span className="material-symbols-outlined text-blue-400 text-[20px] flex-shrink-0">pending_actions</span>
                  <div>
                    <p className="text-[11px] font-bold text-blue-400 mb-0.5">Bank transfer submitted</p>
                    <p className="text-[10px] text-slate-500 leading-relaxed">Awaiting admin verification. No further action needed.</p>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => router.push(hero.cta1href)}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-[11px] font-bold uppercase tracking-[0.15em] transition-all shadow-[0_0_20px_rgba(234,88,12,0.3)]"
                >
                  <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    payments
                  </span>
                  {checkoutInvoice.displayAmountDueCents > 0
                    ? `Pay Now — $${(checkoutInvoice.displayAmountDueCents / 100).toFixed(2)}`
                    : 'View Invoice'}
                </button>
              )}
            </div>
          )}

          {/* ─ Right: Pilot Profile card ─────────────────────────────────── */}
          <div className={`${CARD} p-6 flex flex-col`}>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-5">
              Pilot Profile
            </h3>

            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-full bg-[#a7c8ff]/10 border border-[#a7c8ff]/20 flex items-center justify-center flex-shrink-0">
                <span className="text-[14px] font-bold text-[#a7c8ff]">{initials}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{displayName}</p>
                {licenceTypeLabel && (
                  <p className="text-[11px] text-slate-500 mt-0.5">{licenceTypeLabel}</p>
                )}
                {profile?.pilot_arn && (
                  <p className="text-[10px] text-slate-600 font-mono mt-0.5">{profile.pilot_arn}</p>
                )}
              </div>
            </div>

            <div className="h-px bg-white/[0.06] mb-4" />

            <div className="space-y-2 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Clearance Status</p>
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-widest ${PILL_BG[displayCfg.pillColor]}`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT_BG[displayCfg.pillColor]} ${displayCfg.pulse ? 'animate-pulse' : ''}`} />
                {displayCfg.badge}
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {isCleared
                  ? 'Cleared to fly'
                  : inCheckoutFlow
                  ? 'Checkout in progress'
                  : 'Bookings unavailable'}
              </p>
            </div>

            <div className="mt-5 pt-4 border-t border-white/[0.06]">
              <button
                onClick={() => router.push('/dashboard/settings')}
                className="text-[10px] text-slate-500 hover:text-blue-300 font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5"
              >
                View Account
                <span className="material-symbols-outlined text-[12px]">arrow_forward</span>
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ══ MAIN CONTENT ════════════════════════════════════════════════════ */}
      <div className="max-w-[1280px] mx-auto px-6 md:px-10 xl:px-12 py-10 space-y-8">

        {clearanceStatus === 'checkout_requested' && (
          <section className="bg-blue-500/[0.06] border border-blue-500/20 rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-blue-400 text-xl animate-pulse" style={{ fontVariationSettings: "'wght' 300" }}>
                pending_actions
              </span>
              <h4 className="text-xs font-bold uppercase tracking-widest text-blue-400">
                Checkout Request Under Review
              </h4>
            </div>
            <p className="text-sm text-white/75 leading-relaxed pl-8">
              Your selected checkout time has been submitted for review. Our Team may confirm this time or suggest an alternative. You will be notified once the request has been reviewed.
            </p>
          </section>
        )}

        {clearanceStatus === 'checkout_confirmed' && (
          <section className="bg-green-500/[0.06] border border-green-500/20 rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-green-400 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                verified
              </span>
              <h4 className="text-xs font-bold uppercase tracking-widest text-green-400">
                Checkout Confirmed
              </h4>
            </div>
            <p className="text-sm text-white/75 leading-relaxed pl-8">
              Your checkout flight has been confirmed by our team. Check your bookings for the full details.
            </p>
          </section>
        )}

        {clearanceStatus === 'checkout_completed_under_review' && (
          <section className="bg-amber-500/[0.06] border border-amber-500/20 rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-amber-400 text-xl animate-pulse" style={{ fontVariationSettings: "'wght' 300" }}>
                hourglass_top
              </span>
              <h4 className="text-xs font-bold uppercase tracking-widest text-amber-400">
                Checkout Outcome Under Review
              </h4>
            </div>
            <p className="text-sm text-white/75 leading-relaxed pl-8">
              Your checkout flight has been completed. The flight operations team is reviewing the outcome and will update your clearance status shortly.
            </p>
          </section>
        )}

        {clearanceStatus === 'additional_checkout_required' && (
          <section className="bg-amber-500/[0.06] border border-amber-500/20 rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-amber-400 text-xl" style={{ fontVariationSettings: "'wght' 300" }}>
                schedule
              </span>
              <h4 className="text-xs font-bold uppercase tracking-widest text-amber-400">
                Additional Checkout Required
              </h4>
            </div>
            <p className="text-sm text-white/75 leading-relaxed pl-8">
              Following your checkout, the admin team has determined that an additional checkout session is required before you can be cleared to fly. Book another checkout flight when you are ready to continue.
            </p>
          </section>
        )}

        {clearanceStatus === 'checkout_reschedule_required' && (
          <section className="bg-amber-500/[0.06] border border-amber-500/20 rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-amber-400 text-xl" style={{ fontVariationSettings: "'wght' 300" }}>
                event_repeat
              </span>
              <h4 className="text-xs font-bold uppercase tracking-widest text-amber-400">
                Checkout Reschedule Required
              </h4>
            </div>
            <p className="text-sm text-white/75 leading-relaxed pl-8">
              Your checkout could not be fully assessed this time. Book another checkout session when you are ready to try again.
            </p>
          </section>
        )}

        {clearanceStatus === 'not_currently_eligible' && (
          <section className="bg-red-500/[0.06] border border-red-500/20 rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-red-400 text-xl" style={{ fontVariationSettings: "'wght' 300" }}>
                block
              </span>
              <h4 className="text-xs font-bold uppercase tracking-widest text-red-400">
                Not Currently Eligible to Fly
              </h4>
            </div>
            <p className="text-sm text-white/75 leading-relaxed pl-8">
              Your account is not currently eligible to fly. Please contact the operations team for further information.
            </p>
          </section>
        )}

        {/* 2×2 Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Onboarding Steps — driven by pilot_clearance_status */}
          <div className={`${CARD} p-7 space-y-5`}>
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-blue-400/80">Onboarding Progress</h3>
              <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border ${PILL_BG[displayCfg.pillColor]}`}>
                {displayCfg.badge}
              </span>
            </div>
            <ul className="space-y-4">
              {displaySteps.map(step => (
                <li key={step.label} className={`flex items-center gap-4 ${
                  step.state === 'active'  ? 'text-white' :
                  step.state === 'failed'  ? 'text-red-400/80' :
                  step.state === 'pending' ? 'text-white/25' :
                  'text-white/45'
                }`}>
                  <StepIcon state={step.state} />
                  <span className={`text-sm ${step.state === 'active' ? 'font-medium' : 'font-light'}`}>
                    {step.label}
                  </span>
                </li>
              ))}
            </ul>
            {isAwaitingManualPayment && (
              <p className="text-[11px] text-blue-400/70 leading-relaxed border-t border-white/[0.06] pt-4 mt-1">
                Your bank transfer details have been submitted. Our team will verify the payment before your checkout result is finalised.
              </p>
            )}
          </div>

          {/* Documents summary */}
          <div className={`${CARD} p-7 flex flex-col justify-between`}>
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-blue-400/80">My Documents</h3>
                <span className="material-symbols-outlined text-slate-600 text-sm">description</span>
              </div>
              {documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-4 gap-3 text-center">
                  <span className="material-symbols-outlined text-white/10 text-4xl" style={{ fontVariationSettings: "'wght' 100, 'FILL' 0" }}>upload_file</span>
                  <p className="text-sm text-slate-500 font-light leading-relaxed">
                    No documents uploaded yet. Start with your pilot licence.
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {[
                    { key: 'pilot_licence',       label: 'Pilot Licence' },
                    { key: 'medical_certificate',  label: 'Medical Certificate' },
                    { key: 'photo_id',             label: 'Photo ID' },
                  ].map(({ key, label }) => {
                    const uploaded = documents.some(d => d.document_type === key)
                    return (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-sm text-slate-400 font-light">{label}</span>
                        {uploaded
                          ? <span className="text-[9px] font-bold text-blue-400 uppercase px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded tracking-widest">Uploaded</span>
                          : <span className="text-[9px] font-bold text-slate-500 uppercase px-2 py-1 border border-white/8 rounded tracking-widest">Missing</span>
                        }
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <button
              onClick={() => router.push('/dashboard/documents')}
              className="mt-6 w-full py-3 border-t border-white/[0.06] hover:bg-white/[0.04] text-slate-500 hover:text-white transition-all text-[10px] font-bold uppercase tracking-[0.15em] flex items-center justify-center gap-2 rounded-lg"
            >
              {documents.length === 0 ? 'Upload Documents' : 'Manage Documents'}
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>

          {/* Bookings card */}
          <div className={`${CARD} p-7 flex flex-col items-center justify-center text-center space-y-4 min-h-[200px]`}>
            <div className="w-14 h-14 rounded-full bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
              <span className={`material-symbols-outlined text-2xl ${isCleared ? 'text-blue-400/60' : 'text-blue-400/25'}`}>
                flight_takeoff
              </span>
            </div>
            {isCleared ? (
              <>
                <h3 className="text-lg font-serif text-white">Ready to book</h3>
                <p className="text-sm text-slate-500 max-w-xs leading-relaxed font-light">
                  Browse available windows and request the Sydney Cessna 172.
                </p>
                <button
                  onClick={() => router.push('/dashboard/bookings/new')}
                  className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400 border-b border-blue-400/30 pb-0.5 hover:border-blue-400 transition-all"
                >
                  Book a Flight
                </button>
              </>
            ) : clearanceStatus === 'checkout_required' ? (
              <>
                <h3 className="text-lg font-serif text-white">Checkout Required</h3>
                <p className="text-sm text-slate-500 max-w-xs leading-relaxed font-light">
                  Once your checkout flight is approved, you will unlock bookings.
                </p>
                <button
                  onClick={() => router.push('/dashboard/checkout')}
                  className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400 border-b border-blue-400/30 pb-0.5 hover:border-blue-400 transition-all"
                >
                  Book Checkout Flight
                </button>
              </>
            ) : isAwaitingManualPayment ? (
              <>
                <h3 className="text-lg font-serif text-white">Awaiting Payment Confirmation</h3>
                <p className="text-sm text-slate-500 max-w-xs leading-relaxed font-light">
                  Your bank transfer has been submitted and is awaiting confirmation from our team.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-serif text-white">Solo Booking Locked</h3>
                <p className="text-sm text-slate-500 max-w-xs leading-relaxed font-light">
                  {inCheckoutFlow
                    ? 'Solo hire will be unlocked once you are cleared for solo flight.'
                    : 'Solo hire is currently unavailable. Contact the operations team for assistance.'}
                </p>
                <button
                  onClick={() => router.push('/dashboard/bookings')}
                  className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 border-b border-slate-500/30 pb-0.5 hover:text-white hover:border-slate-400 transition-all"
                >
                  View My Bookings
                </button>
              </>
            )}
          </div>

          {/* Support / Messages */}
          <div className={`${CARD} p-7 flex flex-col justify-between relative overflow-hidden group hover:border-white/[0.1] transition-colors min-h-[200px]`}>
            <div className="absolute -right-6 -bottom-6 opacity-[0.04] group-hover:opacity-[0.06] transition-opacity select-none">
              <span className="material-symbols-outlined text-[120px] text-white">contact_support</span>
            </div>
            <div className="space-y-3 relative z-10">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-blue-400/80">Need Help?</h3>
              <p className="text-sm text-slate-500 leading-relaxed font-light">
                {clearanceStatus === 'not_currently_eligible' || clearanceStatus === 'checkout_reschedule_required'
                  ? "Our team can review your case and guide you through next steps."
                  : 'Questions about onboarding, documents, or an upcoming trip? Our team is here.'}
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard/messages')}
              className="relative z-10 w-fit mt-6 px-5 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] rounded-full text-[10px] text-white font-bold uppercase tracking-[0.15em] transition-all"
            >
              View Messages
            </button>
          </div>

        </section>

        {/* Verification History */}
        {events.length > 0 && (
          <section className="space-y-5">
            <div className="flex items-center gap-3">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Status Updates</h3>
              {unreadCount > 0 && (
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-[9px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="space-y-3">
              {events.map(ev => {
                const disp         = EVENT_DISPLAY[ev.event_type] ?? EVENT_DISPLAY.message
                const isCustomerMsg = ev.actor_role === 'customer'
                const when         = fmtTimestamp(ev.created_at)
                return (
                  <div
                    key={ev.id}
                    className={`${CARD} p-5 flex gap-4 transition-colors ${!ev.is_read ? 'border-white/10' : ''}`}
                  >
                    <div className="flex flex-col items-center flex-shrink-0 pt-1">
                      {!ev.is_read && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`material-symbols-outlined text-base ${isCustomerMsg ? 'text-blue-300/50' : disp.color}`}
                            style={{ fontVariationSettings: "'wght' 300" }}
                          >
                            {isCustomerMsg ? 'person' : disp.icon}
                          </span>
                          <p className="text-sm font-semibold text-white">{ev.title}</p>
                          {isCustomerMsg && (
                            <span className="text-[9px] uppercase tracking-widest font-bold text-white/25 border border-white/10 px-1.5 py-0.5 rounded">You</span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-600 whitespace-nowrap font-mono flex-shrink-0">{when}</span>
                      </div>
                      {ev.body && (
                        <p className="text-sm text-slate-400 leading-relaxed">{ev.body}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
