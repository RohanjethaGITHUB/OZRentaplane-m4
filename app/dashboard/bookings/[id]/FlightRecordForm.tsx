'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  submitAndPayPostFlight,
  uploadFlightRecordEvidence,
  uploadPostFlightBankTransferReceipt,
} from '@/app/actions/booking'
import TotalOnlyReadingsForm from '@/components/aircraft/TotalOnlyReadingsForm'
import { type TotalOnlyFormValues, validateTotalOnlyReadings } from '@/lib/aircraft-readings'
import { calculatePostFlightCharges, type AirportBillingInfo, type ActiveBlockTimeSummary } from '@/lib/booking/live-booking-calculator'
import { LoadingButtonContent } from '@/components/ui/Spinner'
import AirportSelect from '@/components/ui/AirportSelect'
import BlockTimeTopupCard from '@/app/dashboard/pricing/BlockTimeTopupCard'
import { formatDateFromISO } from '@/lib/formatDateTime'

type LandingRow = {
  airport_id: string
  landing_count: string
}

type Props = {
  bookingId: string
  picName?: string | null
  picArn?: string | null
  flightDate: string
  airports?: AirportBillingInfo[]
  activePackage?: ActiveBlockTimeSummary | null
  expiredPackage?: ActiveBlockTimeSummary | null
  bookingSlotHours: number
  scheduledStart?: string | Date | null
  scheduledEnd?: string | Date | null
  is24HourBooking?: boolean
  customerCreditCents?: number
  defaultHourlyRate?: number
  bankDetails?: {
    bankName?: string
    accountName: string
    bsb: string
    accountNumber: string
  } | null
  initialRecord?: {
    vdo_total?: number | string | null
    air_switch_total?: number | string | null
    customer_notes?: string | null
  } | null
  initialLandings?: Array<{
    airportId?: string
    icaoCode?: string | null
    landingCount: number
  }> | null
  initialAttachments?: Array<{
    id: string
    file_name: string
    signedUrl: string | null
  }> | null
  clarification?: {
    category: string
    message: string
  } | null
  meterAdjustment?: {
    previous_vdo: number
    adjusted_vdo: number
    difference: number
  } | null
  upfrontPaidCents?: number
  initialRecordStatus?: string | null
}

type UploadedFile = { file: File; preview: string }
type RejectedFile = { name: string; reason: string }

const MAX_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png'])

function money(cents: number) {
  return (cents / 100).toFixed(2)
}

