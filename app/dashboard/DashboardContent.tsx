'use client'

import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import type { Profile, PilotClearanceStatus, UserDocument, VerificationEvent } from '@/lib/supabase/types'
import { fmtTimestamp } from '@/lib/utils/format'
import { getCheckoutPaymentDisplayState } from '@/lib/checkout-payment-state'

export type CheckoutInvoiceData = {
  invoiceId: string
  invoiceStatus?: string | null
  subtotalCents: number
  advanceAppliedCents: number
  totalPaidCents: number
  currentCreditCents: number
  displayAmountDueCents: number
  checkoutOutcome: string | null
  checkoutDurationHours: number | null
  landingSubtotalCents: number
  bankTransferStatus?: string | null
  landingCharges: {
    airportIcao: string
    airportName: string
    landingCount: number
    unitAmountCents: number
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
  checkoutInvoice?: CheckoutInvoiceData | null
}

type StatusConfig = {
  subtitle: string
  body: string
  primaryCtaLabel: string
  primaryCtaHref: string
  secondaryCtaLabel: string
  secondaryCtaHref: string
  statusPill: string
  statusTone: 'amber' | 'blue' | 'violet' | 'slate' | 'green' | 'red'
  actionTitle: string
  actionBody: string
  progressTitle: string
}

type ChecklistState = 'done' | 'active' | 'pending'

type ChecklistItem = { label: string; state: ChecklistState }

const STATUS_CONFIG: Record<PilotClearanceStatus, StatusConfig> = {
  checkout_required: {
    subtitle: 'Before Solo Hire',
    body: 'Complete your one-time checkout flight before booking aircraft solo.',
    primaryCtaLabel: 'Book checkout flight',
    primaryCtaHref: '/dashboard/checkout',
    secondaryCtaLabel: 'Learn more',
    secondaryCtaHref: '/checkout-process',
    statusPill: 'Checkout Required',
    statusTone: 'amber',
    actionTitle: 'Book your checkout flight',
    actionBody: 'Schedule your checkout orientation flight to start the final onboarding stage.',
    progressTitle: 'Select checkout date',
  },
  checkout_requested: {
    subtitle: 'Checkout Submitted',
    body: 'Your request has been submitted and is now under operations review.',
    primaryCtaLabel: 'View booking',
    primaryCtaHref: '/dashboard/bookings',
    secondaryCtaLabel: 'Contact support',
    secondaryCtaHref: '/dashboard/messages',
    statusPill: 'Checkout Requested',
    statusTone: 'blue',
    actionTitle: 'Checkout request under review',
    actionBody: 'Our team is reviewing your requested time and documents. We will notify you with the outcome.',
    progressTitle: 'Awaiting operations review',
  },
  checkout_confirmed: {
    subtitle: 'Checkout Confirmed',
    body: 'Your checkout flight has been confirmed. Attend the flight to continue toward clearance.',
    primaryCtaLabel: 'View booking details',
    primaryCtaHref: '/dashboard/bookings',
    secondaryCtaLabel: 'Message ops',
    secondaryCtaHref: '/dashboard/messages',
    statusPill: 'Checkout Confirmed',
    statusTone: 'blue',
    actionTitle: 'Prepare for your checkout flight',
    actionBody: 'Review booking details and arrive ready with your required documentation.',
    progressTitle: 'Complete checkout flight',
  },
  checkout_completed_under_review: {
    subtitle: 'Outcome Pending',
    body: 'Your checkout flight is complete and currently under review by operations.',
    primaryCtaLabel: 'View booking',
    primaryCtaHref: '/dashboard/bookings',
    secondaryCtaLabel: 'Contact support',
    secondaryCtaHref: '/dashboard/messages',
    statusPill: 'Under Review',
    statusTone: 'amber',
    actionTitle: 'Awaiting checkout outcome',
    actionBody: 'Your flight has been assessed and is awaiting final outcome publication.',
    progressTitle: 'Outcome under review',
  },
  checkout_payment_required: {
    subtitle: 'Invoice Due',
    body: 'Your checkout invoice is ready. Payment is required before your status can proceed.',
    primaryCtaLabel: 'View invoice',
    primaryCtaHref: '/dashboard/bookings',
    secondaryCtaLabel: 'Contact support',
    secondaryCtaHref: '/dashboard/messages',
    statusPill: 'Payment Required',
    statusTone: 'amber',
    actionTitle: 'Complete your checkout payment',
    actionBody: 'Settle the invoice to continue your clearance progression.',
    progressTitle: 'Pay checkout invoice',
  },
  additional_checkout_required: {
    subtitle: 'Additional Checkout Required',
    body: 'An additional checkout session is required before solo hire can be approved.',
    primaryCtaLabel: 'Book another checkout',
    primaryCtaHref: '/dashboard/checkout',
    secondaryCtaLabel: 'Contact support',
    secondaryCtaHref: '/dashboard/messages',
    statusPill: 'Additional Checkout Required',
    statusTone: 'amber',
    actionTitle: 'Book your additional checkout',
    actionBody: 'Select another checkout time so operations can continue your pathway to clearance.',
    progressTitle: 'Book additional checkout',
  },
  checkout_reschedule_required: {
    subtitle: 'Reschedule Required',
    body: 'Your checkout requires a new booking slot before assessment can continue.',
    primaryCtaLabel: 'Reschedule checkout',
    primaryCtaHref: '/dashboard/checkout',
    secondaryCtaLabel: 'Contact support',
    secondaryCtaHref: '/dashboard/messages',
    statusPill: 'Reschedule Required',
    statusTone: 'amber',
    actionTitle: 'Reschedule your checkout',
    actionBody: 'Choose a new date and time to proceed with the onboarding runway.',
    progressTitle: 'Reschedule checkout',
  },
  not_currently_eligible: {
    subtitle: 'Training Required',
    body: 'Further training is required before solo hire can continue.',
    primaryCtaLabel: 'Contact support',
    primaryCtaHref: '/dashboard/messages',
    secondaryCtaLabel: 'View bookings',
    secondaryCtaHref: '/dashboard/bookings',
    statusPill: 'Not Currently Eligible',
    statusTone: 'red',
    actionTitle: 'Coordinate next training steps',
    actionBody: 'Speak with operations to understand required training before your next assessment.',
    progressTitle: 'Training required',
  },
  cleared_to_fly: {
    subtitle: 'You’re cleared to book aircraft with Oz Rent A Plane.',
    body: 'Your clearance is complete. You can now request aircraft bookings and manage upcoming flights.',
    primaryCtaLabel: 'Book aircraft',
    primaryCtaHref: '/dashboard/bookings/new',
    secondaryCtaLabel: 'View bookings',
    secondaryCtaHref: '/dashboard/bookings',
    statusPill: 'Cleared to Fly',
    statusTone: 'green',
    actionTitle: 'Book your next flight',
    actionBody: 'Browse available windows and submit a new aircraft booking request.',
    progressTitle: 'Cleared for booking',
  },
}

const CHECKLIST_BY_STATUS: Record<PilotClearanceStatus, ChecklistItem[]> = {
  checkout_required: [
    { label: 'Account setup complete', state: 'done' },
    { label: 'Select checkout date', state: 'active' },
    { label: 'Upload medical and licence', state: 'pending' },
    { label: 'Complete checkout flight', state: 'pending' },
  ],
  checkout_requested: [
    { label: 'Account setup complete', state: 'done' },
    { label: 'Checkout request submitted', state: 'done' },
    { label: 'Operations review', state: 'active' },
    { label: 'Clearance outcome', state: 'pending' },
  ],
  checkout_confirmed: [
    { label: 'Account setup complete', state: 'done' },
    { label: 'Checkout scheduled', state: 'done' },
    { label: 'Attend checkout flight', state: 'active' },
    { label: 'Clearance outcome', state: 'pending' },
  ],
  checkout_completed_under_review: [
    { label: 'Account setup complete', state: 'done' },
    { label: 'Checkout completed', state: 'done' },
    { label: 'Outcome review in progress', state: 'active' },
    { label: 'Clearance update', state: 'pending' },
  ],
  checkout_payment_required: [
    { label: 'Account setup complete', state: 'done' },
    { label: 'Checkout completed', state: 'done' },
    { label: 'Pay checkout invoice', state: 'active' },
    { label: 'Clearance update', state: 'pending' },
  ],
  additional_checkout_required: [
    { label: 'Account setup complete', state: 'done' },
    { label: 'First checkout completed', state: 'done' },
    { label: 'Book additional checkout', state: 'active' },
    { label: 'Clearance update', state: 'pending' },
  ],
  checkout_reschedule_required: [
    { label: 'Account setup complete', state: 'done' },
    { label: 'Checkout attempt logged', state: 'done' },
    { label: 'Select a new checkout slot', state: 'active' },
    { label: 'Continue assessment', state: 'pending' },
  ],
  not_currently_eligible: [
    { label: 'Account setup complete', state: 'done' },
    { label: 'Training required', state: 'active' },
    { label: 'Reassessment pathway', state: 'pending' },
  ],
  cleared_to_fly: [
    { label: 'Account setup complete', state: 'done' },
    { label: 'Checkout complete', state: 'done' },
    { label: 'Cleared to fly', state: 'done' },
  ],
}

const JOURNEY_LABELS = ['Account created', 'Date selected', 'Docs uploaded', 'Checkout', 'Ready to fly']

function journeyActiveIndex(status: PilotClearanceStatus, paymentPending: boolean): number {
  if (status === 'checkout_required') return 1
  if (status === 'checkout_requested' || status === 'checkout_confirmed') return 2
  if (status === 'checkout_completed_under_review' || status === 'checkout_payment_required' || paymentPending) return 3
  if (status === 'additional_checkout_required' || status === 'checkout_reschedule_required' || status === 'not_currently_eligible') return 3
  return 4
}

function toneClass(tone: StatusConfig['statusTone']): string {
  if (tone === 'amber') return 'text-amber-200 border-amber-400/55 bg-amber-500/10'
  if (tone === 'blue') return 'text-[#d7e2ff] border-[#7f93b2]/65 bg-[#435b80]/18'
  if (tone === 'violet') return 'text-violet-100 border-violet-300/55 bg-violet-500/12'
  if (tone === 'green') return 'text-emerald-100 border-emerald-300/55 bg-emerald-500/12'
  if (tone === 'red') return 'text-red-100 border-red-300/55 bg-red-500/12'
  return 'text-slate-100 border-slate-300/45 bg-slate-500/12'
}

function StepBullet({ state }: { state: ChecklistState }) {
  if (state === 'done') {
    return <span className="material-symbols-outlined text-[18px] text-blue-200">check_circle</span>
  }
  if (state === 'active') {
    return <span className="material-symbols-outlined text-[18px] text-amber-300">radio_button_checked</span>
  }
  return <span className="material-symbols-outlined text-[18px] text-slate-400">radio_button_unchecked</span>
}

export default function DashboardContent({ user, profile, documents, events, isFirstLogin, checkoutBookingId, checkoutInvoice }: Props) {
  const router = useRouter()

  const displayName = profile?.full_name ?? user.email?.split('@')[0] ?? 'Pilot'
  const firstNameFromProfile = (profile?.first_name ?? '').trim()
  const firstNameFromDisplay = displayName.split(' ')[0] ?? ''
  const firstName = firstNameFromProfile || firstNameFromDisplay || ''

  const clearanceStatus = (profile?.pilot_clearance_status ?? 'checkout_required') as PilotClearanceStatus
  const checkoutPaymentDisplayState = clearanceStatus === 'checkout_payment_required'
    ? getCheckoutPaymentDisplayState(
        checkoutInvoice ? { status: checkoutInvoice.invoiceStatus ?? 'payment_required' } : null,
        checkoutInvoice?.bankTransferStatus ? { status: checkoutInvoice.bankTransferStatus } : null,
      )
    : null

  const isAwaitingManualPayment = checkoutPaymentDisplayState === 'awaiting_manual_payment_confirmation'

  const statusConfig: StatusConfig = isAwaitingManualPayment
    ? {
        ...STATUS_CONFIG.checkout_payment_required,
        subtitle: 'Payment Submitted',
        body: 'Your bank transfer has been submitted and is awaiting team verification.',
        statusPill: 'Awaiting Payment Confirmation',
        statusTone: 'violet',
        actionTitle: 'Awaiting payment confirmation',
        actionBody: 'No further action is required until payment verification is complete.',
      }
    : STATUS_CONFIG[clearanceStatus]

  const mainCtaHref = clearanceStatus === 'checkout_payment_required' && checkoutBookingId
    ? `/dashboard/bookings/${checkoutBookingId}`
    : statusConfig.primaryCtaHref

  const checklist = CHECKLIST_BY_STATUS[clearanceStatus]
  const activeJourney = journeyActiveIndex(clearanceStatus, isAwaitingManualPayment)
  const docsUploaded = documents.length
  const unreadCount = events.filter((e) => !e.is_read).length
  const isCleared = clearanceStatus === 'cleared_to_fly'
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'P'

  return (
    <div>
      <section className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden bg-[#061422] -mt-5 md:-mt-8">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/customer-dash.png')" }}
        />
        <div className="absolute inset-0 bg-[rgba(3,13,25,0.58)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#060f1d]/50 via-[#061422]/42 to-[#061422]/72" />
        <div className="absolute bottom-0 inset-x-0 h-24 md:h-32 bg-gradient-to-t from-[#061422] to-transparent" />

        <div className="relative z-10 max-w-[1280px] mx-auto px-6 md:px-12 py-20 md:py-28 text-center min-h-[620px] md:min-h-[700px] flex flex-col items-center justify-center">
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-semibold tracking-[0.14em] uppercase ${toneClass(statusConfig.statusTone)}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.statusTone === 'amber' ? 'bg-amber-300' : statusConfig.statusTone === 'red' ? 'bg-red-300' : statusConfig.statusTone === 'green' ? 'bg-emerald-300' : 'bg-blue-200'}`} />
            {statusConfig.statusPill}
          </div>

          <h1 className="mt-6 font-serif text-[44px] md:text-[64px] leading-[1.08] text-[#dce7fb] tracking-[-0.02em] max-w-4xl">
            <span className="block">Welcome to the Cockpit</span>
            <span className="block">{firstName ? `Captain ${firstName}` : 'Captain'}</span>
          </h1>
          <p className="mt-6 text-[18px] text-[#c6d2e8] max-w-2xl mx-auto leading-relaxed">
            {statusConfig.body}
          </p>

          <div className="mt-14 w-full max-w-[980px] px-3 md:px-6">
            <div className="relative">
              <div className="absolute left-[8%] right-[8%] top-5 border-t border-dashed border-[#435b80]/45" />
              <div className="grid grid-cols-5 gap-3 md:gap-7">
                {JOURNEY_LABELS.map((label, i) => {
                  const done = i < activeJourney
                  const current = i === activeJourney
                  return (
                    <div key={label} className="relative flex flex-col items-center gap-2 min-w-0">
                      <div className={`flex items-center justify-center rounded-[10px] ${current ? 'w-11 h-11 border border-amber-300 bg-[#1f2224] shadow-[0_0_14px_rgba(251,191,36,0.22)]' : 'w-8 h-8 border border-[#435b80]/65 bg-[#071421]'} ${done ? 'text-[#d7e2ff]' : current ? 'text-amber-300' : 'text-[#90a0bc]'}`}>
                        <span className="material-symbols-outlined" style={{ fontSize: current ? '20px' : '16px', fontVariationSettings: current ? "'FILL' 1" : "'FILL' 0" }}>
                          {current ? 'flight' : done ? 'check' : 'radio_button_unchecked'}
                        </span>
                      </div>
                      <span className={`text-[10px] md:text-[11px] uppercase tracking-[0.12em] text-center leading-tight ${current ? 'text-amber-300' : done ? 'text-[#ccd8ef]' : 'text-[#97a8c3]'}`}>
                        {label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-0 space-y-7 md:space-y-8">
      <section className="rounded-md border border-[#435b80]/25 bg-[linear-gradient(135deg,rgba(15,26,44,0.92),rgba(9,18,33,0.95))] p-7 md:p-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-amber-300/55" />
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="max-w-2xl">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#97a8c3] mb-3">{statusConfig.subtitle}</p>
            <h2 className="text-3xl md:text-5xl font-serif text-[#dce7fb] mb-2">{statusConfig.actionTitle}</h2>
            <p className="text-[#b8c8e2] text-[16px] leading-relaxed">{statusConfig.actionBody}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(mainCtaHref)}
              className="px-6 py-3 rounded bg-[#ffb800] text-[#1a1e2a] text-[11px] uppercase tracking-[0.16em] font-bold hover:bg-[#ffc633] transition-colors"
            >
              {statusConfig.primaryCtaLabel}
            </button>
            <button
              onClick={() => router.push(statusConfig.secondaryCtaHref)}
              className="px-6 py-3 rounded border border-[#435b80] text-[#d6e4f7] text-[11px] uppercase tracking-[0.16em] font-bold hover:bg-[#0f2035] transition-colors"
            >
              {statusConfig.secondaryCtaLabel}
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <article className="lg:col-span-2 rounded-md border border-[#435b80]/25 bg-[linear-gradient(140deg,rgba(14,24,41,0.95),rgba(8,15,27,0.96))] p-6">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-12 h-12 rounded-full bg-[#0f2239] border border-[#536788] flex items-center justify-center text-blue-100 font-semibold flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <h3 className="font-serif text-[32px] leading-none text-[#dce7fb]">{displayName}</h3>
              {profile?.pilot_arn && <p className="text-[11px] text-[#97a8c3] mt-1">ID: {profile.pilot_arn}</p>}
            </div>
          </div>
          <div className="pt-4 border-t border-[#425774]/28 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.14em] text-[#97a8c3]">Status</span>
            <span className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${statusConfig.statusTone === 'green' ? 'text-emerald-300' : statusConfig.statusTone === 'red' ? 'text-red-300' : statusConfig.statusTone === 'amber' ? 'text-amber-300' : 'text-blue-200'}`}>
              {statusConfig.statusPill}
            </span>
          </div>
          <div className="mt-6">
            <h4 className="font-serif text-3xl text-[#dce7fb] mb-4">Onboarding</h4>
            <ul className="space-y-3">
              {checklist.map((item) => (
                <li key={item.label} className="flex items-center gap-3 text-[14px] text-[#d6e4f7]">
                  <StepBullet state={item.state} />
                  <span className={item.state === 'active' ? 'text-amber-300' : item.state === 'done' ? 'text-[#d7e2ff]' : 'text-[#b0bfd8]'}>{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </article>

        <div className="space-y-6">
          <article className="rounded-md border border-[#435b80]/25 bg-[linear-gradient(140deg,rgba(14,24,41,0.95),rgba(8,15,27,0.96))] p-6 min-h-[220px] flex flex-col justify-center items-center text-center">
            <span className="material-symbols-outlined text-4xl text-[#8ca0bf] mb-4">folder_open</span>
            {docsUploaded === 0 ? (
              <>
                <p className="text-[#b8c8e2] text-sm mb-4">No documents uploaded yet.</p>
                <button
                  onClick={() => router.push('/dashboard/documents')}
                  className="px-4 py-2 rounded border border-[#435b80] text-[11px] uppercase tracking-[0.14em] text-[#d7e2ff] hover:bg-[#10243d] transition-colors"
                >
                  Upload documents
                </button>
              </>
            ) : (
              <>
                <p className="text-[#d7e2ff] text-sm mb-1">{docsUploaded} document{docsUploaded === 1 ? '' : 's'} uploaded</p>
                <button
                  onClick={() => router.push('/dashboard/documents')}
                  className="px-4 py-2 mt-3 rounded border border-[#435b80] text-[11px] uppercase tracking-[0.14em] text-[#d7e2ff] hover:bg-[#10243d] transition-colors"
                >
                  Manage documents
                </button>
              </>
            )}
          </article>

          <article className="rounded-md border border-[#435b80]/25 bg-[linear-gradient(140deg,rgba(14,24,41,0.95),rgba(8,15,27,0.96))] p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-serif text-2xl text-[#dce7fb]">Need help?</h3>
                <p className="text-[12px] text-[#b8c8e2] mt-1">Ops team available 24/7</p>
              </div>
              <button
                onClick={() => router.push('/dashboard/messages')}
                className="text-amber-300 text-[11px] uppercase tracking-[0.14em] font-semibold hover:text-amber-200 transition-colors"
              >
                Contact support
              </button>
            </div>
            {unreadCount > 0 && (
              <p className="mt-3 text-[11px] text-blue-200">{unreadCount} unread update{unreadCount === 1 ? '' : 's'} in messages.</p>
            )}
          </article>
        </div>
      </section>

      <section className="rounded-md border border-[#435b80]/25 bg-[linear-gradient(140deg,rgba(14,24,41,0.95),rgba(8,15,27,0.96))] p-6 md:p-7">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h3 className="font-serif text-3xl text-[#dce7fb]">Recent updates</h3>
          <button
            onClick={() => router.push('/dashboard/messages')}
            className="text-[11px] uppercase tracking-[0.14em] text-[#b8c8e2] hover:text-[#d7e2ff] transition-colors"
          >
            View all
          </button>
        </div>
        {events.length === 0 ? (
          <p className="text-[#97a8c3] text-sm">No updates yet.</p>
        ) : (
          <div className="space-y-2">
            {events.slice(0, 4).map((ev) => (
              <div key={ev.id} className="rounded border border-[#425774]/28 bg-[#0b1728]/78 px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-[#d7e2ff] truncate">{ev.title}</p>
                  <p className="text-[12px] text-[#97a8c3] truncate">{ev.body}</p>
                </div>
                <span className="text-[11px] text-[#7f93b2] whitespace-nowrap">{fmtTimestamp(ev.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {isCleared && (
        <section className="rounded-md border border-emerald-400/25 bg-emerald-500/10 p-5">
          <p className="text-sm text-emerald-100">You are cleared to fly. Checkout onboarding is complete and aircraft booking is now your primary action.</p>
        </section>
      )}

      {isFirstLogin && (
        <section className="rounded-md border border-blue-400/25 bg-blue-500/10 p-5">
          <p className="text-sm text-blue-100">Welcome aboard. Your cockpit dashboard is ready.</p>
        </section>
      )}
      </div>
    </div>
  )
}
