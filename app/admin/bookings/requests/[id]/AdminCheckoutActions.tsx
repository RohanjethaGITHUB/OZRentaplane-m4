'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  cancelCheckoutBooking,
  markCheckoutFlightCompleted,
  markCheckoutOutcome,
  markCheckoutNoShow,
  unlockCheckoutNoShowLock,
} from '@/app/actions/admin-booking'
import TotalOnlyReadingsForm from '@/components/aircraft/TotalOnlyReadingsForm'
import {
  type TotalOnlyFormValues,
  validateTotalOnlyReadings,
} from '@/lib/aircraft-readings'

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
  id: number
  airportId: string
  landingCount: string
}

type Props = {
  bookingId: string
  status: CheckoutStatus
  airports: Airport[]
  customerCreditCents: number
  customerId: string
  scheduledStart: string
  noShowLocked: boolean
}

type OutcomeKey =
  | 'cleared_to_fly'
  | 'additional_checkout_required'
  | 'checkout_reschedule_required'
  | 'not_currently_eligible'

const OUTCOMES: { key: OutcomeKey; label: string; body: string; color: string; border: string; textColor: string; icon: string }[] = [
  {
    key: 'cleared_to_fly',
    label: 'Cleared to Fly',
    body: 'Pilot has passed checkout and can make standard aircraft bookings after payment is settled.',
    color: 'bg-emerald-600 hover:bg-emerald-500',
    border: 'border-emerald-500/30',
    textColor: 'text-emerald-400',
    icon: 'verified',
  },
  {
    key: 'additional_checkout_required',
    label: 'Additional Checkout Required',
    body: 'Pilot is close but needs another checkout session before being cleared. They can book another checkout flight after payment is settled.',
    color: 'bg-amber-600 hover:bg-amber-500',
    border: 'border-amber-500/30',
    textColor: 'text-amber-400',
    icon: 'schedule',
  },
  {
    key: 'checkout_reschedule_required',
    label: 'Checkout Reschedule Required',
    body: 'Checkout could not be properly assessed and should be rescheduled after payment is settled.',
    color: 'bg-orange-600 hover:bg-orange-500',
    border: 'border-orange-500/30',
    textColor: 'text-orange-400',
    icon: 'event_repeat',
  },
  {
    key: 'not_currently_eligible',
    label: 'Not Currently Eligible',
    body: 'Pilot is not ready to continue with aircraft hire and further training is required.',
    color: 'bg-rose-700 hover:bg-rose-600',
    border: 'border-rose-500/30',
    textColor: 'text-rose-400',
    icon: 'block',
  },
]

const LANDING_FEE_CENTS = 2500
let rowIdCounter = 0