export default function FlightRecordForm({
  bookingId,
  picName,
  picArn,
  flightDate,
  airports = [],
  activePackage = null,
  expiredPackage = null,
  bookingSlotHours,
  scheduledStart,
  scheduledEnd,
  is24HourBooking = false,
  customerCreditCents = 0,
  defaultHourlyRate = 330,
  bankDetails,
  initialRecord,
  initialRecordStatus,
  initialLandings,
  initialAttachments,
  clarification,
  meterAdjustment = null,
  upfrontPaidCents = 0,
}: Props) {
  const router = useRouter()

  const airportOptions = useMemo(() => {
    const bankstown = airports.find(
      (a) => a.icao_code === 'YSBK' || a.name.toLowerCase().includes('bankstown'),
    )
    if (!bankstown) return airports
    return [bankstown, ...airports.filter((a) => a.id !== bankstown.id)]
  }, [airports])

  const initialAirportId = airportOptions[0]?.id || ''

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [showTopupModal, setShowTopupModal] = useState(false)
  const [isExpiredNoticeCollapsed, setIsExpiredNoticeCollapsed] = useState(false)
  const [isMinimumVdoNoticeCollapsed, setIsMinimumVdoNoticeCollapsed] = useState(false)
  const [declaration, setDeclaration] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [uploadErrors, setUploadErrors] = useState<RejectedFile[]>([])
  const [uploadResults, setUploadResults] = useState<Array<{ name: string; success: boolean; error?: string }>>([])
  
  const [landingRows, setLandingRows] = useState<LandingRow[]>(() => {
    if (initialLandings && initialLandings.length > 0) {
      return initialLandings.map((l) => {
        const matched = airports.find((a) => a.id === l.airportId || (l.icaoCode && a.icao_code === l.icaoCode))
        return {
          airport_id: matched?.id || l.airportId || initialAirportId,
          landing_count: String(l.landingCount || 1),
        }
      })
    }
    return [{ airport_id: initialAirportId, landing_count: '1' }]
  })
  
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isDraft = initialRecordStatus === 'draft'
  const isResubmission = Boolean(clarification || (initialRecord && !isDraft))

  // Payment method state: stripe | bank_transfer | previous_payment
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'bank_transfer' | 'previous_payment'>('stripe')
  const [bankReceiptFile, setBankReceiptFile] = useState<File | null>(null)
  const [bankReceiptPreview, setBankReceiptPreview] = useState<string | null>(null)
  const [bankReceiptError, setBankReceiptError] = useState<string | null>(null)
  const [bankReference, setBankReference] = useState('')
  const bankReceiptInputRef = useRef<HTMLInputElement>(null)

  const [readings, setReadings] = useState<TotalOnlyFormValues>({
    vdo_total: meterAdjustment?.adjusted_vdo != null
      ? String(meterAdjustment.adjusted_vdo)
      : (initialRecord?.vdo_total != null ? String(initialRecord.vdo_total) : ''),
    air_switch_total: initialRecord?.air_switch_total != null ? String(initialRecord.air_switch_total) : '',
  })
  const [notes, setNotes] = useState(initialRecord?.customer_notes ?? '')
  const [minimumVdoDecision, setMinimumVdoDecision] = useState<'enforce_minimum' | 'bill_actual'>('enforce_minimum')
  const [requestActualHoursRefund, setRequestActualHoursRefund] = useState(false)
  const [refundAccountName, setRefundAccountName] = useState(picName || '')
  const [refundBsb, setRefundBsb] = useState('')
  const [refundAccountNumber, setRefundAccountNumber] = useState('')
  const [refundBankName, setRefundBankName] = useState('')
  const [refundReason, setRefundReason] = useState('')

  // Landing row helpers
  function updateLandingAirport(idx: number, airportId: string) {
    setLandingRows((rows) =>
      rows.map((r, i) => {
        if (i !== idx) return r
        return {
          ...r,
          airport_id: airportId,
          landing_count: airportId ? (r.landing_count || '1') : '',
        }
      }),
    )
  }

  function updateLandingCount(idx: number, value: string) {
    setLandingRows((rows) =>
      rows.map((r, i) => {
        if (i !== idx) return r
        if (!r.airport_id) {
          return { ...r, landing_count: value }
        }

        const nextValue = value.trim()
        const parsed = Number(nextValue)
        if (!nextValue || !Number.isFinite(parsed) || parsed < 1) {
          return { ...r, landing_count: '1' }
        }

        return {
          ...r,
          landing_count: String(Math.max(1, Math.floor(parsed))),
        }
      }),
    )
  }

  function addLandingRow() {
    setLandingRows((rows) => [...rows, { airport_id: '', landing_count: '' }])
  }

  function removeLandingRow(idx: number) {
    setLandingRows((rows) => rows.filter((_, i) => i !== idx))
  }

  function getLandingRowError(row: LandingRow): string | null {
    if (!row.airport_id) return 'Select an airport.'
    const n = Number(row.landing_count)
    if (!row.landing_count || isNaN(n) || !Number.isInteger(n) || n < 1) return 'Landings must be a whole number ≥ 1.'
    return null
  }

  const hasLandingErrors = landingRows.some((r) => getLandingRowError(r) !== null)
  const allLandingsFilled =
    landingRows.length > 0 &&
    landingRows.every((r) => {
      if (!r.airport_id) return false
      const n = Number(r.landing_count)
      return Number.isInteger(n) && n >= 1
    })

  // Evidence file helpers
  function addFiles(incoming: File[]) {
    const accepted: UploadedFile[] = []
    const rejected: RejectedFile[] = []
    for (const f of incoming) {
      if (!ALLOWED_TYPES.has(f.type)) {
        const ext = f.name.split('.').pop()?.toUpperCase() ?? '?'
        rejected.push({
          name: f.name,
          reason: f.type.startsWith('image/')
            ? `${ext} format not supported — use JPEG or PNG`
            : 'Not a recognised image file — JPEG or PNG only',
        })
      } else if (f.size > MAX_FILE_BYTES) {
        rejected.push({
          name: f.name,
          reason: `Too large (${(f.size / 1024 / 1024).toFixed(1)} MB) — max ${MAX_FILE_BYTES / 1024 / 1024} MB per file`,
        })
      } else {
        accepted.push({ file: f, preview: URL.createObjectURL(f) })
      }
    }
    if (accepted.length > 0) setFiles((prev) => [...prev, ...accepted])
    setUploadErrors(rejected)
  }

  function removeFile(idx: number) {
    setFiles((prev) => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  // Bank receipt file handler
  function handleBankReceiptChange(incoming: File | null) {
    setBankReceiptError(null)
    if (!incoming) {
      setBankReceiptFile(null)
      setBankReceiptPreview(null)
      return
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!validTypes.includes(incoming.type)) {
      setBankReceiptError('Please upload JPEG, PNG, WebP or PDF.')
      return
    }
    if (incoming.size > 10 * 1024 * 1024) {
      setBankReceiptError('File too large (max 10MB).')
      return
    }

    setBankReceiptFile(incoming)
    if (incoming.type.startsWith('image/')) {
      setBankReceiptPreview(URL.createObjectURL(incoming))
    } else {
      setBankReceiptPreview(null)
    }
  }

  function getNum(field: keyof TotalOnlyFormValues): number | null {
    const v = readings[field]
    if (!v || !v.trim()) return null
    const parsed = Number(v)
    return Number.isFinite(parsed) ? parsed : null
  }

  const enteredVdoTotal = getNum('vdo_total')
  const enteredAirSwitchTotal = getNum('air_switch_total')

  // Real-time calculation engine
  const calc = useMemo(() => {
    return calculatePostFlightCharges({
      vdoTotal: enteredVdoTotal,
      bookingSlotHours,
      scheduledStart,
      scheduledEnd,
      defaultHourlyRate,
      airports,
      landingRows,
      activeBlockTime: activePackage,
      customerCreditCents,
      minimumVdoDecision,
    })
  }, [enteredVdoTotal, bookingSlotHours, scheduledStart, scheduledEnd, defaultHourlyRate, airports, landingRows, activePackage, customerCreditCents, minimumVdoDecision])

  const effectiveUpfrontPaidCents = upfrontPaidCents ?? 0
  const grossSettlementCents = Math.max(0, calc.subtotalCents - calc.creditAppliedCents)
  const netPayableDueCents = Math.max(0, grossSettlementCents - effectiveUpfrontPaidCents)
  const hasEvidencePhotos = files.length > 0 || (initialAttachments != null && initialAttachments.length > 0)

  const stripeSurchargeRemainingCents = netPayableDueCents > 0
    ? Math.round(netPayableDueCents * 0.0175 + 30)
    : 0
  const totalCardChargeRemainingCents = netPayableDueCents + stripeSurchargeRemainingCents

  // Sync payment method: if no balance is due on resubmission, keep previous payment; otherwise default to stripe
  useEffect(() => {
    if (netPayableDueCents === 0 && isResubmission) {
      setPaymentMethod('previous_payment')
    } else if (netPayableDueCents > 0 && paymentMethod === 'previous_payment') {
      setPaymentMethod('stripe')
    }
  }, [netPayableDueCents, isResubmission, paymentMethod])

  const isSubmitBlocked =
    loading ||
    !declaration ||
    !hasEvidencePhotos ||
    hasLandingErrors ||
    !allLandingsFilled ||
    enteredVdoTotal == null ||
    enteredVdoTotal <= 0 ||
    calc.validationError !== null ||
    (netPayableDueCents > 0 && paymentMethod === 'bank_transfer' && !bankReceiptFile) ||
    (netPayableDueCents > 0 && paymentMethod === 'previous_payment')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitAttempted(true)
    setError(null)

    if (!declaration) {
      setError('Please check the declaration box before submitting.')
      return
    }
    if (!hasEvidencePhotos) {
      setError('Please upload at least one evidence photo of your cockpit meter readings.')
      return
    }
    if (landingRows.length === 0) {
      setError('Add at least one landing airport.')
      return
    }
    for (let i = 0; i < landingRows.length; i++) {
      const err = getLandingRowError(landingRows[i])
      if (err) {
        setError(`Landing row ${i + 1}: ${err}`)
        return
      }
    }

    const landingRowsParsed = landingRows.map((r) => ({
      airport_id: r.airport_id,
      landing_count: Math.round(Number(r.landing_count)),
    }))
    const totalLandings = landingRowsParsed.reduce((s, r) => s + r.landing_count, 0)

    const totalReadings = {
      vdo_total: enteredVdoTotal ?? 0,
      air_switch_total: enteredAirSwitchTotal ?? 0,
      landings: totalLandings,
      notes: notes.trim() || null,
    }

    try {
      validateTotalOnlyReadings(totalReadings)
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message.replace(/^VALIDATION: /, '')
          : 'Invalid aircraft readings.',
      )
      return
    }

    if (netPayableDueCents > 0 && paymentMethod === 'bank_transfer' && !bankReceiptFile) {
      setError('Please upload your bank transfer payment receipt for the remaining balance.')
      return
    }

    if (calc.minimumVdoBilling.isBelowMinimum && requestActualHoursRefund) {
      if (!refundAccountName.trim() || !refundBsb.trim() || !refundAccountNumber.trim()) {
        setError('Please enter your Account Name, BSB, and Account Number for the refund.')
        return
      }
    }

    const actualHoursRefundRequestPayload = (calc.minimumVdoBilling.isBelowMinimum && requestActualHoursRefund)
      ? {
          requested: true,
          account_name: refundAccountName.trim(),
          bsb: refundBsb.trim(),
          account_number: refundAccountNumber.trim(),
          bank_name: refundBankName.trim() || null,
          reason: refundReason.trim() || null,
          actual_vdo_hours: totalReadings.vdo_total,
          enforced_minimum_hours: calc.minimumVdoBilling.minimumVdoHours,
          difference_hours: Math.max(0, Math.round((calc.minimumVdoBilling.minimumVdoHours - totalReadings.vdo_total) * 10) / 10),
          difference_amount_cents: Math.round(
            Math.max(0, Math.round((calc.minimumVdoBilling.minimumVdoHours - totalReadings.vdo_total) * 10) / 10) *
              calc.standardHourlyRate *
              100,
          ),
          status: 'pending' as const,
        }
      : null

    try {
      setLoading(true)

      // 1. If bank transfer, upload receipt storage path first
      let bankReceiptPath: string | null = null
      if (netPayableDueCents > 0 && paymentMethod === 'bank_transfer' && bankReceiptFile) {
        const receiptFd = new FormData()
        receiptFd.set('receipt', bankReceiptFile)
        receiptFd.set('bookingId', bookingId)
        const uploadRes = await uploadPostFlightBankTransferReceipt(receiptFd)
        bankReceiptPath = uploadRes.storagePath
      }

      // 2. Submit flight record & generate invoice
      const effectivePaymentMethod = netPayableDueCents === 0 ? 'credit_or_block_time' : paymentMethod

      const result = await submitAndPayPostFlight({
        booking_id: bookingId,
        date: flightDate,
        pic_name: picName || null,
        pic_arn: picArn || null,
        vdo_total: totalReadings.vdo_total,
        air_switch_total: totalReadings.air_switch_total,
        landings: totalLandings,
        landing_rows: landingRowsParsed,
        customer_notes: notes || null,
        minimum_vdo_decision: 'enforce_minimum',
        actual_hours_refund_request: actualHoursRefundRequestPayload,
        declaration_accepted: true,
        signature_type: 'typed',
        signature_value: picName || null,
        payment_method: effectivePaymentMethod,
        bank_transfer_reference: bankReference || null,
        bank_transfer_receipt_path: bankReceiptPath,
      })

      // 3. Upload evidence attachments
      if (files.length > 0) {
        const results: Array<{ name: string; success: boolean; error?: string }> = []
        for (const f of files) {
          const uploadFd = new FormData()
          uploadFd.set('file', f.file)
          uploadFd.set('flightRecordId', result.flightRecordId)
          uploadFd.set('bookingId', bookingId)
          try {
            await uploadFlightRecordEvidence(uploadFd)
            results.push({ name: f.file.name, success: true })
          } catch (uploadErr) {
            results.push({
              name: f.file.name,
              success: false,
              error:
                uploadErr instanceof Error
                  ? uploadErr.message.replace(/^VALIDATION: /, '')
                  : 'Upload failed',
            })
          }
        }
        setUploadResults(results)
      }

      // 4. If Stripe checkout URL is returned, redirect immediately to Stripe Checkout
      if (result.stripeCheckoutUrl) {
        window.location.href = result.stripeCheckoutUrl
        return
      }

      setDone(true)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message.replace(/^VALIDATION: /, '') : 'Submission failed.')
      setLoading(false)
    }
  }

  // ── Success State ─────────────────────────────────────────────────────────────
  if (done) {
    const failedUploads = uploadResults.filter((r) => !r.success)
    return (
      <div className="bg-white border border-[#dbe7f4] rounded-[1.5rem] p-8 md:p-10 space-y-6 shadow-[0_8px_24px_rgba(21,45,90,0.06)]">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-[#1a4fd6]">
            <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>
              verified_user
            </span>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-[#152d5a]">Post-Flight Record & Payment Submitted</h2>
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-bold uppercase tracking-wider text-[#1a4fd6]">
              <span className="material-symbols-outlined text-sm">pending_actions</span>
              Payment Verification Required
            </div>
            <p className="text-sm text-[#4b6390] max-w-md mx-auto pt-2">
              Your meter readings, evidence photos, and payment have been received. An administrator will verify the
              readings and finalize your booking.
            </p>
          </div>
        </div>

        {failedUploads.length > 0 && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-1">
            <p className="text-xs font-semibold text-amber-700">Some evidence photos could not be uploaded:</p>
            <ul className="list-disc list-inside text-xs text-amber-600/90 space-y-0.5">
              {failedUploads.map((f, i) => (
                <li key={i}>{f.name} — {f.error ?? 'Upload failed'}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => router.push('/dashboard/bookings')}
            className="px-6 py-2.5 rounded-xl bg-[#1a4fd6] hover:bg-[#152d5a] text-white text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
          >
            Back to Bookings
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
      {/* Clarification Alert Banner */}
      {clarification && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl sm:rounded-[1.5rem] p-4 sm:p-6 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <span className="material-symbols-outlined text-amber-600 text-2xl shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
                warning
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-amber-900 uppercase tracking-wide">
                  Clarification Requested by Admin
                </h3>
                <p className="text-xs text-amber-700">Please review the note from admin below, adjust readings or evidence photos, and complete the remaining settlement.</p>
              </div>
            </div>
            {clarification.category && (
              <span className="self-start sm:self-auto px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-200/80 text-amber-900 border border-amber-300 shrink-0">
                {clarification.category}
              </span>
            )}
          </div>
          <div className="p-3 sm:p-3.5 bg-white rounded-xl border border-amber-200 text-xs text-slate-800 font-medium leading-relaxed shadow-sm">
            <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider block mb-1">Message from Admin:</span>
            <span className="whitespace-pre-line">&ldquo;{clarification.message}&rdquo;</span>
          </div>

          {meterAdjustment && (
            <div className="p-3.5 sm:p-4 bg-white rounded-xl border border-blue-200 shadow-sm flex items-start gap-3 text-xs">
              <span className="material-symbols-outlined text-[#1a4fd6] text-xl flex-shrink-0 mt-0.5">
                tune
              </span>
              <div className="space-y-1">
                <span className="font-bold text-slate-900 block">Meter Reading Correction by Operations</span>
                <p className="text-slate-600 leading-relaxed">
                  Previously submitted VDO reading: <strong>{meterAdjustment.previous_vdo} hrs</strong> &rarr; Operations verified: <strong className="text-[#1a4fd6]">{meterAdjustment.adjusted_vdo} hrs</strong>
                  {meterAdjustment.difference > 0 ? ` (+${meterAdjustment.difference} hrs)` : ` (${meterAdjustment.difference} hrs)`}.
                  The readings below have been updated to reflect the verified hours.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Meter readings section */}
      <div className="bg-white border border-[#dbe7f4] rounded-2xl sm:rounded-[1.5rem] p-4 sm:p-6 md:p-8 shadow-[0_8px_24px_rgba(21,45,90,0.06)] space-y-5 sm:space-y-6">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[#1a4fd6] text-xl shrink-0">speed</span>
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1a4fd6]">Aircraft Readings</h3>
            <p className="text-xs text-[#4b6390]">Enter total meter readings from the cockpit</p>
          </div>
        </div>

        {meterAdjustment && (
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-950 font-medium">
            <span className="material-symbols-outlined text-[#1a4fd6] text-base shrink-0">info</span>
            <span>
              Previously submitted: <strong>{meterAdjustment.previous_vdo} hrs</strong> &rarr; Operations updated to: <strong className="text-[#1a4fd6]">{meterAdjustment.adjusted_vdo} hrs</strong>
            </span>
          </div>
        )}

        <TotalOnlyReadingsForm
          values={readings}
          onChange={(field, val) => setReadings((prev) => ({ ...prev, [field]: val }))}
          disabled={loading}
        />

        {/* Customer notes */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4b6390] block mb-2">
            Flight Remarks / Notes <span className="text-slate-400 font-normal normal-case">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={loading}
            rows={3}
            placeholder="Any maintenance issues, fuel purchased, or flight notes…"
            className="w-full rounded-xl border border-[#dbe7f4] bg-[#f8fbff] p-3 text-sm text-[#152d5a] placeholder-slate-400 focus:border-[#1a4fd6] focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {/* Landing Details Section */}
      <div className="bg-white border border-[#dbe7f4] rounded-2xl sm:rounded-[1.5rem] p-4 sm:p-6 md:p-8 shadow-[0_8px_24px_rgba(21,45,90,0.06)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <span className="material-symbols-outlined text-[#1a4fd6] text-xl shrink-0">flight_land</span>
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1a4fd6]">
                Landing Details <span className="text-rose-500">*</span>
              </h3>
              <p className="text-xs text-[#4b6390]">Record touch-and-gos and full stop landings per airport</p>
            </div>
          </div>
          <button
            type="button"
            onClick={addLandingRow}
            disabled={loading}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#1a4fd6] hover:text-[#152d5a] bg-blue-50 hover:bg-blue-100/80 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors self-start sm:self-auto shrink-0"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Add Airport
          </button>
        </div>

        <div className="space-y-3">
          {landingRows.map((row, idx) => (
            <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 p-3 sm:p-3.5 rounded-xl bg-[#f8fbff] border border-[#dbe7f4]">
              <div className="flex-1 w-full min-w-0">
                <AirportSelect
                  value={row.airport_id}
                  onChange={(val) => updateLandingAirport(idx, val)}
                  options={airportOptions}
                  disabled={loading}
                  placeholder="Select airport…"
                />
              </div>
              <div className="flex items-center justify-between sm:justify-start gap-2 w-full sm:w-auto">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={row.landing_count}
                    onChange={(e) => updateLandingCount(idx, e.target.value)}
                    disabled={loading}
                    placeholder="Count"
                    className="w-20 sm:w-24 rounded-lg border border-[#dbe7f4] bg-white px-2.5 sm:px-3 py-2 text-sm text-center font-bold text-[#152d5a] focus:border-[#1a4fd6] focus:outline-none"
                  />
                  <span className="text-xs text-[#4b6390] shrink-0">landings</span>
                </div>
                {landingRows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLandingRow(idx)}
                    disabled={loading}
                    className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors ml-auto sm:ml-0 shrink-0"
                    title="Remove airport"
                  >
                    <span className="material-symbols-outlined text-lg">delete</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Evidence Photos Upload */}
      <div className="bg-white border border-[#dbe7f4] rounded-2xl sm:rounded-[1.5rem] p-4 sm:p-6 md:p-8 shadow-[0_8px_24px_rgba(21,45,90,0.06)] space-y-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[#1a4fd6] text-xl shrink-0">photo_camera</span>
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1a4fd6]">
              Evidence Upload <span className="text-rose-500 font-bold">*</span>
            </h3>
            <p className="text-xs text-[#4b6390]">Upload photos of meter readings (Hobbs / VDO / Tacho / Fuel) — at least 1 required</p>
          </div>
        </div>

        {initialAttachments && initialAttachments.length > 0 && (
          <div className="p-3.5 bg-[#f8fbff] rounded-xl border border-[#dbe7f4] space-y-2">
            <span className="text-[10px] uppercase font-bold text-[#4b6390] tracking-wider block">
              Previously Uploaded Photos ({initialAttachments.length}):
            </span>
            <div className="flex flex-wrap gap-2">
              {initialAttachments.map((att) => (
                <div key={att.id} className="w-16 h-16 rounded-lg overflow-hidden border border-[#dbe7f4] relative bg-white shadow-xs">
                  {att.signedUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={att.signedUrl} alt={att.file_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><span className="material-symbols-outlined text-slate-400 text-lg">image</span></div>
                  )}
                  <span className="absolute bottom-1 right-1 bg-emerald-500 text-white rounded-full p-0.5 material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    check
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-[#4b6390]">You can keep these photos or upload additional/clearer photos below.</p>
          </div>
        )}

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (e.dataTransfer.files) addFiles(Array.from(e.dataTransfer.files))
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors ${
            !hasEvidencePhotos && submitAttempted
              ? 'border-rose-400 bg-rose-50/50 ring-2 ring-rose-300'
              : dragOver
              ? 'border-[#1a4fd6] bg-blue-50/50'
              : 'border-[#dbe7f4] hover:border-[#1a4fd6]/60 bg-[#f8fbff]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png"
            onChange={(e) => {
              if (e.target.files) addFiles(Array.from(e.target.files))
              e.target.value = ''
            }}
            className="hidden"
          />
          <div className="flex flex-col items-center gap-2">
            <span className="material-symbols-outlined text-3xl text-[#1a4fd6]">cloud_upload</span>
            <p className="text-sm font-medium text-[#152d5a]">Drag and drop photos here, or click to browse</p>
            <p className="text-xs text-[#4b6390]">JPEG or PNG only • Up to 10 MB each • Required</p>
          </div>
        </div>

        {!hasEvidencePhotos && submitAttempted && (
          <p className="text-xs text-rose-600 font-semibold flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">error</span>
            At least one evidence photo of cockpit meter readings is required.
          </p>
        )}

        {uploadErrors.length > 0 && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
            {uploadErrors.map((err, i) => (
              <p key={i} className="text-xs text-rose-700">{err.name}: {err.reason}</p>
            ))}
          </div>
        )}

        {files.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            {files.map((f, i) => (
              <div key={i} className="relative group rounded-xl overflow-hidden border border-[#dbe7f4] aspect-square bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.preview} alt={f.file.name} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center opacity-90 hover:opacity-100 shadow-sm"
                >
                  <span className="material-symbols-outlined text-xs">close</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── LIVE CALCULATION & INVOICE BREAKDOWN ────────────────────────────── */}
      <div id="payment" className="bg-white border-2 border-[#1a4fd6]/20 rounded-2xl sm:rounded-[1.5rem] p-4 sm:p-6 md:p-8 shadow-[0_8px_24px_rgba(21,45,90,0.08)] space-y-5 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#dbe7f4] pb-4">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <span className="material-symbols-outlined text-[#1a4fd6] text-2xl shrink-0">receipt_long</span>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#152d5a]">Flight Invoice & Live Breakdown</h3>
              <p className="text-xs text-[#4b6390]">Immediate calculation based on your meter readings</p>
            </div>
          </div>
          {enteredVdoTotal != null && enteredVdoTotal > 0 && (
            <span className="self-start sm:self-auto px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-bold text-[#1a4fd6] tabular-nums whitespace-nowrap shrink-0">
              {enteredVdoTotal.toFixed(1)} hrs VDO
            </span>
          )}
        </div>

        {/* Multi-Day Minimum VDO Decision Selector (Image 3 behavior for customers) */}
        {calc.minimumVdoBilling.isBelowMinimum && (
          <div className={`rounded-2xl border border-amber-300 bg-amber-50/90 transition-all shadow-xs ${isMinimumVdoNoticeCollapsed ? 'p-3.5 sm:p-4' : 'p-4 sm:p-5 space-y-3.5'}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-200 text-amber-900 shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-base">schedule</span>
                </span>
                <div className="space-y-0.5 min-w-0">
                  <p className="text-xs font-bold text-amber-950 truncate sm:whitespace-normal">
                    VDO hours are below the minimum for this booking.
                  </p>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    VDO hours flown: <span className="font-mono font-bold">{enteredVdoTotal?.toFixed(1)} h</span>
                    {' '}| Minimum for this booking ({calc.minimumVdoBilling.bookingDays} day{calc.minimumVdoBilling.bookingDays === 1 ? '' : 's'} booked &times; 4h/day):{' '}
                    <span className="font-mono font-bold">{calc.minimumVdoBilling.minimumVdoHours.toFixed(1)} h</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsMinimumVdoNoticeCollapsed((prev) => !prev)}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-full text-amber-800 hover:text-amber-950 hover:bg-amber-200/60 transition-colors"
                  title={isMinimumVdoNoticeCollapsed ? "Show details" : "Hide/collapse"}
                  aria-label="Toggle minimum VDO notice"
                >
                  <span className={`material-symbols-outlined text-[20px] transition-transform duration-200 ${isMinimumVdoNoticeCollapsed ? '' : 'rotate-180'}`}>
                    keyboard_arrow_down
                  </span>
                </button>
              </div>
            </div>

            {!isMinimumVdoNoticeCollapsed && (
              <div className="space-y-3 pt-1">
              {/* Enforced Minimum Notice Card */}
              <div className="flex flex-col text-left p-3.5 rounded-xl border-2 border-[#1a4fd6] bg-white shadow-sm ring-2 ring-blue-500/20">
                <div className="flex items-center justify-between mb-1.5 w-full">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-[#1a4fd6] border border-blue-200">
                    <span className="material-symbols-outlined text-xs">balance</span>
                    Rental Policy Minimum Enforced
                  </span>
                  <span className="material-symbols-outlined text-lg text-[#1a4fd6]">
                    check_circle
                  </span>
                </div>
                <span className="text-xs font-bold text-[#152d5a]">
                  Enforce Minimum ({calc.minimumVdoBilling.minimumVdoHours.toFixed(1)}h minimum)
                </span>
                <span className="text-[11px] text-[#4b6390] mt-1 leading-snug">
                  Multi-day rental policy applies a 4h/day minimum ({calc.minimumVdoBilling.minimumVdoHours.toFixed(1)}h total). This minimum is applied to your live bill settlement.
                </span>
              </div>

              {/* Request Waiver / Refund for Actual Hours Checkbox */}
              <div className="rounded-xl border border-amber-300 bg-white p-3.5 sm:p-4 space-y-3 shadow-xs">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requestActualHoursRefund}
                    onChange={(e) => setRequestActualHoursRefund(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-amber-400 text-[#1a4fd6] focus:ring-[#1a4fd6] accent-[#1a4fd6]"
                  />
                  <div>
                    <span className="text-xs font-bold text-[#152d5a] block">
                      Request review &amp; refund for actual hours flown ({enteredVdoTotal?.toFixed(1)}h flown vs {calc.minimumVdoBilling.minimumVdoHours.toFixed(1)}h minimum)
                    </span>
                    <span className="text-[11px] text-[#4b6390] leading-relaxed block mt-0.5">
                      You will pay the standard minimum invoice amount now. Operations will review your actual flown hours and can refund the difference ({Math.max(0, Math.round((calc.minimumVdoBilling.minimumVdoHours - (enteredVdoTotal ?? 0)) * 10) / 10).toFixed(1)}h = ${money(Math.max(0, Math.round((calc.minimumVdoBilling.minimumVdoHours - (enteredVdoTotal ?? 0)) * 10) / 10) * calc.standardHourlyRate * 100)}) directly to your bank account upon approval.
                    </span>
                  </div>
                </label>

                {requestActualHoursRefund && (
                  <div className="pt-3 border-t border-slate-100 space-y-3">
                    <div className="flex items-center gap-1.5 text-amber-900 font-bold text-[11px] uppercase tracking-wider">
                      <span className="material-symbols-outlined text-sm text-amber-700">account_balance</span>
                      Your Bank Account Details for Refund
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">
                          Account Name <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={refundAccountName}
                          onChange={(e) => setRefundAccountName(e.target.value)}
                          placeholder="e.g. John Doe"
                          className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-900 focus:bg-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">
                          Bank Name (Optional)
                        </label>
                        <input
                          type="text"
                          value={refundBankName}
                          onChange={(e) => setRefundBankName(e.target.value)}
                          placeholder="e.g. Commonwealth Bank, NAB"
                          className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-900 focus:bg-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">
                          BSB <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={refundBsb}
                          onChange={(e) => setRefundBsb(e.target.value)}
                          placeholder="000-000"
                          maxLength={7}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-900 font-mono focus:bg-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">
                          Account Number <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={refundAccountNumber}
                          onChange={(e) => setRefundAccountNumber(e.target.value)}
                          placeholder="12345678"
                          className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-900 font-mono focus:bg-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">
                          Reason / Notes for Waiver Request (Optional)
                        </label>
                        <textarea
                          value={refundReason}
                          onChange={(e) => setRefundReason(e.target.value)}
                          rows={2}
                          placeholder="Explain why you are requesting billing on actual hours (e.g. weather diversion, mechanical hold)..."
                          className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-900 focus:bg-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            )}
          </div>
        )}

        {calc.validationError ? (
          <div className="p-3.5 sm:p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-medium">
            {calc.validationError}
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            {/* Block Time Package Drawdown Summary Card */}
            {calc.isBlockTime && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-3.5 sm:p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#1a4fd6] text-lg">inventory_2</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-[#152d5a]">
                      {calc.blockPackageName}
                    </span>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                    (calc.blockHoursBefore ?? 0) <= 0
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : 'bg-blue-100 text-[#1a4fd6] border-blue-200'
                  }`}>
                    {(calc.blockHoursBefore ?? 0) <= 0 ? 'Exhausted' : 'Active Package'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-center pt-1">
                  <div className="bg-white rounded-xl p-2 sm:p-2.5 border border-blue-100 shadow-xs">
                    <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-[#4b6390] block mb-0.5 truncate">Balance</span>
                    <span className="text-xs sm:text-sm font-bold text-[#152d5a] tabular-nums">{calc.blockHoursBefore?.toFixed(1) ?? '0.0'}h</span>
                  </div>
                  <div className="bg-white rounded-xl p-2 sm:p-2.5 border border-blue-100 shadow-xs">
                    <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-emerald-700 block mb-0.5 truncate">Deducted</span>
                    <span className="text-xs sm:text-sm font-bold text-emerald-600 tabular-nums">-{calc.blockHoursDeducted.toFixed(1)}h</span>
                  </div>
                  <div className="bg-white rounded-xl p-2 sm:p-2.5 border border-blue-100 shadow-xs">
                    <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-[#4b6390] block mb-0.5 truncate">Remaining</span>
                    <span className="text-xs sm:text-sm font-bold text-[#152d5a] tabular-nums">{calc.blockHoursRemainingAfter?.toFixed(1) ?? '0.0'}h</span>
                  </div>
                </div>

                {(calc.blockOverageHours > 0 || (calc.blockHoursBefore ?? 0) <= 0) && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 sm:p-3.5 text-xs space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-amber-900">
                      <span className="material-symbols-outlined text-sm text-amber-600">warning</span>
                      <span>
                        {(calc.blockHoursBefore ?? 0) <= 0 && calc.blockOverageHours === 0
                          ? 'Package Hours Exhausted (0.0h Remaining)'
                          : `Package Hours Depleted (${calc.blockOverageHours.toFixed(1)}h Overage)`}
                      </span>
                    </div>
                    <p className="text-amber-800 text-[11px] leading-relaxed">
                      {calc.blockHoursDeducted > 0
                        ? `Your package covers ${calc.blockHoursDeducted.toFixed(1)}h ($0.00). The remaining ${calc.blockOverageHours.toFixed(1)}h is billed at the standard aircraft hire rate of $${money(calc.standardHourlyRate * 100)}/hr ($${money(calc.blockOverageAmountCents)}).`
                        : (calc.blockOverageHours > 0
                          ? `Your package currently has 0.0h remaining. The full flight time (${calc.blockOverageHours.toFixed(1)}h) is billed at the standard aircraft hire rate of $${money(calc.standardHourlyRate * 100)}/hr ($${money(calc.blockOverageAmountCents)}).`
                          : `Your package currently has 0.0h remaining. Flight hours will be billed at the standard aircraft hire rate of $${money(calc.standardHourlyRate * 100)}/hr unless topped up.`
                        )}
                    </p>
                    <div className="pt-1 flex flex-wrap items-center gap-2">
                      {activePackage && (
                        <button
                          type="button"
                          onClick={() => setShowTopupModal(true)}
                          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white bg-[#1a4fd6] hover:bg-[#153eb2] px-3 py-1.5 rounded-lg shadow-sm transition-colors"
                        >
                          <span className="material-symbols-outlined text-sm">add_circle</span>
                          Add Hours to {activePackage.package_name?.split('(')[0]?.trim() || 'Package'} (Top up at ${activePackage.rate_per_hour ?? 320}/hr)
                        </button>
                      )}
                      <a
                        href="/dashboard/purchases#top-up"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1a4fd6] hover:underline"
                      >
                        <span className="material-symbols-outlined text-xs">open_in_new</span>
                        Open Top-Up in new tab
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Expired Block Time Package Notice & Price Difference */}
            {!calc.isBlockTime && expiredPackage && (
              <div className={`rounded-2xl border border-amber-300 bg-amber-50/80 transition-all ${isExpiredNoticeCollapsed ? 'p-3 sm:p-4' : 'p-3.5 sm:p-5 space-y-3.5'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-amber-700 text-lg shrink-0">event_busy</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-950 truncate">
                      Previous Package Expired · {expiredPackage.package_name || 'Block Time'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-amber-100 text-amber-800 border-amber-300">
                      Expired {formatDateFromISO(expiredPackage.expires_at)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsExpiredNoticeCollapsed((prev) => !prev)}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-full text-amber-800 hover:text-amber-950 hover:bg-amber-200/60 transition-colors"
                      title={isExpiredNoticeCollapsed ? "Show details" : "Hide/collapse"}
                      aria-label="Toggle expired package notice"
                    >
                      <span className={`material-symbols-outlined text-[20px] transition-transform duration-200 ${isExpiredNoticeCollapsed ? '' : 'rotate-180'}`}>
                        keyboard_arrow_down
                      </span>
                    </button>
                  </div>
                </div>

                {!isExpiredNoticeCollapsed && (
                  <>
                    <p className="text-xs text-amber-900 leading-relaxed">
                      You previously had <strong>{expiredPackage.hours_remaining.toFixed(1)}h remaining</strong> on your <strong>{expiredPackage.package_name || 'Block Time package'}</strong>, which expired on <strong>{formatDateFromISO(expiredPackage.expires_at)}</strong>. Because it is expired, this flight is being billed at the standard aircraft hire rate.
                    </p>

                    {/* Price Difference Breakdown */}
                    <div className="rounded-xl border border-amber-200/90 bg-white p-3.5 space-y-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[#4b6390]">Standard Aircraft Hire Rate:</span>
                        <span className="font-semibold text-[#152d5a] tabular-nums">${money(calc.standardHourlyRate * 100)}/hr</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#4b6390]">
                          Block-Time Rate ({expiredPackage.package_name ? expiredPackage.package_name.replace(/\s*\([^)]*\)$/, '') : 'Package'}):
                        </span>
                        <span className="font-semibold text-emerald-700 tabular-nums">${money(expiredPackage.rate_per_hour * 100)}/hr</span>
                      </div>
                      <div className="border-t border-slate-100 pt-2 flex items-center justify-between font-bold">
                        <span className="text-emerald-700">Rate Savings with Package:</span>
                        <span className="text-emerald-700 tabular-nums">Save ${money((calc.standardHourlyRate - expiredPackage.rate_per_hour) * 100)}/hr</span>
                      </div>

                      {calc.billedVdoHours != null && calc.billedVdoHours > 0 && (
                        <div className="mt-2 rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                          <span>
                            Flight cost for {calc.billedVdoHours.toFixed(1)}h: <strong className="text-[#152d5a]">${money(calc.billedVdoHours * calc.standardHourlyRate * 100)}</strong> standard vs <strong className="text-emerald-700">${money(calc.billedVdoHours * expiredPackage.rate_per_hour * 100)}</strong> with package
                          </span>
                          <span className="font-bold text-emerald-700 whitespace-nowrap bg-emerald-100/70 px-2 py-0.5 rounded">
                            Save ${money(calc.billedVdoHours * (calc.standardHourlyRate - expiredPackage.rate_per_hour) * 100)}!
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="pt-1 flex flex-wrap items-center gap-2">
                      <a
                        href="/dashboard/pricing"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#1a4fd6] hover:bg-[#153eb2] px-4 py-2 rounded-xl shadow-sm transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">sell</span>
                        Purchase a Package &amp; Save ${money((calc.standardHourlyRate - expiredPackage.rate_per_hour) * 100)}/hr
                      </a>
                      <span className="text-[11px] text-amber-800">
                        Lock in discounted rates for future flights
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* VDO Hours / Block Time line */}
            <div className="flex items-start justify-between gap-4 text-[#152d5a]">
              <div>
                <p className="font-semibold text-xs sm:text-sm">
                  {calc.isBlockTime ? `Flight Hours (${calc.blockPackageName || 'Block Time Package'})` : 'Flight Charge (VDO Hours)'}
                </p>
                <p className="text-xs text-[#4b6390] mt-0.5">
                  {calc.billedVdoHours != null && calc.billedVdoHours > 0 ? (
                    calc.isBlockTime ? (
                      calc.blockOverageHours > 0 ? (
                        <>
                          {calc.blockHoursDeducted > 0
                            ? `${calc.blockHoursDeducted.toFixed(1)}h covered via package + ${calc.blockOverageHours.toFixed(1)}h overage ($${money(calc.standardHourlyRate * 100)}/hr)`
                            : `0.0h covered via package + ${calc.blockOverageHours.toFixed(1)}h overage ($${money(calc.standardHourlyRate * 100)}/hr)`
                          }
                        </>
                      ) : (
                        <>{calc.blockHoursDeducted.toFixed(1)}h deducted from block time balance</>
                      )
                    ) : (
                      <>{calc.billedVdoHours.toFixed(1)} hrs (${money(calc.hourlyRate * 100)}/hr)</>
                    )
                  ) : (
                    'Enter VDO reading above to calculate'
                  )}
                </p>
                {calc.minimumVdoBilling.isBelowMinimum && (
                  <span className="inline-block mt-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                    {minimumVdoDecision === 'bill_actual'
                      ? `Actual flight hours chosen (${enteredVdoTotal?.toFixed(1)}h flown)`
                      : `4h/day minimum rule enforced (${calc.minimumVdoBilling.minimumVdoHours}h minimum)`}
                  </span>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold tabular-nums text-xs sm:text-sm">
                  {calc.isBlockTime && calc.blockOverageHours === 0
                    ? 'Covered'
                    : `$${money(calc.flightBaseCents)}`}
                </p>
              </div>
            </div>

            {/* Landing charges */}
            {calc.landingItems.length > 0 && (
              <div className="border-t border-[#dbe7f4] pt-3 space-y-1.5">
                <div className="flex items-center justify-between text-[#152d5a]">
                  <p className="font-semibold text-xs sm:text-sm">Landing Fees</p>
                  <p className="font-bold tabular-nums text-xs sm:text-sm">${money(calc.landingSubtotalCents)}</p>
                </div>
                {calc.landingItems.map((item, i) => (
                  <div key={i} className="flex justify-between gap-2 text-xs text-[#4b6390] pl-2">
                    <span className="min-w-0">{item.icaoCode} · {item.airportName} (${money(item.unitAmountCents)} × {item.landingCount})</span>
                    <span className="tabular-nums font-medium shrink-0">${money(item.totalAmountCents)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Subtotal */}
            <div className="flex justify-between border-t border-[#dbe7f4] pt-3 font-semibold text-[#152d5a] text-xs sm:text-sm">
              <span>Subtotal</span>
              <span className="tabular-nums">${money(calc.subtotalCents)}</span>
            </div>

            {/* Customer credit */}
            {calc.creditAppliedCents > 0 && (
              <div className="flex justify-between text-emerald-600 font-medium text-xs sm:text-sm">
                <span>Account Credit Applied</span>
                <span className="tabular-nums">-${money(calc.creditAppliedCents)}</span>
              </div>
            )}

            {/* Upfront Payment on File */}
            {effectiveUpfrontPaidCents > 0 && (
              <div className="flex justify-between text-emerald-700 font-medium text-xs sm:text-sm">
                <span>Upfront Payment on File</span>
                <span className="tabular-nums">-${money(effectiveUpfrontPaidCents)}</span>
              </div>
            )}

            {/* Net Amount Due */}
            <div className="flex justify-between items-baseline border-t-2 border-[#1a4fd6]/30 pt-3 text-[#1a4fd6]">
              <div>
                <span className="text-sm sm:text-base font-bold">Net Amount Due</span>
                {netPayableDueCents === 0 && (
                  <span className="block text-[11px] text-emerald-600 font-medium mt-0.5">
                    {calc.isBlockTime
                      ? 'Covered by Block Time Package ($0.00 due)'
                      : calc.isFullyCovered
                      ? '100% covered by package / credit balance'
                      : 'Fully covered by upfront payment'}
                  </span>
                )}
              </div>
              <span className="text-xl sm:text-2xl font-black tabular-nums">${money(netPayableDueCents)}</span>
            </div>
          </div>
        )}

        {/* ── PAYMENT METHOD SELECTION ────────────────────────────────────── */}
        {netPayableDueCents === 0 && (
          <div className="border-t border-[#dbe7f4] pt-6 space-y-5">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:p-5 text-xs space-y-3 shadow-sm">
              <div className="flex items-center gap-2 text-emerald-800 font-bold uppercase tracking-wider">
                <span className="material-symbols-outlined text-lg text-emerald-600" style={{ fontVariationSettings: "'FILL' 1" }}>
                  verified
                </span>
                {calc.isBlockTime
                  ? 'Covered by Block Time Package'
                  : isResubmission
                  ? 'Payment Already Covered / Recorded'
                  : 'Zero Balance Due'}
              </div>
              <p className="text-emerald-700 leading-relaxed">
                {calc.isBlockTime
                  ? `Your flight hours are fully covered by your active package (${calc.blockPackageName}). Net balance due is $0.00. No card or bank transfer payment is required.`
                  : effectiveUpfrontPaidCents > 0
                  ? `Your flight charges are fully covered by your upfront payment on file (${money(effectiveUpfrontPaidCents)}) or package credits. No additional payment is required.`
                  : 'Total net amount due is $0.00. No payment is required.'}
              </p>
              {isResubmission && (
                <div className="flex flex-wrap gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('previous_payment')}
                    className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-400"
                  >
                    <span className="material-symbols-outlined text-sm">check_circle</span>
                    Keep Previous Payment (No Payment Required)
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {netPayableDueCents > 0 && (
          <div className="border-t border-[#dbe7f4] pt-5 sm:pt-6 space-y-4 sm:space-y-5">
            {effectiveUpfrontPaidCents > 0 ? (
              <div className="rounded-2xl border border-amber-300 bg-amber-50/80 p-3.5 sm:p-5 text-xs space-y-2 shadow-sm">
                <div className="flex items-center gap-2 text-amber-900 font-bold uppercase tracking-wider">
                  <span className="material-symbols-outlined text-lg text-amber-600">payments</span>
                  Remaining Balance Due: ${money(netPayableDueCents)}
                </div>
                <p className="text-amber-800 leading-relaxed">
                  Your upfront payment of <strong>${money(effectiveUpfrontPaidCents)}</strong> is on file. Please select a payment method below to settle the remaining requested balance of <strong>${money(netPayableDueCents)}</strong>.
                </p>
              </div>
            ) : calc.isBlockTime ? (
              <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-3.5 sm:p-5 text-xs space-y-2 shadow-sm">
                <div className="flex items-center gap-2 text-[#152d5a] font-bold uppercase tracking-wider">
                  <span className="material-symbols-outlined text-lg text-[#1a4fd6]">payments</span>
                  Amount Due for Settlement: ${money(netPayableDueCents)}
                </div>
                <p className="text-[#4b6390] leading-relaxed">
                  Flight hours ({calc.blockHoursDeducted.toFixed(1)}h) will be deducted from your {calc.blockPackageName}.
                  Please select a payment method below to settle{' '}
                  <span className="font-semibold text-[#152d5a]">
                    {calc.blockOverageHours > 0
                      ? `${calc.blockOverageHours.toFixed(1)}h overage ($${money(calc.blockOverageAmountCents)})`
                      : ''}
                    {calc.blockOverageHours > 0 && calc.landingSubtotalCents > 0 ? ' and ' : ''}
                    {calc.landingSubtotalCents > 0
                      ? `landing charges ($${money(calc.landingSubtotalCents)})`
                      : ''}
                  </span>.
                </p>
              </div>
            ) : null}

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1a4fd6] block mb-2.5 sm:mb-3">
                {effectiveUpfrontPaidCents > 0 ? 'Select Payment Method for Remaining Balance' : 'Select Payment Method'} <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('stripe')}
                  className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 flex items-center gap-3 transition-all ${
                    paymentMethod === 'stripe'
                      ? 'border-[#1a4fd6] bg-blue-50/70 text-[#152d5a] shadow-sm ring-2 ring-[#1a4fd6]/20'
                      : 'border-[#dbe7f4] bg-[#f8fbff] text-[#4b6390] hover:border-[#1a4fd6]/40'
                  }`}
                >
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    paymentMethod === 'stripe' ? 'bg-[#1a4fd6] text-white' : 'bg-white text-[#4b6390] border border-[#dbe7f4]'
                  }`}>
                    <span className="material-symbols-outlined text-lg sm:text-xl">credit_card</span>
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#152d5a]">Pay Online (Card)</p>
                    <p className="text-[10px] sm:text-[11px] text-[#4b6390] truncate">Immediate Visa / Mastercard / Apple Pay</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('bank_transfer')}
                  className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 flex items-center gap-3 transition-all ${
                    paymentMethod === 'bank_transfer'
                      ? 'border-[#1a4fd6] bg-blue-50/70 text-[#152d5a] shadow-sm ring-2 ring-[#1a4fd6]/20'
                      : 'border-[#dbe7f4] bg-[#f8fbff] text-[#4b6390] hover:border-[#1a4fd6]/40'
                  }`}
                >
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    paymentMethod === 'bank_transfer' ? 'bg-[#1a4fd6] text-white' : 'bg-white text-[#4b6390] border border-[#dbe7f4]'
                  }`}>
                    <span className="material-symbols-outlined text-lg sm:text-xl">account_balance</span>
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#152d5a]">Bank Transfer</p>
                    <p className="text-[10px] sm:text-[11px] text-[#4b6390] truncate">Bank transfer & upload receipt</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Payment Sub-panel: Card Details Summary */}
            {paymentMethod === 'stripe' && (
              <div className="rounded-xl bg-[#f0f6ff] border border-[#dbe7f4] p-3.5 sm:p-4 text-xs space-y-2">
                <div className="flex justify-between text-[#4b6390]">
                  <span>Remaining Base Amount</span>
                  <span className="font-semibold tabular-nums text-[#152d5a]">${money(netPayableDueCents)}</span>
                </div>
                {stripeSurchargeRemainingCents > 0 && (
                  <div className="flex justify-between text-[#4b6390]">
                    <span>Card Processing Fee (1.7% + 30c)</span>
                    <span className="font-medium tabular-nums">${money(stripeSurchargeRemainingCents)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[#152d5a] font-bold border-t border-[#dbe7f4] pt-2 text-xs sm:text-sm">
                  <span>Total Card Charge</span>
                  <span className="tabular-nums text-[#1a4fd6]">${money(totalCardChargeRemainingCents)}</span>
                </div>
              </div>
            )}

            {/* Payment Sub-panel: Bank Transfer Details & Upload */}
            {paymentMethod === 'bank_transfer' && (
              <div className="space-y-4">
                <div className="rounded-2xl bg-[#f8fbff] border border-[#dbe7f4] p-4 sm:p-5 space-y-3 text-xs">
                  <div className="flex items-center gap-2 text-[#1a4fd6] font-bold uppercase tracking-wider">
                    <span className="material-symbols-outlined text-base">account_balance</span>
                    Bank Account Details for Transfer
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 text-sm pt-1">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[#4b6390]">Bank</p>
                      <p className="font-semibold text-[#152d5a]">{bankDetails?.bankName || 'National Australia Bank (NAB)'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[#4b6390]">Account Name</p>
                      <p className="font-semibold text-[#152d5a]">{bankDetails?.accountName || 'JAM Aviation PTY LTD'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[#4b6390]">BSB</p>
                      <p className="font-mono font-bold text-[#152d5a]">{bankDetails?.bsb || '085-005'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[#4b6390]">Account Number</p>
                      <p className="font-mono font-bold text-[#152d5a]">{bankDetails?.accountNumber || '12345678'}</p>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-[#dbe7f4]">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-[#4b6390] block mb-1">
                      Payment Reference Used
                    </label>
                    <input
                      type="text"
                      value={bankReference}
                      onChange={(e) => setBankReference(e.target.value)}
                      placeholder="e.g. Flight YSBK or your Name"
                      className="w-full rounded-lg border border-[#dbe7f4] bg-white px-3 py-2 text-sm text-[#152d5a] focus:border-[#1a4fd6] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Upload receipt */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1a4fd6] block mb-2">
                    Upload Bank Transfer Proof / Receipt <span className="text-rose-500">*</span>
                  </label>
                  <div
                    onClick={() => bankReceiptInputRef.current?.click()}
                    className="border-2 border-dashed border-[#dbe7f4] hover:border-[#1a4fd6] rounded-xl p-3.5 sm:p-4 text-center cursor-pointer bg-[#f8fbff] transition-colors"
                  >
                    <input
                      ref={bankReceiptInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={(e) => {
                        handleBankReceiptChange(e.target.files?.[0] ?? null)
                        e.target.value = ''
                      }}
                      className="hidden"
                    />
                    {bankReceiptFile ? (
                      <div className="flex items-center justify-between gap-3 text-left">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="material-symbols-outlined text-emerald-500 text-2xl shrink-0">check_circle</span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[#152d5a] truncate">{bankReceiptFile.name}</p>
                            <p className="text-[10px] text-[#4b6390]">{(bankReceiptFile.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        </div>
                        <span className="text-xs text-[#1a4fd6] font-semibold shrink-0">Change File</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2 text-xs text-[#4b6390]">
                        <span className="material-symbols-outlined text-[#1a4fd6] shrink-0">receipt_long</span>
                        <span>Click to attach payment receipt / screenshot (JPEG, PNG, PDF)</span>
                      </div>
                    )}
                  </div>
                  {bankReceiptError && (
                    <p className="text-xs text-rose-600 mt-1">{bankReceiptError}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Declaration & Actions ───────────────────────────────────────────── */}
      <div className="bg-white border border-[#dbe7f4] rounded-2xl sm:rounded-[1.5rem] p-4 sm:p-6 md:p-8 shadow-[0_8px_24px_rgba(21,45,90,0.06)] space-y-5 sm:space-y-6">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={declaration}
            onChange={(e) => setDeclaration(e.target.checked)}
            disabled={loading}
            className="mt-0.5 w-4 h-4 rounded border-[#dbe7f4] text-[#1a4fd6] focus:ring-[#1a4fd6] cursor-pointer shrink-0"
          />
          <span className="text-xs text-[#4b6390] leading-relaxed select-none">
            I declare that the meter readings, landings, and details provided are accurate and correspond to the completed flight.
          </span>
        </label>

        {error && (
          <div className="p-3.5 sm:p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitBlocked}
          className={`w-full py-3.5 sm:py-4 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-bold uppercase tracking-wider sm:tracking-widest transition-all flex items-center justify-center gap-2 shadow-sm ${
            isSubmitBlocked
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
              : paymentMethod === 'previous_payment'
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-[0_4px_16px_rgba(5,150,105,0.3)]'
              : netPayableDueCents > 0 && paymentMethod === 'stripe'
              ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-[0_4px_16px_rgba(249,115,22,0.3)]'
              : 'bg-[#1a4fd6] hover:bg-[#152d5a] text-white shadow-[0_4px_16px_rgba(26,79,214,0.3)]'
          }`}
        >
          <LoadingButtonContent loading={loading} loadingLabel="Processing Submission…">
            <span className="material-symbols-outlined text-base sm:text-lg shrink-0">
              {paymentMethod === 'previous_payment'
                ? 'refresh'
                : netPayableDueCents > 0 && paymentMethod === 'stripe'
                ? 'credit_card'
                : netPayableDueCents > 0 && paymentMethod === 'bank_transfer'
                ? 'account_balance'
                : 'check_circle'}
            </span>
            <span className="truncate text-center">
              {paymentMethod === 'previous_payment' || netPayableDueCents === 0
                ? (calc.isBlockTime
                    ? `Submit Flight Record (Covered by ${calc.blockPackageName || 'Package'})`
                    : isResubmission
                    ? 'Resubmit Flight Record ($0.00 Due)'
                    : 'Submit Flight Record ($0.00 Due)')
                : paymentMethod === 'stripe'
                ? `Pay $${money(totalCardChargeRemainingCents)} & Submit Flight Record`
                : `Submit Flight Record & Bank Transfer Proof ($${money(netPayableDueCents)})`}
            </span>
          </LoadingButtonContent>
        </button>
      </div>
    </form>

      {/* ─── MODAL: TOP UP PACKAGE ────────────────────────────────────────── */}
      {showTopupModal && activePackage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-2 sm:p-4 md:p-6"
          onClick={() => setShowTopupModal(false)}
        >
          <div
            className="relative flex flex-col w-full max-w-xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh] rounded-2xl sm:rounded-3xl border border-[#152d5a]/10 bg-white shadow-[0_24px_90px_rgba(2,10,22,0.32)] overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-7 sm:py-5 border-b border-[#152d5a]/10 bg-white shrink-0">
              <div className="min-w-0 pr-1">
                <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#1a4fd6] font-sans">
                  TOP UP PACKAGE
                </p>
                <h2
                  className="mt-0.5 text-[18px] sm:text-[23px] font-normal leading-tight text-[#152d5a] truncate sm:whitespace-normal"
                  style={{ fontFamily: 'Newsreader, Georgia, serif' }}
                >
                  Add Hours to {activePackage.package_name || 'Block Time'}
                </h2>
                <p className="mt-0.5 text-[11px] sm:text-[13px] text-[#4b6390] font-sans">
                  Locked-in rate: ${activePackage.rate_per_hour?.toFixed(0) ?? 320}/hr · Fuel & GST included
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTopupModal(false)}
                className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full border border-[#152d5a]/10 bg-[#f8fafc] text-[#4b6390] transition-colors hover:bg-[#eef4fb] hover:text-[#152d5a] shrink-0"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Scrollable Body with isModal={true} */}
            <div className="flex-1 overflow-y-auto px-4 py-3.5 sm:px-7 sm:py-5">
              <BlockTimeTopupCard
                purchaseId={activePackage.id}
                packageName={activePackage.package_name || 'Block Time'}
                hoursPurchased={activePackage.hours_purchased || 10}
                hoursRemaining={activePackage.hours_remaining ?? 0}
                ratePerHour={activePackage.rate_per_hour ?? 320}
                expiresAt={activePackage.expires_at ?? new Date().toISOString()}
                validityDays={30}
                isModal={true}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
