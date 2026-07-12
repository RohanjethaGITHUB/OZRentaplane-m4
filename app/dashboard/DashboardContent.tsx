'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import type { BlockTimePackage, Profile, UserDocument, VerificationEvent } from '@/lib/supabase/types'
import type { BookingReadinessDecision } from '@/lib/booking-readiness'
import { evaluateBookingDocumentsReadiness } from '@/lib/booking-readiness'
import { getDocumentProgressSnapshot } from '@/lib/document-progress'
import {
  getJourneyStepIndex,
  type DashboardActionState,
  type DashboardFlightSnapshot,
  type DashboardJourneyStep,
  type DashboardTone,
} from '@/lib/dashboard/dashboard-action-state'
import { formatDashboardDate, formatDashboardTimestamp, formatDateFromISO, formatDateFromISOShort } from '@/lib/formatDateTime'
import { formatSydTime } from '@/lib/utils/sydney-time'
import DashboardNextActionPanel from '@/components/customer/dashboard/DashboardNextActionPanel'
import SuccessModal from '@/components/ui/SuccessModal'

// ── Exported types ────────────────────────────────────────────────────────────

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
  bankTransferNote?: string | null
  landingCharges: {
    airportIcao: string
    airportName: string
    landingCount: number
    unitAmountCents: number
    totalAmountCents: number
  }[]
}

export type BlockTimeSummary = {
  totalActiveHoursRemaining: number
  activePurchaseCount: number
  pendingPurchaseCount: number
  earliestExpiry: string | null
  latestPurchase: {
    packageName: string
    hoursPurchased: number
    purchasedAt: string
    status: 'pending' | 'active' | 'exhausted' | 'expired' | 'refunded'
  } | null
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  user: User
  profile: Profile | null
  documents: UserDocument[]
  events: VerificationEvent[]
  isFirstLogin: boolean
  mustChangePassword?: boolean
  passwordUpdated?: boolean
  checkoutBookingId?: string | null
  checkoutInvoice?: CheckoutInvoiceData | null
  activeBooking?: { id: string; status: string } | null
  dashboardActionState: DashboardActionState
  flightSnapshotBooking?: DashboardFlightSnapshot | null
  bookingReadiness?: BookingReadinessDecision | null
  blockTimeSummary?: BlockTimeSummary | null
  allBlockTimePackages?: BlockTimePackage[]
  flashNotice?: { kind: 'success'; title: string; message: string; actionLabel?: string; actionUrl?: string } | null
  newlyPurchasedInvoicePdfUrl?: string | null
}

function heroPillStyle(tone: DashboardTone): React.CSSProperties {
  if (tone === 'danger') return { background: 'rgba(239,68,68,0.15)', borderColor: 'rgba(248,113,113,0.40)', color: '#fecaca' }
  if (tone === 'warning') return { background: 'rgba(245,158,11,0.15)', borderColor: 'rgba(245,158,11,0.35)', color: '#fcd34d' }
  if (tone === 'success') return { background: 'rgba(52,211,153,0.16)', borderColor: 'rgba(52,211,153,0.40)', color: '#bbf7d0' }
  if (tone === 'info') return { background: 'rgba(59,130,246,0.16)', borderColor: 'rgba(96,165,250,0.38)', color: '#bfdbfe' }
  return { background: 'rgba(148,163,184,0.16)', borderColor: 'rgba(148,163,184,0.38)', color: '#e2e8f0' }
}

function heroButtonStyle(tone: DashboardTone): string {
  if (tone === 'danger') return 'bg-red-600 hover:bg-red-700 text-white'
  if (tone === 'warning') return 'bg-[#f59e0b] hover:bg-[#e08c00] text-white'
  if (tone === 'success') return 'bg-emerald-600 hover:bg-emerald-700 text-white'
  if (tone === 'info') return 'bg-[#1a4fd6] hover:bg-[#1847be] text-white'
  return 'bg-white/15 hover:bg-white/25 text-white'
}

function heroIcon(tone: DashboardTone): string {
  if (tone === 'danger') return 'warning'
  if (tone === 'success') return 'check_circle'
  if (tone === 'info') return 'info'
  return 'flight_takeoff'
}