function getNum(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function createInitialReadings(): TotalOnlyFormValues {
  return {
    vdo_total:        '',
    tacho_total:      '',
    air_switch_total: '',
    mr_total:         '',
    oil_added:        '',
    oil_total:        '',
    fuel_added:       '',
    fuel_returned:       '',
  }
}

export default function AdminCheckoutActions({
  bookingId,
  status,
  airports,
  customerCreditCents,
  customerId,
  scheduledStart,
  noShowLocked,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [confirmingOutcome, setConfirmingOutcome] = useState<OutcomeKey | null>(null)
  const [paymentWaived, setPaymentWaived] = useState(false)
  const [waiverReason, setWaiverReason] = useState('')
  const [hourlyRate, setHourlyRate] = useState('290')
  const [adminNote, setAdminNote] = useState('')
  const [landingRows, setLandingRows] = useState<LandingChargeRow[]>([])
  const [readings, setReadings] = useState<TotalOnlyFormValues>(createInitialReadings)
  const [submitAttempted, setSubmitAttempted] = useState(false)

  function run(fn: () => Promise<void>) {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
        router.refresh()
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : 'Action failed. Please try again.'
        setError(message.replace(/^VALIDATION: /, ''))
      }
    })
  }

  function addLandingRow() {
    setLandingRows(current => [...current, { id: ++rowIdCounter, airportId: '', landingCount: '1' }])
  }
  function removeLandingRow(id: number) {
    setLandingRows(current => current.length > 1 ? current.filter(row => row.id !== id) : current)
  }
  function handleLandingChange(id: number, field: 'airportId' | 'landingCount', value: string) {
    setLandingRows(current => current.map(row => row.id === id ? { ...row, [field]: value } : row))
  }

  function resetOutcomeForm() {
    setConfirmingOutcome(null)
    setPaymentWaived(false)
    setWaiverReason('')
    setHourlyRate('290')
    setAdminNote('')
    setLandingRows([])
    setReadings(createInitialReadings())
    setSubmitAttempted(false)
    setError(null)
  }

  function handleOutcomeSelect(key: OutcomeKey) {
    setConfirmingOutcome(key)
    setPaymentWaived(key === 'checkout_reschedule_required')
    setWaiverReason('')
    setHourlyRate('290')
    setAdminNote('')
    setReadings(createInitialReadings())
    setLandingRows([{ id: ++rowIdCounter, airportId: '', landingCount: '1' }])
    setSubmitAttempted(false)
    setError(null)
  }

  const hourlyRateNum     = Number(hourlyRate)
  const validHourlyRate   = Number.isFinite(hourlyRateNum) && hourlyRateNum > 0

  const landingRowErrors = landingRows.map(row => {
    const count     = Number(row.landingCount)
    const hasAirport = !!row.airportId
    const hasCount   = Number.isInteger(count) && count > 0
    if (!hasAirport && !row.landingCount.trim()) return null
    if (!hasAirport) return 'Airport is required.'
    if (!hasCount)   return 'Landing count must be at least 1.'
    return null
  })
  const hasIncompleteLandingRows = landingRowErrors.some(Boolean)
  const validLandingCharges = landingRows
    .filter(row => row.airportId && Number.isInteger(Number(row.landingCount)) && Number(row.landingCount) > 0)
    .map(row => ({ airportId: row.airportId, landingCount: Number(row.landingCount) }))
  const hasValidLandingRow = validLandingCharges.length > 0

  // Compute totals directly from total-only inputs
  const vdoTotal   = getNum(readings.vdo_total)
  const vdoReading = vdoTotal  // billing uses vdo_total directly

  let readingsError: string | null = null
  try {
    validateTotalOnlyReadings({
      vdo_total:        vdoTotal        ?? 0,
      tacho_total:      getNum(readings.tacho_total)      ?? 0,
      air_switch_total: getNum(readings.air_switch_total) ?? 0,
      mr_total:         getNum(readings.mr_total)         ?? 0,
      oil_added:        getNum(readings.oil_added),
      oil_total:        getNum(readings.oil_total),
      fuel_added:       getNum(readings.fuel_added),
      fuel_returned:       getNum(readings.fuel_returned),
      landings:         null,
      notes:            null,
    })
    if (!paymentWaived && (vdoReading == null || vdoReading <= 0)) {
      readingsError = 'VDO total must be greater than 0.'
    }
    if (!paymentWaived && vdoReading != null && vdoReading < 0.1) {
      readingsError = `VDO total (${vdoReading}h) is below minimum of 0.1h. Check the readings.`
    }
    if (!paymentWaived && vdoReading != null && vdoReading > 5.0) {
      readingsError = `VDO total (${vdoReading}h) exceeds maximum of 5.0h. Check the readings.`
    }
  } catch (validationError) {
    readingsError = validationError instanceof Error ? validationError.message.replace(/^VALIDATION: /, '') : 'Invalid readings.'
  }

  const vdoBaseCents        = !paymentWaived && validHourlyRate && vdoReading != null ? Math.round(vdoReading * Math.round(hourlyRateNum * 100)) : 0
  const landingSubtotalCents = validLandingCharges.reduce((sum, row) => sum + LANDING_FEE_CENTS * row.landingCount, 0)
  const finalAmountCents    = paymentWaived ? 0 : vdoBaseCents + landingSubtotalCents
  const creditApplicable    = Math.min(customerCreditCents, finalAmountCents)
  const estimatedAmountDue  = Math.max(finalAmountCents - creditApplicable, 0)
  const outcomeSupportsWaiver = confirmingOutcome !== null && confirmingOutcome !== 'cleared_to_fly'

  function handleSubmit() {
    setSubmitAttempted(true)

    if (readingsError) { setError(readingsError); return }
    if (!validHourlyRate) { setError('Hourly rate must be a positive number.'); return }
    if (!hasValidLandingRow || hasIncompleteLandingRows) { setError('Add at least one complete landing row before submitting.'); return }
    if (paymentWaived && !waiverReason.trim()) { setError('A waiver reason is required when payment is waived.'); return }
    if (!confirmingOutcome) return

    const totalReadings = {
      vdo_total:        getNum(readings.vdo_total)        ?? 0,
      tacho_total:      getNum(readings.tacho_total)      ?? 0,
      air_switch_total: getNum(readings.air_switch_total) ?? 0,
      mr_total:         getNum(readings.mr_total)         ?? 0,
      oil_added:        getNum(readings.oil_added),
      oil_total:        getNum(readings.oil_total),
      fuel_added:       getNum(readings.fuel_added),
      fuel_returned:       getNum(readings.fuel_returned),
      landings:         validLandingCharges.reduce((sum, r) => sum + r.landingCount, 0) || null,
      notes:            adminNote.trim() || null,
    }

    run(() => markCheckoutOutcome({
      bookingId,
      outcome:             confirmingOutcome,
      adminNote:           adminNote.trim() || undefined,
      checkoutRatePerHour: hourlyRateNum,
      landingCharges:      validLandingCharges,
      paymentWaived,
      waiverReason:        paymentWaived ? waiverReason.trim() : undefined,
      readings:            totalReadings,
    }))
  }

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
          <button type="button" onClick={() => { setIsCancelling(false); setError(null) }} disabled={isPending} className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-white/5 text-slate-300 hover:bg-white/10 transition-colors">Back</button>
          <button type="button" disabled={isPending || !cancelReason.trim()} onClick={() => run(() => cancelCheckoutBooking(bookingId, cancelReason))} className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-rose-700 hover:bg-rose-600 text-white transition-colors disabled:opacity-50">
            {isPending ? 'Cancelling…' : 'Cancel Booking'}
          </button>
        </div>
        {error && <p className="text-[10px] text-rose-400 leading-tight">{error}</p>}
      </div>
    )
  }

  if (status === 'checkout_confirmed') {
    const startPassed = new Date(scheduledStart).getTime() <= Date.now()
    return (
      <div className="space-y-3">
        <button onClick={() => run(() => markCheckoutFlightCompleted(bookingId))} disabled={isPending} className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
          <span className="material-symbols-outlined text-[18px]">flight_land</span>
          {isPending ? 'Updating…' : 'Mark Checkout Completed'}
        </button>
        <p className="text-[9px] text-slate-600 leading-relaxed text-center">Click after the checkout flight has physically occurred. You will then record the full aircraft readings and checkout outcome.</p>
        <button onClick={() => setIsCancelling(true)} disabled={isPending} className="w-full flex items-center justify-center gap-2 bg-transparent border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
          <span className="material-symbols-outlined text-[16px]">cancel</span>
          Cancel Checkout
        </button>
        <button
          onClick={() => {
            const warning = startPassed
              ? 'Mark this checkout as no-show and lock the customer account?'
              : 'This checkout start time has not passed yet. Mark as no-show anyway and lock the customer account?'
            if (!window.confirm(warning)) return
            run(() => markCheckoutNoShow(bookingId))
          }}
          disabled={isPending}
          className="w-full flex items-center justify-center gap-2 bg-transparent border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[16px]">person_off</span>
          Mark No-Show
        </button>
        {noShowLocked && (
          <button
            onClick={() => {
              if (!window.confirm('Unlock this customer account from checkout no-show lock?')) return
              run(() => unlockCheckoutNoShowLock(customerId))
            }}
            disabled={isPending}
            className="w-full flex items-center justify-center gap-2 bg-transparent border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">lock_open</span>
            Unlock No-Show Lock
          </button>
        )}
        {error && <p className="text-[10px] text-rose-400 leading-tight text-center">{error}</p>}
      </div>
    )
  }

  if (!confirmingOutcome) {
    return (
      <div className="space-y-2.5">
        <p className="text-[9px] uppercase tracking-widest font-bold text-slate-500 mb-3">Record Checkout Outcome</p>
        {OUTCOMES.map(outcome => (
          <button
            key={outcome.key}
            onClick={() => handleOutcomeSelect(outcome.key)}
            disabled={isPending}
            className="w-full flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:border-white/15 hover:bg-white/[0.06] text-left transition-all disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[18px] flex-shrink-0 mt-0.5 ${outcome.textColor}`} style={{ fontVariationSettings: "'wght' 300" }}>{outcome.icon}</span>
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

  const outcome = OUTCOMES.find(item => item.key === confirmingOutcome)!

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-[#0f1216] p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-semibold text-white">Record Checkout Outcome</h3>
            <p className="text-sm text-slate-400 mt-1">Aircraft totals entered here become the official aircraft flight log row for this checkout.</p>
          </div>
          <button type="button" onClick={resetOutcomeForm} className="text-sm text-slate-500 hover:text-slate-300">Back</button>
        </div>

        <div className={`rounded-xl border p-4 ${outcome.border} bg-white/[0.02]`}>
          <p className={`text-sm font-semibold ${outcome.textColor} mb-1`}>{outcome.label}</p>
          <p className="text-sm text-slate-300 leading-relaxed">{outcome.body}</p>
        </div>

        {outcomeSupportsWaiver && (
          <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
            <p className="text-sm font-medium text-slate-300 mb-3">Charge customer for this checkout?</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPaymentWaived(false)} disabled={isPending} className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${!paymentWaived ? 'bg-blue-600/30 border border-blue-500/40 text-blue-300' : 'bg-white/[0.03] border border-white/[0.07] text-slate-400 hover:bg-white/[0.06]'}`}>Yes, create payment request</button>
              <button type="button" onClick={() => setPaymentWaived(true)}  disabled={isPending} className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${paymentWaived  ? 'bg-amber-600/20 border border-amber-500/40 text-amber-300' : 'bg-white/[0.03] border border-white/[0.07] text-slate-400 hover:bg-white/[0.06]'}`}>No, waive payment</button>
            </div>
          </div>
        )}

        {paymentWaived && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg bg-amber-500/[0.06] border border-amber-500/20 px-3 py-3">
              <p className="text-sm text-amber-300/80 leading-relaxed">Payment will be waived. The checkout outcome will still write the complete aircraft readings into the aircraft ledger.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Waiver reason <span className="text-rose-400">*</span></label>
              <textarea
                value={waiverReason}
                onChange={e => setWaiverReason(e.target.value)}
                rows={3}
                placeholder="Required — e.g. weather cancellation, aircraft unavailable, customer did not fly…"
                className="w-full bg-[#0a0b0d] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-500/50 resize-none"
                disabled={isPending}
              />
            </div>
          </div>
        )}

        <div className="mt-5 space-y-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#a7c8ff]/70 mb-3">Aircraft Readings</p>
            <TotalOnlyReadingsForm
              values={readings}
              onChange={(field, value) => setReadings(prev => ({ ...prev, [field]: value }))}
              notes={adminNote}
              onNotesChange={setAdminNote}
              compact
              submitAttempted={submitAttempted}
            />
            {submitAttempted && readingsError && (
              <p className="mt-2 text-xs text-rose-400">{readingsError}</p>
            )}
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1.5">Checkout hourly rate</label>
            <div className="relative max-w-[220px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={hourlyRate}
                onChange={e => setHourlyRate(e.target.value)}
                className="w-full bg-[#0a0b0d] border border-white/10 rounded-lg pl-7 pr-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
                disabled={isPending}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-base font-semibold text-white">Airport landings <span className="text-rose-400 ml-1">*</span></p>
              <p className="text-sm text-slate-400 mt-1 leading-relaxed">Add each airport and number of landings for landing fee billing.</p>
            </div>
            <button type="button" onClick={addLandingRow} disabled={isPending || airports.length === 0} className="flex items-center gap-1.5 text-sm text-[#a7c8ff]/80 hover:text-[#a7c8ff] transition-colors disabled:opacity-40">
              <span className="material-symbols-outlined text-[14px]">add_circle</span>
              Add Airport
            </button>
          </div>
          <div className="space-y-3">
            {landingRows.map((row, index) => {
              const rowError = landingRowErrors[index]
              const count    = Number(row.landingCount)
              const rowTotal = row.airportId && Number.isInteger(count) && count > 0 ? LANDING_FEE_CENTS * count : 0
              return (
                <div key={row.id} className="rounded-lg border border-white/10 bg-[#0a0d11] p-3">
                  <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_110px_120px_44px] gap-2 items-start">
                    <select value={row.airportId} onChange={e => handleLandingChange(row.id, 'airportId', e.target.value)} disabled={isPending} className="w-full bg-[#0c1015] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-slate-500/60">
                      <option value="">Select airport</option>
                      {airports.map(airport => (<option key={airport.id} value={airport.id}>{airport.icao_code} — {airport.name}</option>))}
                    </select>
                    <input type="number" min="1" step="1" value={row.landingCount} onChange={e => handleLandingChange(row.id, 'landingCount', e.target.value)} disabled={isPending} className="w-full bg-[#0c1015] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-200 text-center focus:outline-none focus:border-slate-500/60" />
                    <div className="h-[42px] rounded-lg border border-white/5 bg-black/20 flex items-center justify-end px-3 text-sm text-slate-300">{rowTotal > 0 ? `$${(rowTotal / 100).toFixed(2)}` : '—'}</div>
                    <button type="button" onClick={() => removeLandingRow(row.id)} disabled={isPending || landingRows.length <= 1} className="h-[42px] flex items-center justify-center rounded-lg border border-white/10 text-slate-500 hover:text-rose-300 hover:border-rose-500/30 disabled:opacity-40">
                      <span className="material-symbols-outlined text-[16px]">remove_circle</span>
                    </button>
                  </div>
                  {rowError && <p className="mt-2 text-xs text-rose-400">{rowError}</p>}
                </div>
              )
            })}
          </div>
        </div>

        {!paymentWaived && vdoReading != null && validHourlyRate && (
          <div className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500">VDO total</span>
              <span className="text-[10px] font-mono text-slate-300">{vdoReading.toFixed(1)} h</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500">Aircraft hire</span>
              <span className="text-[10px] font-mono text-slate-300">${(vdoBaseCents / 100).toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500">Landing charges</span>
              <span className="text-[10px] font-mono text-slate-300">${(landingSubtotalCents / 100).toFixed(2)}</span>
            </div>
            <div className="border-t border-white/[0.06] pt-1.5 flex items-center justify-between">
              <span className="text-[10px] font-medium text-slate-300">Estimated amount due</span>
              <span className="text-[11px] font-bold font-mono text-white">${(estimatedAmountDue / 100).toFixed(2)}</span>
            </div>
            {customerCreditCents > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500">Customer credit applied</span>
                <span className="text-[10px] font-mono text-emerald-300">${(creditApplicable / 100).toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>
        )}

        <div className="mt-5 flex gap-3">
          <button type="button" onClick={resetOutcomeForm} className="flex-1 rounded-xl border border-white/10 px-4 py-3 text-sm text-slate-300 hover:bg-white/5">Back</button>
          <button type="button" onClick={handleSubmit} disabled={isPending} className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium text-white transition-colors ${outcome.color} disabled:opacity-50`}>
            {isPending ? 'Saving…' : 'Save Checkout Outcome'}
          </button>
        </div>
      </div>
    </div>
  )
}
