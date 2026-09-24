'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail, Phone, Plus, Trash2, CheckCircle2 } from 'lucide-react'
import DocumentViewerModal, { type DocumentFile } from '@/components/ui/DocumentViewerModal'
import { LoadingButtonContent } from '@/components/ui/Spinner'
import { formatDateTime } from '@/lib/formatDateTime'
import { approvePostFlightReview, requestPostFlightClarification } from '@/app/actions/admin-booking'
import { CLARIFICATION_CATEGORY_LABELS, type ClarificationCategory } from '@/lib/supabase/booking-types'
import { calculateBookingDays } from '@/lib/booking/standard-booking-billing'
import AirportSelect from '@/components/ui/AirportSelect'

const CATEGORY_ICONS: Record<string, string> = {
  missing_evidence: 'photo_camera',
  unreadable_image: 'image_not_supported',
  meter_reading_mismatch: 'speed',
  missing_field_values: 'edit_note',
  fuel_or_oil_detail_unclear: 'local_gas_station',
  landings_unclear: 'flight_land',
  other: 'help_outline',
}

export type EvidenceAttachment = {
  id: string
  file_name: string
  signedUrl: string
  file_size?: number | null
  created_at?: string
}

export type LandingRowItem = {
  airportId: string
  airportName?: string
  icaoCode?: string
  landingCount: number
  rateCents: number
  totalCents: number
}

export type AvailableAirport = {
  id: string
  icao_code: string
  name: string
  default_landing_fee_cents?: number
}

export type BlockTimeBookingDetails = {
  packageId: string
  packageName: string
  hoursBefore: number
  hoursDeducted: number
  hoursRemaining: number
  overageHours: number
  overageAmountCents: number
  hoursPurchased?: number
}

type Props = {
  flightRecordId: string
  bookingId: string
  customerId: string
  bookingRef: string
  customerName: string
  customerEmail: string
  customerPhone: string
  picArn?: string | null
  flightDate: string
  scheduledStartStr: string
  scheduledEndStr: string
  scheduledStartISO?: string | null
  scheduledEndISO?: string | null
  customerNotes?: string | null
  aircraftReg: string
  aircraftType: string
  currentStatus: string
  // Meters
  vdoStart?: number | null
  vdoStop?: number | null
  vdoTotal?: number | null
  vdoBaseline?: number | null
  airSwitchStart?: number | null
  airSwitchStop?: number | null
  airSwitchTotal?: number | null
  airSwitchBaseline?: number | null
  hourlyRate: number
  standardHourlyRate?: number
  // Landings & Airports
  availableAirports?: AvailableAirport[]
  landingItems: LandingRowItem[]
  // Invoices & Charges
  flightChargeCents: number
  landingSubtotalCents: number
  creditAppliedCents: number
  subtotalCents: number
  gstCents: number
  totalAmountCents: number
  invoiceNumber?: string | null
  // Payment Proof
  paymentMethod: string
  stripePaymentIntentId?: string | null
  bankReference?: string | null
  bankReceiptSignedUrl?: string | null
  bankReceiptFilename?: string | null
  bankSubmittedAt?: string | null
  // Attachments
  evidenceAttachments: EvidenceAttachment[]
  // Clarification
  clarificationCategory?: string | null
  clarificationMessage?: string | null
  // Multi-day & Upfront Paid
  bookingSlotHours?: number
  upfrontPaidCents?: number
  hasBankTransfer?: boolean
  hasStripePayment?: boolean
  isSplitPayment?: boolean
  bankTransferPaidCents?: number
  cardPaidCents?: number
  stripeGrossChargedCents?: number
  // Block Time
  blockTimeDetails?: BlockTimeBookingDetails | null
}

const CATEGORIES = Object.entries(CLARIFICATION_CATEGORY_LABELS) as [ClarificationCategory, string][]

