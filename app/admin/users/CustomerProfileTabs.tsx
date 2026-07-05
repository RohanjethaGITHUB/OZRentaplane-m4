'use client'

import { type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import type { AccountStatus, PilotClearanceStatus, UserDocument, VerificationEvent } from '@/lib/supabase/types'
import CurrentActionSection from './CurrentActionSection'
import CheckoutActivitySection from './CheckoutActivitySection'
import HistoricalCheckoutEditor from './HistoricalCheckoutEditor'
import { AdminActionsPanel } from './AdminActionsPanel'
import AdminChatPanel from './AdminChatPanel'
import UnblockCustomerButton from './UnblockCustomerButton'
import { CLEARANCE_ACTION } from './clearance-actions'
import { DocumentReviewCards } from './VerdictPanel'
import BlockTimePurchasesSection, { type AdminBlockTimePurchase } from './BlockTimePurchasesSection'
import BlockTimeTopupsSection, { type AdminBlockTimeTopup } from './BlockTimeTopupsSection'
import BlockTimeFlightInvoicesSection, { type AdminBlockTimeFlightInvoice } from './BlockTimeFlightInvoicesSection'
import { formatDateFromISO } from '@/lib/formatDateTime'

type TimelineEvent = {
  at: string
  title: string
  detail: string
  tone: 'slate' | 'blue' | 'amber' | 'red' | 'green'
  actor?: { full_name: string | null; email: string | null } | null
}

type BookingRow = {
  id: string
  status: string
  booking_type: string
  checkout_lifecycle_status?: string | null
  scheduled_start: string | null
  payment_status: string
  aircraft: { id: string; registration: string } | { id: string; registration: string }[] | null
}

type HistoricalCheckoutRow = {
  id: string
  checkout_date: string
  checkout_outcome: 'cleared_to_fly' | 'additional_checkout_required' | 'not_currently_eligible'
  admin_notes: string | null
  recorded_by_admin_id: string
  recorded_at: string
  linked_aircraft_flight_log_id: string | null
} | null

type PendingRescheduleRow = {
  created_at: string
  original_scheduled_start: string | null
  checkout_request_id: string
  status: string
  bookings: { booking_owner_user_id: string } | { booking_owner_user_id: string }[]
}

type PendingCancellationRow = {
  created_at: string
  booking_start_time: string | null
  status: string
  bookings: { booking_owner_user_id: string } | { booking_owner_user_id: string }[]
}

type CheckoutStatusHistoryRow = {
  booking_id: string
  old_status: string | null
  new_status: string
  changed_by_user_id: string | null
  note: string | null
  created_at: string
}

type AircraftRow = {
  id: string
  registration: string
  display_name: string | null
}

type AircraftLogRow = {
  id: string
  aircraft_id: string
  flight_date: string
  pic_name: string
  pic_arn: string | null
  vdo_start: number | null
  vdo_stop: number | null
  vdo_total: number | null
  tacho_start: number | null
  tacho_stop: number | null
  tacho_total: number | null
  air_switch_start: number | null
  air_switch_stop: number | null
  air_switch_total: number | null
  mr_start: number | null
  mr_stop: number | null
  mr_total: number | null
  oil_added: number | null
  oil_total: number | null
  fuel_added: number | null
  fuel_returned: number | null
  landings: number | null
  source: string | null
  review_status: string | null
  aircraft: { registration: string; display_name: string | null } | { registration: string; display_name: string | null }[] | null
}

type CreditTransaction = {
  id: string
  entry_type: string
  amount_cents: number
  created_at: string
}

type RecordedByAdminProfile = {
  data: {
    full_name: string | null
    email: string | null
  } | null
} | null

type TabType = 'overview' | 'admin_actions' | 'documents' | 'bookings' | 'billing' | 'messages'

type CustomerProfile = {
  id: string
  full_name: string | null
  email: string | null
  account_status: AccountStatus | null
  verification_status: string | null
  pilot_clearance_status: PilotClearanceStatus | null
  terms_accepted_at: string | null
  created_at: string
  updated_at: string
  reviewed_at: string | null
  admin_review_note: string | null
  pilot_arn: string | null
  has_night_vfr_rating: boolean | null
  has_instrument_rating: boolean | null
}

type Props = {
  customerId: string
  customerProfile: CustomerProfile
  accountStatus: AccountStatus
  clearanceStatus: PilotClearanceStatus
  documents: UserDocument[]
  timelineEvents: TimelineEvent[]
  events: VerificationEvent[]
  checkoutBookings: BookingRow[]
  standardBookings: BookingRow[]
  historicalCheckoutRow: HistoricalCheckoutRow
  pendingRescheduleRows: PendingRescheduleRow[]
  pendingCancellationRows: PendingCancellationRow[]
  checkoutStatusHistoryRows: CheckoutStatusHistoryRow[]
  aircraftRows: AircraftRow[]
  aircraftLogRows: AircraftLogRow[]
  blockTimePurchases: AdminBlockTimePurchase[]
  blockTimeTopups: AdminBlockTimeTopup[]
  blockTimeFlightInvoices: AdminBlockTimeFlightInvoice[]
  balanceCents: number
  totalRevenueCents: number
  transactions: CreditTransaction[]
  totalBookingCount: number
  checkoutBookingCount: number
  standardBookingCount: number
  recordedByAdminProfile: RecordedByAdminProfile
  onHoldBookingCount: number
  activeBookingsSummary: {
    count: number
    primaryBookingId: string | null
  } | null
}

const REQUIRED_DOC_TYPES: UserDocument['document_type'][] = ['pilot_licence', 'medical_certificate', 'photo_id']

function prettyStatus(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function shortDate(value: string | null | undefined): string {
  if (!value) return '—'
  return formatDateFromISO(value)
}

function activityDate(value: string | null | undefined): string {
  if (!value) return '—'
  return formatDateFromISO(value)
}

function activityDotClass(eventType: string): string {
  if (eventType === 'document_uploaded') return 'bg-amber-400'
  if (eventType === 'approved') return 'bg-green-500'
  if (eventType === 'rejected') return 'bg-red-500'
  if (eventType === 'on_hold') return 'bg-orange-400'
  if (eventType === 'submitted' || eventType === 'resubmitted') return 'bg-blue-500'
  if (eventType === 'message') return 'bg-purple-400'
  if (eventType === 'admin_proxy_booking_created') return 'bg-[#152d5a]'
  return 'bg-slate-400'
}

function clearanceBadge(status: PilotClearanceStatus): { label: string; bg: string; text: string } {
  if (status === 'cleared_to_fly') return { label: 'Cleared to fly', bg: 'rgba(26,79,214,.3)', text: '#93b4ff' }
  if (status === 'checkout_payment_required') return { label: 'Payment required', bg: 'rgba(239,68,68,.25)', text: '#fca5a5' }
  if (status === 'checkout_required' || status === 'checkout_requested') {
    return { label: prettyStatus(status), bg: 'rgba(245,158,11,.25)', text: '#fcd34d' }
  }
  return { label: prettyStatus(status), bg: 'rgba(255,255,255,.1)', text: 'rgba(255,255,255,.6)' }
}

function accountBadge(status: AccountStatus): { label: string; bg: string; text: string } {
  if (status === 'active') return { label: 'Active', bg: 'rgba(255,255,255,.12)', text: 'rgba(255,255,255,.75)' }
  if (status === 'blocked') return { label: 'Blocked', bg: 'rgba(239,68,68,.35)', text: '#fca5a5' }
  return { label: prettyStatus(status), bg: 'rgba(255,255,255,.12)', text: 'rgba(255,255,255,.6)' }
}

function getStatusTone(clearanceStatus: PilotClearanceStatus, accountStatus: AccountStatus): 'green' | 'amber' | 'red' | 'blue' {
  if (accountStatus === 'blocked' || clearanceStatus === 'not_currently_eligible') return 'red'
  if (clearanceStatus === 'cleared_to_fly') return 'green'
  if (
    clearanceStatus === 'checkout_required' ||
    clearanceStatus === 'checkout_requested' ||
    clearanceStatus === 'checkout_payment_required' ||
    clearanceStatus === 'checkout_completed_under_review' ||
    clearanceStatus === 'additional_checkout_required' ||
    clearanceStatus === 'checkout_reschedule_required'
  ) {
    return 'amber'
  }
  return 'blue'
}

function getStatusBadgeClass(tone: 'green' | 'amber' | 'red' | 'blue'): string {
  if (tone === 'green') return 'bg-green-50 border-green-200 text-green-700'
  if (tone === 'amber') return 'bg-amber-50 border-amber-200 text-amber-700'
  if (tone === 'red') return 'bg-red-50 border-red-200 text-red-700'
  return 'bg-blue-50 border-blue-200 text-blue-700'
}

function getCurrentStatusText(clearanceStatus: PilotClearanceStatus, accountStatus: AccountStatus): { label: string; description: string; tone: 'green' | 'amber' | 'red' | 'blue' } {
  if (accountStatus === 'blocked') {
    return {
      label: 'Blocked',
      description: 'This account has been blocked. The customer cannot create new bookings or access the platform until unblocked.',
      tone: 'red',
    }
  }

  const action = CLEARANCE_ACTION[clearanceStatus]
  return {
    label: prettyStatus(clearanceStatus),
    description: action.description,
    tone: getStatusTone(clearanceStatus, accountStatus),
  }
}

export default function CustomerProfileTabs({
  customerId,
  customerProfile,
  accountStatus,
  clearanceStatus,
  documents,
  timelineEvents,
  events,
  checkoutBookings,
  standardBookings,
  historicalCheckoutRow,
  pendingRescheduleRows,
  pendingCancellationRows,
  checkoutStatusHistoryRows,
  aircraftRows,
  aircraftLogRows,
  blockTimePurchases,
  blockTimeTopups,
  blockTimeFlightInvoices,
  balanceCents,
  totalRevenueCents,
  transactions,
  totalBookingCount,
  checkoutBookingCount,
  standardBookingCount,
  recordedByAdminProfile,
  onHoldBookingCount,
  activeBookingsSummary,
}: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const activeTab = (searchParams?.get('tab') ?? 'overview') as TabType

  const initials = customerProfile.full_name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() ?? '??'
  const uploadedRequired = REQUIRED_DOC_TYPES.filter((t) => documents.some((d) => d.document_type === t && (d.status === 'uploaded' || d.status === 'approved'))).length
  const latestDocumentsByType = new Map<UserDocument['document_type'], UserDocument>()
  for (const doc of documents) {
    if (!latestDocumentsByType.has(doc.document_type)) {
      latestDocumentsByType.set(doc.document_type, doc)
    }
  }
  const latestDocuments = Array.from(latestDocumentsByType.values())
  const documentStatusCounts = {
    uploaded: latestDocuments.filter((doc) => doc.status === 'uploaded').length,
    approved: latestDocuments.filter((doc) => doc.status === 'approved').length,
    rejected: latestDocuments.filter((doc) => doc.status === 'rejected').length,
  }
  const totalDocumentCount =
    documentStatusCounts.uploaded + documentStatusCounts.approved + documentStatusCounts.rejected
  const documentStatTone: QuickStatTone =
    documentStatusCounts.rejected > 0
      ? 'red'
      : documentStatusCounts.approved > 0 && totalDocumentCount === documentStatusCounts.approved
        ? 'green'
        : documentStatusCounts.uploaded > 0
          ? 'amber'
          : 'slate'
  const requiredHeroDocuments = REQUIRED_DOC_TYPES
    .map((type) => latestDocumentsByType.get(type))
    .filter((doc): doc is UserDocument => Boolean(doc))
  const heroDocumentsLabel =
    requiredHeroDocuments.length === 0
      ? 'Docs required'
      : requiredHeroDocuments.some((doc) => doc.status === 'rejected')
        ? 'Review required'
        : requiredHeroDocuments.some((doc) => doc.status === 'uploaded')
          ? 'Review required'
          : REQUIRED_DOC_TYPES.every((type) => latestDocumentsByType.get(type)?.status === 'approved')
            ? 'All approved'
            : 'Docs required'
  const heroDocumentsValueClass =
    requiredHeroDocuments.length === 0
      ? 'text-red-400'
      : requiredHeroDocuments.some((doc) => doc.status === 'rejected')
        ? 'text-red-400'
        : requiredHeroDocuments.some((doc) => doc.status === 'uploaded')
          ? 'text-amber-400'
          : REQUIRED_DOC_TYPES.every((type) => latestDocumentsByType.get(type)?.status === 'approved')
            ? 'text-green-400'
            : 'text-red-400'
  const clearance = clearanceBadge(clearanceStatus)
  const account = accountBadge(accountStatus)

  const unreadMessages = events.filter((e) => e.event_type === 'message' && !e.is_read && e.actor_role !== 'admin').length
  const latestCheckoutBookingId = checkoutBookings[0]?.id ?? null

  const latestPilotLicenceArn = documents.find((d) => d.document_type === 'pilot_licence' && d.licence_number)?.licence_number ?? null
  const defaultPicArn = customerProfile.pilot_arn ?? latestPilotLicenceArn ?? null

  const historicalSummary = historicalCheckoutRow
    ? {
        id: historicalCheckoutRow.id,
        checkoutDate: historicalCheckoutRow.checkout_date,
        checkoutOutcome: historicalCheckoutRow.checkout_outcome,
        adminNotes: historicalCheckoutRow.admin_notes,
        recordedAt: historicalCheckoutRow.recorded_at,
        recordedByName: recordedByAdminProfile?.data?.full_name ?? null,
        recordedByEmail: recordedByAdminProfile?.data?.email ?? null,
        linkedFlightLogId: historicalCheckoutRow.linked_aircraft_flight_log_id,
        linkedFlightLogAircraftId: null,
        linkedFlightLogAircraftRegistration: null,
        linkedFlightLogDate: null,
      }
    : null

  const clearanceValue = clearanceStatus
    ? clearanceStatus
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : '—'
  type QuickStatTone = 'green' | 'amber' | 'red' | 'blue' | 'slate'

  function quickStatAccentClass(tone: QuickStatTone): string {
    if (tone === 'green') return 'border-l-green-600'
    if (tone === 'amber') return 'border-l-amber-500'
    if (tone === 'red') return 'border-l-red-600'
    if (tone === 'slate') return 'border-l-slate-300'
    return 'border-l-blue-600'
  }

  function quickStatValueClass(label: string): string {
    if (label === 'Clearance') {
      if (clearanceStatus === 'cleared_to_fly') return 'text-green-600 font-medium'
      if (clearanceStatus === 'checkout_required' || clearanceStatus === 'checkout_requested' || clearanceStatus === 'checkout_payment_required') {
        return 'text-amber-600 font-medium'
      }
      if (accountStatus === 'blocked' || clearanceStatus === 'not_currently_eligible') return 'text-red-700 font-medium'
      return 'text-[#0C2340] font-medium'
    }
    if (label === 'Terms & Conditions') {
      return customerProfile.terms_accepted_at ? 'text-green-600 font-medium' : 'text-red-600 font-medium'
    }
    if (label === 'Documents') {
      if (documentStatusCounts.rejected > 0) return 'text-red-700 font-medium'
      if (documentStatusCounts.approved > 0 && totalDocumentCount === documentStatusCounts.approved) {
        return 'text-green-700 font-medium'
      }
      if (documentStatusCounts.uploaded > 0) return 'text-amber-800 font-medium'
      return 'text-slate-500 font-medium'
    }
    return 'text-[#0C2340] font-medium'
  }

  const recentActivityEvents = [...events]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6)

  const currentStatus = getCurrentStatusText(clearanceStatus, accountStatus)
  const currentStatusAction = accountStatus === 'blocked' ? null : CLEARANCE_ACTION[clearanceStatus]

  function setTab(tab: TabType) {
    router.replace(`?tab=${tab}`, { scroll: false })
  }

  function openTab(tab: TabType) {
    setTab(tab)
  }

  function QuickStatsGrid() {
    function StatCard({
      label,
      tone,
      children,
      subtext,
      hrefTab,
      className = '',
    }: {
      label: string
      tone: QuickStatTone
      children: ReactNode
      subtext?: ReactNode
      hrefTab?: TabType | null
      className?: string
    }) {
      const isClickable = Boolean(hrefTab)
      const handleClick = () => {
        if (hrefTab) openTab(hrefTab)
      }

      const cardClasses = `rounded-xl border border-[rgba(12,35,64,0.15)] border-l-4 p-3 pl-4 ${quickStatAccentClass(tone)} ${
        label === 'Clearance'
          ? clearanceStatus === 'cleared_to_fly'
            ? 'bg-green-50'
            : accountStatus === 'blocked' || clearanceStatus === 'not_currently_eligible'
              ? 'bg-red-50'
              : 'bg-amber-50'
          : label === 'Terms & Conditions'
            ? customerProfile.terms_accepted_at
              ? 'bg-green-50'
              : 'bg-red-50'
            : label === 'Documents'
              ? documentStatusCounts.rejected > 0
                ? 'bg-red-50 border-red-300'
                : documentStatusCounts.approved > 0 && totalDocumentCount === documentStatusCounts.approved
                  ? 'bg-green-50 border-green-300'
                  : documentStatusCounts.uploaded > 0
                    ? 'bg-amber-50 border-amber-300'
                    : 'bg-slate-50 border-slate-200'
              : label === 'Billing'
                ? 'bg-slate-50'
                : 'bg-slate-50'
      } ${isClickable ? 'cursor-pointer hover:shadow-md hover:border-[#152d5a]/20 transition-all duration-150' : ''} ${className}`

      if (isClickable) {
        return (
          <button type="button" onClick={handleClick} className={`${cardClasses} text-left w-full`}>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#3d5a80] mb-1.5">
              {label}
            </p>
            <p className={`text-[17px] font-medium leading-tight ${quickStatValueClass(label)}`}>
              {children}
            </p>
            {subtext ? (
              <p className="mt-1 text-xs text-slate-400 leading-tight">
                {subtext}
              </p>
            ) : null}
            <span className="text-slate-300 text-xs mt-2 block text-right">→</span>
          </button>
        )
      }

      return (
        <div className={cardClasses}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#3d5a80] mb-1.5">
            {label}
          </p>
          <p className={`text-[17px] font-medium leading-tight ${quickStatValueClass(label)}`}>
            {children}
          </p>
          {subtext ? (
            <p className="mt-1 text-xs text-slate-400 leading-tight">
              {subtext}
            </p>
          ) : null}
        </div>
      )
    }

    const bookingSummary = `${checkoutBookingCount} checkout · ${standardBookingCount} standard`
    const formattedRevenue = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(totalRevenueCents / 100)

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <StatCard label="Clearance" tone="red">
          {clearanceValue}
        </StatCard>
        <StatCard label="Terms & Conditions" tone={customerProfile.terms_accepted_at ? 'green' : 'red'} hrefTab="documents">
          {customerProfile.terms_accepted_at ? 'Accepted' : 'Not accepted'}
        </StatCard>
        <StatCard label="Documents" tone={documentStatTone} hrefTab="documents">
          <>
            <span className={documentStatusCounts.uploaded > 0 ? 'text-amber-700' : 'text-slate-400'}>
              {documentStatusCounts.uploaded} uploaded
            </span>
            <span className="mx-1 text-slate-300">·</span>
            <span className={documentStatusCounts.approved > 0 ? 'text-green-700' : 'text-slate-400'}>
              {documentStatusCounts.approved} approved
            </span>
            <span className="mx-1 text-slate-300">·</span>
            <span className={documentStatusCounts.rejected > 0 ? 'text-red-700' : 'text-slate-400'}>
              {documentStatusCounts.rejected} rejected
            </span>
          </>
        </StatCard>
        <StatCard label="Billing" tone="blue" hrefTab="billing">
          <span className={totalRevenueCents > 0 ? 'text-[#0C2340] font-medium' : 'text-slate-400 font-medium'}>
            {formattedRevenue}
          </span>
        </StatCard>
        <StatCard
          label="Bookings"
          tone="blue"
          hrefTab="bookings"
          className="border-l-blue-400 bg-slate-50 border-slate-200"
          subtext={bookingSummary}
        >
          <span className={totalBookingCount > 0 ? 'text-[#0C2340] font-medium' : 'text-slate-400 font-medium'}>
            {totalBookingCount}
          </span>
        </StatCard>
      </div>
    )
  }

  function CurrentStatusCard() {
    return (
      <div className="bg-white rounded-xl border border-[rgba(12,35,64,0.15)] p-4 mb-4">
        <div className="flex items-center justify-between pb-3 border-b border-[rgba(12,35,64,0.08)] mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#3d5a80]">
            Current Status
          </p>
          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest ${getStatusBadgeClass(currentStatus.tone)}`}>
            {currentStatus.label}
          </span>
        </div>

        <p className="text-[15px] text-[#3d5a80] mb-3 leading-relaxed">
          {currentStatus.description}
        </p>

        {accountStatus === 'blocked' ? (
          <div className="flex flex-wrap items-center gap-3">
            <UnblockCustomerButton customerId={customerProfile.id} />
          </div>
        ) : currentStatusAction && currentStatusAction.ctas.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {currentStatusAction.ctas.map((cta, i) => (
              <Link
                key={`${cta.label}-${i}`}
                href={cta.href(latestCheckoutBookingId)}
                className="text-[15px] font-medium text-[#185FA5] inline-flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors"
              >
                {cta.label}
                <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'wght' 300" }}>arrow_forward</span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  function RecentActivityCard() {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            RECENT ACTIVITY
          </p>
          <p className="text-xs text-slate-400">
            Latest 6 events
          </p>
        </div>

        {recentActivityEvents.length === 0 ? (
          <p className="text-sm text-slate-400">No activity recorded yet.</p>
        ) : (
          <div className="space-y-0">
            {recentActivityEvents.map((event, idx) => {
              const isLast = idx === recentActivityEvents.length - 1
              return (
                <div key={event.id} className="flex gap-4 pb-4 relative">
                  <div className="flex flex-col items-center">
                    <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${activityDotClass(event.event_type)}`} />
                    {!isLast && <div className="w-0.5 bg-slate-200 flex-1 mt-1" />}
                  </div>
                  <div className="flex-1 pb-2">
                    <div className="text-sm font-medium text-slate-800">
                      {event.title}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {activityDate(event.created_at)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <section className="bg-[#152d5a] rounded-t-2xl rounded-b-none px-6 py-5">
        <div className="hidden md:flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <div className="w-[52px] h-[52px] rounded-full bg-white/15 text-[22px] font-semibold text-white flex items-center justify-center">{initials}</div>
              <div>
                <h1 className="text-[22px] font-semibold text-white">{customerProfile.full_name ?? 'Unknown Customer'}</h1>
                <div className="flex gap-2 mt-1">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: account.bg, color: account.text }}>{account.label}</span>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: clearance.bg, color: clearance.text }}>{clearance.label}</span>
                </div>
              </div>
            </div>

            {accountStatus === 'blocked' && (
              <div className="bg-red-900/40 border border-red-500/30 rounded-xl px-4 py-2 mt-3 text-red-200 text-[14px]">⚠ This account is blocked</div>
            )}

            <div className="mt-3 pt-3 border-t border-white/10">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/40">
                Pilot details
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
                <div className="min-w-0 text-left">
                  <p className="text-[11px] uppercase text-white/40">Pilot ARN</p>
                  <p className="text-[15px] font-medium text-white">{customerProfile.pilot_arn ?? 'Not set'}</p>
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-[11px] uppercase text-white/40">Night VFR</p>
                  <p
                    className={`text-[15px] font-medium ${
                      customerProfile.has_night_vfr_rating === true
                        ? 'text-green-400'
                        : customerProfile.has_night_vfr_rating === false
                          ? 'text-slate-300'
                          : 'text-amber-400'
                    }`}
                  >
                    {customerProfile.has_night_vfr_rating === true
                      ? 'Yes'
                      : customerProfile.has_night_vfr_rating === false
                        ? 'No'
                        : 'Not set'}
                  </p>
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-[11px] uppercase text-white/40">Instrument</p>
                  <p className="text-[15px] font-medium text-white">{customerProfile.has_instrument_rating ? 'Yes' : 'No'}</p>
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-[11px] uppercase text-white/40">Documents</p>
                  <p className={`text-[15px] font-medium ${heroDocumentsValueClass}`}>{heroDocumentsLabel}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="text-right flex flex-col items-end gap-3">
            <div className="flex flex-col items-end gap-2">
              <Link
                href={`/admin/users/${customerId}/create-booking`}
                className="inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3.5 text-sm font-semibold text-[#152d5a] shadow-sm transition-colors hover:bg-[#eef3fa] hover:text-[#0C2340]"
              >
                Create Booking
              </Link>
            </div>
            <div>
              <p className="text-[13px] text-white/45">{customerProfile.email ?? '—'}</p>
              <p className="text-[13px] text-white/30 mt-1">Member since {shortDate(customerProfile.created_at)}</p>
            </div>
          </div>
        </div>

        <div className="md:hidden">
          <div className="flex items-center gap-3">
            <div className="w-[52px] h-[52px] rounded-full bg-white/15 text-[22px] font-semibold text-white flex items-center justify-center">{initials}</div>
            <div>
              <h1 className="text-[22px] font-semibold text-white">{customerProfile.full_name ?? 'Unknown Customer'}</h1>
              <div className="flex gap-2 mt-1">
                <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: account.bg, color: account.text }}>{account.label}</span>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: clearance.bg, color: clearance.text }}>{clearance.label}</span>
              </div>
            </div>
          </div>

          {accountStatus === 'blocked' && (
            <div className="bg-red-900/40 border border-red-500/30 rounded-xl px-4 py-2 mt-3 text-red-200 text-[14px]">⚠ This account is blocked</div>
          )}

          <div className="mt-4">
            <Link
              href={`/admin/users/${customerId}/create-booking`}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-6 py-3.5 text-sm font-semibold text-[#152d5a] shadow-sm transition-colors hover:bg-[#eef3fa] hover:text-[#0C2340]"
            >
              Create Booking
            </Link>
          </div>

          <p className="text-[13px] text-white/45 mt-3">{customerProfile.email ?? '—'} · ARN {customerProfile.pilot_arn ?? 'Not set'}</p>

          <div className="border-t border-white/10 mt-3 pt-3">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/40">
              Pilot details
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/5 rounded-lg px-2 py-2">
                <p className="text-[11px] uppercase text-white/40">Docs</p>
                <p className={`text-[15px] font-semibold ${heroDocumentsValueClass}`}>{heroDocumentsLabel}</p>
              </div>
              <div className="bg-white/5 rounded-lg px-2 py-2">
                <p className="text-[11px] uppercase text-white/40">Flights</p>
                <p className="text-[15px] font-semibold text-white">{checkoutBookings.length + standardBookings.length}</p>
              </div>
              <div className="bg-white/5 rounded-lg px-2 py-2">
                <p className="text-[11px] uppercase text-white/40">Credit</p>
                <p className="text-[15px] font-semibold text-white">${(balanceCents / 100).toFixed(2)}</p>
              </div>
              <div className="bg-white/5 rounded-lg px-2 py-2">
                <p className="text-[11px] uppercase text-white/40">Night VFR</p>
                <p
                  className={`text-[15px] font-semibold ${
                    customerProfile.has_night_vfr_rating === true
                      ? 'text-green-400'
                      : customerProfile.has_night_vfr_rating === false
                        ? 'text-slate-300'
                        : 'text-amber-400'
                  }`}
                >
                  {customerProfile.has_night_vfr_rating === true
                    ? 'Yes'
                    : customerProfile.has_night_vfr_rating === false
                      ? 'No'
                      : 'Not set'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sticky top-0 z-10 mb-4 rounded-b-2xl bg-white">
          <div className="flex overflow-x-auto border-b-2 border-slate-200 bg-white scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {([
              { key: 'overview', label: 'Overview' },
              { key: 'admin_actions', label: 'Admin Actions' },
              { key: 'documents', label: 'Documents' },
              { key: 'bookings', label: 'Bookings' },
              { key: 'billing', label: 'Billing' },
              { key: 'messages', label: 'Messages' },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setTab(tab.key)}
                className={`relative px-5 py-4 text-sm font-semibold tracking-wide transition-all duration-150 whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'text-[#152d5a] border-b-2 border-[#152d5a] bg-white'
                    : 'text-slate-400 border-b-2 border-transparent hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                {tab.label}
                {tab.key === 'messages' && unreadMessages > 0 && (
                  <span className="absolute top-2.5 right-2 w-2 h-2 rounded-full bg-red-500" />
                )}
              </button>
            ))}
          </div>
      </section>

      {activeTab === 'overview' && (
        <section className="space-y-4">
          <QuickStatsGrid />
          <CurrentActionSection
            clearanceStatus={clearanceStatus}
            accountStatus={accountStatus}
            latestCheckoutBookingId={latestCheckoutBookingId}
            adminReviewNote={customerProfile.admin_review_note}
            reviewedAt={customerProfile.reviewed_at}
            customerId={customerId}
          />
          <RecentActivityCard />
        </section>
      )}

      {activeTab === 'admin_actions' && (
        <section className="space-y-4">
          <AdminActionsPanel
            customerId={customerId}
            currentStatus={clearanceStatus}
            activeBookingsSummary={activeBookingsSummary}
          />
        </section>
      )}

      {activeTab === 'documents' && (
        <section>
          <DocumentReviewCards
            customerId={customerId}
            documents={documents}
            customerProfile={customerProfile}
            onHoldBookingCount={onHoldBookingCount}
          />
        </section>
      )}

      {activeTab === 'bookings' && (
        <section>
          <CheckoutActivitySection checkoutBookings={checkoutBookings} standardBookings={standardBookings} />
          <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-5 mt-3">
            <HistoricalCheckoutEditor
              customerId={customerProfile.id}
              customerName={customerProfile.full_name ?? 'Unknown Customer'}
              clearanceStatus={clearanceStatus}
              hasActiveCheckoutRequest={checkoutBookings.some((b) => ['checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review', 'checkout_payment_required'].includes(b.status))}
              defaultPicArn={defaultPicArn}
              aircraftOptions={aircraftRows.map((a) => ({ id: a.id, registration: a.registration, displayName: a.display_name ?? a.registration }))}
              existingLogs={aircraftLogRows.map((log) => {
                const av = log.aircraft
                const first = Array.isArray(av) ? av[0] : av
                return {
                  id: log.id,
                  aircraftId: log.aircraft_id,
                  aircraftRegistration: first?.registration ?? 'Unknown',
                  aircraftDisplayName: first?.display_name ?? null,
                  flightDate: log.flight_date,
                  picName: log.pic_name,
                  picArn: log.pic_arn,
                  vdoStart: log.vdo_start,
                  vdoStop: log.vdo_stop,
                  vdoTotal: log.vdo_total,
                  tachoStart: log.tacho_start,
                  tachoStop: log.tacho_stop,
                  tachoTotal: log.tacho_total,
                  airSwitchStart: log.air_switch_start,
                  airSwitchStop: log.air_switch_stop,
                  airSwitchTotal: log.air_switch_total,
                  mrStart: log.mr_start,
                  mrStop: log.mr_stop,
                  mrTotal: log.mr_total,
                  oilAdded: log.oil_added,
                  oilTotal: log.oil_total,
                  fuelAdded: log.fuel_added,
                  fuelReturned: log.fuel_returned,
                  landings: log.landings,
                  source: log.source,
                  reviewStatus: log.review_status,
                }
              })}
              historicalRecord={historicalSummary}
            />
          </div>
        </section>
      )}

      {activeTab === 'billing' && (
        <section>
          <h3 className="text-[11px] uppercase tracking-widest font-semibold text-[#4b6390] mb-3">Billing & credits</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-5">
              <p className="text-[11px] uppercase tracking-widest font-semibold text-[#4b6390]">Available credit</p>
              <p className="text-3xl font-semibold text-[#152d5a] mt-2">${(balanceCents / 100).toFixed(2)}</p>
              <button type="button" className="mt-4 px-4 py-2 bg-[#152d5a] text-white text-[13px] rounded-full">Manage credits & refunds</button>
            </div>

            <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-5">
              <h4 className="text-[11px] uppercase tracking-widest font-semibold text-[#4b6390] mb-3">Transactions</h4>
              {transactions.length === 0 ? (
                <p className="text-[12px] text-[#4b6390]">No transactions yet.</p>
              ) : (
                transactions.map((txn) => {
                  const amount = txn.amount_cents / 100
                  const isCredit = amount >= 0
                  return (
                    <div key={txn.id} className="flex justify-between items-center py-2 border-b border-[#152d5a]/8 last:border-b-0">
                      <p className="text-[12px] text-[#4b6390]">{prettyStatus(txn.entry_type)} · {shortDate(txn.created_at)}</p>
                      <p className={`text-[12px] font-semibold ${isCredit ? 'text-[#166534]' : 'text-[#991b1b]'}`}>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)}</p>
                    </div>
                  )
                })
              )}
            </div>
          </div>
          <BlockTimePurchasesSection purchases={blockTimePurchases} />
          <BlockTimeTopupsSection topups={blockTimeTopups} />
          <BlockTimeFlightInvoicesSection invoices={blockTimeFlightInvoices} />
        </section>
      )}

      {activeTab === 'messages' && (
        <section className="bg-white border border-[#152d5a]/10 rounded-2xl overflow-hidden">
          <AdminChatPanel
            customerId={customerProfile.id}
            events={events}
            customerName={customerProfile.full_name ?? 'Unknown Customer'}
          />
        </section>
      )}

    </div>
  )
}