function getSnapshotStatusDisplay(
  snapshot: DashboardFlightSnapshot,
  actionState: DashboardActionState,
): { label: string; textColor: string; dotColor: string } {
  if (actionState.statusKey === 'post_flight_records_due') {
    return { label: 'Post-Flight Records Due', textColor: 'text-amber-300', dotColor: '#fbbf24' }
  }
  if (actionState.statusKey === 'post_flight_under_review') {
    return { label: 'Under Review', textColor: 'text-blue-300', dotColor: '#60a5fa' }
  }
  if (actionState.statusKey === 'post_flight_clarification_required') {
    return { label: 'Clarification Needed', textColor: 'text-orange-300', dotColor: '#fdba74' }
  }
  if (actionState.statusKey === 'booking_payment_required') {
    return { label: 'Payment Required', textColor: 'text-orange-300', dotColor: '#fb923c' }
  }
  if (actionState.statusKey === 'booking_payment_proof_under_review') {
    return { label: 'Payment Proof Under Review', textColor: 'text-blue-300', dotColor: '#60a5fa' }
  }
  if (actionState.statusKey === 'checkout_payment_required') {
    return { label: 'Payment Required', textColor: 'text-orange-300', dotColor: '#fb923c' }
  }
  if (actionState.statusKey === 'checkout_payment_proof_under_review') {
    return { label: 'Payment Proof Under Review', textColor: 'text-blue-300', dotColor: '#60a5fa' }
  }
  if (actionState.statusKey === 'upcoming_booking_confirmed') {
    return { label: 'Confirmed', textColor: 'text-emerald-300', dotColor: '#34d399' }
  }
  if (snapshot.bookingType === 'checkout') {
    if (snapshot.status === 'checkout_requested') return { label: 'Awaiting Review', textColor: 'text-blue-300', dotColor: '#60a5fa' }
    if (snapshot.status === 'checkout_confirmed') return { label: 'Confirmed', textColor: 'text-emerald-300', dotColor: '#34d399' }
    if (snapshot.status === 'checkout_completed_under_review') return { label: 'Awaiting Outcome', textColor: 'text-amber-300', dotColor: '#fbbf24' }
    if (snapshot.status === 'checkout_payment_required') return { label: 'Payment Required', textColor: 'text-orange-300', dotColor: '#fb923c' }
    return { label: 'Checkout Flight', textColor: 'text-blue-300', dotColor: '#60a5fa' }
  }
  if (['confirmed', 'ready_for_dispatch', 'dispatched'].includes(snapshot.status)) return { label: 'Confirmed', textColor: 'text-emerald-300', dotColor: '#34d399' }
  if (['awaiting_flight_record', 'flight_record_overdue'].includes(snapshot.status)) return { label: 'Awaiting Record', textColor: 'text-amber-300', dotColor: '#fbbf24' }
  if (['pending_post_flight_review', 'needs_clarification'].includes(snapshot.status)) return { label: 'Under Review', textColor: 'text-blue-300', dotColor: '#60a5fa' }
  if (snapshot.status === 'post_flight_approved') return { label: 'Flight Approved', textColor: 'text-emerald-300', dotColor: '#34d399' }
  return { label: snapshot.status.replace(/_/g, ' '), textColor: 'text-slate-300', dotColor: '#94a3b8' }
}

function getStepState(stepId: DashboardJourneyStep, currentStep: DashboardJourneyStep): 'completed' | 'current' | 'upcoming' | 'locked' {
  const currentIndex = getJourneyStepIndex(currentStep)
  const stepIndex = getJourneyStepIndex(stepId)

  if (stepIndex < currentIndex) return 'completed'
  if (stepIndex === currentIndex) return 'current'
  if (stepId === 'ready') return 'locked'
  return 'upcoming'
}

function PilotJourneyStrip({ currentStep }: { currentStep: DashboardJourneyStep }) {
  const steps = [
    {
      id: 'account',
      label: 'Account Created',
      sublabel: getStepState('account', currentStep) === 'completed' ? 'Completed' : 'Upcoming',
      icon: 'person',
      state: getStepState('account', currentStep),
    },
    {
      id: 'documents',
      label: 'Documents',
      sublabel:
        getStepState('documents', currentStep) === 'current'
          ? 'In Progress'
          : getStepState('documents', currentStep) === 'completed'
            ? 'Completed'
            : 'Upcoming',
      icon: 'description',
      state: getStepState('documents', currentStep),
    },
    {
      id: 'checkout',
      label: 'Checkout',
      sublabel:
        getStepState('checkout', currentStep) === 'current'
          ? 'Required'
          : getStepState('checkout', currentStep) === 'completed'
            ? 'Completed'
            : 'Upcoming',
      icon: 'flight_takeoff',
      state: getStepState('checkout', currentStep),
    },
    {
      id: 'approved',
      label: 'Approved',
      sublabel:
        getStepState('approved', currentStep) === 'current'
          ? 'Pending'
          : getStepState('approved', currentStep) === 'completed'
            ? 'Completed'
            : 'Upcoming',
      icon: 'verified',
      state: getStepState('approved', currentStep),
    },
    {
      id: 'ready',
      label: 'Ready to Fly',
      sublabel: getStepState('ready', currentStep) === 'completed' ? 'Unlocked' : 'Locked',
      icon: 'local_airport',
      state: getStepState('ready', currentStep),
    },
  ] as const

  return (
    <section className="relative bg-[#eef4ff] border border-[#dbeafe] rounded-2xl p-6 md:p-8" style={{ boxShadow: '0 4px 40px rgba(2,10,22,0.08)' }}>
      <div className="flex flex-col md:flex-row md:items-center gap-5 md:gap-8">
        <div className="flex flex-col gap-1 md:min-w-[160px]">
          <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#1a4fd6]">
            PILOT JOURNEY
          </div>
          <div className="text-[22px] font-semibold leading-snug text-[#152d5a]" style={{ fontFamily: 'Newsreader, Georgia, serif' }}>
            Your path to<br />flying solo
          </div>
        </div>

        <div className="flex items-start flex-1 overflow-x-auto scrollbar-none">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-start flex-1 min-w-0">
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div
                  className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    step.state === 'completed'
                      ? 'bg-[#1a4fd6] text-white'
                      : step.state === 'current'
                        ? 'bg-white border-2 border-[#f59e0b] text-[#f59e0b]'
                        : step.state === 'upcoming'
                          ? 'bg-[#f0f6ff] border border-[#152d5a]/15 text-[#94a3b8]'
                          : 'bg-[#f0f6ff] border border-[#152d5a]/10 text-[#c4c6ce]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px] md:text-[16px]">{step.icon}</span>
                </div>
                <div className="text-center">
                  <div
                    className={`hidden md:block text-[11px] font-semibold leading-tight ${
                      step.state === 'completed' || step.state === 'current' ? 'text-[#152d5a]' : 'text-[#94a3b8]'
                    }`}
                  >
                    {step.label}
                  </div>
                  <div
                    className={`hidden text-[10px] leading-tight mt-0.5 ${
                      step.state === 'current' ? 'text-[#f59e0b] font-medium' : 'text-[#94a3b8]'
                    }`}
                  >
                    {step.sublabel}
                  </div>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className={`h-[2px] w-4 md:w-8 flex-shrink-0 mt-4 mx-1 rounded-full ${step.state === 'completed' ? 'bg-[#1a4fd6]' : 'bg-[#e2e8f0]'}`} />
              )}
            </div>
          ))}
          {/* Control tower — end of runway */}
          <div className="hidden md:block flex-shrink-0 flex items-center pl-0 ml-1">
            <img
              src="/CustomerDashboard/CustomerDashboard-tower.png"
              alt=""
              aria-hidden="true"
              className="w-auto object-contain"
              style={{
                height: '80px',
                filter: 'invert(45%) sepia(60%) saturate(300%) hue-rotate(190deg) brightness(1.1) opacity(0.45)',
              }}
            />
          </div>
        </div>
        {/* Mobile scroll hint — fade right edge */}
        <div className="md:hidden absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#eef4ff] to-transparent pointer-events-none" />
      </div>
    </section>
  )
}

