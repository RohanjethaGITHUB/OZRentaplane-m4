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
import { recordManualPayment } from '@/app/actions/payment'
import {
  type TotalOnlyFormValues,
  validateTotalOnlyReadings,
} from '@/lib/aircraft-readings'
import ConfirmModal from '@/components/ui/ConfirmModal'

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

type ManualPaymentMethod = 'cash' | 'card_in_person' | 'bank_transfer'
type SubmissionConfirmation = 'send_invoice' | 'mark_paid' | null

const OUTCOMES: {
  key: OutcomeKey
  label: string
  body: string
  color: string
  border: string
  textColor: string
  icon: string
  cardTint: string
  cardBorder: string
  cardHover: string
  cardActive: string
}[] = [
  {
    key: 'cleared_to_fly',
    label: 'Cleared to Fly',
    body: 'Pilot has passed checkout and can make standard aircraft bookings after payment is settled.',
    color: 'bg-emerald-600 hover:bg-emerald-500',
    border: 'border-emerald-500/30',
    textColor: 'text-emerald-400',
    icon: 'verified',
    cardTint: 'bg-emerald-50',
    cardBorder: 'border-emerald-400',
    cardHover: 'hover:border-emerald-500/60',
    cardActive: 'active:border-emerald-600 active:bg-emerald-100',
  },
  {
    key: 'additional_checkout_required',
    label: 'Additional Checkout Required',
    body: 'Pilot is close but needs another checkout session before being cleared. They can book another checkout flight after payment is settled.',
    color: 'bg-amber-600 hover:bg-amber-500',
    border: 'border-amber-500/30',
    textColor: 'text-amber-400',
    icon: 'schedule',
    cardTint: 'bg-amber-50',
    cardBorder: 'border-amber-400',
    cardHover: 'hover:border-amber-500/60',
    cardActive: 'active:border-amber-600 active:bg-amber-100',
  },
  {
    key: 'checkout_reschedule_required',
    label: 'Checkout Reschedule Required',
    body: 'Checkout could not be properly assessed and should be rescheduled after payment is settled.',
    color: 'bg-orange-600 hover:bg-orange-500',
    border: 'border-orange-500/30',
    textColor: 'text-orange-400',
    icon: 'event_repeat',
    cardTint: 'bg-orange-50',
    cardBorder: 'border-orange-400',
    cardHover: 'hover:border-orange-500/60',
    cardActive: 'active:border-orange-600 active:bg-orange-100',
  },
  {
    key: 'not_currently_eligible',
    label: 'Not Currently Eligible',
    body: 'Pilot is not ready to continue with aircraft hire and further training is required.',
    color: 'bg-rose-700 hover:bg-rose-600',
    border: 'border-rose-500/30',
    textColor: 'text-rose-400',
    icon: 'block',
    cardTint: 'bg-rose-50',
    cardBorder: 'border-rose-400',
    cardHover: 'hover:border-rose-500/60',
    cardActive: 'active:border-rose-600 active:bg-rose-100',
  },
]

