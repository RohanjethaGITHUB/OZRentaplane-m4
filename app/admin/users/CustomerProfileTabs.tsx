'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import type { AccountStatus, PilotClearanceStatus, UserDocument, VerificationEvent } from '@/lib/supabase/types'
import NextActionCard from './NextActionCard'
import CurrentActionSection from './CurrentActionSection'
import CheckoutActivitySection from './CheckoutActivitySection'
import HistoricalCheckoutEditor from './HistoricalCheckoutEditor'
import AdminChatPanel from './AdminChatPanel'
import PilotMetadataEditor from './PilotMetadataEditor'
import { DocumentReviewCards } from './VerdictPanel'

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

type CustomerProfile = {
  id: string
  full_name: string | null
  email: string | null
  account_status: AccountStatus | null
  verification_status: string | null
  pilot_clearance_status: PilotClearanceStatus | null
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
  balanceCents: number
  transactions: CreditTransaction[]
  recordedByAdminProfile: RecordedByAdminProfile
  onHoldBookingCount: number
}

const REQUIRED_DOC_TYPES: UserDocument['document_type'][] = ['pilot_licence', 'medical_certificate', 'photo_id']

const TONE_COLOUR: Record<TimelineEvent['tone'], string> = {
  slate: '#9ca3af',
  blue: '#42a5f5',
  amber: '#ffa726',
  red: '#ef5350',
  green: '#2e7d32',
}