export default function PostFlightVerificationConsole({
  flightRecordId,
  bookingId,
  customerId,
  bookingRef,
  customerName,
  customerEmail,
  customerPhone,
  picArn,
  flightDate,
  scheduledStartStr,
  scheduledEndStr,
  scheduledStartISO,
  scheduledEndISO,
  bookingSlotHours,
  upfrontPaidCents,
  hasBankTransfer = false,
  hasStripePayment = false,
  isSplitPayment = false,
  bankTransferPaidCents = 0,
  cardPaidCents = 0,
  stripeGrossChargedCents = 0,
  customerNotes,
  aircraftReg,
  aircraftType,
  currentStatus,
  vdoStart,
  vdoStop,
  vdoTotal,
  vdoBaseline,
  airSwitchStart,
  airSwitchStop,
  airSwitchTotal,
  airSwitchBaseline,
  hourlyRate,
  standardHourlyRate,
  availableAirports = [],
  landingItems,
  creditAppliedCents,
  invoiceNumber,
  paymentMethod,
  stripePaymentIntentId,
  bankReference,
  bankReceiptSignedUrl,
  bankReceiptFilename,
  bankSubmittedAt,
  evidenceAttachments,
  clarificationCategory,
  clarificationMessage,
  blockTimeDetails = null,
}: Props) {
  const router = useRouter()
  const [evidenceViewerOpen, setEvidenceViewerOpen] = useState(false)
  const [bankReceiptViewerOpen, setBankReceiptViewerOpen] = useState(false)
  const [activeDecision, setActiveDecision] = useState<'approve' | 'clarify'>('approve')
  const [approvalMode, setApprovalMode] = useState<'standard' | 'correction'>('standard')
  const [correctionReason, setCorrectionReason] = useState('')
  const [overrideConfirmed, setOverrideConfirmed] = useState(false)

  // Interactive Meter & Landing Editing state (Always directly editable)
  const [editedVdoTotal, setEditedVdoTotal] = useState<string>(
    vdoTotal != null ? String(vdoTotal) : ''
  )
  const [editedAirSwitchTotal, setEditedAirSwitchTotal] = useState<string>(
    airSwitchTotal != null ? String(airSwitchTotal) : ''
  )
  const [editedLandings, setEditedLandings] = useState<
    Array<{ airportId: string; landingCount: string | number }>
  >(
    landingItems.length > 0
      ? landingItems.map((item) => ({
          airportId: item.airportId,
          landingCount: item.landingCount,
        }))
      : availableAirports.length > 0
      ? [{ airportId: availableAirports[0].id, landingCount: 1 }]
      : []
  )

  // Clarification form state
  const [clarifyCategory, setClarifyCategory] = useState<ClarificationCategory | ''>('')
  const [clarifyMessage, setClarifyMessage] = useState('')
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false)
  const categoryDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setCategoryDropdownOpen(false)
      }
    }
    if (categoryDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [categoryDropdownOpen])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const isAwaitingCustomer = currentStatus === 'needs_clarification'
  const isSettled = currentStatus === 'approved' || currentStatus === 'approved_with_correction'

  // Live calculation based on current editable values
  const currentVdoNum = editedVdoTotal ? Number(editedVdoTotal) : (vdoTotal ?? 0)
  const currentAirSwitchNum = editedAirSwitchTotal ? Number(editedAirSwitchTotal) : (airSwitchTotal ?? null)

  // Multi-day booking minimum policy calculations
  const bookingDays = calculateBookingDays({
    scheduledStart: scheduledStartISO || scheduledStartStr,
    scheduledEnd: scheduledEndISO || scheduledEndStr,
    bookingSlotHours,
  })
  const minimumVdoHours = bookingDays * 4
  const isMultiDayBooking = bookingDays > 0
  const isBelowMinimum = isMultiDayBooking && currentVdoNum < minimumVdoHours
  const effectiveUpfrontPaidCents = upfrontPaidCents ?? 0

  const calculatedLandings = editedLandings
    .map((el) => {
      const apt = availableAirports.find((a) => a.id === el.airportId)
      const existing = landingItems.find((l) => l.airportId === el.airportId)
      const count = Number(el.landingCount) || 0
      const rateCents = apt?.default_landing_fee_cents ?? existing?.rateCents ?? 2895
      return {
        airportId: el.airportId,
        icaoCode: apt?.icao_code ?? existing?.icaoCode ?? 'YSBK',
        airportName: apt?.name ?? existing?.airportName ?? 'Airport',
        landingCount: count,
        rateCents,
        totalCents: count * rateCents,
      }
    })
    .filter((cl) => cl.landingCount > 0)

  const isBlockTime = Boolean(blockTimeDetails)
  const initialPackageHours = blockTimeDetails
    ? (blockTimeDetails.hoursBefore > 0
        ? blockTimeDetails.hoursBefore
        : (blockTimeDetails.hoursDeducted + blockTimeDetails.hoursRemaining))
    : 0

  const effectiveStandardRate = standardHourlyRate && standardHourlyRate >= 290 ? standardHourlyRate : 330
  const formattedStandardHourlyRate = `$${effectiveStandardRate.toFixed(2)} AUD/hr`

  const blockHoursDeducted = isBlockTime
    ? Math.min(currentVdoNum, initialPackageHours)
    : 0
  const blockHoursRemainingAfter = isBlockTime
    ? Math.max(0, Math.round((initialPackageHours - blockHoursDeducted) * 10) / 10)
    : 0
  const blockOverageHours = isBlockTime
    ? Math.max(0, Math.round((currentVdoNum - initialPackageHours) * 10) / 10)
    : 0
  const blockOverageAmountCents = isBlockTime
    ? Math.round(blockOverageHours * effectiveStandardRate * 100)
    : 0

  const currentFlightChargeCents = isBlockTime
    ? blockOverageAmountCents
    : Math.round(currentVdoNum * hourlyRate * 100)
  const currentLandingSubtotalCents = calculatedLandings.reduce((sum, item) => sum + item.totalCents, 0)
  const currentSubtotalCents = currentFlightChargeCents + currentLandingSubtotalCents - creditAppliedCents
  const currentTotalAmountCents = Math.max(0, currentSubtotalCents)

  const remainingBalanceCents = Math.max(0, currentTotalAmountCents - effectiveUpfrontPaidCents)
  const formattedDifference = (remainingBalanceCents / 100).toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
  })

  const isModifiedFromInitial =
    (vdoTotal != null && Number(editedVdoTotal) !== vdoTotal) ||
    (airSwitchTotal != null && Number(editedAirSwitchTotal) !== airSwitchTotal) ||
    editedLandings.length !== landingItems.length

  const evidenceFiles: DocumentFile[] = evidenceAttachments.map((att) => ({
    url: att.signedUrl,
    name: att.file_name,
  }))

  const receiptFiles: DocumentFile[] = bankReceiptSignedUrl
    ? [
        {
          url: bankReceiptSignedUrl,
          name: bankReceiptFilename || 'Bank_Transfer_Receipt',
        },
      ]
    : []

  const formattedHourlyRate = hourlyRate.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
  })

  const formattedTotal = (currentTotalAmountCents / 100).toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
  })

  function handleAddLandingRow() {
    const defaultApt = availableAirports[0]?.id || ''
    setEditedLandings((prev) => [...prev, { airportId: defaultApt, landingCount: 1 }])
  }

  function handleRemoveLandingRow(idx: number) {
    setEditedLandings((prev) => prev.filter((_, i) => i !== idx))
  }

  function handleUpdateLandingAirport(idx: number, airportId: string) {
    setEditedLandings((prev) => {
      const copy = [...prev]
      copy[idx] = { ...copy[idx], airportId }
      return copy
    })
  }

  function handleUpdateLandingCount(idx: number, landingCount: string) {
    setEditedLandings((prev) => {
      const copy = [...prev]
      copy[idx] = { ...copy[idx], landingCount }
      return copy
    })
  }

  async function handleApprove(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    const isCorrection = approvalMode === 'correction' || isModifiedFromInitial || isAwaitingCustomer || overrideConfirmed

    if (isCorrection && approvalMode === 'correction' && !correctionReason.trim() && !isAwaitingCustomer && !overrideConfirmed) {
      setError('A correction reason is required when approving with correction override.')
      setLoading(false)
      return
    }

    try {
      await approvePostFlightReview({
        flight_record_id: flightRecordId,
        with_correction: isCorrection,
        correction_reason:
          correctionReason.trim() ||
          (overrideConfirmed
            ? 'Admin override settlement (settled immediately with verified payment).'
            : isModifiedFromInitial
            ? 'Admin verified and adjusted flight meter / landing values.'
            : isAwaitingCustomer
            ? 'Admin override settlement (customer settled via direct transfer or phone).'
            : null),
        allow_override: isAwaitingCustomer || overrideConfirmed,
        vdo_total: currentVdoNum,
        air_switch_total: currentAirSwitchNum ?? undefined,
        landing_rows: editedLandings.map((l) => ({ airport_id: l.airportId, landing_count: l.landingCount })),
      })
      setSuccess('Post-flight readings, invoice settlement, and payment verified successfully.')
      setLoading(false)
      router.refresh()
    } catch (err: unknown) {
      console.error(err)
      setError(err instanceof Error ? err.message.replace(/^VALIDATION: /, '') : 'Failed to approve review.')
      setLoading(false)
    }
  }

  async function handleEnforceAndRequestPayment(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    const defaultMsg =
      isMultiDayBooking && currentVdoNum === minimumVdoHours
        ? `Under our multi-day booking policy (4h/day minimum), this ${bookingDays}-day rental requires a minimum of ${minimumVdoHours.toFixed(
            1
          )} VDO flight hours. Your flight record has been updated to ${minimumVdoHours.toFixed(
            1
          )} hours (${formattedTotal}). As $${(effectiveUpfrontPaidCents / 100).toFixed(
            2
          )} was paid upfront, the remaining balance of ${formattedDifference} is now due. Please settle via the pilot portal or direct bank transfer.`
        : `Your flight record has been updated to ${currentVdoNum.toFixed(1)} VDO flight hours (${formattedTotal}). As $${(effectiveUpfrontPaidCents / 100).toFixed(
            2
          )} was paid upfront, the remaining balance of ${formattedDifference} is now due. Please settle via the pilot portal or direct bank transfer.`

    const finalMsg = correctionReason.trim()
      ? `${defaultMsg}\n\nAdditional Admin Note: ${correctionReason.trim()}`
      : defaultMsg

    try {
      await requestPostFlightClarification({
        flightRecordId,
        bookingId,
        customerId,
        category: isMultiDayBooking && currentVdoNum === minimumVdoHours
          ? 'Multi-Day Rental Minimum Billing Policy'
          : CLARIFICATION_CATEGORY_LABELS['meter_reading_mismatch'],
        message: finalMsg,
        vdo_total: currentVdoNum,
        preserve_actual_meters: isMultiDayBooking && currentVdoNum === minimumVdoHours,
        air_switch_total: currentAirSwitchNum ?? undefined,
        landing_rows: editedLandings.map((l) => ({ airport_id: l.airportId, landing_count: l.landingCount })),
      })
      setSuccess('Clarification request with updated billing and email notification sent to customer.')
      setLoading(false)
      router.refresh()
    } catch (err: unknown) {
      console.error(err)
      setError(err instanceof Error ? err.message.replace(/^VALIDATION: /, '') : 'Failed to request payment clarification.')
      setLoading(false)
    }
  }

  async function handleClarify(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const resolvedCategory = clarifyCategory ? CLARIFICATION_CATEGORY_LABELS[clarifyCategory] : 'General Clarification'
      const resolvedMessage = clarifyMessage.trim() || 'Please review your post-flight record and update any necessary details.'

      await requestPostFlightClarification({
        flightRecordId,
        bookingId,
        customerId,
        category: resolvedCategory,
        message: resolvedMessage,
        vdo_total: currentVdoNum,
        air_switch_total: currentAirSwitchNum ?? undefined,
        landing_rows: editedLandings.map((l) => ({ airport_id: l.airportId, landing_count: l.landingCount })),
      })
      setSuccess('Clarification request, updated invoice calculations, and email notification sent to customer.')
      setLoading(false)
      router.refresh()
    } catch (err: unknown) {
      console.error(err)
      setError(err instanceof Error ? err.message.replace(/^VALIDATION: /, '') : 'Failed to request clarification.')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-[1320px] mx-auto p-3 sm:p-6 lg:p-8 pt-16 sm:pt-16 lg:pt-8 space-y-4 sm:space-y-6">
      {/* ── Top Hero matching customer billing dark navy aesthetic ────────────── */}
      <section
        className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-[#0d1b3e] p-4 sm:p-6 md:p-8 text-white shadow-xl border border-blue-900/40"
        style={{
          backgroundImage: 'url(/optimized/pricing-hero-1400.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center 40%',
        }}
      >
        {/* Subtle dark gradient overlay to keep text ultra-sharp */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a1633]/95 via-[#0d1b3e]/85 to-[#152d5a]/90" />

        <div className="relative z-10 space-y-4 sm:space-y-5">
          {/* Top navigation row */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
            <Link
              href="/admin/bookings"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-xs font-medium transition-colors border border-white/15"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              Back to Bookings
            </Link>

            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold text-blue-200 bg-white/10 px-2.5 sm:px-3 py-1.5 rounded-xl border border-white/15">
                Ref: {bookingRef}
              </span>
              {customerId && (
                <Link
                  href={`/admin/users/${customerId}`}
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors border border-white/15"
                >
                  <span className="material-symbols-outlined text-[14px]">person</span>
                  Customer Profile
                </Link>
              )}
            </div>
          </div>

          {/* Main Hero Title & Status Row */}
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 pt-1">
            <div className="space-y-1">
              <div className="text-[11px] font-semibold tracking-[0.2em] uppercase font-sans text-blue-300">
                Post-Flight Review &amp; Verification
              </div>
              <h1
                className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-white tracking-tight break-words"
                style={{ fontFamily: 'Newsreader, Georgia, serif' }}
              >
                Flight &amp; Payment Review &mdash; {aircraftReg}
              </h1>
              <p className="text-xs sm:text-sm text-white/80 max-w-2xl leading-relaxed">
                Verify submitted flight meters, evidence photos, airport landings, and upfront payment to settle this booking.
              </p>
            </div>

            {/* Status Pill */}
            <div className="flex-shrink-0 self-start md:self-auto">
              {isSettled ? (
                <div className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full border border-emerald-400/50 bg-emerald-400/20 text-emerald-200 text-xs font-bold uppercase tracking-wider shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Approved &amp; Settled
                </div>
              ) : isAwaitingCustomer ? (
                <div className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full border border-amber-400/50 bg-amber-400/20 text-amber-200 text-xs font-bold uppercase tracking-wider shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                  Clarification Requested
                </div>
              ) : currentStatus === 'resubmitted' ? (
                <div className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full border border-emerald-400/50 bg-emerald-400/20 text-emerald-200 text-xs font-bold uppercase tracking-wider shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Resubmitted &mdash; Under Review
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full border border-amber-400/50 bg-amber-400/20 text-amber-200 text-xs font-bold uppercase tracking-wider shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                  Payment Verification Required
                </div>
              )}
            </div>
          </div>

          {/* Quick Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 pt-3 border-t border-white/10 text-xs">
            <div>
              <span className="text-[10px] text-blue-200 uppercase font-semibold block">Aircraft</span>
              <span className="font-bold text-white text-xs sm:text-sm break-words">
                {aircraftReg} ({aircraftType})
              </span>
            </div>
            <div>
              <span className="text-[10px] text-blue-200 uppercase font-semibold block">Pilot in Command</span>
              <span className="font-bold text-white text-xs sm:text-sm break-words">{customerName}</span>
            </div>
            <div>
              <span className="text-[10px] text-blue-200 uppercase font-semibold block">Flight Hours</span>
              <span className="font-bold text-white text-xs sm:text-sm">
                {currentVdoNum ? `${currentVdoNum.toFixed(1)} hrs` : '0.0 hrs'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-blue-200 uppercase font-semibold block">Total Settlement</span>
              <span className="font-bold text-emerald-300 text-xs sm:text-sm">{formattedTotal}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Clarification Banner (if awaiting customer) ─────────────────────── */}
      {isAwaitingCustomer && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm flex items-start gap-3.5">
          <span className="material-symbols-outlined text-amber-600 text-2xl flex-shrink-0 mt-0.5">
            hourglass_empty
          </span>
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-amber-900">
                Clarification Requested &mdash; Awaiting Customer Response
              </h3>
              {clarificationCategory && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-200/70 text-amber-900 border border-amber-300">
                  {clarificationCategory}
                </span>
              )}
            </div>
            {clarificationMessage && (
              <div className="p-3.5 bg-white rounded-xl border border-amber-200/80 text-xs text-slate-800 font-medium leading-relaxed shadow-sm">
                <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider block mb-1">
                  Clarification Note Sent to Customer:
                </span>
                &ldquo;{clarificationMessage}&rdquo;
              </div>
            )}
            <p className="text-xs text-amber-700 leading-relaxed">
              Customer can log into their portal to update records and pay any difference. As admin, you can also check the{' '}
              <strong>Override &amp; Settle</strong> checkbox below if the customer settled directly via phone or bank transfer.
            </p>
          </div>
        </div>
      )}

      {/* Global Alerts */}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 flex items-center gap-2.5 shadow-sm">
          <span className="material-symbols-outlined text-rose-600 text-base">error</span>
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 flex items-center gap-2.5 shadow-sm">
          <span className="material-symbols-outlined text-emerald-600 text-base">check_circle</span>
          <span>{success}</span>
        </div>
      )}

      {/* ── Section 1: Flight & Pilot Overview ──────────────────────────────── */}
      <div className="rounded-2xl md:rounded-3xl border border-[var(--admin-border)] bg-white p-4 sm:p-6 md:p-7 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-4 sm:space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-[#1a4fd6]">
              <span className="material-symbols-outlined text-lg">flight_takeoff</span>
            </span>
            <h2 className="text-base font-bold text-slate-900">Flight &amp; Pilot Overview</h2>
          </div>
          <span className="text-xs font-mono font-medium text-slate-500 bg-slate-50 px-3 py-1 rounded-lg border border-slate-200/80 self-start sm:self-auto">
            Flight Date: {flightDate}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5 text-xs">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Pilot in Command</p>
            <p className="font-bold text-slate-900 text-sm break-words">{customerName}</p>
            {picArn && <p className="text-[11px] font-mono text-slate-500 mt-0.5">ARN: {picArn}</p>}
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Customer Contact</p>
            <div className="space-y-1 mt-0.5">
              {customerEmail && customerEmail !== '—' ? (
                <div>
                  <a
                    href={`mailto:${customerEmail}`}
                    title={`Email ${customerName} (${customerEmail})`}
                    aria-label={`Email ${customerName} at ${customerEmail}`}
                    className="group/email inline-flex max-w-full items-center gap-1.5 text-xs text-slate-700 transition-colors hover:text-[#1a4fd6] break-all"
                  >
                    <Mail className="h-3.5 w-3.5 shrink-0 text-[#D97706] transition-colors group-hover/email:text-[#b45309]" />
                    <span className="truncate underline decoration-slate-300 underline-offset-2 group-hover/email:decoration-current font-medium">
                      {customerEmail}
                    </span>
                  </a>
                </div>
              ) : (
                <p className="text-slate-400 text-xs">No email</p>
              )}
              {customerPhone && customerPhone !== '—' ? (
                <div>
                  <a
                    href={`tel:${customerPhone.replace(/[^\d+]/g, '')}`}
                    title={`Call ${customerName} (${customerPhone})`}
                    aria-label={`Call ${customerName} at ${customerPhone}`}
                    className="group/call inline-flex max-w-full items-center gap-1.5 text-xs text-slate-700 transition-colors hover:text-[#1a4fd6]"
                  >
                    <Phone className="h-3.5 w-3.5 shrink-0 text-[#0284C7] transition-colors group-hover/call:text-[#0369a1]" />
                    <span className="break-words underline decoration-slate-300 underline-offset-2 group-hover/call:decoration-current font-medium">
                      {customerPhone}
                    </span>
                  </a>
                </div>
              ) : (
                <p className="text-slate-400 text-xs">No phone</p>
              )}
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Aircraft &amp; Rate</p>
            <p className="font-bold text-slate-900 text-sm break-words">{aircraftReg}</p>
            <p className="text-slate-500 mt-0.5">
              {aircraftType} &middot; {formattedHourlyRate}/hr
            </p>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Scheduled Window</p>
            <p className="font-medium text-slate-900 font-mono text-[11px] sm:text-xs break-words">{scheduledStartStr}</p>
            <p className="text-slate-500 font-mono text-[11px] sm:text-xs break-words mt-0.5">to {scheduledEndStr}</p>
          </div>
        </div>

        {customerNotes && (
          <div className="rounded-xl bg-slate-50 p-3.5 sm:p-4 border border-slate-200/70">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Pilot Remarks</p>
            <p className="text-xs text-slate-800 italic">&ldquo;{customerNotes}&rdquo;</p>
          </div>
        )}
      </div>

      {/* ── Section 2: Interactive Flight Meter Readings (Always Editable) ──────── */}
      <div className="rounded-2xl md:rounded-3xl border border-[var(--admin-border)] bg-white p-4 sm:p-6 md:p-7 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-4 sm:space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-[#1a4fd6]">
              <span className="material-symbols-outlined text-lg">speed</span>
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">Flight Meter Readings</h2>
              <p className="text-[11px] text-slate-500">
                Meter values are directly editable to verify, correct, or update billing
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[#1a4fd6] bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200">
              Rate: {formattedHourlyRate}/hr
            </span>

            {/* Evidence Photos Button */}
            {evidenceAttachments.length > 0 ? (
              <button
                type="button"
                onClick={() => setEvidenceViewerOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a4fd6] hover:bg-[#152d5a] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all"
              >
                <span className="material-symbols-outlined text-base">photo_camera</span>
                View Evidence ({evidenceAttachments.length})
              </button>
            ) : (
              <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1.5 rounded-xl">
                No Evidence Photos
              </span>
            )}
          </div>
        </div>

        {/* ── Multi-Day Rental Minimum Billing Decision ──────────────────────── */}
        {isMultiDayBooking && (
          <div
            className={`rounded-2xl border p-3.5 sm:p-5 transition-all ${
              isBelowMinimum
                ? 'border-amber-300 bg-amber-50/80 text-amber-950'
                : 'border-blue-200 bg-blue-50/50 text-blue-950'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex items-start gap-3">
                <span
                  className={`material-symbols-outlined text-2xl flex-shrink-0 mt-0.5 ${
                    isBelowMinimum ? 'text-amber-600' : 'text-blue-600'
                  }`}
                >
                  {isBelowMinimum ? 'schedule' : 'verified'}
                </span>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold">
                      Multi-Day Rental Minimum Billing Policy (4h/day minimum)
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${
                        isBelowMinimum
                          ? 'bg-amber-200 text-amber-900 border border-amber-300'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      }`}
                    >
                      {bookingDays} Day{bookingDays > 1 ? 's' : ''} &middot; {minimumVdoHours.toFixed(1)}h Minimum
                    </span>
                  </div>
                  <p className="text-xs opacity-90 leading-relaxed">
                    This booking spans {bookingDays} day{bookingDays > 1 ? 's' : ''}{' '}
                    {bookingSlotHours ? `(${bookingSlotHours.toFixed(0)}h scheduled)` : ''}. The standard policy
                    requires a minimum of 4.0 VDO flight hours per day (
                    <strong>{minimumVdoHours.toFixed(1)} hrs total minimum</strong>).
                  </p>
                  <p className="text-xs font-medium">
                    Customer submitted:{' '}
                    <strong>
                      {vdoTotal != null ? Number(vdoTotal).toFixed(1) : currentVdoNum.toFixed(1)} hrs
                    </strong>
                    {vdoTotal != null && Number(vdoTotal) < minimumVdoHours && (
                      <span className="text-amber-700 ml-1.5 font-bold">
                        ({(minimumVdoHours - Number(vdoTotal)).toFixed(1)}h below 4h/day minimum)
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Action Buttons for Admin Decision */}
              <div className="flex flex-col sm:flex-col gap-2 shrink-0 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setEditedVdoTotal(minimumVdoHours.toFixed(1))}
                  className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                    Number(editedVdoTotal) === minimumVdoHours
                      ? 'bg-[#1a4fd6] text-white ring-2 ring-blue-400'
                      : 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">balance</span>
                  Enforce Minimum ({minimumVdoHours.toFixed(1)} hrs)
                </button>

                <button
                  type="button"
                  onClick={() => setEditedVdoTotal(vdoTotal != null ? String(vdoTotal) : String(currentVdoNum))}
                  className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                    Number(editedVdoTotal) === (vdoTotal ?? 0) && (vdoTotal ?? 0) !== minimumVdoHours
                      ? 'bg-[#1a4fd6] text-white ring-2 ring-blue-400'
                      : 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">speed</span>
                  Bill Actual Flown ({vdoTotal != null ? Number(vdoTotal).toFixed(1) : currentVdoNum.toFixed(1)} hrs)
                </button>
              </div>
            </div>

            {/* If minimum enforced and difference exists */}
            {Number(editedVdoTotal) === minimumVdoHours && isBelowMinimum && remainingBalanceCents > 0 && (
              <div className="mt-3 pt-3 border-t border-amber-200/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 text-xs">
                <div className="text-amber-900">
                  <span>
                    Minimum {minimumVdoHours.toFixed(1)}h enforced: Total is{' '}
                    <strong>{formattedTotal}</strong>. Customer upfront payment on file is{' '}
                    <strong>
                      {(effectiveUpfrontPaidCents / 100).toLocaleString('en-AU', {
                        style: 'currency',
                        currency: 'AUD',
                      })}
                    </strong>
                    . Remaining payment required: <strong>{formattedDifference}</strong>.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveDecision('clarify')
                    setClarifyCategory('meter_reading_mismatch')
                    setClarifyMessage(
                      `Under our multi-day booking policy (4h/day minimum), this ${bookingDays}-day rental requires a minimum of ${minimumVdoHours.toFixed(
                        1
                      )} VDO flight hours. Your flight record has been updated to ${minimumVdoHours.toFixed(
                        1
                      )} hours (${formattedTotal}). As $${(effectiveUpfrontPaidCents / 100).toFixed(
                        2
                      )} was paid upfront, the remaining balance of ${formattedDifference} is now due. Please settle via the pilot portal or direct bank transfer.`
                    )
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 shadow-sm w-full sm:w-auto"
                >
                  <span className="material-symbols-outlined text-sm">forward_to_inbox</span>
                  Request Remaining Payment ({formattedDifference}) via Clarification
                </button>
              </div>
            )}
          </div>
        )}

        {/* Meter Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* VDO Card */}
          <div className="rounded-2xl border border-blue-200 bg-blue-50/30 p-5 flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">VDO (Engine / Billing Meter)</span>
                <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                  Billed
                </span>
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] font-bold text-slate-600 block">VDO Total Hours:</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={editedVdoTotal}
                  onChange={(e) => setEditedVdoTotal(e.target.value)}
                  className="w-full rounded-xl border border-blue-300 bg-white p-2.5 text-sm font-bold text-slate-900 focus:border-[#1a4fd6] focus:outline-none"
                  placeholder="e.g. 3.5"
                />
                <span className="text-xs font-bold text-slate-600">hrs</span>
              </div>
            </div>
          </div>

          {/* Air Switch Card */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">Air Switch (Flight Meter / Log Count)</span>
                <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                  Flight Log
                </span>
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] font-bold text-slate-600 block">Air Switch Count:</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={editedAirSwitchTotal}
                  onChange={(e) => setEditedAirSwitchTotal(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm font-bold text-slate-900 focus:border-[#1a4fd6] focus:outline-none"
                  placeholder="e.g. 3"
                />
                <span className="text-xs font-bold text-slate-600">count</span>
              </div>
            </div>
          </div>
        </div>

        {/* Evidence Photos Thumbnail Bar */}
        {evidenceAttachments.length > 0 && (
          <div className="pt-2">
            <p className="text-[10px] uppercase font-bold text-slate-400 mb-2">Submitted Evidence Photos</p>
            <div className="flex flex-wrap gap-3">
              {evidenceAttachments.map((att, idx) => (
                <button
                  key={att.id || idx}
                  type="button"
                  onClick={() => setEvidenceViewerOpen(true)}
                  className="group relative flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-blue-50/60 hover:border-blue-300 p-2 text-left transition-all"
                >
                  <div className="h-10 w-10 overflow-hidden rounded-lg bg-slate-200 flex-shrink-0 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={att.signedUrl}
                      alt={att.file_name}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-semibold text-slate-800 truncate max-w-[140px]">{att.file_name}</p>
                    <p className="text-[10px] text-slate-400">Click to enlarge</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Section 3: Declared Airport Landings (Always Editable & Parallel) ───── */}
      <div className="rounded-2xl md:rounded-3xl border border-[var(--admin-border)] bg-white p-4 sm:p-6 md:p-7 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-[#1a4fd6]">
              <span className="material-symbols-outlined text-lg">connecting_airports</span>
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">Declared Airport Landings</h2>
              <p className="text-[11px] text-slate-500">Airports and landing counts declared by renter</p>
            </div>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleAddLandingRow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#1a4fd6] text-xs font-bold transition-all border border-blue-200"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Airport
            </button>
            <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-full">
              Subtotal: ${(currentLandingSubtotalCents / 100).toFixed(2)}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {editedLandings.length > 0 ? (
            editedLandings.map((row, idx) => (
              <div
                key={idx}
                className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 rounded-xl bg-slate-50 p-3 sm:p-3.5 border border-slate-200 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-800 text-[11px] font-bold flex-shrink-0">
                    {idx + 1}
                  </span>

                  <div className="flex-1 min-w-0">
                    <AirportSelect
                      value={row.airportId}
                      onChange={(val) => handleUpdateLandingAirport(idx, val)}
                      options={availableAirports}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-start gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60 sm:border-transparent pl-8 sm:pl-0">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={row.landingCount}
                      onChange={(e) => handleUpdateLandingCount(idx, e.target.value)}
                      className="w-16 sm:w-20 rounded-xl border border-slate-300 bg-white p-2 sm:p-2.5 text-xs font-bold text-slate-900 text-center focus:border-[#1a4fd6] focus:outline-none"
                    />
                    <span className="text-slate-500 text-xs">landings</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveLandingRow(idx)}
                    className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors ml-auto sm:ml-0"
                    title="Remove Airport Landing Row"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-500 italic p-3">No airport landings declared for this flight.</p>
          )}
        </div>
      </div>

      {/* ── Section 4: Payment Verification Proof ──────────────────────────── */}
      <div className="rounded-2xl md:rounded-3xl border border-[var(--admin-border)] bg-white p-4 sm:p-6 md:p-7 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-4 sm:space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <span className="material-symbols-outlined text-lg">receipt_long</span>
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">Payment Verification Proof</h2>
              <p className="text-[11px] text-slate-500">Upfront payment details and transaction proof</p>
            </div>
          </div>
          {isSettled ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3.5 py-1 text-xs font-bold text-emerald-800 self-start sm:self-auto">
              <span className="material-symbols-outlined text-sm text-emerald-600">check_circle</span>
              Payment Verified &amp; Settled
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3.5 py-1 text-xs font-bold text-amber-800 self-start sm:self-auto">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              Payment Verification Required
            </span>
          )}
        </div>

        {isSplitPayment ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200 gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-[#1a4fd6]">
                  <span className="material-symbols-outlined text-sm">call_split</span>
                </span>
                <span className="font-bold text-slate-800 text-xs">
                  Split Payment Settlement (2 Separate Transactions Verified)
                </span>
              </div>
              <span className="text-xs font-semibold text-slate-600">
                Total Covered: <strong className="text-emerald-700 font-bold">${((bankTransferPaidCents + cardPaidCents) / 100).toFixed(2)} AUD</strong>
              </span>
            </div>

            {/* Transaction 1: Stripe Online Card Payment (Initial Upfront) */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-emerald-50/60 p-4 border border-emerald-200 gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shrink-0">
                  <span className="material-symbols-outlined text-xl">credit_card</span>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-bold text-slate-900">1. Stripe Online Card Payment</p>
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                      Initial Upfront Payment
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Online Card Payment (Stripe Verified)
                  </p>
                </div>
              </div>
              <div className="text-left sm:text-right pt-2 sm:pt-0 border-t sm:border-t-0 border-emerald-200/60 sm:border-transparent">
                <p className="text-base font-bold text-emerald-800 tabular-nums">
                  ${(cardPaidCents / 100).toFixed(2)}
                </p>
                <p className="text-[10px] uppercase font-bold text-emerald-700">Online Paid via Stripe</p>
              </div>
            </div>

            {/* Transaction 2: NAB Direct Bank Transfer (Remaining Balance) */}
            <div className="space-y-3 rounded-2xl bg-blue-50/50 p-4 border border-blue-200/80">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1a4fd6] text-white shrink-0">
                    <span className="material-symbols-outlined text-xl">account_balance</span>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold text-slate-900">2. NAB Direct Bank Transfer</p>
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-100/90 px-2 py-0.5 rounded-md">
                        Remaining Balance Settlement
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 font-mono break-all sm:break-normal">
                      BSB: 085-005 &middot; Acc: 388004197 (JAM Aviation PTY LTD)
                    </p>
                  </div>
                </div>

                <div className="text-left sm:text-right pt-2 sm:pt-0 border-t sm:border-t-0 border-blue-200/60 sm:border-transparent">
                  <p className="text-base font-bold text-[#1a4fd6] tabular-nums">
                    ${(bankTransferPaidCents / 100).toFixed(2)}
                  </p>
                  <p className="text-[10px] uppercase font-bold text-blue-700">
                    {isSettled ? 'Verified & Settled' : 'Proof Uploaded (Pending Admin Verification)'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-slate-200/80 bg-white p-3">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Payment Reference</span>
                  <span className="font-mono font-bold text-slate-900 text-sm break-all">{bankReference || '—'}</span>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white p-3">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                    Submitted Timestamp
                  </span>
                  <span className="font-medium text-slate-800 break-words">
                    {bankSubmittedAt ? formatDateTime(bankSubmittedAt) : '—'}
                  </span>
                </div>
              </div>

              {bankReceiptSignedUrl ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setBankReceiptViewerOpen(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/80 p-3.5 text-xs font-bold text-[#1a4fd6] transition-all hover:border-[#1a4fd6] hover:bg-blue-100/60 text-center"
                  >
                    <span className="material-symbols-outlined text-lg">open_in_new</span>
                    View Uploaded Bank Transfer Receipt Document ({bankReceiptFilename || 'Receipt File'})
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800">
                  No bank transfer receipt image file was attached.
                </div>
              )}
            </div>
          </div>
        ) : (hasBankTransfer || paymentMethod === 'bank_transfer') ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-blue-50/60 p-4 border border-blue-200/80 gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1a4fd6] text-white shrink-0">
                  <span className="material-symbols-outlined text-xl">account_balance</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">NAB Direct Bank Transfer</p>
                  <p className="text-[11px] text-slate-600 font-mono break-all sm:break-normal">
                    BSB: 085-005 &middot; Acc: 388004197 (JAM Aviation PTY LTD)
                  </p>
                </div>
              </div>

              <div className="text-left sm:text-right pt-2 sm:pt-0 border-t sm:border-t-0 border-blue-200/60 sm:border-transparent">
                <p className="text-base font-bold text-[#1a4fd6] tabular-nums">
                  ${((bankTransferPaidCents > 0 ? bankTransferPaidCents : effectiveUpfrontPaidCents) / 100).toFixed(2)}
                </p>
                <p className="text-[10px] uppercase font-bold text-blue-700">Proof Uploaded</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Bank Reference</span>
                <span className="font-mono font-bold text-slate-900 text-sm break-all">{bankReference || '—'}</span>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                  Submitted Timestamp
                </span>
                <span className="font-medium text-slate-800 break-words">
                  {bankSubmittedAt ? formatDateTime(bankSubmittedAt) : '—'}
                </span>
              </div>
            </div>

            {bankReceiptSignedUrl ? (
              <div>
                <button
                  type="button"
                  onClick={() => setBankReceiptViewerOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 p-4 text-xs font-bold text-[#1a4fd6] transition-all hover:border-[#1a4fd6] hover:bg-blue-50 text-center"
                >
                  <span className="material-symbols-outlined text-xl">open_in_new</span>
                  View Uploaded Bank Transfer Receipt Document ({bankReceiptFilename || 'Receipt File'})
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800">
                No bank transfer receipt image file was attached.
              </div>
            )}
          </div>
        ) : (hasStripePayment || (cardPaidCents > 0) || (effectiveUpfrontPaidCents > 0)) ? (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-emerald-50/60 p-4 border border-emerald-200 gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shrink-0">
                <span className="material-symbols-outlined text-xl">credit_card</span>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">Stripe Online Card Payment</p>
                <p className="text-[11px] text-slate-500 font-medium">
                  Online Card Payment (Stripe Verified)
                </p>
                {stripeGrossChargedCents > 0 && stripeGrossChargedCents > (cardPaidCents > 0 ? cardPaidCents : effectiveUpfrontPaidCents) && (
                  <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                    Gross Charged: ${(stripeGrossChargedCents / 100).toFixed(2)} (includes ${((stripeGrossChargedCents - (cardPaidCents > 0 ? cardPaidCents : effectiveUpfrontPaidCents)) / 100).toFixed(2)} online card processing surcharge)
                  </p>
                )}
              </div>
            </div>
            <div className="text-left sm:text-right pt-2 sm:pt-0 border-t sm:border-t-0 border-emerald-200/60 sm:border-transparent">
              <p className="text-base font-bold text-emerald-800 tabular-nums">
                ${((cardPaidCents > 0 ? cardPaidCents : effectiveUpfrontPaidCents) / 100).toFixed(2)}
              </p>
              <p className="text-[10px] uppercase font-bold text-emerald-700">Online Paid</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-amber-50/60 p-4 border border-amber-200 gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white shrink-0">
                <span className="material-symbols-outlined text-xl">pending</span>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">Awaiting Customer Payment</p>
                <p className="text-[11px] text-amber-700">
                  Customer selected online payment but checkout has not been completed.
                </p>
              </div>
            </div>
            <div className="text-left sm:text-right pt-2 sm:pt-0 border-t sm:border-t-0 border-amber-200/60 sm:border-transparent">
              <p className="text-base font-bold text-amber-800 tabular-nums">$0.00</p>
              <p className="text-[10px] uppercase font-bold text-amber-700">Payment Pending</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Section 5: Itemized Invoice Breakdown ──────────────────────────── */}
      <div className="rounded-2xl md:rounded-3xl border border-[var(--admin-border)] bg-white p-4 sm:p-6 md:p-7 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-[#1a4fd6]">
              <span className="material-symbols-outlined text-lg">calculate</span>
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">Itemized Invoice Calculation</h2>
              <p className="text-[11px] text-slate-500 font-mono">{invoiceNumber || 'INV-PENDING'}</p>
            </div>
          </div>
          <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-full self-start sm:self-auto">
            AUD Currency
          </span>
        </div>

        <div className="space-y-3 text-xs">
          {isBlockTime ? (
            <div className="space-y-2">
              <div className="flex justify-between items-center text-slate-700 bg-blue-50/70 p-3 rounded-xl border border-blue-100">
                <div className="space-y-0.5">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                    <span className="material-symbols-outlined text-sm text-[#1a4fd6]">inventory_2</span>
                    Block Time Drawdown &mdash; {blockTimeDetails?.packageName || 'Starter Block'}
                  </span>
                  <span className="text-[11px] text-slate-600 block">
                    {blockHoursDeducted.toFixed(1)}h deducted &middot; Balance: {blockHoursRemainingAfter.toFixed(1)}h remaining
                  </span>
                </div>
                <span className="font-bold text-slate-900 tabular-nums text-xs">
                  $0.00 AUD
                </span>
              </div>

              {blockOverageHours > 0 && (
                <div className="flex justify-between items-center text-amber-950 bg-amber-50/80 p-3 rounded-xl border border-amber-200">
                  <div className="space-y-0.5">
                    <span className="font-bold flex items-center gap-1.5 text-xs text-amber-900">
                      <span className="material-symbols-outlined text-sm text-amber-600">warning</span>
                      Flight Time Overage ({blockOverageHours.toFixed(1)} hrs &times; {formattedStandardHourlyRate})
                    </span>
                    <span className="text-[11px] text-amber-700 block">
                      Flown hours exceeding package balance billed at standard rate
                    </span>
                  </div>
                  <span className="font-bold tabular-nums text-xs text-amber-900">
                    ${(blockOverageAmountCents / 100).toFixed(2)} AUD
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex justify-between text-slate-700">
              <span>
                Flight Time ({currentVdoNum ? currentVdoNum.toFixed(1) : 0} hrs &times; {formattedHourlyRate}):
              </span>
              <span className="font-semibold text-slate-900 tabular-nums">
                ${(currentFlightChargeCents / 100).toFixed(2)}
              </span>
            </div>
          )}

          {currentLandingSubtotalCents > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-slate-700">
                <span>Airport Landing Fees Subtotal:</span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  ${(currentLandingSubtotalCents / 100).toFixed(2)}
                </span>
              </div>
              {calculatedLandings.map((cl, i) => (
                <div key={i} className="flex justify-between text-[11px] text-slate-500 pl-3">
                  <span>{cl.icaoCode} &middot; {cl.airportName} (${(cl.rateCents / 100).toFixed(2)} &times; {cl.landingCount})</span>
                  <span className="tabular-nums font-medium">${(cl.totalCents / 100).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          {creditAppliedCents > 0 && (
            <div className="flex justify-between text-emerald-700 font-medium">
              <span>Advance / Customer Credit Applied:</span>
              <span className="tabular-nums">-${(creditAppliedCents / 100).toFixed(2)}</span>
            </div>
          )}

          <div className="pt-3 border-t-2 border-slate-900 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1.5 sm:gap-2 text-sm font-bold text-slate-900">
            <div className="flex items-baseline gap-2">
              <span>Calculated Total Settlement:</span>
              <span className="text-[11px] text-slate-500 font-normal">(Included all GST)</span>
            </div>
            <span className="text-xl sm:text-lg text-[#1a4fd6] tabular-nums">{formattedTotal}</span>
          </div>

          {isSplitPayment ? (
            <div className="mt-3 space-y-2.5 rounded-xl bg-slate-50/90 p-3.5 sm:p-4 border border-slate-200 text-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                Payments Received on File Breakdown
              </span>
              <div className="flex justify-between items-center text-slate-700 font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-[#1a4fd6]">account_balance</span>
                  1. Initial NAB Direct Bank Transfer:
                </span>
                <span className="font-bold text-blue-700 tabular-nums">
                  ${(bankTransferPaidCents / 100).toFixed(2)} AUD
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-700 font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-emerald-600">credit_card</span>
                  2. Stripe Online Card Top-Up:
                </span>
                <span className="font-bold text-emerald-700 tabular-nums">
                  ${(cardPaidCents / 100).toFixed(2)} AUD
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-slate-900 font-bold">
                <span>Total Upfront &amp; Online Payments:</span>
                <span className="text-emerald-800 tabular-nums font-bold">
                  ${(effectiveUpfrontPaidCents / 100).toFixed(2)} AUD
                </span>
              </div>
            </div>
          ) : effectiveUpfrontPaidCents > 0 ? (
            <div className="flex justify-between items-center text-slate-600 font-medium pt-1">
              <span>Customer Payment on File ({hasBankTransfer || paymentMethod === 'bank_transfer' ? 'NAB Bank Transfer' : 'Stripe Card'}):</span>
              <span className="tabular-nums text-emerald-700 font-bold">
                ${(effectiveUpfrontPaidCents / 100).toFixed(2)}
              </span>
            </div>
          ) : null}

          {effectiveUpfrontPaidCents > 0 && remainingBalanceCents === 0 && (
            <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/80 flex items-center justify-between text-emerald-950 font-medium">
              <span className="flex items-center gap-2 text-xs">
                <span className="material-symbols-outlined text-emerald-600 text-base">check_circle</span>
                <span>Payment Settled in Full &mdash; No outstanding balance required</span>
              </span>
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Settled</span>
            </div>
          )}

          {effectiveUpfrontPaidCents > 0 && remainingBalanceCents > 0 && (
            <div className="p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 font-bold transition-all bg-amber-50/90 border-amber-300 text-amber-950">
              <div>
                <span className="text-xs uppercase tracking-wider block font-extrabold">
                  Remaining Balance Required
                </span>
                <span className="text-[11px] font-normal opacity-90">
                  Admin can request this difference via clarification or override &amp; settle if received
                </span>
              </div>
              <span className="text-base sm:text-base font-extrabold tabular-nums text-amber-800 self-start sm:self-auto">
                {formattedDifference}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 6: Admin Review Decision Console ────────────────────────── */}
      <div className="rounded-2xl md:rounded-3xl border border-[var(--admin-border)] bg-white p-4 sm:p-6 md:p-7 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-4 sm:space-y-6">
        {isSettled ? (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Post-Flight Record Verified &amp; Settled</h2>
                <p className="text-xs text-slate-500">Official meter readings committed and invoice paid in full</p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold self-start sm:self-auto">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                {currentStatus === 'approved_with_correction' ? 'Approved with Correction' : 'Standard Settled'}
              </span>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:p-5 space-y-3">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm flex-shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-xl">verified</span>
                </span>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-emerald-950">Review &amp; Settlement Complete</h3>
                  <p className="text-xs text-emerald-800/90 leading-relaxed">
                    This post-flight record has been officially verified and settled. The submitted meters are committed to the aircraft flight log history, the customer invoice has been marked as <strong>Paid</strong>, and schedule locks have been released.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 pt-2">
              <Link
                href="/admin/bookings"
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 px-4 py-2.5 text-xs font-bold text-white transition-all shadow-sm"
              >
                <span className="material-symbols-outlined text-base">list_alt</span>
                Go to Booking Directory
              </Link>
              {customerId && (
                <Link
                  href={`/admin/users/${customerId}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-800 transition-all"
                >
                  <span className="material-symbols-outlined text-base">person</span>
                  View Customer Profile
                </Link>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Admin Review Decision</h2>
                <p className="text-xs text-slate-500">
                  Verify flight meters and payment to finalize this booking or request corrections
                </p>
              </div>

              {/* Decision Mode Toggle */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 sm:gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200 w-full lg:w-auto">
                <button
                  type="button"
                  onClick={() => setActiveDecision('approve')}
                  className={`flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-2.5 sm:py-2 rounded-lg text-xs font-bold transition-all text-center ${
                    activeDecision === 'approve'
                      ? !isAwaitingCustomer && remainingBalanceCents > 0
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">
                    {isAwaitingCustomer
                      ? 'bolt'
                      : remainingBalanceCents > 0
                      ? 'forward_to_inbox'
                      : 'check_circle'}
                  </span>
                  <span>
                    {isAwaitingCustomer
                      ? 'Override & Settle'
                      : remainingBalanceCents > 0
                      ? 'Enforce & Request Payment'
                      : 'Approve & Settle'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveDecision('clarify')}
                  className={`flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-2.5 sm:py-2 rounded-lg text-xs font-bold transition-all text-center ${
                    activeDecision === 'clarify'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">edit_note</span>
                  <span>Decline / Request Fix</span>
                </button>
              </div>
            </div>

            {/* ── Approve / Enforce Settlement View ─────────────────────────────────────────── */}
            {activeDecision === 'approve' && (
              <form
                onSubmit={
                  isAwaitingCustomer
                    ? handleApprove
                    : remainingBalanceCents > 0
                    ? handleEnforceAndRequestPayment
                    : handleApprove
                }
                className="space-y-6"
              >
                {/* CASE 1: Currently Awaiting Customer Clarification */}
                {isAwaitingCustomer ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-950 space-y-1">
                      <p className="font-bold flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-base text-amber-600">hourglass_empty</span>
                        Record is currently awaiting pilot response
                      </p>
                      <p className="text-[11px] leading-relaxed text-amber-900">
                        A clarification request has already been sent to the pilot. If the customer has now settled the remaining balance directly (via phone or direct bank transfer) or operations approves waiving this difference, check the box below to override and approve immediately.
                      </p>
                    </div>

                    {/* Override Checkbox: ONLY visible in this clarification flow */}
                    <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      overrideConfirmed
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-950 shadow-sm'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100/70 text-slate-700'
                    }`}>
                      <input
                        type="checkbox"
                        checked={overrideConfirmed}
                        onChange={(e) => setOverrideConfirmed(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-emerald-400 text-emerald-600 accent-emerald-600 focus:ring-emerald-500"
                      />
                      <div className="text-xs">
                        <span className="font-bold block">Override &amp; Settle Immediately</span>
                        <span className="text-[11px] leading-relaxed opacity-90">
                          Check this box to override and approve all readings and settle the booking immediately (customer settled via phone/bank transfer or difference waived).
                        </span>
                      </div>
                    </label>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={loading || !overrideConfirmed}
                      className={`w-full flex items-center justify-center gap-2 rounded-xl px-6 py-4 text-sm font-bold text-white shadow-md transition-all disabled:opacity-50 ${
                        overrideConfirmed
                          ? 'bg-emerald-700 hover:bg-emerald-800 ring-2 ring-emerald-400'
                          : 'bg-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <LoadingButtonContent
                        loading={loading}
                        loadingLabel="Overriding & Settling..."
                      >
                        <span className="material-symbols-outlined text-lg">bolt</span>
                        {overrideConfirmed
                          ? `Override, Approve & Settle (${formattedTotal})`
                          : 'Check Override Box Above to Settle'}
                      </LoadingButtonContent>
                    </button>
                  </div>
                ) : remainingBalanceCents > 0 ? (
                  /* CASE 2: Enforce Minimum Billing / Outstanding Balance Required (Not yet asked clarification) */
                  <div className="space-y-4">
                    <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-5 text-xs text-amber-950 space-y-3">
                      <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
                        <span className="material-symbols-outlined text-xl text-amber-600">payments</span>
                        <span>Remaining Balance Required: {formattedDifference}</span>
                      </div>
                      <p className="text-xs leading-relaxed opacity-95">
                        You have selected <strong>{currentVdoNum.toFixed(1)} hrs</strong>{' '}
                        {isMultiDayBooking && currentVdoNum === minimumVdoHours ? '(4h/day minimum policy enforced)' : ''}. The recalculated total settlement is{' '}
                        <strong>{formattedTotal}</strong>. The customer paid{' '}
                        <strong>{(effectiveUpfrontPaidCents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}</strong> upfront.
                      </p>
                      <p className="text-[11px] text-amber-900 leading-relaxed font-semibold">
                        Clicking the button below will change the record status to <strong>Needs Clarification</strong>, update the invoice to <strong>{formattedTotal}</strong>, and automatically email the customer with payment details for the remaining <strong>{formattedDifference}</strong>.
                      </p>
                      <div className="pt-1">
                        <label className="text-[11px] font-bold text-amber-900 block mb-1">
                          Additional Instructions for Pilot (Optional):
                        </label>
                        <textarea
                          value={correctionReason}
                          onChange={(e) => setCorrectionReason(e.target.value)}
                          rows={2}
                          placeholder="Optional extra message to append to the customer notification..."
                          className="w-full rounded-lg border border-amber-300 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Submit Button for Requesting Remaining Payment */}
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 px-6 py-4 text-sm font-bold text-white shadow-md transition-all disabled:opacity-50"
                    >
                      <LoadingButtonContent
                        loading={loading}
                        loadingLabel="Requesting Payment & Notifying Customer..."
                      >
                        <span className="material-symbols-outlined text-lg">forward_to_inbox</span>
                        {isMultiDayBooking && currentVdoNum === minimumVdoHours
                          ? `Enforce Minimum & Request Payment (${formattedDifference})`
                          : `Request Remaining Payment (${formattedDifference})`}
                      </LoadingButtonContent>
                    </button>

                    {vdoTotal != null && Number(vdoTotal) !== currentVdoNum && (
                      <div className="text-center pt-1">
                        <button
                          type="button"
                          onClick={() => setEditedVdoTotal(String(vdoTotal))}
                          className="text-xs text-slate-500 hover:text-slate-800 underline font-medium"
                        >
                          Prefer to bill actual hours ({Number(vdoTotal).toFixed(1)} hrs) and approve directly?
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* CASE 3: Fully Paid / Bill Actual Flown (remainingBalanceCents === 0) */
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label
                        className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          approvalMode === 'standard'
                            ? 'border-emerald-500 bg-emerald-50/40 text-emerald-950'
                            : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="approvalMode"
                          value="standard"
                          checked={approvalMode === 'standard'}
                          onChange={() => setApprovalMode('standard')}
                          className="accent-emerald-600"
                        />
                        <div>
                          <p className="text-xs font-bold">Standard Settlement</p>
                          <p className="text-[11px] text-slate-500">
                            Confirm submitted readings &amp; mark invoice paid as calculated
                          </p>
                        </div>
                      </label>

                      <label
                        className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          approvalMode === 'correction'
                            ? 'border-amber-500 bg-amber-50/40 text-amber-950'
                            : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="approvalMode"
                          value="correction"
                          checked={approvalMode === 'correction'}
                          onChange={() => setApprovalMode('correction')}
                          className="accent-amber-600"
                        />
                        <div>
                          <p className="text-xs font-bold">Approve with Correction</p>
                          <p className="text-[11px] text-slate-500">
                            Override readings with an admin note for official record
                          </p>
                        </div>
                      </label>
                    </div>

                    {(approvalMode === 'correction' || isModifiedFromInitial) && (
                      <div className="space-y-2 p-4 rounded-xl border border-amber-200 bg-amber-50/60">
                        <label className="text-xs font-bold text-amber-900 block">
                          Correction Reason (Optional / Recommended)
                        </label>
                        <textarea
                          value={correctionReason}
                          onChange={(e) => setCorrectionReason(e.target.value)}
                          rows={2}
                          placeholder="Explain why an admin correction was made to the flight readings or landings..."
                          className="w-full rounded-lg border border-amber-300 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    )}

                    {/* Submit Button for Standard Approval */}
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-6 py-4 text-sm font-bold text-white shadow-md transition-all disabled:opacity-50"
                    >
                      <LoadingButtonContent
                        loading={loading}
                        loadingLabel="Approving & Settling..."
                      >
                        <span className="material-symbols-outlined text-lg">verified</span>
                        Approve Post-Flight &amp; Settle ({formattedTotal})
                      </LoadingButtonContent>
                    </button>
                  </div>
                )}
              </form>
            )}

            {/* ── Decline / Request Fix View ────────────────────────────────────── */}
            {activeDecision === 'clarify' && (
              <form onSubmit={handleClarify} className="space-y-6">
                {/* Pre-fill Quick Button for Multi-Day Minimum Difference */}
                {isMultiDayBooking && remainingBalanceCents > 0 && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 p-3.5 rounded-xl bg-amber-100/80 border border-amber-300 text-xs text-amber-950">
                    <div className="flex items-center gap-2 font-bold">
                      <span className="material-symbols-outlined text-base text-amber-700">auto_fix_high</span>
                      <span>Multi-Day Minimum Difference: {formattedDifference}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setClarifyCategory('meter_reading_mismatch')
                        setClarifyMessage(
                          `Under our multi-day booking policy (4h/day minimum), this ${bookingDays}-day rental requires a minimum of ${minimumVdoHours.toFixed(
                            1
                          )} VDO flight hours. Your flight record has been updated to ${minimumVdoHours.toFixed(
                            1
                          )} hours (${formattedTotal}). As $${(effectiveUpfrontPaidCents / 100).toFixed(
                            2
                          )} was paid upfront, the remaining balance of ${formattedDifference} is now due. Please settle via the pilot portal or direct bank transfer.`
                        )
                      }}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] shadow-sm transition-all w-full sm:w-auto text-center"
                    >
                      Insert Pre-Filled Minimum Payment Message
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 block">
                      Reason / Category <span className="text-[11px] font-normal text-slate-500">(Optional)</span>
                    </label>
                    {clarifyCategory && (
                      <button
                        type="button"
                        onClick={() => setClarifyCategory('')}
                        className="text-[11px] text-amber-700 hover:text-amber-900 font-semibold"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="relative" ref={categoryDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setCategoryDropdownOpen((prev) => !prev)}
                      className={`w-full flex items-center justify-between rounded-xl border bg-white p-3 text-xs text-left transition-all ${
                        categoryDropdownOpen
                          ? 'border-amber-500 ring-2 ring-amber-500/20 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 shadow-sm'
                      }`}
                    >
                      {clarifyCategory ? (
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="material-symbols-outlined text-amber-600 text-base shrink-0">
                            {CATEGORY_ICONS[clarifyCategory] || 'help_outline'}
                          </span>
                          <span className="font-semibold text-slate-900 truncate">
                            {CLARIFICATION_CATEGORY_LABELS[clarifyCategory]}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">Select reason category (optional)...</span>
                      )}
                      <span className={`material-symbols-outlined text-slate-400 transition-transform duration-200 ${categoryDropdownOpen ? 'rotate-180 text-amber-600' : ''}`}>
                        keyboard_arrow_down
                      </span>
                    </button>

                    {categoryDropdownOpen && (
                      <div className="absolute z-30 left-0 right-0 mt-1.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl space-y-0.5 max-h-60 overflow-y-auto">
                        {CATEGORIES.map(([key, label]) => {
                          const isSelected = clarifyCategory === key
                          const icon = CATEGORY_ICONS[key] || 'help_outline'
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => {
                                setClarifyCategory(key)
                                setCategoryDropdownOpen(false)
                              }}
                              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs transition-colors text-left ${
                                isSelected
                                  ? 'bg-amber-50 font-bold text-amber-950 border border-amber-200/80'
                                  : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className={`material-symbols-outlined text-base ${isSelected ? 'text-amber-700' : 'text-slate-400'}`}>
                                  {icon}
                                </span>
                                <span className="truncate">{label}</span>
                              </div>
                              {isSelected && (
                                <span className="material-symbols-outlined text-amber-600 text-sm shrink-0">check</span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Quick Select Chips */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[11px] text-slate-400 font-medium mr-0.5">Quick select:</span>
                    {CATEGORIES.map(([key, label]) => {
                      const isSelected = clarifyCategory === key
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setClarifyCategory(isSelected ? '' : key)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] transition-all ${
                            isSelected
                              ? 'bg-amber-100 text-amber-950 border border-amber-300 font-bold shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 border border-slate-200'
                          }`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 block">
                    Instructions for Pilot <span className="text-[11px] font-normal text-slate-500">(Optional)</span>
                  </label>
                  <textarea
                    value={clarifyMessage}
                    onChange={(e) => setClarifyMessage(e.target.value)}
                    rows={3}
                    placeholder="Explain clearly what needs correction (e.g. Please check landing count, flight meter hours, or settle outstanding payment)..."
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none shadow-sm"
                  />
                </div>

                {isModifiedFromInitial && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-900 space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-base text-blue-600">tune</span>
                      Adjusted Readings will be Saved
                    </p>
                    <p className="text-[11px] text-blue-800 leading-relaxed">
                      Your updated meter readings and recalculated total ({formattedTotal}) will be saved to the invoice and notified to the customer in their email and pilot portal.
                    </p>
                  </div>
                )}

                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-xs text-amber-800 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-base">info</span>
                    Customer Clarification Notice
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    Sending this request will update the record status to <strong>Needs Clarification</strong>, dispatch an immediate email with your notes and updated invoice amount ({formattedTotal}) to <strong>{customerEmail}</strong>, and unlock the pilot portal for resubmission or remaining payment.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 px-6 py-4 text-sm font-bold text-white shadow-md transition-all disabled:opacity-50"
                >
                  <LoadingButtonContent loading={loading} loadingLabel="Sending Clarification Request...">
                    <span className="material-symbols-outlined text-lg">forward_to_inbox</span>
                    Send Clarification Request / Decline ({formattedTotal})
                  </LoadingButtonContent>
                </button>
              </form>
            )}
          </>
        )}
      </div>

      {/* ── Document Viewer Modals ───────────────────────────────────────────── */}
      {evidenceViewerOpen && evidenceFiles.length > 0 && (
        <DocumentViewerModal
          isOpen={evidenceViewerOpen}
          onClose={() => setEvidenceViewerOpen(false)}
          files={evidenceFiles}
          initialIndex={0}
          title="Flight Record Meter &amp; Evidence Photos"
        />
      )}

      {bankReceiptViewerOpen && receiptFiles.length > 0 && (
        <DocumentViewerModal
          isOpen={bankReceiptViewerOpen}
          onClose={() => setBankReceiptViewerOpen(false)}
          files={receiptFiles}
          initialIndex={0}
          title="Uploaded Bank Transfer Receipt Proof"
        />
      )}
    </div>
  )
}
