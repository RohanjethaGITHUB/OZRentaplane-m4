'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { finaliseStandardBookingInvoice } from '@/app/actions/admin-booking'
import TotalOnlyReadingsForm from '@/components/aircraft/TotalOnlyReadingsForm'
import {
  numberInputValue,
  type AircraftContinuityBaseline,
  type TotalOnlyFormValues,
  validateTotalOnlyReadings,
} from '@/lib/aircraft-readings'
import { PAYF_RATE_PER_HOUR } from '@/lib/pricing-constants'
import DocumentViewerModal from '@/components/ui/DocumentViewerModal'
import {
  resolveStandardBookingBillingBranch,
  resolveMinimumVdoBilling,
  resolveMinimumVdoBillingDisplay,
  type ManualSettlementMethod,
  type MinimumVdoDecision,
  type StandardBookingSubmissionMode,
} from '@/lib/booking/standard-booking-billing'
import type { FlightRecord } from '@/lib/supabase/booking-types'

export type FlightEvidenceAttachment = {
  id: string
  file_name: string
  signedUrl: string
  file_size: number | null
  created_at: string
}

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

type BlockTimeSummary = {
  hoursRemaining: number
  ratePerHour: number
  expiresAt: string
}

type InitialLandingCharge = {
  airportId: string
  landingCount: number
}

type Props = {
  bookingId: string
  airports: Airport[]
  customerCreditCents: number
  initialFlightRecord: FlightRecord
  initialLandingCharges?: InitialLandingCharge[]
  startSuggestions: AircraftContinuityBaseline
  bookingSlotHours: number
  activeBlockTime?: BlockTimeSummary | null
  defaultHourlyRate?: number
  redirectAfterSuccess?: string
  evidenceAttachments?: FlightEvidenceAttachment[]
}

const LANDING_FEE_CENTS = 2895
let rowIdCounter = 0

function getInitialAirportId(airports: Airport[]) {
  return airports.find(
    (airport) => airport.icao_code === 'YSBK' || airport.name.toLowerCase().includes('bankstown'),
  )?.id ?? ''
}