// ── Recent activity strip ────────────────────────────────────────────────────

function formatActivityTimestamp(iso: string): string {
  return formatDashboardTimestamp(iso)
}

function getActivityChip(event: VerificationEvent): { label: string; tone: string; icon: string } {
  if (event.event_type === 'message') return { label: 'Message', tone: 'text-blue-700 bg-blue-50 border-blue-200', icon: 'chat_bubble' }
  if (event.event_type === 'on_hold') return { label: 'Action needed', tone: 'text-amber-700 bg-amber-50 border-amber-200', icon: 'schedule' }
  if (event.event_type === 'approved') return { label: 'Approved', tone: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: 'check_circle' }
  if (event.event_type === 'rejected') return { label: 'Rejected', tone: 'text-rose-700 bg-rose-50 border-rose-200', icon: 'cancel' }
  if (event.event_type === 'resubmitted') return { label: 'Resubmitted', tone: 'text-violet-700 bg-violet-50 border-violet-200', icon: 'refresh' }
  return { label: 'Update', tone: 'text-slate-700 bg-slate-50 border-slate-200', icon: 'notifications' }
}

function RecentActivityStrip({ events }: { events: VerificationEvent[] }) {
  const visibleEvents = events.slice(0, 4)

  return (
    <section className="rounded-2xl border border-[#152d5a]/10 bg-white p-5 md:p-6" style={{ boxShadow: '0 4px 40px rgba(2,10,22,0.08)' }}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-[#4b6390]">Recent Activity</p>
          <p className="mt-1 text-sm text-[#4b6390]">Latest updates from your pilot file and booking history.</p>
        </div>
      </div>

      {visibleEvents.length > 0 ? (
        <div className="mt-4 overflow-x-auto pb-1">
          <div className="flex min-w-max gap-3">
            {visibleEvents.map((event) => {
              const chip = getActivityChip(event)
              return (
                <article key={event.id} className="min-w-[260px] rounded-2xl border border-[#152d5a]/10 bg-[#f8fbff] p-4 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${chip.tone}`}>
                      <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                        {chip.icon}
                      </span>
                      {chip.label}
                    </div>
                    <span className="text-[11px] text-[#64748b]">{formatActivityTimestamp(event.created_at)}</span>
                  </div>
                  <h3 className="mt-3 text-[15px] font-semibold text-[#152d5a]">{event.title}</h3>
                  {event.body ? <p className="mt-1.5 text-sm leading-relaxed text-[#4b6390]">{event.body}</p> : null}
                </article>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-[#152d5a]/15 bg-[#f8fafc] p-5 text-sm text-[#4b6390]">
          No recent activity yet. Updates will appear here as your pilot file changes.
        </div>
      )}
    </section>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SnapshotRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[#152d5a]/10 last:border-0">
      <span
        className="material-symbols-outlined text-[15px] flex-shrink-0 mt-0.5"
        style={{ color: 'rgba(75,99,144,0.75)', fontVariationSettings: "'wght' 300" }}
      >
        {icon}
      </span>
      <span className="text-[11px] uppercase tracking-[0.08em] text-[#64748b] w-24 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-[13px] text-[#152d5a] font-medium leading-snug">{children}</span>
    </div>
  )
}

function readinessTone(state: 'complete' | 'missing' | 'needs_review' | 'expired') {
  if (state === 'complete') {
    return { icon: 'check_circle', iconClassName: 'text-emerald-500', labelClassName: 'text-emerald-700' }
  }
  if (state === 'expired') {
    return { icon: 'warning', iconClassName: 'text-amber-500', labelClassName: 'text-amber-700' }
  }
  if (state === 'needs_review') {
    return { icon: 'pending', iconClassName: 'text-blue-500', labelClassName: 'text-blue-700' }
  }
  return { icon: 'radio_button_unchecked', iconClassName: 'text-slate-300', labelClassName: 'text-slate-500' }
}

function progressStatusTone(status: 'not_started' | 'in_progress' | 'complete') {
  if (status === 'complete') {
    return { icon: 'check_circle', iconClassName: 'text-emerald-500', label: 'Complete', labelClassName: 'text-emerald-700' }
  }
  if (status === 'in_progress') {
    return { icon: 'pending', iconClassName: 'text-blue-500', label: 'In Progress', labelClassName: 'text-blue-700' }
  }
  return { icon: 'radio_button_unchecked', iconClassName: 'text-slate-300', label: 'Not Started', labelClassName: 'text-slate-500' }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DashboardContent({
  user,
  profile,
  documents,
  events,
  isFirstLogin: _isFirstLogin,
  mustChangePassword = false,
  passwordUpdated = false,
  checkoutBookingId,
  checkoutInvoice: _checkoutInvoice,
  activeBooking: _activeBooking,
  dashboardActionState,
  flightSnapshotBooking,
  bookingReadiness,
  blockTimeSummary,
  allBlockTimePackages = [],
  flashNotice,
  newlyPurchasedInvoicePdfUrl,
}: Props) {
  const router = useRouter()
  const [successModalOpen, setSuccessModalOpen] = useState(Boolean(flashNotice) || passwordUpdated)
  const [showPackageModal, setShowPackageModal] = useState(false)
  const [purchasing, setPurchasing] = useState(false)
  const toastNotice =
    flashNotice ??
    (passwordUpdated
      ? {
          kind: 'success' as const,
          title: 'Password updated successfully',
          message: 'Welcome to OZ Rent A Plane.',
          actionLabel: undefined,
          actionUrl: undefined,
        }
      : null)
  const toastEyebrow = flashNotice
    ? 'Block time purchase'
    : passwordUpdated
    ? 'Security'
    : undefined

  useEffect(() => {
    if (!toastNotice) return
    setSuccessModalOpen(true)

    const url = new URL(window.location.href)
    if (url.searchParams.has('block_time_purchase')) {
      url.searchParams.delete('block_time_purchase')
      const nextUrl = `${url.pathname}${url.search}${url.hash}`
      window.history.replaceState({}, '', nextUrl === '/dashboard' ? '/dashboard' : nextUrl)
    }
  }, [toastNotice])

  // Automatically open the invoice PDF in a new tab upon successful purchase
  useEffect(() => {
    if (newlyPurchasedInvoicePdfUrl) {
      try {
        window.open(newlyPurchasedInvoicePdfUrl, '_blank')
      } catch (err) {
        console.error("Popup blocker prevented automatic PDF launch:", err)
      }
    }
  }, [newlyPurchasedInvoicePdfUrl])

  const displayName = profile?.full_name ?? user.email?.split('@')[0] ?? 'Pilot'
  const firstNameFromProfile = (profile?.first_name ?? '').trim()
  const firstName = firstNameFromProfile || displayName.split(' ')[0] || ''

  const actionState = dashboardActionState
  const heroAction = actionState.primaryAction ?? actionState.secondaryAction ?? null
  const snapshotStatus = flightSnapshotBooking ? getSnapshotStatusDisplay(flightSnapshotBooking, actionState) : null
  const latestDocsByType = documents.reduce((map, doc) => {
    const existing = map.get(doc.document_type)
    if (!existing || new Date(doc.updated_at).getTime() > new Date(existing.updated_at).getTime()) {
      map.set(doc.document_type, doc)
    }
    return map
  }, new Map<string, UserDocument>())
  const pilotLicenceDocument = latestDocsByType.get('pilot_licence') ?? null
  const documentReadinessItems = evaluateBookingDocumentsReadiness({
    documents,
    hasNightVfrRating: profile?.has_night_vfr_rating ?? null,
  })
  const documentProgress = getDocumentProgressSnapshot({
    documentReadinessItems,
    pilotLicenceDocument,
    lastFlightDate: profile?.last_flight_date ?? null,
    hasNightVfrRating: profile?.has_night_vfr_rating ?? null,
    termsAccepted: bookingReadiness?.currentTermsAccepted ?? false,
  })

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {toastNotice ? (
        <SuccessModal
          open={successModalOpen}
          eyebrow={toastEyebrow}
          title={toastNotice.title}
          message={toastNotice.message}
          actionLabel={toastNotice.actionLabel}
          actionUrl={toastNotice.actionUrl}
          onClose={() => setSuccessModalOpen(false)}
        />
      ) : null}

      {mustChangePassword && !passwordUpdated ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>Your account is using a temporary password. Please update it when you get a chance.</p>
            <Link href="/change-password" className="font-semibold text-amber-900 hover:text-amber-950">
              Update now →
            </Link>
          </div>
        </section>
      ) : null}

      {/* ─── SECTION 1: HERO CARD ────────────────────────────────────────────── */}
      <section
        data-hero="dashboard"
        className="relative overflow-hidden -mt-6"
        style={{
          minHeight: '380px',
          marginLeft: 'calc(-50vw + 50%)',
          marginRight: 'calc(-50vw + 50%)',
          width: '100vw',
          backgroundImage: 'url(/CustomerDashboard/CustomerDashboard-hero.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center right',
          boxShadow: '0 8px 64px rgba(2,10,22,0.18)',
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(90deg, rgba(8,20,50,0.82) 0%, rgba(8,20,50,0.65) 45%, rgba(8,20,50,0.15) 100%)',
          }}
        />

        <div className="relative z-10 max-w-[1440px] mx-auto px-3 md:px-4 lg:px-6 py-12 md:py-16">
          <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-[#f59e0b] mb-3 font-sans">
            DASHBOARD
          </div>
          <h1
            className="text-5xl md:text-6xl font-bold text-white leading-tight mb-4"
            style={{ fontFamily: 'Newsreader, Georgia, serif' }}
          >
            Welcome back,<br />
            Captain {firstName}
          </h1>
          <div className="mb-3">
            <div
              className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full border text-[13px] font-semibold"
              style={heroPillStyle(actionState.tone)}
            >
              <span className="material-symbols-outlined text-[14px]">{heroIcon(actionState.tone)}</span>
              {actionState.heroLabel}
            </div>
          </div>
          <p className="text-[15px] text-white/80 leading-relaxed mb-6 max-w-xl">
            {actionState.heroMessage}
          </p>
          {heroAction ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => router.push(heroAction.href)}
                className={`inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl px-6 py-3 font-semibold transition-colors sm:w-auto ${heroButtonStyle(actionState.tone)}`}
              >
                <span
                  className="material-symbols-outlined text-[15px] leading-none"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {heroIcon(actionState.tone)}
                </span>
                {heroAction.label}
              </button>
            </div>
          ) : null}
        </div>
        <div
          className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, transparent, rgba(13,27,62,0.3))' }}
        />
      </section>

      <DashboardNextActionPanel state={actionState} flightSnapshotBooking={flightSnapshotBooking ?? null} />

      {/* ─── SECTION 2: PILOT JOURNEY CARD ───────────────────────────────────── */}
      <PilotJourneyStrip currentStep={actionState.journeyStep} />

      {/* ─── SECTION 2.5: BLOCK TIME BALANCE BANNER ──────────────────────────── */}
      {blockTimeSummary && (
        <section
          className="bg-white border border-[#152d5a]/10 rounded-2xl p-6 md:p-8 transition-all hover:shadow-[0_8px_30px_rgba(2,10,22,0.06)]"
          style={{ boxShadow: '0 4px 40px rgba(2,10,22,0.08)' }}
        >
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#1a4fd6] font-sans">
                BLOCK TIME BALANCE
              </p>
              <h2
                className="text-[32px] md:text-[38px] font-normal leading-tight text-[#152d5a] mt-2"
                style={{ fontFamily: 'Newsreader, Georgia, serif' }}
              >
                {blockTimeSummary.totalActiveHoursRemaining.toFixed(0)} hours remaining
              </h2>
              <p className="text-[14px] text-[#4b6390] mt-1.5 font-sans">
                You have {blockTimeSummary.totalActiveHoursRemaining.toFixed(1)} hours available across{' '}
                <span className="font-semibold text-[#152d5a]">
                  {blockTimeSummary.activePurchaseCount} active{' '}
                  {blockTimeSummary.activePurchaseCount === 1 ? 'package' : 'packages'}
                </span>
                .
              </p>
            </div>

            {/* Badges and Buy More CTA */}
            <div className="flex flex-wrap items-center gap-2 md:mt-2 font-sans">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {blockTimeSummary.activePurchaseCount} active
              </span>

              {blockTimeSummary.earliestExpiry && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold text-[#4b6390] bg-[#f8fafc] border border-[#152d5a]/10 shadow-sm">
                  <span className="material-symbols-outlined text-[13px]">event</span>
                  Earliest expiry {formatDateFromISO(blockTimeSummary.earliestExpiry)}
                </span>
              )}

              <button
                type="button"
                onClick={() => setShowPackageModal(true)}
                className="inline-flex items-center gap-1 text-[12px] font-bold text-[#1a4fd6] hover:text-[#153eb2] px-3.5 py-1.5 bg-[#f0f6ff] hover:bg-[#e0eeff] rounded-full border border-[#1a4fd6]/10 transition-colors ml-1"
              >
                {blockTimeSummary.activePurchaseCount > 0 ? 'Buy More Hours' : 'Get Started with Block Time'}
                <span className="material-symbols-outlined text-[14px]">add</span>
              </button>

              <Link
                href="/dashboard/purchases"
                className="inline-flex items-center gap-1 text-[12px] font-bold text-[#4b6390] hover:text-[#152d5a] px-3.5 py-1.5 bg-white/70 hover:bg-white rounded-full border border-[#152d5a]/10 transition-colors"
              >
                View purchase history
                <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              </Link>
            </div>
          </div>

          {/* Inner Card: Latest Purchase details */}
          {blockTimeSummary.latestPurchase && (
            <div className="mt-6 border border-[#e2e8f0]/80 rounded-xl p-4 bg-[#f8fbff]/70 hover:bg-[#f8fbff] transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="font-sans">
                <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#1a4fd6]">
                  LATEST PURCHASE
                </p>
                <h3 className="text-[17px] font-semibold text-[#152d5a] mt-1">
                  {blockTimeSummary.latestPurchase.packageName}
                </h3>
                <p className="text-[12px] text-[#4b6390] mt-0.5">
                  {blockTimeSummary.latestPurchase.hoursPurchased} hours bought on{' '}
                  {formatDateFromISO(blockTimeSummary.latestPurchase.purchasedAt)}.
                </p>
              </div>

              {/* Status Box */}
              <div className="border border-[#e2e8f0] rounded-xl p-3 bg-white text-center min-w-[120px] shadow-sm flex flex-col items-center justify-center font-sans">
                <p className="text-[9px] font-semibold tracking-[0.14em] uppercase text-[#64748b]">
                  STATUS
                </p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      blockTimeSummary.latestPurchase.status === 'active'
                        ? 'bg-emerald-500'
                        : blockTimeSummary.latestPurchase.status === 'pending'
                        ? 'bg-amber-400'
                        : 'bg-slate-400'
                    }`}
                  />
                  <span className="text-[13px] font-bold text-[#152d5a] capitalize">
                    {blockTimeSummary.latestPurchase.status}
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {showPackageModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
          onClick={() => setShowPackageModal(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-[#152d5a]/10 bg-white p-6 shadow-[0_24px_90px_rgba(2,10,22,0.32)] md:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#1a4fd6] font-sans">
                  BLOCK TIME
                </p>
                <h2
                  className="mt-2 text-[30px] font-normal leading-tight text-[#152d5a]"
                  style={{ fontFamily: 'Newsreader, Georgia, serif' }}
                >
                  Block Time Packages
                </h2>
                <p className="mt-2 text-[14px] text-[#4b6390] font-sans">
                  Lock in your hourly rate and save on every flight.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPackageModal(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#152d5a]/10 bg-[#f8fafc] text-[#4b6390] transition-colors hover:bg-[#eef4fb] hover:text-[#152d5a]"
                aria-label="Close block time packages"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="mt-6">
              {allBlockTimePackages.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {allBlockTimePackages.map((pkg) => {
                    const savings = 330 - Number(pkg.rate_per_hour)
                    const packageSlug = pkg.name.toLowerCase().replace(/\s+/g, '-')
                    return (
                      <div
                        key={pkg.id}
                        className="flex h-full flex-col rounded-2xl border border-[#152d5a]/10 bg-[#f8fbff] p-5 shadow-[0_4px_24px_rgba(2,10,22,0.05)]"
                      >
                        <div>
                          <h3
                            className="text-[22px] font-normal text-[#152d5a]"
                            style={{ fontFamily: 'Newsreader, Georgia, serif' }}
                          >
                            {pkg.name}
                          </h3>
                          <p className="mt-2 text-[13px] text-[#4b6390] font-sans">
                            {pkg.hours} hours
                          </p>
                          <p className="mt-1 text-[13px] text-[#4b6390] font-sans">
                            {pkg.rate_per_hour.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })}/hr
                          </p>
                          <p className="mt-1 text-[13px] text-[#4b6390] font-sans">
                            {pkg.total_price.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })}
                          </p>
                          <p className="mt-1 text-[13px] text-[#4b6390] font-sans">
                            Valid for {pkg.validity_days} days
                          </p>
                          <p className="mt-2 text-[13px] font-medium text-[#1a4fd6] font-sans">
                            {savings > 0
                              ? `(Save ${savings.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })}/hr vs Pay As You Fly)`
                              : '(No savings vs Pay As You Fly)'}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={purchasing}
                          onClick={() => {
                            setPurchasing(true)
                            setShowPackageModal(false)
                            window.location.href =
                              '/dashboard?block_time_package=' + encodeURIComponent(packageSlug)
                          }}
                          className="mt-5 inline-flex items-center justify-center rounded-xl bg-[#f59e0b] px-4 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#e08c00] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          Select
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#152d5a]/15 bg-[#f8fbff] px-5 py-8 text-center">
                  <p className="text-[14px] font-medium text-[#152d5a] font-sans">
                    No block time packages are available right now.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-4 border-t border-[#152d5a]/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[12px] text-[#4b6390] font-sans">
                All packages include GST and fuel. Landing fees charged separately.
              </p>
              <button
                type="button"
                onClick={() => setShowPackageModal(false)}
                className="inline-flex items-center justify-center rounded-xl border border-[#152d5a]/10 bg-white px-4 py-2.5 text-[13px] font-semibold text-[#152d5a] transition-colors hover:bg-[#f8fafc]"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ─── SECTION 3: UPCOMING BOOKING + DOCUMENT READINESS ───────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div
          className="relative rounded-2xl overflow-hidden bg-white border border-[#152d5a]/10"
          style={{
            boxShadow: '0 4px 40px rgba(2,10,22,0.08)',
            minHeight: '320px',
          }}
        >
          <div className="absolute top-0 inset-x-0 z-20 h-[3px]" style={{ background: 'linear-gradient(90deg, rgba(96,165,250,0.55) 0%, rgba(96,165,250,0.04) 100%)' }} />

          <div className="relative z-20 p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-[16px] text-[#1a4fd6]">calendar_month</span>
              <span className="text-[16px] font-semibold text-[#4b6390]">Upcoming Booking</span>
            </div>

            {flightSnapshotBooking ? (
              <div className="relative flex flex-col gap-3 flex-1">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                  <img
                    src="/CustomerDashboard/CustomerDashboard-plane.png"
                    alt=""
                    aria-hidden="true"
                    style={{ width: '320px', height: 'auto', opacity: 0.18 }}
                    className="object-contain"
                  />
                </div>
                <div className="relative z-10 mb-6">
                  <SnapshotRow icon="flight_takeoff" label="Starts">
                    {formatDashboardDate(flightSnapshotBooking.scheduledStart)} · {formatSydTime(flightSnapshotBooking.scheduledStart)}
                  </SnapshotRow>
                  {flightSnapshotBooking.scheduledEnd && (
                    <SnapshotRow icon="flight_land" label="Ends">
                      {formatDashboardDate(flightSnapshotBooking.scheduledEnd)} · {formatSydTime(flightSnapshotBooking.scheduledEnd)}
                    </SnapshotRow>
                  )}
                  <SnapshotRow icon="flight" label="Aircraft">
                    {flightSnapshotBooking.aircraftRegistration
                      ? `Cessna 172 (${flightSnapshotBooking.aircraftRegistration})`
                      : 'Cessna 172'}
                  </SnapshotRow>
                  <SnapshotRow icon="label" label="Type">
                    {flightSnapshotBooking.bookingType === 'checkout' ? 'Checkout Flight' : 'Aircraft Booking'}
                  </SnapshotRow>
                  <SnapshotRow icon="verified" label="Status">
                    <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${snapshotStatus?.textColor ?? 'text-slate-300'}`}>
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: snapshotStatus?.dotColor ?? '#94a3b8' }}
                      />
                      {snapshotStatus?.label ?? '—'}
                    </span>
                  </SnapshotRow>
                </div>
                <button
                  onClick={() => router.push(`/dashboard/bookings/${flightSnapshotBooking.id}`)}
                  className="relative z-10 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] font-bold text-blue-400 hover:text-blue-300 transition-colors"
                >
                  View Booking Details
                  <span className="material-symbols-outlined text-[14px] leading-none">arrow_forward</span>
                </button>
              </div>
            ) : (() => {
              const bookingCardAction =
                actionState.primaryAction?.href === '/dashboard/bookings/new'
                  ? actionState.primaryAction
                  : actionState.primaryAction ?? actionState.secondaryAction ?? null

              return (
                <div>
                  <div className="relative flex justify-center items-center" style={{ height: '180px' }}>
                    <div
                      className="absolute rounded-full"
                      style={{
                        width: '160px',
                        height: '160px',
                        bottom: '0px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(219,234,254,0.55)',
                      }}
                    />
                    <img
                      src="/CustomerDashboard/CustomerDashboard-plane.png"
                      alt=""
                      aria-hidden="true"
                      className="relative z-10 object-contain"
                      style={{ width: '240px', height: 'auto', position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)' }}
                    />
                  </div>
                  <p className="text-[20px] font-semibold text-[#152d5a] text-center mb-2">
                    {actionState.statusKey === 'cleared_ready_to_book' ? 'No upcoming bookings' : 'No active booking yet'}
                  </p>
                  <p className="text-[12px] text-[#4b6390] text-center leading-relaxed mt-2 mb-5">
                    {actionState.statusKey === 'cleared_ready_to_book'
                      ? 'You are cleared to fly and ready to make your next aircraft booking.'
                      : actionState.actionDescription}
                  </p>
                  {bookingCardAction ? (
                    <div className="flex justify-center">
                      <Link
                        href={bookingCardAction.href}
                        className="border border-[#1a4fd6] text-[#1a4fd6] rounded-xl py-2.5 px-6 text-[13px] font-semibold hover:bg-[#f0f6ff] transition-colors"
                      >
                        {bookingCardAction.label}
                      </Link>
                    </div>
                  ) : (
                    <div className="text-center text-[12px] text-[#64748b]">
                      Your next available update will appear here automatically.
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>

        <div
          className="bg-white border border-[#152d5a]/10 rounded-2xl p-5 flex flex-col"
          style={{
            boxShadow: '0 4px 40px rgba(2,10,22,0.08)',
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-[16px] text-[#1a4fd6]">description</span>
            <span className="text-[16px] font-semibold text-[#4b6390]">Document Readiness</span>
          </div>

          <div className="flex items-start gap-4 mb-5">
            <div className="flex-shrink-0">
              <svg viewBox="0 0 100 100" className="w-28 h-28 flex-shrink-0">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#e2e8f0" strokeWidth="14" />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="#1a4fd6"
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={`${(documentProgress.percent / 100) * 251.2} 251.2`}
                  transform="rotate(-90 50 50)"
                />
                <text x="50" y="46" textAnchor="middle" fontWeight="800" fontSize="18" fill="#152d5a">
                  {documentProgress.percent}%
                </text>
                <text x="50" y="62" textAnchor="middle" fontSize="12" fill="#4b6390">
                  Ready
                </text>
              </svg>
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <p className="text-[19px] font-semibold text-[#152d5a] leading-snug">{documentProgress.bannerHeading}</p>
              <p className="mt-2 text-[12px] text-[#4b6390] leading-relaxed">{documentProgress.bannerBody}</p>
            </div>
          </div>

          <div className="space-y-3 mb-5">
            {documentReadinessItems.map((item) => {
              const tone = readinessTone(item.state)
              return (
                <div key={item.key} className="flex items-start gap-3 rounded-xl border border-[#152d5a]/8 bg-[#f8fbff] px-3 py-3">
                  <span className={`material-symbols-outlined text-[18px] ${tone.iconClassName}`}>{tone.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[12px] font-semibold text-[#152d5a]">{item.label}</span>
                      <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${tone.labelClassName}`}>
                        {item.state.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-[#4b6390]">{item.detail}</p>
                  </div>
                </div>
              )
            })}

            {[
              {
                key: 'flight_review',
                label: 'Flight review and red card',
                detail:
                  profile?.last_flight_date?.trim() && pilotLicenceDocument?.red_card_expiry_month && pilotLicenceDocument?.red_card_expiry_year
                    ? 'Flight review recorded and red card details are on file.'
                    : profile?.last_flight_date?.trim()
                      ? 'Flight review date is saved. Add red card details to complete this step.'
                      : 'Add your last flight review date and red card details.',
                status: documentProgress.statuses[1],
              },
              {
                key: 'night_vfr',
                label: 'Night VFR requirement',
                detail:
                  profile?.has_night_vfr_rating === true
                    ? documentReadinessItems.some((item) => item.key === 'night_vfr_evidence')
                      ? 'Night VFR evidence is being tracked in your required documents.'
                      : 'Night VFR is enabled but supporting evidence is still needed.'
                    : profile?.has_night_vfr_rating === false
                      ? 'No Night VFR evidence is required for your current profile.'
                      : 'Answer the Night VFR question so the correct evidence requirement can be applied.',
                status: documentProgress.statuses[2],
              },
              {
                key: 'terms',
                label: 'Current booking terms',
                detail: bookingReadiness?.currentTermsAccepted
                  ? 'The latest terms have been accepted.'
                  : 'Accept the latest booking terms to complete your readiness.',
                status: documentProgress.statuses[3],
              },
            ].map((item) => {
              const tone = progressStatusTone(item.status)
              return (
                <div key={item.key} className="flex items-start gap-3 rounded-xl border border-[#152d5a]/8 bg-white px-3 py-3">
                  <span className={`material-symbols-outlined text-[18px] ${tone.iconClassName}`}>{tone.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[12px] font-semibold text-[#152d5a]">{item.label}</span>
                      <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${tone.labelClassName}`}>
                        {tone.label}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-[#4b6390]">{item.detail}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <Link href="/dashboard/documents" className="flex items-center gap-1 text-[15px] font-semibold text-[#1a4fd6] hover:underline mt-auto">
            {documentProgress.ctaLabel}
            <span className="material-symbols-outlined text-[15px]">chevron_right</span>
          </Link>
        </div>
      </div>

      <div className="bg-white border border-[#152d5a]/10 rounded-2xl px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#1a4fd6]">show_chart</span>
            <span className="text-[15px] font-semibold text-[#152d5a]">Recent Activity</span>
          </div>
          <Link href="/dashboard/bookings" className="text-[12px] text-[#1a4fd6] hover:underline font-medium">
            View All Activity →
          </Link>
        </div>

        <div className="flex flex-col md:flex-row items-stretch gap-2 md:gap-0">
          {(events && events.length > 0 ? events.slice(0, 3) : [
            { label: 'Account created', time: 'Today', icon: 'person', color: 'blue' },
            { label: 'Complete your documents', time: 'Action required', icon: 'description', color: 'amber' },
          ]).map((item: any, i: number, arr: any[]) => {
            const isEvent = 'event_type' in item
            const label = isEvent ? (item.title ?? item.event_type ?? 'Activity update') : item.label
            const time = isEvent
              ? (item.created_at ? formatDateFromISOShort(item.created_at) : 'Recently')
              : item.time
            const isPositive = isEvent
              ? (item.event_type?.includes('approved') || item.event_type?.includes('verified'))
              : item.color === 'blue'

            return (
              <div key={i} className="flex items-center flex-1">
                <div className="flex items-center gap-3 bg-[#f0f6ff] border border-[#152d5a]/08 rounded-xl px-4 py-3 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isPositive ? 'bg-green-100' : 'bg-amber-50'}`}>
                    <span className={`material-symbols-outlined text-[15px] ${isPositive ? 'text-green-600' : 'text-[#f59e0b]'}`}>
                      {isEvent ? (isPositive ? 'check_circle' : 'schedule') : (item.icon ?? 'info')}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-[#152d5a] truncate">{label}</div>
                    <div className="text-[11px] text-[#4b6390]">{time}</div>
                  </div>
                </div>
                {i < arr.length - 1 && (
                  <div className="hidden md:flex items-center justify-center w-8 flex-shrink-0">
                    <span className="text-[#94a3b8] text-[18px]">→</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
