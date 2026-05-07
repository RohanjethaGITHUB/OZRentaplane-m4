'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  cancelCheckoutBooking,
  markCheckoutFlightCompleted,
  markCheckoutOutcome,
} from '@/app/actions/admin-booking'

// checkout_requested is handled by AdminCheckoutReviewPanel (left column)
type CheckoutStatus =
  | 'checkout_confirmed'
  | 'checkout_completed_under_review'

type Airport = {
  id: string
  icao_code: string
  name: string
  default_landing_fee_cents: number
}

type LandingChargeRow = {
  id:           number
  airportId:    string
  landingCount: string
}

type Props = {
  bookingId:           string
  status:              CheckoutStatus
  airports:            Airport[]
  customerCreditCents: number
}

type OutcomeKey = 'cleared_to_fly' | 'additional_checkout_required' | 'checkout_reschedule_required' | 'not_currently_eligible'

const OUTCOMES: { key: OutcomeKey; label: string; body: string; color: string; border: string; textColor: string; icon: string }[] = [
  {
    key:       'cleared_to_fly',
    label:     'Cleared to Fly',
    body:      'Pilot has passed checkout and can make standard aircraft bookings after payment is settled.',
    color:     'bg-emerald-600 hover:bg-emerald-500',
    border:    'border-emerald-500/30',
    textColor: 'text-emerald-400',
    icon:      'verified',
  },
  {
    key:       'additional_checkout_required',
    label:     'Additional Checkout Required',
    body:      'Pilot is close but needs another checkout session before being cleared. They can book another checkout flight after payment is settled.',
    color:     'bg-amber-600 hover:bg-amber-500',
    border:    'border-amber-500/30',
    textColor: 'text-amber-400',
    icon:      'schedule',
  },
  {
    key:       'checkout_reschedule_required',
    label:     'Checkout Reschedule Required',
    body:      'Checkout could not be properly assessed (e.g. weather, time, or scheduling). Pilot can book another checkout flight after payment is settled.',
    color:     'bg-orange-600 hover:bg-orange-500',
    border:    'border-orange-500/30',
    textColor: 'text-orange-400',
    icon:      'event_repeat',
  },
  {
    key:       'not_currently_eligible',
    label:     'Not Currently Eligible',
    body:      'Pilot is not ready to continue with aircraft hire. They cannot book a standard or checkout flight automatically. Further training with a qualified instructor is required.',
    color:     'bg-rose-700 hover:bg-rose-600',
    border:    'border-rose-500/30',
    textColor: 'text-rose-400',
    icon:      'block',
  },
]

let rowIdCounter = 0

// Parse a VDO reading string; one decimal place required, must be > 0.
function parseVdoReading(s: string): number {
  const n = parseFloat(s)
  if (isNaN(n) || n <= 0) return NaN
  if (!/^\d+(\.\d)?$/.test(s.trim())) return NaN
  return n
}