const LANDING_FEE_CENTS = 2895
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
  const [showManualPaymentFields, setShowManualPaymentFields] = useState(false)
  const [manualPaymentMethod, setManualPaymentMethod] = useState<ManualPaymentMethod>('cash')
  const [manualAmount, setManualAmount] = useState('')
  const [manualPaymentNote, setManualPaymentNote] = useState('')
  const [submissionConfirmation, setSubmissionConfirmation] = useState<SubmissionConfirmation>(null)
  const [noShowConfirmOpen, setNoShowConfirmOpen] = useState(false)
  const [unlockNoShowConfirmOpen, setUnlockNoShowConfirmOpen] = useState(false)

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
    setShowManualPaymentFields(false)
    setManualPaymentMethod('cash')
    setManualAmount('')
    setManualPaymentNote('')
    setSubmissionConfirmation(null)
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
    setShowManualPaymentFields(false)
    setManualPaymentMethod('cash')
    setManualAmount('')
    setManualPaymentNote('')
    setSubmissionConfirmation(null)
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

  function runSubmit(mode: 'send_invoice' | 'mark_paid') {
    setSubmitAttempted(true)

    if (readingsError) { setError(readingsError); return }
    if (!validHourlyRate) { setError('Hourly rate must be a positive number.'); return }
    if (!hasValidLandingRow || hasIncompleteLandingRows) { setError('Add at least one complete landing row before submitting.'); return }
    if (paymentWaived && !waiverReason.trim()) { setError('A waiver reason is required when payment is waived.'); return }
    if (!paymentWaived && mode === 'mark_paid') {
      const parsed = Number(manualAmount || (estimatedAmountDue / 100).toFixed(2))
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError('Manual payment amount must be greater than zero.')
        return
      }
    }
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

    run(async () => {
      await markCheckoutOutcome({
        bookingId,
        outcome:             confirmingOutcome,
        adminNote:           adminNote.trim() || undefined,
        checkoutRatePerHour: hourlyRateNum,
        landingCharges:      validLandingCharges,
        paymentWaived,
        waiverReason:        paymentWaived ? waiverReason.trim() : undefined,
        readings:            totalReadings,
        suppressPaymentRequestEmail: !paymentWaived && mode === 'mark_paid',
      })

      if (!paymentWaived && mode === 'mark_paid') {
        const parsedAmount = Number(manualAmount || (estimatedAmountDue / 100).toFixed(2))
        await recordManualPayment({
          bookingId,
          paymentMethod: manualPaymentMethod,
          amountCents: Math.round(parsedAmount * 100),
          note: manualPaymentNote.trim() || undefined,
        })
      }
    })
  }

  function executeSaveAndSendInvoice() {
    setSubmissionConfirmation(null)
    if (showManualPaymentFields) setShowManualPaymentFields(false)
    runSubmit('send_invoice')
  }

  function executeMarkPaidAction() {
    setSubmissionConfirmation(null)
    runSubmit('mark_paid')
  }

  function handleSaveAndSendInvoice() {
    setSubmissionConfirmation('send_invoice')
  }

  function handleMarkPaidAction() {
    if (paymentWaived) return
    if (!showManualPaymentFields) {
      setShowManualPaymentFields(true)
      if (!manualAmount) setManualAmount((estimatedAmountDue / 100).toFixed(2))
    }
    setSubmissionConfirmation('mark_paid')
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
    const noShowDescription = startPassed
      ? 'Mark this checkout as no-show and lock the customer account.'
      : 'This checkout start time has not passed yet. Mark it as no-show anyway and lock the customer account.'
    return (
      <>
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
          onClick={() => setNoShowConfirmOpen(true)}
          disabled={isPending}
          className="w-full flex items-center justify-center gap-2 bg-transparent border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[16px]">person_off</span>
          Mark No-Show
        </button>
        {noShowLocked && (
          <button
            onClick={() => setUnlockNoShowConfirmOpen(true)}
            disabled={isPending}
            className="w-full flex items-center justify-center gap-2 bg-transparent border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">lock_open</span>
            Unlock No-Show Lock
          </button>
        )}
        {error && <p className="text-[10px] text-rose-400 leading-tight text-center">{error}</p>}
        </div>

      <ConfirmModal
        open={noShowConfirmOpen}
        title="Mark this checkout as no-show?"
        description={noShowDescription}
        confirmLabel={isPending ? 'Saving…' : 'Yes, mark no-show'}
        cancelLabel="Back"
        variant="danger"
        onCancel={() => setNoShowConfirmOpen(false)}
        onConfirm={() => {
          setNoShowConfirmOpen(false)
          run(() => markCheckoutNoShow(bookingId))
        }}
      />

      <ConfirmModal
        open={unlockNoShowConfirmOpen}
        title="Unlock no-show lock?"
        description="This will restore the customer's ability to proceed with checkout bookings."
        confirmLabel={isPending ? 'Unlocking…' : 'Yes, unlock'}
        cancelLabel="Back"
        variant="primary"
        onCancel={() => setUnlockNoShowConfirmOpen(false)}
        onConfirm={() => {
          setUnlockNoShowConfirmOpen(false)
          run(() => unlockCheckoutNoShowLock(customerId))
        }}
      />
      </>
    )
  }

  if (!confirmingOutcome) {
    return (
      <div className="rounded-2xl border border-[#152d5a]/10 bg-open-ceiling p-5">
        <div className="space-y-3">
          <div className="mb-2">
            <p className="text-[9px] uppercase tracking-widest font-bold text-[#152d5a]">RECORD CHECKOUT OUTCOME</p>
            <p className="mt-1 text-sm text-gray-500">Select the outcome of this checkout flight to proceed.</p>
          </div>
          {OUTCOMES.map(outcome => (
            <button
              key={outcome.key}
              onClick={() => handleOutcomeSelect(outcome.key)}
              disabled={isPending}
              className={`w-full rounded-xl border border-[#152d5a]/15 border-l-[3px] ${outcome.cardBorder} ${outcome.cardTint} p-6 text-left transition-all ${outcome.cardHover} ${outcome.cardActive} hover:shadow-sm disabled:opacity-50 flex items-start gap-4`}
            >
              <span className={`material-symbols-outlined text-[26px] flex-shrink-0 mt-0.5 ${outcome.textColor}`} style={{ fontVariationSettings: "'wght' 350" }}>{outcome.icon}</span>
              <div className="min-w-0">
                <p className={`text-base font-semibold ${outcome.textColor}`}>{outcome.label}</p>
                <p className="mt-1 text-sm leading-relaxed text-gray-600">{outcome.body}</p>
              </div>
            </button>
          ))}
          {error && <p className="text-[10px] text-rose-500 leading-tight">{error}</p>}
        </div>
      </div>
    )
  }

  const outcome = OUTCOMES.find(item => item.key === confirmingOutcome)!

  return (
    <div className="space-y-5 rounded-2xl bg-open-ceiling p-1">
      <div className="rounded-2xl border border-[#152d5a]/10 bg-white p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-semibold text-[#152d5a]">Record Checkout Outcome</h3>
            <p className="text-sm text-[#4b6390] mt-1">Aircraft totals entered here become the official aircraft flight log row for this checkout.</p>
          </div>
          <button type="button" onClick={resetOutcomeForm} className="text-sm text-[#4b6390] hover:text-[#152d5a]">← Back</button>
        </div>

        <div className="rounded-xl border border-[#152d5a]/10 bg-[#f7f9fc] p-4">
          <p className={`text-sm font-semibold ${outcome.textColor} mb-1`}>{outcome.label}</p>
          <p className="text-sm text-[#4b6390] leading-relaxed">{outcome.body}</p>
        </div>

        {outcomeSupportsWaiver && (
          <div className="mt-4 rounded-xl border border-[#152d5a]/10 bg-[#f7f9fc] p-4">
            <p className="text-sm font-medium text-[#152d5a] mb-3">Charge customer for this checkout?</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPaymentWaived(false)} disabled={isPending} className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${!paymentWaived ? 'bg-[#152d5a] border border-[#152d5a] text-white' : 'bg-white border border-[#152d5a]/15 text-[#4b6390] hover:border-[#152d5a]/30'}`}>Yes, create payment request</button>
              <button type="button" onClick={() => setPaymentWaived(true)}  disabled={isPending} className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${paymentWaived  ? 'bg-amber-100 border border-amber-300 text-amber-800' : 'bg-white border border-[#152d5a]/15 text-[#4b6390] hover:border-[#152d5a]/30'}`}>No, waive payment</button>
            </div>
          </div>
        )}

        {paymentWaived && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg bg-amber-500/[0.06] border border-amber-500/20 px-3 py-3">
              <p className="text-sm text-amber-800 leading-relaxed">Payment will be waived. The checkout outcome will still write the complete aircraft readings into the aircraft ledger.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#152d5a] mb-1.5">Waiver reason <span className="text-rose-400">*</span></label>
              <textarea
                value={waiverReason}
                onChange={e => setWaiverReason(e.target.value)}
                rows={3}
                placeholder="Required — e.g. weather cancellation, aircraft unavailable, customer did not fly…"
                className="w-full bg-white border border-[#152d5a]/15 rounded-lg px-3 py-2.5 text-sm text-[#152d5a] placeholder:text-[#4b6390]/60 focus:outline-none focus:border-[#152d5a]/40 resize-none"
                disabled={isPending}
              />
            </div>
          </div>
        )}

        <div className="mt-5 space-y-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#4b6390] mb-3">Aircraft Readings</p>
            <div className="rounded-xl border border-[#152d5a]/10 bg-[#f7f9fc] p-4 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { field: 'vdo_total', label: 'VDO total' },
                  { field: 'tacho_total', label: 'Tacho total' },
                  { field: 'air_switch_total', label: 'Airswitch total' },
                  { field: 'mr_total', label: 'MR total' },
                ].map(({ field, label }) => {
                  const value = readings[field as keyof TotalOnlyFormValues] ?? ''
                  const parsed = value.trim() ? Number(value) : null
                  const isInvalid = submitAttempted && (value.trim() === '' || parsed == null || Number.isNaN(parsed) || parsed < 0)
                  return (
                    <label key={field} className="block">
                      <span className="text-[11px] text-[#4b6390] block mb-1">{label}</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={value}
                        onChange={(e) => setReadings(prev => ({ ...prev, [field]: e.target.value }))}
                        className={`w-full bg-white border rounded-lg px-3 py-2.5 text-sm text-[#152d5a] placeholder:text-[#4b6390]/60 focus:outline-none ${
                          isInvalid ? 'border-rose-300 focus:border-rose-400' : 'border-[#152d5a]/15 focus:border-[#152d5a]/40'
                        }`}
                        disabled={isPending}
                      />
                    </label>
                  )
                })}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { field: 'oil_added', label: 'Oil added' },
                  { field: 'oil_total', label: 'Oil total' },
                  { field: 'fuel_added', label: 'Fuel added' },
                  { field: 'fuel_returned', label: 'Fuel returned' },
                ].map(({ field, label }) => (
                  <label key={field} className="block">
                    <span className="text-[11px] text-[#4b6390] block mb-1">{label}</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={readings[field as keyof TotalOnlyFormValues] ?? ''}
                      onChange={(e) => setReadings(prev => ({ ...prev, [field]: e.target.value }))}
                      className="w-full bg-white border border-[#152d5a]/15 rounded-lg px-3 py-2.5 text-sm text-[#152d5a] placeholder:text-[#4b6390]/60 focus:outline-none focus:border-[#152d5a]/40"
                      disabled={isPending}
                    />
                  </label>
                ))}
              </div>

              <label className="block">
                <span className="text-[11px] text-[#4b6390] block mb-1">Notes</span>
                <textarea
                  rows={3}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  className="w-full bg-white border border-[#152d5a]/15 rounded-lg px-3 py-2.5 text-sm text-[#152d5a] placeholder:text-[#4b6390]/60 focus:outline-none focus:border-[#152d5a]/40"
                  disabled={isPending}
                />
              </label>
            </div>
            {submitAttempted && readingsError && (
              <p className="mt-2 text-xs text-rose-400">{readingsError}</p>
            )}
          </div>

          <div className="mt-2 border-t border-gray-200 pt-4">
            <div className="rounded-xl overflow-hidden border border-gray-200 bg-white">
              <div className="border-b border-gray-200 bg-gray-50 px-5 py-4">
                <p className="text-sm font-semibold text-gray-900">Finalise charges</p>
                <p className="mt-0.5 text-xs text-gray-500">Review and confirm billing before finalising the checkout.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2">
                <div className="px-5 py-5 md:border-r md:border-gray-200">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">Hourly rate</label>
                    <div className="flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                      <span className="mr-1 text-sm text-gray-400">$</span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={hourlyRate}
                        onChange={e => setHourlyRate(e.target.value)}
                        className="w-full border-0 bg-transparent p-0 text-sm text-gray-900 focus:outline-none"
                        disabled={isPending}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-gray-400">Applied to VDO duration for hire cost</p>
                  </div>

                  <div className="mt-5">
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-xs font-medium text-gray-900">Airport landings <span className="text-rose-500">*</span></p>
                      <button type="button" onClick={addLandingRow} disabled={isPending || airports.length === 0} className="inline-flex items-center gap-1 text-xs text-blue-600 disabled:opacity-40">
                        <span className="material-symbols-outlined text-[12px]">add</span>
                        Add airport
                      </button>
                    </div>
                    <p className="mb-2.5 text-xs text-gray-400">$28.95 per landing — add each airport visited</p>
                    <div>
                      {landingRows.map((row, index) => {
                        const rowError = landingRowErrors[index]
                        const count    = Number(row.landingCount)
                        const rowTotal = row.airportId && Number.isInteger(count) && count > 0 ? LANDING_FEE_CENTS * count : 0
                        return (
                          <div key={row.id} className="mb-2">
                            <div className="flex items-center gap-2">
                              <select value={row.airportId} onChange={e => handleLandingChange(row.id, 'airportId', e.target.value)} disabled={isPending} className="min-w-0 flex-1 truncate rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#152d5a]/40">
                                <option value="">Select airport</option>
                                {airports.map(airport => (<option key={airport.id} value={airport.id}>{airport.icao_code} — {airport.name}</option>))}
                              </select>
                              <input type="number" min="1" step="1" value={row.landingCount} onChange={e => handleLandingChange(row.id, 'landingCount', e.target.value)} disabled={isPending} className="w-12 rounded-lg border border-gray-200 bg-white px-2 py-2 text-center text-sm text-gray-900 focus:outline-none focus:border-[#152d5a]/40" />
                              <div className="w-16 text-right text-sm font-medium text-gray-700">
                                {rowTotal > 0 ? `$${(rowTotal / 100).toFixed(2)}` : '—'}
                              </div>
                              <button type="button" onClick={() => removeLandingRow(row.id)} disabled={isPending || landingRows.length <= 1} className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:text-rose-600 hover:border-rose-300 disabled:opacity-40">
                                <span className="material-symbols-outlined text-[12px]">remove</span>
                              </button>
                            </div>
                            {rowError && <p className="mt-1 text-xs text-rose-400">{rowError}</p>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="bg-white px-5 py-5 md:sticky md:top-4">
                  <p className="mb-3 border-b border-gray-200 pb-2.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Billing estimate</p>
                  <div className="flex items-baseline justify-between py-1.5">
                    <span className="text-sm text-gray-500">VDO total</span>
                    <span className="text-sm font-medium text-gray-900 tabular-nums">{vdoReading != null ? `${vdoReading.toFixed(1)} h` : '—'}</span>
                  </div>
                  <div className="flex items-baseline justify-between py-1.5">
                    <span className="text-sm text-gray-500">Aircraft hire</span>
                    <span className="text-sm font-medium text-gray-900 tabular-nums">{validHourlyRate && vdoReading != null ? `$${(vdoBaseCents / 100).toFixed(2)}` : '—'}</span>
                  </div>
                  <div className="flex items-baseline justify-between py-1.5">
                    <span className="text-sm text-gray-500">Landing charges</span>
                    <span className="text-sm font-medium text-gray-900 tabular-nums">${(landingSubtotalCents / 100).toFixed(2)}</span>
                  </div>
                  {customerCreditCents > 0 && (
                    <div className="flex items-baseline justify-between py-1.5">
                      <span className="text-sm text-gray-500">Customer credit applied</span>
                      <span className="text-sm font-medium text-emerald-700 tabular-nums">${(creditApplicable / 100).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="my-2 border-t border-gray-200" />
                  <div className="mt-1.5 flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2.5">
                    <span className="text-sm font-semibold text-blue-800">Estimated amount due</span>
                    <span className="text-base font-semibold text-blue-800 tabular-nums">{!paymentWaived && validHourlyRate && vdoReading != null ? `$${(estimatedAmountDue / 100).toFixed(2)}` : '—'}</span>
                  </div>
                  <p className="mt-2 text-right text-[11px] text-gray-400">Final amount may vary based on airport selection.</p>
                </div>
              </div>

              {!paymentWaived && showManualPaymentFields && (
                <div className="mt-4 rounded-xl border border-[#152d5a]/10 bg-white p-4 space-y-3">
                  <p className="text-base font-semibold text-[#152d5a]">Payment</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] text-[#4b6390]">Payment method</span>
                      <select
                        value={manualPaymentMethod}
                        onChange={(e) => setManualPaymentMethod(e.target.value as ManualPaymentMethod)}
                        className="w-full bg-white border border-[#152d5a]/15 rounded-lg px-3 py-2.5 text-sm text-[#152d5a] focus:outline-none focus:border-[#152d5a]/40"
                      >
                        <option value="cash">Cash</option>
                        <option value="card_in_person">Card (in person)</option>
                        <option value="bank_transfer">Bank transfer</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] text-[#4b6390]">Amount</span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={manualAmount || (estimatedAmountDue / 100).toFixed(2)}
                        onChange={(e) => setManualAmount(e.target.value)}
                        className="w-full bg-white border border-[#152d5a]/15 rounded-lg px-3 py-2.5 text-sm text-[#152d5a] focus:outline-none focus:border-[#152d5a]/40"
                      />
                    </label>
                    <label className="block md:col-span-1">
                      <span className="mb-1.5 block text-[11px] text-[#4b6390]">Note (optional)</span>
                      <input
                        type="text"
                        value={manualPaymentNote}
                        onChange={(e) => setManualPaymentNote(e.target.value)}
                        className="w-full bg-white border border-[#152d5a]/15 rounded-lg px-3 py-2.5 text-sm text-[#152d5a] focus:outline-none focus:border-[#152d5a]/40"
                      />
                    </label>
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>
              )}

              <div className="border-t border-gray-200 bg-white px-5 py-4">
                {submissionConfirmation ? (
                  <div className="rounded-xl border border-[#152d5a]/10 bg-[#f7f9fc] p-4">
                    <p className="text-sm font-semibold text-[#152d5a]">
                      {submissionConfirmation === 'send_invoice' ? 'Send invoice to customer?' : 'Mark payment as received?'}
                    </p>
                    <p className="mt-1 text-sm text-[#4b6390]">
                      {submissionConfirmation === 'send_invoice'
                        ? 'This will finalise the checkout outcome and send a payment request to the customer. The booking will move to awaiting payment.'
                        : 'This will finalise the checkout outcome and mark the booking as fully paid. No invoice will be sent to the customer.'}
                    </p>
                    <div className="mt-4 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => { setSubmissionConfirmation(null); setShowManualPaymentFields(false) }}
                        disabled={isPending}
                        className="text-sm text-[#4b6390] hover:text-[#152d5a] disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={submissionConfirmation === 'send_invoice' ? executeSaveAndSendInvoice : executeMarkPaidAction}
                        disabled={isPending}
                        className={`rounded-xl px-4 py-3 text-sm font-medium text-white transition-colors disabled:opacity-50 ${
                          submissionConfirmation === 'send_invoice'
                            ? 'bg-blue-600 hover:bg-blue-700'
                            : 'bg-green-600 hover:bg-green-700'
                        }`}
                      >
                        {isPending
                          ? 'Saving…'
                          : submissionConfirmation === 'send_invoice'
                            ? 'Yes, send invoice'
                            : 'Yes, mark as paid'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={handleSaveAndSendInvoice}
                      disabled={isPending}
                      className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isPending ? 'Saving…' : 'Save and Send Invoice'}
                    </button>
                    <button
                      type="button"
                      onClick={handleMarkPaidAction}
                      disabled={isPending || paymentWaived}
                      className="rounded-lg bg-green-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-800 disabled:opacity-50"
                    >
                      {isPending ? 'Saving…' : showManualPaymentFields ? 'Confirm and Complete' : 'Save and Mark Paid'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
