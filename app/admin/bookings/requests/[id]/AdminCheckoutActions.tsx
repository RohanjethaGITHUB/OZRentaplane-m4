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
  bookingId:          string
  status:             CheckoutStatus
  airports:           Airport[]
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

const CHECKOUT_RATE_PER_HOUR_CENTS = 29000   // $290 in cents

let rowIdCounter = 0

export default function AdminCheckoutActions({ bookingId, status, airports, customerCreditCents }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError]             = useState<string | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [confirmingOutcome, setConfirmingOutcome] = useState<OutcomeKey | null>(null)
  const [adminNote, setAdminNote] = useState('')
  const [checkoutDuration, setCheckoutDuration] = useState('')
  const [checkoutFinalAmount, setCheckoutFinalAmount] = useState('')
  const [landingRows, setLandingRows] = useState<LandingChargeRow[]>([])
  // Waiver state — only applicable for non-cleared outcomes
  const [paymentWaived, setPaymentWaived] = useState(false)
  const [waiverReason, setWaiverReason] = useState('')

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

  // ── Derived billing calculations (client-side display only) ───────────────
  const durationNum    = parseFloat(checkoutDuration)
  const validDuration  = !isNaN(durationNum) && durationNum > 0
  const flightTimeCents = validDuration ? Math.round(durationNum * CHECKOUT_RATE_PER_HOUR_CENTS) : 0

  const landingSubtotalCents = landingRows.reduce((sum, row) => {
    const airport = airports.find(a => a.id === row.airportId)
    const count   = parseInt(row.landingCount, 10)
    if (!airport || isNaN(count) || count <= 0) return sum
    return sum + airport.default_landing_fee_cents * count
  }, 0)

  const grossTotalCents = flightTimeCents + landingSubtotalCents

  const finalAmountCents = checkoutFinalAmount !== ''
    ? Math.round(parseFloat(checkoutFinalAmount) * 100)
    : grossTotalCents

  const creditApplicable  = Math.min(customerCreditCents, finalAmountCents)
  const estimatedAmountDue = Math.max(finalAmountCents - creditApplicable, 0)

  const finalAmountOverridden = checkoutFinalAmount !== '' &&
    Math.round(parseFloat(checkoutFinalAmount) * 100) !== grossTotalCents

  // cleared_to_fly never allows waiver; other outcomes may be waived
  const outcomeSupportsWaiver = confirmingOutcome !== null && confirmingOutcome !== 'cleared_to_fly'

  const canSubmit = confirmingOutcome !== null && (
    paymentWaived
      ? waiverReason.trim().length > 0
      : validDuration && finalAmountCents > 0
  )

  // Sync gross total to the final amount field unless it's been manually overridden
  function handleDurationChange(val: string) {
    setCheckoutDuration(val)
    if (!finalAmountOverridden) {
      const d = parseFloat(val)
      if (!isNaN(d) && d > 0) {
        const newGross = Math.round(d * CHECKOUT_RATE_PER_HOUR_CENTS) + landingSubtotalCents
        setCheckoutFinalAmount((newGross / 100).toFixed(2))
      } else {
        setCheckoutFinalAmount('')
      }
    }
  }

  function handleLandingChange(id: number, field: 'airportId' | 'landingCount', value: string) {
    setLandingRows(rows => rows.map(r => r.id === id ? { ...r, [field]: value } : r))
    if (!finalAmountOverridden) {
      // Recalculate after this change
      setTimeout(() => {
        setCheckoutFinalAmount(prev => {
          // Let the gross recalculate naturally via landingSubtotalCents on next render
          // Just auto-sync if not manually overridden
          if (!finalAmountOverridden) {
            const newLandingTotal = landingRows.map(r => {
              const a = airports.find(ap => ap.id === r.airportId)
              const c = parseInt(r.landingCount, 10)
              return (a && !isNaN(c) && c > 0) ? a.default_landing_fee_cents * c : 0
            }).reduce((s, v) => s + v, 0)
            const newGross = flightTimeCents + newLandingTotal
            return newGross > 0 ? (newGross / 100).toFixed(2) : prev
          }
          return prev
        })
      }, 0)
    }
  }

  function addLandingRow() {
    setLandingRows(rows => [...rows, { id: ++rowIdCounter, airportId: '', landingCount: '1' }])
  }

  function removeLandingRow(id: number) {
    setLandingRows(rows => rows.filter(r => r.id !== id))
  }

  function resetOutcomeForm() {
    setConfirmingOutcome(null)
    setAdminNote('')
    setCheckoutDuration('')
    setCheckoutFinalAmount('')
    setLandingRows([])
    setPaymentWaived(false)
    setWaiverReason('')
    setError(null)
  }

  // When an outcome is selected, set the default payment mode:
  //   checkout_reschedule_required → waived by default (often no flight occurred)
  //   all others → charge by default
  function handleOutcomeSelect(key: OutcomeKey) {
    setConfirmingOutcome(key)
    setPaymentWaived(key === 'checkout_reschedule_required')
    setWaiverReason('')
    setCheckoutDuration('')
    setCheckoutFinalAmount('')
    setLandingRows([])
    setError(null)
  }

  function handlePaymentModeChange(waive: boolean) {
    setPaymentWaived(waive)
    setWaiverReason('')
    if (!waive) {
      setCheckoutDuration('')
      setCheckoutFinalAmount('')
      setLandingRows([])
    }
  }

  function handleSubmit() {
    if (!confirmingOutcome) return

    if (paymentWaived) {
      run(() => markCheckoutOutcome({
        bookingId,
        outcome:                  confirmingOutcome,
        adminNote:                adminNote || undefined,
        checkoutDurationHours:    0,
        checkoutFinalAmountCents: 0,
        paymentWaived:            true,
        waiverReason:             waiverReason,
      }))
    } else {
      const validLandingCharges = landingRows
        .filter(r => r.airportId && parseInt(r.landingCount, 10) > 0)
        .map(r => ({ airportId: r.airportId, landingCount: parseInt(r.landingCount, 10) }))
      run(() => markCheckoutOutcome({
        bookingId,
        outcome:                  confirmingOutcome,
        adminNote:                adminNote || undefined,
        checkoutDurationHours:    durationNum,
        checkoutFinalAmountCents: finalAmountCents,
        landingCharges:           validLandingCharges.length > 0 ? validLandingCharges : undefined,
        paymentWaived:            false,
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
          Click after the checkout flight has physically occurred. You will then record the outcome.
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

  // Step 1: If no outcome selected, show the outcome selector
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

  // Step 2: Outcome selected — show billing or waiver form
  const outcome = OUTCOMES.find(o => o.key === confirmingOutcome)!

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border p-4 ${outcome.border} bg-white/[0.02]`}>
        <p className={`text-[10px] font-bold uppercase tracking-widest ${outcome.textColor} mb-1`}>
          Recording: {outcome.label}
        </p>
        <p className="text-[11px] text-slate-500 leading-relaxed mb-4">{outcome.body}</p>

        {/* ── Payment mode toggle (non-cleared outcomes only) ────── */}
        {outcomeSupportsWaiver && (
          <div className="mb-4 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
            <p className="text-[10px] font-medium text-slate-400 mb-2">
              Charge customer for this checkout?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handlePaymentModeChange(false)}
                disabled={isPending}
                className={`flex-1 px-3 py-2 rounded-lg text-[10px] font-medium transition-colors ${
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
                className={`flex-1 px-3 py-2 rounded-lg text-[10px] font-medium transition-colors ${
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
          <div className="space-y-3">
            <div className="rounded-lg bg-amber-500/[0.06] border border-amber-500/20 px-3 py-2.5">
              <p className="text-[10px] text-amber-300/80 leading-relaxed">
                Payment will be waived. The outcome will be applied immediately and the customer will not be asked to pay. A waived audit record will be stored.
              </p>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-1">
                Waiver reason <span className="text-rose-400">*</span>
              </label>
              <textarea
                value={waiverReason}
                onChange={e => setWaiverReason(e.target.value)}
                rows={3}
                placeholder="Required — e.g. weather cancellation, aircraft unavailable, customer did not fly, incorrect documents…"
                className={`w-full bg-[#0a0b0d] border rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none resize-none ${
                  waiverReason.trim() ? 'border-white/10 focus:border-slate-500/50' : 'border-rose-500/30 focus:border-rose-500/50'
                }`}
                disabled={isPending}
              />
              {!waiverReason.trim() && (
                <p className="text-[9px] text-rose-400/70 mt-1">A waiver reason is required.</p>
              )}
            </div>
          </div>
        )}

        {/* ── Payment path — billing calculator ────────────────────── */}
        {!paymentWaived && (
          <div className="space-y-3">
            {/* Duration */}
            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-1">
                Checkout Duration (hours) <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={checkoutDuration}
                onChange={e => handleDurationChange(e.target.value)}
                placeholder="e.g. 1.0, 1.5, 2.0"
                className="w-full bg-[#0a0b0d] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-500/50"
                disabled={isPending}
              />
            </div>

            {/* Flight time reference */}
            {validDuration && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <span className="text-[10px] text-slate-500">
                  Flight time ({durationNum}h × $290/hr)
                </span>
                <span className="text-[11px] font-semibold text-slate-300">
                  ${(flightTimeCents / 100).toFixed(2)}
                </span>
              </div>
            )}

            {/* Landing charges */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-medium text-slate-400">
                  Landing Charges
                  <span className="text-slate-600 font-normal ml-1">(optional)</span>
                </label>
                <button
                  type="button"
                  onClick={addLandingRow}
                  disabled={isPending || airports.length === 0}
                  className="flex items-center gap-1 text-[10px] text-[#a7c8ff]/60 hover:text-[#a7c8ff] transition-colors disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-[12px]">add_circle</span>
                  Add Airport
                </button>
              </div>

              {airports.length === 0 && (
                <p className="text-[10px] text-slate-600 italic">No airports available — run migration 036 first.</p>
              )}

              {landingRows.length > 0 && (
                <div className="space-y-2 mb-2">
                  {landingRows.map(row => {
                    const selectedAirport = airports.find(a => a.id === row.airportId)
                    const landingCount    = parseInt(row.landingCount, 10)
                    const rowTotal        = selectedAirport && !isNaN(landingCount) && landingCount > 0
                      ? selectedAirport.default_landing_fee_cents * landingCount
                      : 0

                    return (
                      <div key={row.id} className="flex gap-2 items-start">
                        <select
                          value={row.airportId}
                          onChange={e => handleLandingChange(row.id, 'airportId', e.target.value)}
                          disabled={isPending}
                          className="flex-1 bg-[#0a0b0d] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-500/50 min-w-0"
                        >
                          <option value="">Select airport…</option>
                          {airports.map(a => (
                            <option key={a.id} value={a.id}>
                              {a.icao_code} — {a.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={row.landingCount}
                          onChange={e => handleLandingChange(row.id, 'landingCount', e.target.value)}
                          disabled={isPending}
                          className="w-14 bg-[#0a0b0d] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 text-center focus:outline-none focus:border-slate-500/50"
                          title="Landings"
                        />
                        <div className="w-16 text-right flex-shrink-0 py-1.5">
                          <span className="text-[10px] font-mono text-slate-400">
                            {rowTotal > 0 ? `$${(rowTotal / 100).toFixed(2)}` : '—'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLandingRow(row.id)}
                          disabled={isPending}
                          className="flex-shrink-0 p-1.5 text-slate-600 hover:text-rose-400 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[14px]">remove_circle</span>
                        </button>
                      </div>
                    )
                  })}

                  {landingSubtotalCents > 0 && (
                    <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                      <span className="text-[10px] text-slate-500">Landing subtotal</span>
                      <span className="text-[10px] font-mono text-slate-300">
                        ${(landingSubtotalCents / 100).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Gross calculated total */}
            {validDuration && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                <span className="text-[10px] text-slate-400 font-medium">Gross calculated total</span>
                <span className="text-[11px] font-semibold text-white">
                  ${(grossTotalCents / 100).toFixed(2)}
                </span>
              </div>
            )}

            {/* Final payable amount (admin override) */}
            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-1">
                Final Payable Amount (AUD) <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">$</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={checkoutFinalAmount}
                  onChange={e => setCheckoutFinalAmount(e.target.value)}
                  placeholder={(grossTotalCents / 100).toFixed(2) || '0.00'}
                  className="w-full bg-[#0a0b0d] border border-white/10 rounded-lg pl-6 pr-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-500/50"
                  disabled={isPending}
                />
              </div>
              {finalAmountOverridden && (
                <p className="text-[9px] text-amber-400/70 mt-1 leading-relaxed">
                  ⚠ Amount differs from calculated total. Confirm this is intentional.
                </p>
              )}
              {!finalAmountOverridden && (
                <p className="text-[9px] text-slate-600 mt-1 leading-relaxed">
                  Pre-filled from duration × $290/hr + landing charges. Edit if the actual amount differs.
                </p>
              )}
            </div>

            {/* Credit display */}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500">Available customer credit</span>
                <span className={`text-[10px] font-mono ${customerCreditCents > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {customerCreditCents > 0 ? `$${(customerCreditCents / 100).toFixed(2)}` : '$0.00'}
                </span>
              </div>
              {creditApplicable > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">Credit will be applied</span>
                  <span className="text-[10px] font-mono text-emerald-400">
                    −${(creditApplicable / 100).toFixed(2)}
                  </span>
                </div>
              )}
              <div className="border-t border-white/[0.06] pt-1.5 flex items-center justify-between">
                <span className="text-[10px] font-medium text-slate-300">Estimated amount due</span>
                <span className={`text-[11px] font-bold font-mono ${estimatedAmountDue > 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                  {estimatedAmountDue > 0 ? `$${(estimatedAmountDue / 100).toFixed(2)}` : 'Settled by credit'}
                </span>
              </div>
              {estimatedAmountDue === 0 && customerCreditCents > 0 && (
                <p className="text-[9px] text-emerald-400/70 leading-relaxed">
                  Credit covers the full invoice. Booking will be marked completed immediately.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Notes (always shown) ──────────────────────────────────── */}
        <div className="mt-4">
          <textarea
            value={adminNote}
            onChange={e => setAdminNote(e.target.value)}
            rows={3}
            placeholder="Optional internal note…"
            className="w-full bg-[#0a0b0d] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none resize-none"
            disabled={isPending}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={resetOutcomeForm}
          disabled={isPending}
          className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-white/5 text-slate-300 hover:bg-white/10 transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          disabled={isPending || !canSubmit}
          onClick={handleSubmit}
          className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium ${outcome.color} text-white transition-colors disabled:opacity-50`}
        >
          {isPending
            ? 'Recording…'
            : paymentWaived
              ? 'Confirm Outcome Without Payment'
              : 'Confirm Outcome'}
        </button>
      </div>
      {error && <p className="text-[10px] text-rose-400 leading-tight">{error}</p>}
    </div>
  )
}