function prettyStatus(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function shortDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
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
  balanceCents,
  transactions,
  recordedByAdminProfile,
  onHoldBookingCount,
}: Props) {
  const [activeTab, setActiveTab] = useState<'overview'|'documents'|'bookings'|'billing'|'messages'|'log'>('overview')

  const initials = customerProfile.full_name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() ?? '??'
  const uploadedRequired = REQUIRED_DOC_TYPES.filter((t) => documents.some((d) => d.document_type === t && (d.status === 'uploaded' || d.status === 'approved'))).length
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

  const historicalCheckoutAction: ReactNode = (
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
      renderMode="button_only"
    />
  )

  const isCompactOverview = clearanceStatus === 'cleared_to_fly' && accountStatus !== 'blocked'
  const clearanceValue = clearanceStatus
    ? clearanceStatus
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : '—'
  const quickStats = [
    { label: 'Clearance', value: clearanceValue },
    { label: 'Account', value: prettyStatus(accountStatus) },
    { label: 'Documents', value: `${uploadedRequired} / 3` },
    { label: 'Credit', value: `$${(balanceCents / 100).toFixed(2)}` },
    { label: 'Checkouts', value: String(checkoutBookings.length) },
    { label: 'Bookings', value: String(standardBookings.length) },
  ]

  function quickStatValueClass(label: string): string {
    if (label === 'Clearance') {
      if (clearanceStatus === 'cleared_to_fly') return 'text-green-600 font-medium'
      if (clearanceStatus === 'checkout_required' || clearanceStatus === 'checkout_requested' || clearanceStatus === 'checkout_payment_required') {
        return 'text-amber-600 font-medium'
      }
      if ((clearanceStatus as string) === 'rejected') return 'text-red-600 font-medium'
      return 'text-[#0C2340] font-medium'
    }
    if (label === 'Account') {
      if (accountStatus === 'active') return 'text-green-600 font-medium'
      if (accountStatus === 'blocked') return 'text-red-600 font-medium'
      return 'text-[#0C2340] font-medium'
    }
    if (label === 'Documents') {
      return uploadedRequired === REQUIRED_DOC_TYPES.length ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'
    }
    if (label === 'Credit') {
      return 'text-[#0C2340] font-medium'
    }
    return 'text-[#0C2340] font-medium'
  }

  function QuickStatsCard() {
    return (
      <div className="bg-white border border-[rgba(12,35,64,0.15)] rounded-xl p-4">
        <h3 className="text-xs uppercase tracking-wide font-semibold text-[#3d5a80] mb-3">Quick stats</h3>
        <div className="divide-y divide-[rgba(12,35,64,0.1)] border border-[rgba(12,35,64,0.12)] rounded-xl overflow-hidden">
          {quickStats.map((stat) => (
            <div key={stat.label} className="flex items-center justify-between gap-4 px-3 py-3 bg-[#f8f9fb]">
              <div className="text-xs text-[#3d5a80] uppercase tracking-wide font-medium">
                {stat.label}
              </div>
              <div className={`text-sm ${quickStatValueClass(stat.label)}`}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
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

            <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-6">
              <div><p className="text-[11px] uppercase text-white/40">Pilot ARN</p><p className="text-[15px] font-medium text-white">{customerProfile.pilot_arn ?? 'Not set'}</p></div>
              <div><p className="text-[11px] uppercase text-white/40">Night VFR</p><p className="text-[15px] font-medium text-white">{customerProfile.has_night_vfr_rating ? 'Yes' : 'No'}</p></div>
              <div><p className="text-[11px] uppercase text-white/40">Instrument</p><p className="text-[15px] font-medium text-white">{customerProfile.has_instrument_rating ? 'Yes' : 'No'}</p></div>
              <div><p className="text-[11px] uppercase text-white/40">Documents</p><p className={`text-[15px] font-medium ${uploadedRequired === REQUIRED_DOC_TYPES.length ? 'text-[#6ee7a0]' : 'text-amber-300'}`}>{uploadedRequired} / 3</p></div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[13px] text-white/45">{customerProfile.email ?? '—'}</p>
            <p className="text-[13px] text-white/30 mt-1">Member since {shortDate(customerProfile.created_at)}</p>
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

          <p className="text-[13px] text-white/45 mt-3">{customerProfile.email ?? '—'} · ARN {customerProfile.pilot_arn ?? 'Not set'}</p>

          <div className="border-t border-white/10 mt-3 pt-3 grid grid-cols-3 gap-2">
            <div className="bg-white/5 rounded-lg px-2 py-2"><p className="text-[11px] uppercase text-white/40">Docs</p><p className="text-[15px] font-semibold text-white">{uploadedRequired}/3</p></div>
            <div className="bg-white/5 rounded-lg px-2 py-2"><p className="text-[11px] uppercase text-white/40">Flights</p><p className="text-[15px] font-semibold text-white">{checkoutBookings.length + standardBookings.length}</p></div>
            <div className="bg-white/5 rounded-lg px-2 py-2"><p className="text-[11px] uppercase text-white/40">Credit</p><p className="text-[15px] font-semibold text-white">${(balanceCents / 100).toFixed(2)}</p></div>
          </div>
        </div>
      </section>

      <section className="bg-white border border-t-0 border-[#152d5a]/10 rounded-b-2xl mb-4">
        <div className="relative">
          <div className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-white to-transparent pointer-events-none md:hidden z-10" />

          <div className="flex overflow-x-auto scrollbar-none [-webkit-overflow-scrolling:touch] [scrollbar-width:none] px-2 border-b border-[#152d5a]/8">
            {([
              { key: 'overview', label: 'Overview' },
              { key: 'documents', label: 'Documents' },
              { key: 'bookings', label: 'Bookings' },
              { key: 'billing', label: 'Billing' },
              { key: 'messages', label: 'Messages' },
              { key: 'log', label: 'Log' },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative px-4 py-3.5 text-[14px] font-semibold whitespace-nowrap shrink-0 transition-colors border-b-2 -mb-px ${
                  activeTab === tab.key
                    ? 'text-[#152d5a] border-[#152d5a]'
                    : 'text-[#4b6390] border-transparent hover:text-[#152d5a] hover:border-[#152d5a]/30'
                }`}
              >
                {tab.label}
                {tab.key === 'messages' && unreadMessages > 0 && (
                  <span className="absolute top-2.5 right-2 w-2 h-2 rounded-full bg-red-500" />
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {activeTab === 'overview' && (
        <section className={isCompactOverview ? 'space-y-3' : 'grid grid-cols-1 md:grid-cols-[1fr_260px] gap-3'}>
          <div className="space-y-3">
            {isCompactOverview ? <QuickStatsCard /> : null}

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#3d5a80] mb-2">CURRENT STATUS</p>
              {!isCompactOverview && (clearanceStatus !== 'cleared_to_fly' || accountStatus === 'blocked') ? (
                <div className="bg-white border border-[rgba(12,35,64,0.15)] rounded-xl">
                  <NextActionCard
                    clearanceStatus={clearanceStatus}
                    accountStatus={accountStatus}
                    latestCheckoutBookingId={latestCheckoutBookingId}
                    historicalCheckoutAction={historicalCheckoutAction}
                  />
                </div>
              ) : null}

              <div className="bg-white border border-[rgba(12,35,64,0.15)] rounded-xl p-5">
                <CurrentActionSection
                  clearanceStatus={clearanceStatus}
                  accountStatus={accountStatus}
                  latestCheckoutBookingId={latestCheckoutBookingId}
                  adminReviewNote={customerProfile.admin_review_note}
                  reviewedAt={customerProfile.reviewed_at}
                  customerId={customerProfile.id}
                />
              </div>
            </div>

            <div className="bg-white border border-[rgba(12,35,64,0.15)] rounded-xl p-5">
              <h3 className="text-xs uppercase tracking-wide font-semibold text-[#3d5a80] mb-3">Recent activity</h3>
              {timelineEvents.slice(0, 8).map((item, idx) => (
                <div key={`${item.title}-${idx}`} className="flex gap-3 py-2 border-b border-[rgba(12,35,64,0.08)] last:border-b-0">
                  <span
                    className="w-2 h-2 rounded-full mt-1.5"
                    style={{
                      background: TONE_COLOUR[item.tone] ?? '#9ca3af',
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <p className="text-sm font-medium text-[#0C2340]">{item.title}</p>
                    <p className="text-sm text-[#3d5a80]">{item.detail}</p>
                    <p className="text-xs text-[#3d5a80]">{shortDate(item.at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {!isCompactOverview ? (
            <div className="space-y-3">
              <QuickStatsCard />
              <PilotMetadataEditor customerId={customerProfile.id} initialArn={customerProfile.pilot_arn} />
            </div>
          ) : (
            <PilotMetadataEditor customerId={customerProfile.id} initialArn={customerProfile.pilot_arn} />
          )}
        </section>
      )}

      {activeTab === 'documents' && (
        <section>
          <h3 className="text-[11px] uppercase tracking-widest font-semibold text-[#4b6390] mb-3">Documents</h3>
          {onHoldBookingCount > 0 && (
            <div className="mb-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[14px] text-amber-900">
              {onHoldBookingCount} booking{onHoldBookingCount === 1 ? '' : 's'} currently on hold pending document approval.
            </div>
          )}
          <DocumentReviewCards customerId={customerId} documents={documents} hasNightVfrRating={customerProfile.has_night_vfr_rating} />
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

      {activeTab === 'log' && (
        <section>
          <h3 className="text-[11px] uppercase tracking-widest font-semibold text-[#4b6390] mb-3">Internal review history</h3>
          {[...events]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .map((ev) => (
              <div key={ev.id} className="bg-white border border-[#152d5a]/10 rounded-xl px-4 py-3 mb-2">
                <p className="text-[14px] font-semibold text-[#152d5a]">{ev.title}</p>
                {ev.body ? <p className="text-[12px] text-[#4b6390] mt-1">{ev.body}</p> : null}
                <p className="text-[11px] text-[#4b6390]/60 mt-1.5">{shortDate(ev.created_at)}</p>
              </div>
            ))}
          {events.length === 0 ? <p className="text-[12px] text-[#4b6390]">No review history yet.</p> : null}
        </section>
      )}
    </div>
  )
}
