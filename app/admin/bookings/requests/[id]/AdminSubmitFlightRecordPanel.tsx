'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminSubmitFlightRecord } from '@/app/actions/admin-booking'
import TotalOnlyReadingsForm from '@/components/aircraft/TotalOnlyReadingsForm'
import { PAYF_RATE_PER_HOUR } from '@/lib/pricing-constants'
import {
  resolveStandardBookingBillingBranch,
  resolveMinimumVdoBilling,
  resolveMinimumVdoBillingDisplay,
  type MinimumVdoDecision,
  type StandardBookingSubmissionMode,
} from '@/lib/booking/standard-booking-billing'
import {
  type AircraftContinuityBaseline,
  type TotalOnlyFormValues,
  validateTotalOnlyReadings,
} from '@/lib/aircraft-readings'

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

type Props = {
  bookingId: string
  airports: Airport[]
  scheduledStart: string           // ISO — used to default the flight date
  startSuggestions: AircraftContinuityBaseline
  activeBlockTime: BlockTimeSummary | null
  bookingSlotHours: number
  successRedirectHref?: string
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

function sydneyDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
}

export default function AdminSubmitFlightRecordPanel({
  bookingId,
  airports,
  scheduledStart,
  startSuggestions,
  activeBlockTime,
  bookingSlotHours,
  successRedirectHref,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [flightDate, setFlightDate] = useState(sydneyDateKey(scheduledStart))
  const [hourlyRate, setHourlyRate] = useState(
    String(activeBlockTime?.ratePerHour ?? PAYF_RATE_PER_HOUR),
  )
  const [submissionMode, setSubmissionMode] = useState<StandardBookingSubmissionMode>('send_invoice')
  const [waiverReason, setWaiverReason] = useState('')
  const [minimumVdoDecision, setMinimumVdoDecision] = useState<MinimumVdoDecision | ''>('')
  const [adminNotes, setAdminNotes] = useState('')
  const [landings, setLandings] = useState('')
  const [readings, setReadings] = useState<TotalOnlyFormValues>({
    tacho_total:      '',
    vdo_total:        '',
    air_switch_total: '',
    mr_total:         '',
    oil_added:        '',
    oil_total:        '',
    fuel_added:       '',
    fuel_returned:    '',
  })
  const [landingRows, setLandingRows] = useState<LandingChargeRow[]>(() => [
    { id: ++rowIdCounter, airportId: getInitialAirportId(airports), landingCount: '1' },
  ])

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

  const normalisedReadings = {
    vdo_total:        getNum(readings.vdo_total) ?? 0,
    tacho_total:      getNum(readings.tacho_total) ?? 0,
    air_switch_total: getNum(readings.air_switch_total) ?? 0,
    mr_total:         getNum(readings.mr_total) ?? 0,
    oil_added:        getNum(readings.oil_added),
    oil_total:        getNum(readings.oil_total),
    fuel_added:       getNum(readings.fuel_added),
    fuel_returned:    getNum(readings.fuel_returned),
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

  const vdoReading = readingsError ? null : normalisedReadings.vdo_total

  const landingRowErrors = landingRows.map((row) => {
    const count      = Number(row.landingCount)
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

  const effectiveRate = activeBlockTime ? activeBlockTime.ratePerHour : hourlyRateNum
  const billingBranch = resolveStandardBookingBillingBranch({ submissionMode })
  const minimumVdoBilling = resolveMinimumVdoBilling({
    bookingSlotHours,
    actualVdoHours: vdoReading,
    decision: minimumVdoDecision || null,
  })
  const minimumDecisionRequired = minimumVdoBilling.requiresDecision
  const { billedVdoHours, billedVdoSummary, billedVdoConfirmation } = resolveMinimumVdoBillingDisplay(minimumVdoBilling)
  const blockTimeCoveredHours = activeBlockTime && vdoReading != null
    ? Math.min(vdoReading, activeBlockTime.hoursRemaining)
    : 0
  const blockTimeOverageHours = activeBlockTime && vdoReading != null
    ? Math.max(vdoReading - activeBlockTime.hoursRemaining, 0)
    : 0

  function handleSubmit() {
    if (readingsError) {
      setError(readingsError)
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(flightDate)) {
      setError('Flight date is required.')
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
    if (billingBranch.kind === 'waived' && !waiverReason.trim()) {
      setError('A waiver reason is required when payment is waived.')
      return
    }
    if (minimumDecisionRequired) {
      setError('Choose whether to bill the minimum or the actual hours before finalising.')
      return
    }

    setError(null)
    startTransition(async () => {
      try {
        await adminSubmitFlightRecord({
          bookingId,
          date:           flightDate,
          ratePerHour:    hourlyRateNum,
          landingCharges: validLandingCharges.length > 0 ? validLandingCharges : undefined,
          adminNotes:     adminNotes.trim() || undefined,
          readings:       normalisedReadings,
          submissionMode,
          waiverReason:    billingBranch.kind === 'waived' ? waiverReason.trim() || undefined : undefined,
          minimumVdoDecision: minimumVdoDecision || undefined,
        })
        if (successRedirectHref) {
          router.push(successRedirectHref)
        } else {
          router.refresh()
        }
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : 'Action failed. Please try again.'
        setError(message.replace(/^VALIDATION: /, ''))
      }
    })
  }

  return (
    <div className="rounded-2xl border border-[var(--admin-border)] bg-white p-6 md:p-8 space-y-8 shadow-[var(--admin-shadow-panel)]">
      <div>
        <h2 className="text-base font-semibold text-[var(--admin-text)] mb-1">Submit Post-Flight Record</h2>
        <p className="text-sm text-[var(--admin-text-muted)] leading-relaxed">
          Enter the post-flight aircraft readings on the customer&apos;s behalf. The record is
          submitted, approved, and billed in one step — the customer receives the same
          confirmation emails as a self-submitted record.
        </p>
      </div>

      {activeBlockTime ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-800">
            Block time customer — flight hours are deducted from their balance.
          </p>
          <p className="text-xs text-emerald-700 mt-1">
            Balance: {activeBlockTime.hoursRemaining.toFixed(1)}h remaining at
            ${activeBlockTime.ratePerHour.toFixed(2)}/hr (locked rate).
            {vdoReading != null && vdoReading > 0 && blockTimeOverageHours > 0 && (
              <> This submission exceeds the balance: {blockTimeCoveredHours.toFixed(2)}h will be
              deducted and {blockTimeOverageHours.toFixed(2)}h invoiced as overage at the locked rate.</>
            )}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--admin-border)] bg-[#f7f9fc] px-4 py-3">
          <p className="text-sm text-[var(--admin-text)]">
            Pay As You Fly customer — flight hours are invoiced at the hourly rate below.
          </p>
        </div>
      )}

      <section className="space-y-4">
        <SectionHeading>A. Flight Date &amp; Aircraft Readings</SectionHeading>
        <div className="max-w-xs">
          <label className="block text-sm font-medium text-[var(--admin-text)] mb-2">
            Flight date
          </label>
          <input
            type="date"
            value={flightDate}
            onChange={(e) => setFlightDate(e.target.value)}
            disabled={isPending}
            className="w-full bg-white border border-[var(--admin-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--admin-text)] focus:outline-none focus:border-[rgba(26,79,214,0.35)] min-h-[40px]"
          />
        </div>
        <TotalOnlyReadingsForm
          values={readings}
          onChange={(field, value) => setReadings((current) => ({ ...current, [field]: value }))}
          notes={adminNotes}
          onNotesChange={setAdminNotes}
          continuityBaseline={startSuggestions}
          showContinuityWarnings
          disabled={isPending}
        />
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
                disabled={isPending}
                className="w-full max-w-lg rounded-lg border border-amber-200 bg-white px-3 py-2.5 text-sm text-[var(--admin-text)] focus:outline-none focus:border-[rgba(26,79,214,0.35)]"
              >
                <option value="">Choose billing option…</option>
                <option value="enforce_minimum">Enforce minimum billing</option>
                <option value="bill_actual">Bill actual hours</option>
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
                  (ignored for block time — locked rate ${activeBlockTime.ratePerHour.toFixed(2)}/hr applies)
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
                disabled={isPending}
                className="w-full bg-white border border-[var(--admin-border)] rounded-lg pl-7 pr-3 py-2.5 text-sm text-[var(--admin-text)] focus:outline-none focus:border-[rgba(26,79,214,0.35)] min-h-[40px]"
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
                disabled={isPending || airports.length === 0}
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
                        disabled={isPending}
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
                        disabled={isPending}
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
                        disabled={isPending || landingRows.length <= 1}
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
          <SectionHeading>C. Payment Options</SectionHeading>
          {activeBlockTime && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 leading-relaxed">
              Block time customer: flight hours are settled from the balance automatically, so the
              options below apply to the <span className="font-semibold">landing fee invoice</span>.
              Any overage is always invoiced separately and must be paid (online or marked settled
              from the customer&apos;s profile) before the customer can book again — it cannot be
              waived here.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-[var(--admin-border)] bg-[#f7f9fc] p-4 space-y-3">
              <p className="text-sm font-medium text-[var(--admin-text)]">Submission mode</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'send_invoice' as const, label: 'Send Invoice to Customer' },
                  { value: 'mark_paid' as const, label: 'Mark paid' },
                  { value: 'waived' as const, label: 'Waived' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSubmissionMode(option.value)}
                    disabled={isPending}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                      submissionMode === option.value
                        ? 'border-[rgba(26,79,214,0.35)] bg-white text-[var(--admin-text)]'
                        : 'border-[var(--admin-border)] bg-white/70 text-[var(--admin-text-muted)] hover:border-[rgba(26,79,214,0.2)]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {billingBranch.kind === 'waived' ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-3">
              <p className="text-sm font-semibold text-amber-800">Payment waived</p>
              <textarea
                value={waiverReason}
                onChange={(e) => setWaiverReason(e.target.value)}
                rows={3}
                placeholder="Reason for waiving payment…"
                disabled={isPending}
                className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-[var(--admin-text)] focus:outline-none focus:border-[rgba(26,79,214,0.35)]"
              />
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--admin-border)] bg-[#f7f9fc] px-4 py-3 text-sm text-[var(--admin-text-muted)]">
              {submissionMode === 'mark_paid'
                ? activeBlockTime
                  ? 'This will record the landing fee invoice as settled.'
                  : 'This will record the invoice as settled.'
                : activeBlockTime
                  ? 'This will issue a landing fee invoice. The customer will choose how to pay from their Purchases page.'
                  : 'This will issue an invoice. The customer will choose how to pay from their booking page.'}
            </div>
          )}
        </section>

      {vdoReading != null && vdoReading > 0 && (
        <section className="space-y-4">
          <SectionHeading>D. Billing Summary</SectionHeading>
          {activeBlockTime && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 leading-relaxed">
              Billing preview: {billedVdoConfirmation}
            </div>
          )}
          <div className="rounded-xl border border-[var(--admin-border)] bg-[#f7f9fc] px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--admin-text-muted)]">Calculated VDO total</span>
              <span className="text-sm font-mono tabular-nums text-[var(--admin-text)]">
                {billedVdoSummary}
              </span>
            </div>
            {activeBlockTime ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--admin-text-muted)]">Deducted from block time</span>
                  <span className="text-sm font-mono tabular-nums text-emerald-700">
                    {blockTimeCoveredHours.toFixed(2)} h
                  </span>
                </div>
                {blockTimeOverageHours > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-amber-700">Overage (invoiced at locked rate)</span>
                    <span className="text-sm font-mono tabular-nums text-amber-700">
                      {blockTimeOverageHours.toFixed(2)} h · ${(blockTimeOverageHours * activeBlockTime.ratePerHour).toFixed(2)}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--admin-text-muted)]">Aircraft hire</span>
                <span className="text-sm font-mono tabular-nums text-[var(--admin-text)]">
                  ${((billedVdoHours ?? vdoReading) * effectiveRate).toFixed(2)}
                </span>
              </div>
            )}
            {landingSubtotalCents > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--admin-text-muted)]">Landing charges (invoiced separately)</span>
                <span className="text-sm font-mono tabular-nums text-[var(--admin-text)]">
                  ${(landingSubtotalCents / 100).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending || minimumDecisionRequired}
        className="w-full rounded-xl bg-[#1a4fd6] hover:bg-[#1540a8] text-white px-4 py-3.5 text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
      >
        {isPending ? 'Submitting…' : 'Submit Post-Flight Record'}
      </button>
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