function getNum(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export default function AdminStandardBillingPanel({
  bookingId,
  airports,
  customerCreditCents,
  initialFlightRecord,
  initialLandingCharges = [],
  startSuggestions,
  bookingSlotHours,
  activeBlockTime,
  defaultHourlyRate = PAYF_RATE_PER_HOUR,
  redirectAfterSuccess,
  evidenceAttachments,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [submitState, setSubmitState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [showStillProcessing, setShowStillProcessing] = useState(false)
  const [isEvidenceModalOpen, setIsEvidenceModalOpen] = useState(false)
  const [evidenceInitialIndex, setEvidenceInitialIndex] = useState(0)
  const hasEvidence = Boolean(evidenceAttachments && evidenceAttachments.length > 0)
  const [submissionMode, setSubmissionMode] = useState<StandardBookingSubmissionMode>('send_invoice')
  const [manualPaymentMethod, setManualPaymentMethod] = useState<ManualSettlementMethod>('cash')
  const [waiverReason, setWaiverReason] = useState('')
  const [minimumVdoDecision, setMinimumVdoDecision] = useState<MinimumVdoDecision | ''>('')
  const lockedHourlyRate = activeBlockTime?.ratePerHour ?? null
  const initialHourlyRate = lockedHourlyRate ?? defaultHourlyRate
  const [hourlyRate, setHourlyRate] = useState(String(initialHourlyRate))
  const [adminNotes, setAdminNotes] = useState(initialFlightRecord.customer_notes ?? '')
  const [landings, setLandings] = useState(() => {
    if (initialLandingCharges.length > 0) {
      const total = initialLandingCharges.reduce((sum, row) => sum + row.landingCount, 0)
      return total > 0 ? String(total) : numberInputValue(initialFlightRecord.landings)
    }
    return numberInputValue(initialFlightRecord.landings)
  })
  const [readings, setReadings] = useState<TotalOnlyFormValues>({
    vdo_total:        numberInputValue(initialFlightRecord.vdo_total),
    air_switch_total: numberInputValue(initialFlightRecord.air_switch_total),
  })
  const [landingRows, setLandingRows] = useState<LandingChargeRow[]>(() => {
    if (initialLandingCharges.length > 0) {
      return initialLandingCharges.map((row) => ({
        id: ++rowIdCounter,
        airportId: row.airportId,
        landingCount: String(row.landingCount),
      }))
    }
    const initialAirportId = getInitialAirportId(airports)
    return initialAirportId
      ? [{ id: ++rowIdCounter, airportId: initialAirportId, landingCount: String(initialFlightRecord.landings) }]
      : [{ id: ++rowIdCounter, airportId: '', landingCount: '' }]
  })

  useEffect(() => {
    setHourlyRate(String(lockedHourlyRate ?? defaultHourlyRate))
  }, [defaultHourlyRate, lockedHourlyRate])

  useEffect(() => {
    if (submitState !== 'saving') {
      setShowStillProcessing(false)
      return
    }

    const timer = window.setTimeout(() => setShowStillProcessing(true), 15000)
    return () => window.clearTimeout(timer)
  }, [submitState])

  function run(fn: () => Promise<void>) {
    setError(null)
    setSubmitState('saving')

    void (async () => {
      try {
        await fn()
        setSubmitState('saved')

        startTransition(() => {
          if (redirectAfterSuccess) {
            router.replace(redirectAfterSuccess)
            return
          }
          router.refresh()
        })
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : 'Action failed. Please try again.'
        setSubmitState('idle')
        setError(message.replace(/^VALIDATION: /, ''))
      }
    })()
  }

  function addLandingRow() {
    setLandingRows((current) => [...current, { id: ++rowIdCounter, airportId: '', landingCount: '1' }])
  }

  function removeLandingRow(id: number) {
    setLandingRows((current) => current.length > 1 ? current.filter((row) => row.id !== id) : current)
  }

  function handleLandingChange(id: number, field: 'airportId' | 'landingCount', value: string) {
    setLandingRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row))
  }

  const hourlyRateNum = Number(hourlyRate)
  const validHourlyRate = Number.isFinite(hourlyRateNum) && hourlyRateNum > 0
  const landingsNum = landings.trim() === '' ? null : Number(landings)
  const billingBranch = resolveStandardBookingBillingBranch({ submissionMode })

  const normalisedReadings = {
    vdo_total:        getNum(readings.vdo_total) ?? 0,
    air_switch_total: getNum(readings.air_switch_total) ?? 0,
    landings:         landingsNum,
    notes:            adminNotes.trim() || null,
  }

  let readingsError: string | null = null
  try {
    validateTotalOnlyReadings({
      ...normalisedReadings,
      landings: landingsNum,
      notes: adminNotes.trim() || null,
    })
  } catch (validationError) {
    readingsError = validationError instanceof Error
      ? validationError.message.replace(/^VALIDATION: /, '')
      : 'Invalid readings.'
  }

  const totals      = readingsError ? null : normalisedReadings
  const vdoReading  = totals?.vdo_total ?? null
  const minimumVdoBilling = resolveMinimumVdoBilling({
    bookingSlotHours,
    actualVdoHours: vdoReading,
    decision: minimumVdoDecision || null,
  })
  const minimumDecisionRequired = minimumVdoBilling.requiresDecision
  const { billedVdoHours, billedVdoSummary, billedVdoConfirmation } = resolveMinimumVdoBillingDisplay(minimumVdoBilling)

  const landingRowErrors = landingRows.map((row) => {
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
    .filter((row) => row.airportId && Number.isInteger(Number(row.landingCount)) && Number(row.landingCount) > 0)
    .map((row) => ({ airportId: row.airportId, landingCount: Number(row.landingCount) }))

  const landingSubtotalCents = validLandingCharges.reduce(
    (sum, row) => sum + LANDING_FEE_CENTS * row.landingCount,
    0,
  )
  const finalVdoHours = billedVdoHours ?? vdoReading ?? 0
  let packageDeductionHours = 0
  let overageHours = 0
  let overageCents = 0
  let vdoBaseCents = 0

  if (activeBlockTime && finalVdoHours > 0 && validHourlyRate) {
    packageDeductionHours = Math.min(finalVdoHours, activeBlockTime.hoursRemaining)
    overageHours = Math.max(finalVdoHours - activeBlockTime.hoursRemaining, 0)
    overageCents = Math.round(overageHours * Math.round(hourlyRateNum * 100))
    vdoBaseCents = overageCents
  } else if (validHourlyRate && finalVdoHours > 0) {
    vdoBaseCents = Math.round(finalVdoHours * Math.round(hourlyRateNum * 100))
  }

  const subtotalCents      = vdoBaseCents + landingSubtotalCents
  const creditApplicable   = Math.min(customerCreditCents, subtotalCents)
  const estimatedAmountDue = Math.max(subtotalCents - creditApplicable, 0)

  function handleSubmit() {
    if (readingsError) {
      setError(readingsError)
      return
    }
    if (!validHourlyRate) {
      setError('Hourly rate must be a positive number.')
      return
    }
    if (landingsNum != null && (!Number.isInteger(landingsNum) || landingsNum < 0)) {
      setError('Landings must be a non-negative whole number.')
      return
    }
    if (vdoReading == null || vdoReading <= 0) {
      setError('Calculated VDO total must be greater than 0.')
      return
    }
    if (hasIncompleteLandingRows) {
      setError('Complete or remove incomplete landing rows before submitting.')
      return
    }
    if (minimumDecisionRequired) {
      setError('Choose whether to bill the minimum or the actual hours before finalising.')
      return
    }

    run(() => finaliseStandardBookingInvoice({
      bookingId,
      ratePerHour:    hourlyRateNum,
      landingCharges: validLandingCharges.length > 0 ? validLandingCharges : undefined,
      adminNotes:     adminNotes.trim() || undefined,
      readings:       normalisedReadings,
      submissionMode,
      manualPaymentMethod: submissionMode === 'mark_paid' ? manualPaymentMethod : undefined,
      waiverReason:   billingBranch.kind === 'waived' ? waiverReason.trim() || undefined : undefined,
      minimumVdoDecision: minimumVdoDecision || undefined,
    }))
  }

  return (
    <div className="rounded-2xl border border-[var(--admin-border)] bg-white p-6 md:p-8 space-y-8 shadow-[var(--admin-shadow-panel)]">
      <div>
        <h2 className="text-base font-semibold text-[var(--admin-text)] mb-1">Flight Billing</h2>
        <p className="text-sm text-[var(--admin-text-muted)] leading-relaxed">
          Review and finalise the pilot-submitted aircraft readings. The calculated VDO total is the billing source of truth.
        </p>
      </div>

      <section className="space-y-4">
        <SectionHeading>A. Aircraft Readings</SectionHeading>
        {(() => {
          const evidenceSlot = (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4b6390]">
                  Submitted Evidence
                </span>
                {hasEvidence && (
                  <span className="text-[10px] text-[#64748b]">
                    {evidenceAttachments!.length} {evidenceAttachments!.length === 1 ? 'file' : 'files'} attached
                  </span>
                )}
              </div>
              {hasEvidence ? (
                <div className="rounded-xl border border-[#dbe7f4] bg-[#f8fbff] p-3.5 flex items-center justify-between gap-3 shadow-[0_1px_0_rgba(255,255,255,0.8)]">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-[#1a4fd6] flex-shrink-0">
                      <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                        photo_library
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#152d5a] truncate">
                        {evidenceAttachments![0].file_name}
                        {evidenceAttachments!.length > 1 ? ` (+${evidenceAttachments!.length - 1} more)` : ''}
                      </p>
                      <p className="text-[11px] text-[#4b6390] mt-0.5">
                        Click to inspect pilot-uploaded meter &amp; fuel photos
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEvidenceInitialIndex(0)
                      setIsEvidenceModalOpen(true)
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#1a4fd6]/25 hover:border-[#1a4fd6] hover:bg-[#eff4ff]/60 text-[#1a4fd6] text-xs font-bold transition-all shadow-xs cursor-pointer flex-shrink-0"
                  >
                    <span>View Evidence</span>
                    <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#dbe7f4] bg-[#f8fbff]/60 px-3.5 py-2.5 flex items-center gap-2 text-xs text-[#64748b]">
                  <span className="material-symbols-outlined text-[18px] text-[#94a3b8]">image_not_supported</span>
                  <span>No evidence photos uploaded for this flight.</span>
                </div>
              )}
            </div>
          )

          return (
            <TotalOnlyReadingsForm
              values={readings}
              onChange={(field, value) => setReadings((current) => ({ ...current, [field]: value }))}
              notes={adminNotes}
              onNotesChange={setAdminNotes}
              continuityBaseline={startSuggestions}
              showContinuityWarnings
              disabled={submitState !== 'idle'}
              showBillingCaption={true}
              beforeNotesSlot={evidenceSlot}
            />
          )
        })()}
        {readingsError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {readingsError}
          </div>
        )}
        {minimumVdoBilling.isBelowMinimum && minimumVdoBilling.minimumVdoHours > 0 && minimumVdoBilling.actualVdoHours != null && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-800">
                VDO hours are below the minimum for this booking.
              </p>
              <p className="text-sm text-amber-700 leading-relaxed">
                VDO hours flown: <span className="font-mono tabular-nums font-semibold">{minimumVdoBilling.actualVdoHours.toFixed(1)} h</span>
                {' '}| Minimum for this booking ({minimumVdoBilling.bookingDays} day{minimumVdoBilling.bookingDays === 1 ? '' : 's'} booked × 4h/day):{' '}
                <span className="font-mono tabular-nums font-semibold">{minimumVdoBilling.minimumVdoHours.toFixed(1)} h</span>
              </p>
            </div>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800 block mb-1">
                Billing decision
              </span>
              <select
                value={minimumVdoDecision}
                onChange={(e) => setMinimumVdoDecision(e.target.value as MinimumVdoDecision | '')}
                disabled={submitState !== 'idle'}
                className="w-full max-w-lg rounded-lg border border-amber-200 bg-white px-3 py-2.5 text-sm text-[var(--admin-text)] focus:outline-none focus:border-[rgba(26,79,214,0.35)]"
              >
                <option value="">Choose billing option…</option>
                <option value="enforce_minimum">
                  Enforce minimum billing
                </option>
                <option value="bill_actual">
                  Bill actual hours
                </option>
              </select>
            </label>
            <p className="text-xs font-semibold text-amber-800 leading-relaxed">
              {billedVdoConfirmation}
            </p>
            <p className="text-xs text-amber-700/90 leading-relaxed">
              Finalisation will stay blocked until you choose whether to bill the minimum or the actual submitted hours.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-5">
        <SectionHeading>B. Billing Rate &amp; Landing Charges</SectionHeading>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-[var(--admin-text)] mb-2">
              Hourly rate {activeBlockTime ? (
                <span className="ml-1.5 text-[10px] text-[var(--admin-text-muted)] font-normal">
                  (locked block time rate ${activeBlockTime.ratePerHour.toFixed(2)}/hr applies)
                </span>
              ) : (
                <span className="ml-1.5 text-[10px] text-[var(--admin-text-muted)] font-normal">
                  (Pay As You Fly — no active block time package)
                </span>
              )}
            </label>
            <div className="relative max-w-xs">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--admin-text-muted)]">$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                readOnly={!!activeBlockTime}
                disabled={submitState !== 'idle'}
                className={`w-full border rounded-lg pl-7 pr-3 py-2.5 text-sm min-h-[40px] ${
                  activeBlockTime
                    ? 'bg-slate-50 border-[var(--admin-border)] text-[var(--admin-text-muted)] cursor-not-allowed'
                    : 'bg-white border-[var(--admin-border)] text-[var(--admin-text)] focus:outline-none focus:border-[rgba(26,79,214,0.35)]'
                }`}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[var(--admin-text)]">
                Airport landings
                <span className="ml-1.5 text-[10px] text-[var(--admin-text-muted)] font-normal">(optional)</span>
              </label>
              <button
                type="button"
                onClick={addLandingRow}
                disabled={submitState !== 'idle' || airports.length === 0}
                className="flex items-center gap-1 text-[11px] text-[#1a4fd6] hover:text-[#152d5a] transition-colors disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[14px]">add_circle</span>
                Add Airport
              </button>
            </div>

            <div className="space-y-2">
              {landingRows.map((row, index) => {
                const rowError = landingRowErrors[index]
                const count = Number(row.landingCount)
                const rowTotal = row.airportId && Number.isInteger(count) && count > 0
                  ? LANDING_FEE_CENTS * count
                  : 0

                return (
                  <div key={row.id} className="space-y-0.5">
                    <div className="flex gap-2 items-start">
                      <select
                        value={row.airportId}
                        onChange={(e) => handleLandingChange(row.id, 'airportId', e.target.value)}
                        disabled={submitState !== 'idle'}
                        className="flex-1 bg-white border border-[var(--admin-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--admin-text)] focus:outline-none focus:border-[rgba(26,79,214,0.35)] min-w-0 min-h-[40px]"
                      >
                        <option value="">Select airport…</option>
                        {airports.map((airport) => (
                          <option key={airport.id} value={airport.id}>
                            {airport.icao_code} — {airport.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={row.landingCount}
                        onChange={(e) => handleLandingChange(row.id, 'landingCount', e.target.value)}
                        disabled={submitState !== 'idle'}
                        className="w-16 bg-white border border-[var(--admin-border)] rounded-lg px-2 py-2.5 text-sm text-[var(--admin-text)] text-center focus:outline-none focus:border-[rgba(26,79,214,0.35)] min-h-[40px]"
                      />
                      <div className="w-16 text-right flex-shrink-0 py-2.5">
                        <span className="text-sm font-mono text-[var(--admin-text-muted)]">
                          {rowTotal > 0 ? `$${(rowTotal / 100).toFixed(2)}` : '—'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLandingRow(row.id)}
                        disabled={submitState !== 'idle' || landingRows.length <= 1}
                        className="flex-shrink-0 p-2 text-[var(--admin-text-muted)] hover:text-rose-500 transition-colors disabled:opacity-30"
                      >
                        <span className="material-symbols-outlined text-[16px]">remove_circle</span>
                      </button>
                    </div>
                    {rowError && (
                      <p className="text-xs text-rose-500/80 pl-1">{rowError}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading>Payment Options</SectionHeading>
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-[var(--admin-border)] bg-[#f7f9fc] p-4 space-y-4">
            <p className="text-sm font-medium text-[var(--admin-text)]">Submission mode</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { value: 'send_invoice' as const, label: 'Send Invoice to Customer' },
                { value: 'mark_paid' as const, label: 'Mark paid' },
                { value: 'waived' as const, label: 'Waived' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSubmissionMode(option.value)}
                  disabled={submitState !== 'idle'}
                  className={`rounded-xl border px-3 py-3 text-sm font-medium transition-all ${
                    submissionMode === option.value
                      ? 'border-[#1a4fd6] bg-white text-[#1a4fd6] shadow-sm ring-1 ring-[#1a4fd6]/20'
                      : 'border-[var(--admin-border)] bg-white/70 text-[var(--admin-text-muted)] hover:border-[var(--admin-border)] hover:bg-white hover:text-[var(--admin-text)]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {totals && validHourlyRate && (
            <div className="space-y-3">
              {minimumVdoBilling.isBelowMinimum && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 leading-relaxed">
                  Billing preview: {billedVdoConfirmation}
                </div>
              )}
              <div className="rounded-xl border border-[var(--admin-border)] bg-[#f7f9fc] px-5 py-4 space-y-3">
                <div className="flex items-center">
                  <span className="text-sm text-[var(--admin-text-muted)]">Submitted VDO total</span>
                  <span className="flex-1 mx-2 border-b border-dotted border-[var(--admin-border)] translate-y-[-2px]" />
                  <span className="text-sm font-mono tabular-nums text-[var(--admin-text)]">
                    {billedVdoSummary}
                  </span>
                </div>
                {activeBlockTime ? (
                  <>
                    <div className="pl-3.5 border-l-2 border-[var(--admin-border)]/60 space-y-1.5 my-1.5">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--admin-text-muted)] mb-1">Block time balance</div>
                      <div className="flex items-center">
                        <span className="text-sm text-[var(--admin-text-muted)]">Available before this flight</span>
                        <span className="flex-1 mx-2 border-b border-dotted border-[var(--admin-border)] translate-y-[-2px]" />
                        <span className="text-sm font-mono tabular-nums text-[var(--admin-text-muted)]">
                          {activeBlockTime.hoursRemaining.toFixed(1)}h
                        </span>
                      </div>
                      <div className="flex items-center">
                        <span className="text-sm text-[var(--admin-text-muted)]">Used this flight</span>
                        <span className="flex-1 mx-2 border-b border-dotted border-[var(--admin-border)] translate-y-[-2px]" />
                        <span className="text-sm font-mono tabular-nums text-[var(--admin-text-muted)]">
                          {packageDeductionHours.toFixed(1)}h <span className="ml-4">$0.00</span>
                        </span>
                      </div>
                      <div className="flex items-center">
                        <span className="text-sm text-[var(--admin-text-muted)]">Remaining after</span>
                        <span className="flex-1 mx-2 border-b border-dotted border-[var(--admin-border)] translate-y-[-2px]" />
                        <span className="text-sm font-mono tabular-nums text-[var(--admin-text-muted)] font-medium">
                          {(activeBlockTime.hoursRemaining - packageDeductionHours).toFixed(1)}h
                        </span>
                      </div>
                    </div>
                    {overageHours > 0 && (
                      <div className="flex items-center">
                        <span className="text-sm text-amber-700">Overage ({overageHours.toFixed(1)}h x ${activeBlockTime.ratePerHour.toFixed(2)}/hr)</span>
                        <span className="flex-1 mx-2 border-b border-dotted border-[var(--admin-border)] translate-y-[-2px]" />
                        <span className="text-sm font-mono tabular-nums text-amber-700">
                          ${(overageCents / 100).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center">
                    <span className="text-sm text-[var(--admin-text-muted)]">Aircraft hire ({finalVdoHours.toFixed(1)}h x ${hourlyRateNum.toFixed(2)}/hr)</span>
                    <span className="flex-1 mx-2 border-b border-dotted border-[var(--admin-border)] translate-y-[-2px]" />
                    <span className="text-sm font-mono tabular-nums text-[var(--admin-text)]">
                      ${(vdoBaseCents / 100).toFixed(2)}
                    </span>
                  </div>
                )}
                {landingSubtotalCents > 0 && (
                  <div className="flex items-center">
                    <span className="text-sm text-[var(--admin-text-muted)]">Landing charges ({validLandingCharges.reduce((sum, row) => sum + row.landingCount, 0)} x ${(LANDING_FEE_CENTS / 100).toFixed(2)})</span>
                    <span className="flex-1 mx-2 border-b border-dotted border-[var(--admin-border)] translate-y-[-2px]" />
                    <span className="text-sm font-mono tabular-nums text-[var(--admin-text)]">
                      ${(landingSubtotalCents / 100).toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="border-t border-[var(--admin-border)] pt-3 flex items-center">
                  <span className="text-sm font-medium text-[var(--admin-text)]">Invoice total</span>
                  <span className="flex-1 mx-2 border-b border-dotted border-[var(--admin-border)] translate-y-[-2px]" />
                  <span className="text-base font-bold font-mono tabular-nums text-[#1a4fd6]">
                    ${(subtotalCents / 100).toFixed(2)}
                  </span>
                </div>
                {creditApplicable > 0 && (
                  <div className="flex items-center">
                    <span className="text-sm text-[var(--admin-text-muted)]">Credit applied</span>
                    <span className="flex-1 mx-2 border-b border-dotted border-[var(--admin-border)] translate-y-[-2px]" />
                    <span className="text-sm font-mono tabular-nums text-emerald-600">
                      ${(creditApplicable / 100).toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex items-center">
                  <span className="text-sm font-semibold text-[var(--admin-text)]">Final amount due</span>
                  <span className="flex-1 mx-2 border-b border-dotted border-[var(--admin-border)] translate-y-[-2px]" />
                  <span className="text-lg font-bold font-mono tabular-nums text-[#152d5a]">
                    ${(estimatedAmountDue / 100).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {billingBranch.kind === 'waived' ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-3">
            <p className="text-sm font-semibold text-amber-800">Payment waived</p>
            <textarea
              value={waiverReason}
              onChange={(e) => setWaiverReason(e.target.value)}
              rows={3}
              placeholder="Reason for waiving payment (optional)…"
              disabled={submitState !== 'idle'}
              className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-[var(--admin-text)] focus:outline-none focus:border-[rgba(26,79,214,0.35)]"
            />
          </div>
        ) : submissionMode === 'mark_paid' ? (
          <div className="rounded-xl border border-[var(--admin-border)] bg-[#f7f9fc] px-4 py-3 space-y-3">
            <p className="text-sm text-[var(--admin-text-muted)]">This will record the invoice as settled.</p>
            <label className="block md:max-w-xs">
              <span className="mb-1.5 block text-[11px] text-[var(--admin-text-muted)]">Payment method received</span>
              <select
                value={manualPaymentMethod}
                onChange={(e) => setManualPaymentMethod(e.target.value as ManualSettlementMethod)}
                disabled={submitState !== 'idle'}
                className="w-full rounded-lg border border-[var(--admin-border)] bg-white px-3 py-2 text-sm text-[var(--admin-text)] focus:outline-none focus:border-[rgba(26,79,214,0.35)]"
              >
                <option value="cash">Cash</option>
                <option value="card_in_person">Card (in person)</option>
                <option value="bank_transfer">Bank transfer</option>
              </select>
            </label>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--admin-border)] bg-[#f7f9fc] px-4 py-3 text-sm text-[var(--admin-text-muted)]">
            This will issue an invoice. The customer will choose how to pay from their booking page.
          </div>
        )}
      </section>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitState !== 'idle' || minimumDecisionRequired}
        className="w-full rounded-xl bg-[#1a4fd6] hover:bg-[#1540a8] text-white px-4 py-3.5 text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
      >
        {submitState === 'saving'
          ? (showStillProcessing ? 'Still finalising…' : 'Finalising…')
          : submitState === 'saved'
            ? 'Saved'
            : 'Finalise Flight Billing'}
      </button>
      {submitState === 'saving' && showStillProcessing && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This is taking longer than usual, but the save may still be processing. Please keep this tab open for a moment.
        </div>
      )}

      {hasEvidence && (
        <DocumentViewerModal
          isOpen={isEvidenceModalOpen}
          onClose={() => setIsEvidenceModalOpen(false)}
          files={evidenceAttachments!.map((att) => ({
            url: att.signedUrl,
            name: att.file_name,
          }))}
          initialIndex={evidenceInitialIndex}
          title="Flight Evidence Photos"
        />
      )}
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <p className="text-[11px] font-bold uppercase tracking-widest text-[#4b6390] whitespace-nowrap">
        {children}
      </p>
      <div className="flex-1 h-px bg-[rgba(12,35,64,0.08)]" />
    </div>
  )
}
