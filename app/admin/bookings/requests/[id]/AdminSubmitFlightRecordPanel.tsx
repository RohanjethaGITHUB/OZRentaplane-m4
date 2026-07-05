'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminSubmitFlightRecord } from '@/app/actions/admin-booking'
import AircraftReadingsForm from '@/components/aircraft/AircraftReadingsForm'
import {
  calculateAircraftReadingsTotals,
  numberInputValue,
  type AircraftContinuityBaseline,
  type AircraftReadingsFormValues,
  validateAircraftReadings,
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
  defaultHourlyRate?: number
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
  defaultHourlyRate = 330,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [flightDate, setFlightDate] = useState(sydneyDateKey(scheduledStart))
  const [hourlyRate, setHourlyRate] = useState(String(defaultHourlyRate))
  const [adminNotes, setAdminNotes] = useState('')
  const [landings, setLandings] = useState('')
  const [readings, setReadings] = useState<AircraftReadingsFormValues>({
    tacho_start:      numberInputValue(startSuggestions.tacho_start ?? null),
    tacho_stop:       '',
    vdo_start:        numberInputValue(startSuggestions.vdo_start ?? null),
    vdo_stop:         '',
    air_switch_start: numberInputValue(startSuggestions.air_switch_start ?? null),
    air_switch_stop:  '',
    mr_start:         numberInputValue(startSuggestions.mr_start ?? null),
    mr_stop:          '',
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
    vdo_start:        getNum(readings.vdo_start),
    vdo_stop:         getNum(readings.vdo_stop),
    tacho_start:      getNum(readings.tacho_start),
    tacho_stop:       getNum(readings.tacho_stop),
    air_switch_start: getNum(readings.air_switch_start),
    air_switch_stop:  getNum(readings.air_switch_stop),
    mr_start:         getNum(readings.mr_start),
    mr_stop:          getNum(readings.mr_stop),
    oil_added:        getNum(readings.oil_added),
    oil_total:        getNum(readings.oil_total),
    fuel_added:       getNum(readings.fuel_added),
    fuel_returned:    getNum(readings.fuel_returned),
    landings:         landingsNum,
    notes:            adminNotes.trim() || null,
  }

  let readingsError: string | null = null
  try {
    validateAircraftReadings(normalisedReadings)
  } catch (validationError) {
    readingsError = validationError instanceof Error
      ? validationError.message.replace(/^VALIDATION: /, '')
      : 'Invalid readings.'
  }

  const totals     = readingsError ? null : calculateAircraftReadingsTotals(normalisedReadings)
  const vdoReading = totals?.vdo_total ?? null

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
  const vdoBaseCents = vdoReading != null && Number.isFinite(effectiveRate) && effectiveRate > 0
    ? Math.round(vdoReading * Math.round(effectiveRate * 100))
    : 0
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
        })
        router.refresh()
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
        <AircraftReadingsForm
          values={readings}
          onChange={(field, value) => setReadings((current) => ({ ...current, [field]: value }))}
          notes={adminNotes}
          onNotesChange={setAdminNotes}
          landings={landings}
          onLandingsChange={setLandings}
          startBaseline={startSuggestions}
          showContinuityWarnings
          tableLayout
          disabled={isPending}
        />
        {readingsError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {readingsError}
          </div>
        )}
      </section>

      <section className="space-y-5">
        <SectionHeading>B. Billing Rate &amp; Landing Charges</SectionHeading>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-[var(--admin-text)] mb-2">
              Hourly rate {activeBlockTime && (
                <span className="ml-1.5 text-[10px] text-[var(--admin-text-muted)] font-normal">
                  (ignored for block time — locked rate ${activeBlockTime.ratePerHour.toFixed(2)}/hr applies)
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

      {totals && vdoReading != null && vdoReading > 0 && (
        <section className="space-y-4">
          <SectionHeading>C. Billing Summary</SectionHeading>
          <div className="rounded-xl border border-[var(--admin-border)] bg-[#f7f9fc] px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--admin-text-muted)]">Calculated VDO total</span>
              <span className="text-sm font-mono tabular-nums text-[var(--admin-text)]">
                {vdoReading.toFixed(1)} h
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
                  ${(vdoBaseCents / 100).toFixed(2)}
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
        disabled={isPending}
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
