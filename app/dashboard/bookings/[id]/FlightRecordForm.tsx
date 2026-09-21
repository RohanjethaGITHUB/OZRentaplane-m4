'use client'

import { useState, useRef, useMemo } from 'react'
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
  bookingSlotHours: number
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
  bookingSlotHours,
  is24HourBooking = false,
  customerCreditCents = 0,
  defaultHourlyRate = 330,
  bankDetails,
  initialRecord,
  initialLandings,
  initialAttachments,
  clarification,
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

  const isResubmission = Boolean(initialRecord || clarification)

  // Payment method state: stripe | bank_transfer | previous_payment
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'bank_transfer' | 'previous_payment'>(() => {
    return isResubmission ? 'previous_payment' : 'stripe'
  })
  const [bankReceiptFile, setBankReceiptFile] = useState<File | null>(null)
  const [bankReceiptPreview, setBankReceiptPreview] = useState<string | null>(null)
  const [bankReceiptError, setBankReceiptError] = useState<string | null>(null)
  const [bankReference, setBankReference] = useState('')
  const bankReceiptInputRef = useRef<HTMLInputElement>(null)

  const [readings, setReadings] = useState<TotalOnlyFormValues>({
    vdo_total: initialRecord?.vdo_total != null ? String(initialRecord.vdo_total) : '',
    air_switch_total: initialRecord?.air_switch_total != null ? String(initialRecord.air_switch_total) : '',
  })
  const [notes, setNotes] = useState(initialRecord?.customer_notes ?? '')
  const [minimumVdoDecision, setMinimumVdoDecision] = useState<'enforce_minimum' | 'bill_actual'>('enforce_minimum')

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
      defaultHourlyRate,
      airports,
      landingRows,
      activeBlockTime: activePackage,
      customerCreditCents,
      minimumVdoDecision,
    })
  }, [enteredVdoTotal, bookingSlotHours, defaultHourlyRate, airports, landingRows, activePackage, customerCreditCents, minimumVdoDecision])

  const isSubmitBlocked =
    loading ||
    !declaration ||
    hasLandingErrors ||
    !allLandingsFilled ||
    enteredVdoTotal == null ||
    enteredVdoTotal <= 0 ||
    calc.validationError !== null ||
    (calc.amountDueCents > 0 && paymentMethod === 'bank_transfer' && !bankReceiptFile)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitAttempted(true)
    setError(null)

    if (!declaration) {
      setError('Please check the declaration box before submitting.')
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

    if (calc.amountDueCents > 0 && paymentMethod === 'bank_transfer' && !bankReceiptFile) {
      setError('Please upload your bank transfer payment receipt.')
      return
    }

    try {
      setLoading(true)

      // 1. If bank transfer, upload receipt storage path first
      let bankReceiptPath: string | null = null
      if (calc.amountDueCents > 0 && paymentMethod === 'bank_transfer' && bankReceiptFile) {
        const receiptFd = new FormData()
        receiptFd.set('receipt', bankReceiptFile)
        receiptFd.set('bookingId', bookingId)
        const uploadRes = await uploadPostFlightBankTransferReceipt(receiptFd)
        bankReceiptPath = uploadRes.storagePath
      }

      // 2. Submit flight record & generate invoice
      const effectivePaymentMethod = calc.amountDueCents === 0 ? 'credit_or_block_time' : paymentMethod

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
        minimum_vdo_decision: minimumVdoDecision,
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
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Clarification Alert Banner */}
      {clarification && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-[1.5rem] p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-amber-600 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
              warning
            </span>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-amber-900 uppercase tracking-wide">
                Clarification Requested by Operations
              </h3>
              <p className="text-xs text-amber-700">Please review the note from operations below, adjust readings or evidence photos, and resubmit.</p>
            </div>
            {clarification.category && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-200/80 text-amber-900 border border-amber-300">
                {clarification.category}
              </span>
            )}
          </div>
          <div className="p-3.5 bg-white rounded-xl border border-amber-200 text-xs text-slate-800 font-medium leading-relaxed shadow-sm">
            <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider block mb-1">Message from Operations:</span>
            &ldquo;{clarification.message}&rdquo;
          </div>
        </div>
      )}

      {/* Meter readings section */}
      <div className="bg-white border border-[#dbe7f4] rounded-[1.5rem] p-6 sm:p-8 shadow-[0_8px_24px_rgba(21,45,90,0.06)] space-y-6">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[#1a4fd6] text-xl">speed</span>
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1a4fd6]">Aircraft Readings</h3>
            <p className="text-xs text-[#4b6390]">Enter total meter readings from the cockpit</p>
          </div>
        </div>

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
      <div className="bg-white border border-[#dbe7f4] rounded-[1.5rem] p-6 sm:p-8 shadow-[0_8px_24px_rgba(21,45,90,0.06)] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[#1a4fd6] text-xl">flight_land</span>
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
            className="inline-flex items-center gap-1 text-xs font-bold text-[#1a4fd6] hover:text-[#152d5a] bg-blue-50 hover:bg-blue-100/80 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Add Airport
          </button>
        </div>

        <div className="space-y-3">
          {landingRows.map((row, idx) => (
            <div key={idx} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3.5 rounded-xl bg-[#f8fbff] border border-[#dbe7f4]">
              <div className="flex-1 w-full">
                <select
                  value={row.airport_id}
                  onChange={(e) => updateLandingAirport(idx, e.target.value)}
                  disabled={loading}
                  className="w-full rounded-lg border border-[#dbe7f4] bg-white px-3 py-2 text-sm text-[#152d5a] focus:border-[#1a4fd6] focus:outline-none"
                >
                  <option value="" disabled>Select airport…</option>
                  {airportOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.icao_code} — {a.name} (${money(a.default_landing_fee_cents ?? 2895)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={row.landing_count}
                  onChange={(e) => updateLandingCount(idx, e.target.value)}
                  disabled={loading}
                  placeholder="Count"
                  className="w-24 rounded-lg border border-[#dbe7f4] bg-white px-3 py-2 text-sm text-center font-bold text-[#152d5a] focus:border-[#1a4fd6] focus:outline-none"
                />
                <span className="text-xs text-[#4b6390] shrink-0">landings</span>
                {landingRows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLandingRow(idx)}
                    disabled={loading}
                    className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors ml-auto sm:ml-0"
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
      <div className="bg-white border border-[#dbe7f4] rounded-[1.5rem] p-6 sm:p-8 shadow-[0_8px_24px_rgba(21,45,90,0.06)] space-y-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[#1a4fd6] text-xl">photo_camera</span>
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1a4fd6]">Evidence Upload</h3>
            <p className="text-xs text-[#4b6390]">Upload photos of meter readings (Hobbs / VDO / Tacho / Fuel)</p>
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
            dragOver ? 'border-[#1a4fd6] bg-blue-50/50' : 'border-[#dbe7f4] hover:border-[#1a4fd6]/60 bg-[#f8fbff]'
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
            <p className="text-xs text-[#4b6390]">JPEG or PNG only • Up to 10 MB each</p>
          </div>
        </div>

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
      <div className="bg-white border-2 border-[#1a4fd6]/20 rounded-[1.5rem] p-6 sm:p-8 shadow-[0_8px_24px_rgba(21,45,90,0.08)] space-y-6">
        <div className="flex items-center justify-between gap-4 border-b border-[#dbe7f4] pb-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[#1a4fd6] text-2xl">receipt_long</span>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#152d5a]">Flight Invoice & Live Breakdown</h3>
              <p className="text-xs text-[#4b6390]">Immediate calculation based on your meter readings</p>
            </div>
          </div>
          {enteredVdoTotal != null && enteredVdoTotal > 0 && (
            <span className="px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-bold text-[#1a4fd6] tabular-nums">
              {enteredVdoTotal.toFixed(1)} hrs VDO
            </span>
          )}
        </div>

        {/* Multi-Day Minimum VDO Decision Selector (Image 3 behavior for customers) */}
        {calc.minimumVdoBilling.isBelowMinimum && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50/90 p-5 space-y-3.5 shadow-xs">
            <div className="flex items-start gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-200 text-amber-900 shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-base">schedule</span>
              </span>
              <div className="space-y-1">
                <p className="text-xs font-bold text-amber-950">
                  VDO hours are below the minimum for this booking.
                </p>
                <p className="text-xs text-amber-800 leading-relaxed">
                  VDO hours flown: <span className="font-mono font-bold">{enteredVdoTotal?.toFixed(1)} h</span>
                  {' '}| Minimum for this booking ({calc.minimumVdoBilling.bookingDays} day{calc.minimumVdoBilling.bookingDays === 1 ? '' : 's'} booked &times; 4h/day):{' '}
                  <span className="font-mono font-bold">{calc.minimumVdoBilling.minimumVdoHours.toFixed(1)} h</span>
                </p>
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-amber-900 block">
                Billing Decision
              </label>
              <select
                value={minimumVdoDecision}
                onChange={(e) => setMinimumVdoDecision(e.target.value as 'enforce_minimum' | 'bill_actual')}
                className="w-full rounded-xl border border-amber-300 bg-white p-3 text-xs font-semibold text-[#152d5a] focus:border-[#1a4fd6] focus:outline-none shadow-xs"
              >
                <option value="enforce_minimum">
                  Enforce minimum billing ({calc.minimumVdoBilling.minimumVdoHours.toFixed(1)}h minimum)
                </option>
                <option value="bill_actual">
                  Bill actual hours ({enteredVdoTotal?.toFixed(1)}h flown)
                </option>
              </select>
              <p className="text-[11px] text-amber-700/90 leading-relaxed pt-0.5">
                {minimumVdoDecision === 'bill_actual'
                  ? `You have elected to bill for actual hours flown (${enteredVdoTotal?.toFixed(1)}h). Operations will verify this during post-flight review.`
                  : `Multi-day rental policy applies a 4h/day minimum (${calc.minimumVdoBilling.minimumVdoHours.toFixed(1)}h total minimum).`}
              </p>
            </div>
          </div>
        )}

        {calc.validationError ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-medium">
            {calc.validationError}
          </div>
        ) : (
          <div className="space-y-3.5 text-sm">
            {/* VDO Hours / Block Time line */}
            <div className="flex items-start justify-between gap-4 text-[#152d5a]">
              <div>
                <p className="font-semibold">
                  {calc.isBlockTime ? 'Flight Hours (Block Time Package)' : 'Flight Charge (VDO Hours)'}
                </p>
                <p className="text-xs text-[#4b6390] mt-0.5">
                  {calc.billedVdoHours != null && calc.billedVdoHours > 0 ? (
                    calc.isBlockTime ? (
                      calc.blockOverageHours > 0 ? (
                        <>
                          {calc.blockHoursDeducted.toFixed(1)}h covered via package + {calc.blockOverageHours.toFixed(1)}h overage (${money(calc.hourlyRate * 100)}/hr)
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
                <p className="font-bold tabular-nums">
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
                  <p className="font-semibold">Landing Fees</p>
                  <p className="font-bold tabular-nums">${money(calc.landingSubtotalCents)}</p>
                </div>
                {calc.landingItems.map((item, i) => (
                  <div key={i} className="flex justify-between text-xs text-[#4b6390] pl-2">
                    <span>{item.icaoCode} · {item.airportName} (${money(item.unitAmountCents)} × {item.landingCount})</span>
                    <span className="tabular-nums font-medium">${money(item.totalAmountCents)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Subtotal */}
            <div className="flex justify-between border-t border-[#dbe7f4] pt-3 font-semibold text-[#152d5a]">
              <span>Subtotal</span>
              <span className="tabular-nums">${money(calc.subtotalCents)}</span>
            </div>

            {/* Customer credit */}
            {calc.creditAppliedCents > 0 && (
              <div className="flex justify-between text-emerald-600 font-medium">
                <span>Account Credit Applied</span>
                <span className="tabular-nums">-${money(calc.creditAppliedCents)}</span>
              </div>
            )}

            {/* Net Amount Due */}
            <div className="flex justify-between items-baseline border-t-2 border-[#1a4fd6]/30 pt-3 text-[#1a4fd6]">
              <div>
                <span className="text-base font-bold">Net Amount Due</span>
                {calc.isFullyCovered && (
                  <span className="block text-[11px] text-emerald-600 font-medium mt-0.5">
                    100% covered by package / credit balance
                  </span>
                )}
              </div>
              <span className="text-2xl font-black tabular-nums">${money(calc.amountDueCents)}</span>
            </div>
          </div>
        )}

        {/* ── PAYMENT METHOD SELECTION ────────────────────────────────────── */}
        {calc.amountDueCents > 0 && (
          <div className="border-t border-[#dbe7f4] pt-6 space-y-5">
            {isResubmission && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:p-5 text-xs space-y-3 shadow-sm">
                <div className="flex items-center gap-2 text-emerald-800 font-bold uppercase tracking-wider">
                  <span className="material-symbols-outlined text-lg text-emerald-600" style={{ fontVariationSettings: "'FILL' 1" }}>
                    verified
                  </span>
                  Payment Already Submitted / Recorded
                </div>
                <p className="text-emerald-700 leading-relaxed">
                  Your previous payment has already been recorded and is on file with operations. You do not need to pay again unless you wish to upload a new bank receipt or pay online.
                </p>
                <div className="flex flex-wrap gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('previous_payment')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                      paymentMethod === 'previous_payment'
                        ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-400'
                        : 'bg-white text-emerald-800 border border-emerald-300 hover:bg-emerald-100/60'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">check_circle</span>
                    Keep Previous Payment (No Payment Required)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('stripe')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                      paymentMethod !== 'previous_payment'
                        ? 'bg-[#1a4fd6] text-white shadow-sm ring-2 ring-[#1a4fd6]/20'
                        : 'bg-white text-[#4b6390] border border-[#dbe7f4] hover:bg-[#f0f6ff]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">payment</span>
                    Update Payment Method / Proof
                  </button>
                </div>
              </div>
            )}

            {(!isResubmission || paymentMethod !== 'previous_payment') && (
              <>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1a4fd6] block mb-3">
                    Select Payment Method <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('stripe')}
                      className={`p-4 rounded-2xl border-2 flex items-center gap-3 transition-all ${
                        paymentMethod === 'stripe'
                          ? 'border-[#1a4fd6] bg-blue-50/70 text-[#152d5a] shadow-sm ring-2 ring-[#1a4fd6]/20'
                          : 'border-[#dbe7f4] bg-[#f8fbff] text-[#4b6390] hover:border-[#1a4fd6]/40'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        paymentMethod === 'stripe' ? 'bg-[#1a4fd6] text-white' : 'bg-white text-[#4b6390] border border-[#dbe7f4]'
                      }`}>
                        <span className="material-symbols-outlined text-xl">credit_card</span>
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold uppercase tracking-wider text-[#152d5a]">Pay Online (Card)</p>
                        <p className="text-[11px] text-[#4b6390]">Immediate Visa / Mastercard / Apple Pay</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('bank_transfer')}
                      className={`p-4 rounded-2xl border-2 flex items-center gap-3 transition-all ${
                        paymentMethod === 'bank_transfer'
                          ? 'border-[#1a4fd6] bg-blue-50/70 text-[#152d5a] shadow-sm ring-2 ring-[#1a4fd6]/20'
                          : 'border-[#dbe7f4] bg-[#f8fbff] text-[#4b6390] hover:border-[#1a4fd6]/40'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        paymentMethod === 'bank_transfer' ? 'bg-[#1a4fd6] text-white' : 'bg-white text-[#4b6390] border border-[#dbe7f4]'
                      }`}>
                        <span className="material-symbols-outlined text-xl">account_balance</span>
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold uppercase tracking-wider text-[#152d5a]">Bank Transfer</p>
                        <p className="text-[11px] text-[#4b6390]">Transfer via NAB & upload receipt</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Payment Sub-panel: Card Details Summary */}
                {paymentMethod === 'stripe' && (
                  <div className="rounded-xl bg-[#f0f6ff] border border-[#dbe7f4] p-4 text-xs space-y-2">
                    <div className="flex justify-between text-[#4b6390]">
                      <span>Base Invoice Amount</span>
                      <span className="font-semibold tabular-nums text-[#152d5a]">${money(calc.amountDueCents)}</span>
                    </div>
                    {calc.stripeSurchargeCents > 0 && (
                      <div className="flex justify-between text-[#4b6390]">
                        <span>Card Processing Fee (1.7% + 30c)</span>
                        <span className="font-medium tabular-nums">${money(calc.stripeSurchargeCents)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-[#152d5a] font-bold border-t border-[#dbe7f4] pt-2 text-sm">
                      <span>Total Card Charge</span>
                      <span className="tabular-nums text-[#1a4fd6]">${money(calc.stripeGrossAmountCents)}</span>
                    </div>
                  </div>
                )}

                {/* Payment Sub-panel: Bank Transfer Details & Upload */}
                {paymentMethod === 'bank_transfer' && (
                  <div className="space-y-4">
                    <div className="rounded-2xl bg-[#f8fbff] border border-[#dbe7f4] p-5 space-y-3 text-xs">
                      <div className="flex items-center gap-2 text-[#1a4fd6] font-bold uppercase tracking-wider">
                        <span className="material-symbols-outlined text-base">account_balance</span>
                        Bank Account Details for Transfer
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm pt-1">
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
                        className="border-2 border-dashed border-[#dbe7f4] hover:border-[#1a4fd6] rounded-xl p-4 text-center cursor-pointer bg-[#f8fbff] transition-colors"
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
                            <div className="flex items-center gap-2.5">
                              <span className="material-symbols-outlined text-emerald-500 text-2xl">check_circle</span>
                              <div>
                                <p className="text-xs font-bold text-[#152d5a]">{bankReceiptFile.name}</p>
                                <p className="text-[10px] text-[#4b6390]">{(bankReceiptFile.size / 1024 / 1024).toFixed(2)} MB</p>
                              </div>
                            </div>
                            <span className="text-xs text-[#1a4fd6] font-semibold">Change File</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-2 text-xs text-[#4b6390]">
                            <span className="material-symbols-outlined text-[#1a4fd6]">receipt_long</span>
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
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Declaration & Actions ───────────────────────────────────────────── */}
      <div className="bg-white border border-[#dbe7f4] rounded-[1.5rem] p-6 sm:p-8 shadow-[0_8px_24px_rgba(21,45,90,0.06)] space-y-6">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={declaration}
            onChange={(e) => setDeclaration(e.target.checked)}
            disabled={loading}
            className="mt-0.5 w-4 h-4 rounded border-[#dbe7f4] text-[#1a4fd6] focus:ring-[#1a4fd6] cursor-pointer"
          />
          <span className="text-xs text-[#4b6390] leading-relaxed select-none">
            I declare that the meter readings, landings, and details provided are accurate and correspond to the completed flight.
          </span>
        </label>

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitBlocked}
          className={`w-full py-4 rounded-xl text-sm font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-sm ${
            isSubmitBlocked
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
              : paymentMethod === 'previous_payment'
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-[0_4px_16px_rgba(5,150,105,0.3)]'
              : calc.amountDueCents > 0 && paymentMethod === 'stripe'
              ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-[0_4px_16px_rgba(249,115,22,0.3)]'
              : 'bg-[#1a4fd6] hover:bg-[#152d5a] text-white shadow-[0_4px_16px_rgba(26,79,214,0.3)]'
          }`}
        >
          <LoadingButtonContent loading={loading} loadingLabel="Processing Submission…">
            <span className="material-symbols-outlined text-lg">
              {paymentMethod === 'previous_payment'
                ? 'refresh'
                : calc.amountDueCents > 0 && paymentMethod === 'stripe'
                ? 'credit_card'
                : calc.amountDueCents > 0 && paymentMethod === 'bank_transfer'
                ? 'account_balance'
                : 'check_circle'}
            </span>
            {paymentMethod === 'previous_payment'
              ? 'Resubmit Updated Flight Record'
              : calc.amountDueCents > 0
              ? paymentMethod === 'stripe'
                ? `Pay $${money(calc.stripeGrossAmountCents)} & Submit Flight Record`
                : `Submit Flight Record & Bank Transfer Proof ($${money(calc.amountDueCents)})`
              : 'Submit Flight Record ($0.00 Due)'}
          </LoadingButtonContent>
        </button>
      </div>
    </form>
  )
}