export default function AdminCheckoutActions({ bookingId, status, airports, customerCreditCents }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError]             = useState<string | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [confirmingOutcome, setConfirmingOutcome] = useState<OutcomeKey | null>(null)
  const [adminNote, setAdminNote] = useState('')
  const [submitAttempted, setSubmitAttempted] = useState(false)

  // VDO reading state — single value from the aircraft paper sheet
  const [vdoReading, setVdoReading] = useState('')

  // Hourly rate state — admin-editable, default $290/hr
  const [hourlyRate, setHourlyRate] = useState('290')

  // Landing charges state
  const [landingRows, setLandingRows] = useState<LandingChargeRow[]>([])

  // Waiver state — only applicable for non-cleared outcomes
  const [paymentWaived, setPaymentWaived] = useState(false)
  const [waiverReason, setWaiverReason]   = useState('')

  function run(fn: () => Promise<void>) {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
        router.refresh()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Action failed. Please try again.'
        setError(msg.replace(/^VALIDATION: /, ''))
      }
    })
  }

  // ── Hourly rate parsing ───────────────────────────────────────────────────
  const hourlyRateNum   = parseFloat(hourlyRate)
  const validHourlyRate = !isNaN(hourlyRateNum) && hourlyRateNum > 0
  const hourlyRateCents = validHourlyRate ? Math.round(hourlyRateNum * 100) : 0

  // ── VDO reading billing calculations (client-side preview only) ───────────
  const vdoReadingNum   = parseVdoReading(vdoReading)
  const validVdoReading = !isNaN(vdoReadingNum)
  const vdoReadingValid = validVdoReading && vdoReadingNum >= 0.1 && vdoReadingNum <= 5.0

  const vdoBaseCents = vdoReadingValid && validHourlyRate
    ? Math.round(vdoReadingNum * hourlyRateCents)
    : 0

  // Landing fee is fixed at $25 per landing (matches server-side constant 2500 cents).
  const LANDING_FEE_CENTS = 2500

  const landingSubtotalCents = landingRows.reduce((sum, row) => {
    const count = parseInt(row.landingCount, 10)
    if (!row.airportId || isNaN(count) || count <= 0) return sum
    return sum + LANDING_FEE_CENTS * count
  }, 0)

  const finalAmountCents = vdoBaseCents + landingSubtotalCents

  const creditApplicable   = Math.min(customerCreditCents, finalAmountCents)
  const estimatedAmountDue = Math.max(finalAmountCents - creditApplicable, 0)

  // VDO validation error message
  const vdoErrorMsg = validVdoReading && !vdoReadingValid
    ? vdoReadingNum < 0.1
      ? `VDO reading (${vdoReadingNum}h) is below 0.1h minimum — check the paper sheet`
      : `VDO reading (${vdoReadingNum}h) exceeds 5.0h maximum — check the paper sheet`
    : null

  // Incomplete landing row: airport blank with count > 0, or airport set with count <= 0.
  const hasIncompleteLandingRows = landingRows.some(row => {
    const count     = parseInt(row.landingCount, 10)
    const hasAirport = !!row.airportId
    const hasCount   = !isNaN(count) && count > 0
    return (hasCount && !hasAirport) || (hasAirport && !hasCount)
  })

  // Outcome supports waiver for all non-cleared_to_fly outcomes
  const outcomeSupportsWaiver = confirmingOutcome !== null && confirmingOutcome !== 'cleared_to_fly'

  // Landing row is valid when airport and count are both set and count > 0
  const hasValidLandingRow = landingRows.some(row => {
    const count = parseInt(row.landingCount, 10)
    return !!row.airportId && !isNaN(count) && count > 0
  })

  const canSubmit = confirmingOutcome !== null && (
    paymentWaived
      ? waiverReason.trim().length > 0 && !hasIncompleteLandingRows && hasValidLandingRow
      : vdoReadingValid && validHourlyRate && !hasIncompleteLandingRows && finalAmountCents > 0 && hasValidLandingRow
  )

  function addLandingRow() {
    setLandingRows(rows => [...rows, { id: ++rowIdCounter, airportId: '', landingCount: '1' }])
  }

  function removeLandingRow(id: number) {
    setLandingRows(rows => rows.length > 1 ? rows.filter(r => r.id !== id) : rows)
  }

  function handleLandingChange(id: number, field: 'airportId' | 'landingCount', value: string) {
    setLandingRows(rows => rows.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  function resetOutcomeForm() {
    setConfirmingOutcome(null)
    setSubmitAttempted(false)
    setAdminNote('')
    setVdoReading('')
    setHourlyRate('290')
    setLandingRows([])
    setPaymentWaived(false)
    setWaiverReason('')
    setError(null)
  }

  function handleOutcomeSelect(key: OutcomeKey) {
    setConfirmingOutcome(key)
    setSubmitAttempted(false)
    setPaymentWaived(key === 'checkout_reschedule_required')
    setWaiverReason('')
    setVdoReading('')
    setLandingRows([{ id: ++rowIdCounter, airportId: '', landingCount: '1' }])
    setError(null)
  }

  function handlePaymentModeChange(waive: boolean) {
    setPaymentWaived(waive)
    setWaiverReason('')
    if (!waive) setVdoReading('')
  }

  function handleSubmit() {
    setSubmitAttempted(true)
    if (!confirmingOutcome) return

    const validLandingCharges = landingRows
      .filter(r => r.airportId && parseInt(r.landingCount, 10) > 0)
      .map(r => ({ airportId: r.airportId, landingCount: parseInt(r.landingCount, 10) }))

    if (paymentWaived) {
      run(() => markCheckoutOutcome({
        bookingId,
        outcome:              confirmingOutcome,
        adminNote:            adminNote || undefined,
        paymentWaived:        true,
        waiverReason,
        landingCharges:       validLandingCharges,
        checkoutRatePerHour:  hourlyRateNum,
      }))
    } else {
      run(() => markCheckoutOutcome({
        bookingId,
        outcome:              confirmingOutcome,
        adminNote:            adminNote || undefined,
        vdoReading:           vdoReadingNum,
        checkoutRatePerHour:  hourlyRateNum,
        landingCharges:       validLandingCharges,
        paymentWaived:        false,
      }))
    }
  }

  // ── Cancel flow ───────────────────────────────────────────────────────────

  if (isCancelling) {
    return (
      <div className="space-y-3">
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-rose-400">Cancel Checkout Booking</h4>
        <textarea
          value={cancelReason}
          onChange={e => setCancelReason(e.target.value)}
          rows={4}
          placeholder="Reason for cancellation (will be recorded in audit trail)…"
          className="w-full bg-[#0a0b0d] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50 resize-none"
          disabled={isPending}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setIsCancelling(false); setError(null) }}
            disabled={isPending}
            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-white/5 text-slate-300 hover:bg-white/10 transition-colors"
          >
            Back
          </button>
          <button
            type="button"
            disabled={isPending || !cancelReason.trim()}
            onClick={() => run(() => cancelCheckoutBooking(bookingId, cancelReason))}
            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-rose-700 hover:bg-rose-600 text-white transition-colors disabled:opacity-50"
          >
            {isPending ? 'Cancelling…' : 'Cancel Booking'}
          </button>
        </div>
        {error && <p className="text-[10px] text-rose-400 leading-tight">{error}</p>}
      </div>
    )
  }

  // ── checkout_confirmed ────────────────────────────────────────────────────

  if (status === 'checkout_confirmed') {
    return (
      <div className="space-y-3">
        <button
          onClick={() => run(() => markCheckoutFlightCompleted(bookingId))}
          disabled={isPending}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[18px]">flight_land</span>
          {isPending ? 'Updating…' : 'Mark Checkout Completed'}
        </button>
        <p className="text-[9px] text-slate-600 leading-relaxed text-center">
          Click after the checkout flight has physically occurred. You will then record the outcome and VDO reading.
        </p>
        <button
          onClick={() => setIsCancelling(true)}
          disabled={isPending}
          className="w-full flex items-center justify-center gap-2 bg-transparent border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[16px]">cancel</span>
          Cancel Checkout
        </button>
        {error && <p className="text-[10px] text-rose-400 leading-tight text-center">{error}</p>}
      </div>
    )
  }

  // ── checkout_completed_under_review — outcome form ────────────────────────

  // Step 1: outcome selector
  if (!confirmingOutcome) {
    return (
      <div className="space-y-2.5">
        <p className="text-[9px] uppercase tracking-widest font-bold text-slate-500 mb-3">
          Record Checkout Outcome
        </p>
        {OUTCOMES.map(outcome => (
          <button
            key={outcome.key}
            onClick={() => handleOutcomeSelect(outcome.key)}
            disabled={isPending}
            className="w-full flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:border-white/15 hover:bg-white/[0.06] text-left transition-all disabled:opacity-50"
          >
            <span
              className={`material-symbols-outlined text-[18px] flex-shrink-0 mt-0.5 ${outcome.textColor}`}
              style={{ fontVariationSettings: "'wght' 300" }}
            >
              {outcome.icon}
            </span>
            <div className="min-w-0">
              <p className={`text-[11px] font-semibold ${outcome.textColor}`}>{outcome.label}</p>
              <p className="text-[10px] text-slate-600 leading-relaxed mt-0.5">{outcome.body}</p>
            </div>
          </button>
        ))}
        {error && <p className="text-[10px] text-rose-400 leading-tight">{error}</p>}
      </div>
    )
  }

  // Step 2: billing or waiver form
  const outcome = OUTCOMES.find(o => o.key === confirmingOutcome)!
  const landingRowsRequiredError = !hasValidLandingRow || landingRows.length === 0
  const showLandingRowsRequiredError = submitAttempted && landingRowsRequiredError
  const showHourlyRateError = submitAttempted && !paymentWaived && !validHourlyRate
  const showVdoError = submitAttempted && !paymentWaived && !vdoReadingValid

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-[#0f1216] p-5">
        <h3 className="text-base font-semibold text-white mb-4">Record Checkout Outcome</h3>
        <div className={`rounded-xl border p-4 ${outcome.border} bg-white/[0.02]`}>
          <p className={`text-sm font-semibold ${outcome.textColor} mb-1`}>
            {outcome.label}
          </p>
          <p className="text-sm text-slate-300 leading-relaxed">{outcome.body}</p>
        </div>

        {/* ── Payment mode toggle (non-cleared outcomes only) ────── */}
        {outcomeSupportsWaiver && (
          <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
            <p className="text-sm font-medium text-slate-300 mb-3">
              Charge customer for this checkout?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handlePaymentModeChange(false)}
                disabled={isPending}
                className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  !paymentWaived
                    ? 'bg-blue-600/30 border border-blue-500/40 text-blue-300'
                    : 'bg-white/[0.03] border border-white/[0.07] text-slate-400 hover:bg-white/[0.06]'
                }`}
              >
                Yes, create payment request
              </button>
              <button
                type="button"
                onClick={() => handlePaymentModeChange(true)}
                disabled={isPending}
                className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  paymentWaived
                    ? 'bg-amber-600/20 border border-amber-500/40 text-amber-300'
                    : 'bg-white/[0.03] border border-white/[0.07] text-slate-400 hover:bg-white/[0.06]'
                }`}
              >
                No, waive payment
              </button>
            </div>
          </div>
        )}

        {/* ── Waiver path ───────────────────────────────────────────── */}
        {paymentWaived && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg bg-amber-500/[0.06] border border-amber-500/20 px-3 py-3">
              <p className="text-sm text-amber-300/80 leading-relaxed">
                Payment will be waived. The outcome will be applied immediately and the customer will not be asked to pay. A waived audit record will be stored.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Waiver reason <span className="text-rose-400">*</span>
              </label>
              <textarea
                value={waiverReason}
                onChange={e => setWaiverReason(e.target.value)}
                rows={3}
                placeholder="Required — e.g. weather cancellation, aircraft unavailable, customer did not fly, incorrect documents…"
                className={`w-full bg-[#0a0b0d] border rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none resize-none ${
                  waiverReason.trim() ? 'border-white/10 focus:border-slate-500/50' : 'border-rose-500/30 focus:border-rose-500/50'
                }`}
                disabled={isPending}
              />
              {!waiverReason.trim() && (
                <p className="text-xs text-rose-400/80 mt-1.5">A waiver reason is required.</p>
              )}
            </div>
          </div>
        )}

        {/* ── Airport landings section (Required for ALL outcomes) ─── */}
        <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-base font-semibold text-white">
                Airport landings
                <span className="text-rose-400 ml-1">*</span>
              </p>
              <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                Add each airport and number of landings. At least one valid landing row is required.
              </p>
            </div>
            <button
              type="button"
              onClick={addLandingRow}
              disabled={isPending || airports.length === 0}
              className="flex items-center gap-1.5 text-sm text-[#a7c8ff]/80 hover:text-[#a7c8ff] transition-colors disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[14px]">add_circle</span>
              Add Airport
            </button>
          </div>

          {airports.length === 0 && (
            <p className="text-sm text-slate-500 italic">No airports available — run migration 036 first.</p>
          )}

          <div className="space-y-3">
            {landingRows.map(row => {
              const landingCount = parseInt(row.landingCount, 10)
              const hasAirport   = !!row.airportId
              const hasCount     = !isNaN(landingCount) && landingCount > 0
              const rowError = !hasAirport
                ? 'Airport is required.'
                : (!hasCount ? 'Landing count must be at least 1.' : null)
              const rowTotal = hasAirport && hasCount ? LANDING_FEE_CENTS * landingCount : 0

              return (
                <div key={row.id} className="rounded-lg border border-white/10 bg-[#0a0d11] p-3">
                  <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_110px_120px_44px] gap-2 items-start">
                    <div className="relative min-w-0">
                      <select
                        value={row.airportId}
                        onChange={e => handleLandingChange(row.id, 'airportId', e.target.value)}
                        disabled={isPending}
                        className={`w-full appearance-none bg-[#0c1015] border rounded-lg pl-3 pr-9 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-slate-500/60 ${
                          showLandingRowsRequiredError || (!hasAirport && hasCount) ? 'border-rose-500/50' : 'border-white/10'
                        }`}
                      >
                        <option value="">Select airport</option>
                        {airports.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.icao_code} — {a.name}
                          </option>
                        ))}
                      </select>
                      <span className="pointer-events-none material-symbols-outlined text-[18px] text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2">
                        unfold_more
                      </span>
                    </div>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={row.landingCount}
                      onChange={e => handleLandingChange(row.id, 'landingCount', e.target.value)}
                      disabled={isPending}
                      className={`w-full bg-[#0c1015] border rounded-lg px-3 py-2.5 text-sm text-slate-200 text-center focus:outline-none focus:border-slate-500/60 ${
                        (showLandingRowsRequiredError && !hasCount) || (hasAirport && !hasCount) ? 'border-rose-500/50' : 'border-white/10'
                      }`}
                      title="Number of landings"
                    />
                    <div className="h-[42px] flex items-center justify-end rounded-lg border border-white/10 bg-[#0c1015] px-3">
                      <span className="text-sm font-mono text-slate-300">
                        {rowTotal > 0 && !paymentWaived ? `$${(rowTotal / 100).toFixed(2)}` : '—'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLandingRow(row.id)}
                      disabled={isPending || landingRows.length <= 1}
                      title={landingRows.length <= 1 ? 'At least one landing row is required' : 'Remove this row'}
                      className="h-[42px] flex items-center justify-center rounded-lg border border-white/10 bg-[#0c1015] text-slate-500 hover:text-rose-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined text-[18px]">remove_circle</span>
                    </button>
                  </div>
                  {(submitAttempted || hasAirport || row.landingCount !== '1') && rowError && (
                    <p className="text-xs text-rose-400/80 mt-1.5">{rowError}</p>
                  )}
                </div>
              )
            })}

            {!paymentWaived && landingSubtotalCents > 0 && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                <span className="text-sm text-slate-400">Landing fees ($25 × landings)</span>
                <span className="text-sm font-mono text-slate-200">
                  ${(landingSubtotalCents / 100).toFixed(2)}
                </span>
              </div>
            )}

            {hasIncompleteLandingRows && (
              <p className="text-xs text-rose-400/80">
                Complete or remove incomplete landing rows before submitting.
              </p>
            )}
            {showLandingRowsRequiredError && (
              <p className="text-xs text-rose-400/80">At least one airport landing is required, with landing count of 1 or more.</p>
            )}
          </div>
        </div>

        {/* ── Payment path — VDO reading ───────────────────────────── */}
        {!paymentWaived && (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-4">
              <div>
                <p className="text-base font-semibold text-white mb-1">
                  Flight Billing
                </p>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Enter the VDO reading from the aircraft paper sheet. This is the total billable duration taken directly from the flight record.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Hourly rate <span className="text-rose-400">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative w-44 max-w-full">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 pointer-events-none">$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0.01"
                        step="0.01"
                        value={hourlyRate}
                        onChange={e => setHourlyRate(e.target.value)}
                        placeholder="290.00"
                        className={`w-full bg-[#0a0b0d] border rounded-lg pl-7 pr-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-500/50 ${
                          showHourlyRateError || (hourlyRate && !validHourlyRate) ? 'border-rose-500/50' : 'border-white/10'
                        }`}
                        disabled={isPending}
                      />
                    </div>
                    <span className="text-sm text-slate-400 flex-shrink-0">$ / hr</span>
                  </div>
                  {(showHourlyRateError || (hourlyRate && !validHourlyRate)) && (
                    <p className="text-xs text-rose-400/80 mt-1.5">Enter a rate greater than 0.</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    VDO reading <span className="text-rose-400">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={vdoReading}
                      onChange={e => setVdoReading(e.target.value)}
                      placeholder="e.g. 1.4"
                      className={`w-40 max-w-full bg-[#0a0b0d] border rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-500/50 ${
                        showVdoError || (vdoReading && !validVdoReading) ? 'border-rose-500/50' : 'border-white/10'
                      }`}
                      disabled={isPending}
                    />
                    <span className="text-sm text-slate-400">hours</span>
                  </div>
                  {(showVdoError || (vdoReading && !validVdoReading)) && (
                    <p className="text-xs text-rose-400/80 mt-1.5">Enter a valid reading greater than 0 with one decimal place (e.g. 1.4).</p>
                  )}
                  {vdoErrorMsg && (
                    <p className="text-xs text-rose-400/80 mt-1">{vdoErrorMsg}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Final amount preview */}
            {vdoReadingValid && validHourlyRate && (
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5 space-y-2">
                <p className="text-base font-semibold text-white mb-1">Checkout Amount</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">VDO reading</span>
                  <span className="text-sm font-mono text-slate-200">{vdoReadingNum.toFixed(1)} h</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Hourly rate</span>
                  <span className="text-sm font-mono text-slate-200">
                    ${hourlyRateNum.toFixed(2)}/hr
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">
                    Aircraft hire ({vdoReadingNum.toFixed(1)}h × ${hourlyRateNum.toFixed(2)})
                  </span>
                  <span className="text-sm font-mono text-slate-200">
                    ${(vdoBaseCents / 100).toFixed(2)}
                  </span>
                </div>
                {landingSubtotalCents > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Landing charges</span>
                    <span className="text-sm font-mono text-slate-200">
                      ${(landingSubtotalCents / 100).toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="border-t border-white/[0.08] pt-2.5 mt-1 flex items-center justify-between">
                  <span className="text-base font-semibold text-slate-100">Final checkout amount</span>
                  <span className="text-xl font-bold font-mono text-white">
                    ${(finalAmountCents / 100).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Credit display */}
            {vdoReadingValid && validHourlyRate && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5 space-y-2">
                <p className="text-base font-semibold text-white mb-1">Customer Credit</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Available customer credit</span>
                  <span className={`text-lg font-semibold font-mono ${customerCreditCents > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {customerCreditCents > 0 ? `$${(customerCreditCents / 100).toFixed(2)}` : '$0.00'}
                  </span>
                </div>
                {creditApplicable > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Credit will be applied</span>
                    <span className="text-sm font-mono text-emerald-400">
                      −${(creditApplicable / 100).toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="border-t border-white/[0.08] pt-2.5 mt-1 flex items-center justify-between">
                  <span className="text-base font-semibold text-slate-100">Estimated amount due</span>
                  <span className={`text-xl font-bold font-mono ${estimatedAmountDue > 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                    {estimatedAmountDue > 0 ? `$${(estimatedAmountDue / 100).toFixed(2)}` : 'Settled by credit'}
                  </span>
                </div>
                {estimatedAmountDue === 0 && customerCreditCents > 0 && (
                  <p className="text-sm text-emerald-400/80 leading-relaxed">
                    Credit covers the full invoice. Booking will be marked completed immediately.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Notes (always shown) ──────────────────────────────────── */}
        <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <p className="text-base font-semibold text-white mb-2">Internal Note (Optional)</p>
          <textarea
            value={adminNote}
            onChange={e => setAdminNote(e.target.value)}
            rows={3}
            placeholder="Optional internal note…"
            className="w-full bg-[#0a0b0d] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none resize-none"
            disabled={isPending}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={resetOutcomeForm}
          disabled={isPending}
          className="flex-1 px-3 py-2.5 rounded-lg text-sm font-medium bg-white/5 text-slate-300 hover:bg-white/10 transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          disabled={isPending || !canSubmit}
          onClick={handleSubmit}
          className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium ${outcome.color} text-white transition-colors disabled:opacity-50`}
        >
          {isPending
            ? 'Recording…'
            : paymentWaived
              ? 'Confirm Outcome Without Payment'
              : 'Confirm Outcome'}
        </button>
      </div>
      {error && <p className="text-sm text-rose-400 leading-tight">{error}</p>}
    </div>
  )
}
