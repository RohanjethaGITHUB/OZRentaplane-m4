'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { finaliseStandardBookingInvoice } from '@/app/actions/admin-booking'
import AircraftReadingsForm from '@/components/aircraft/AircraftReadingsForm'
import {
  calculateAircraftReadingsTotals,
  numberInputValue,
  type AircraftContinuityBaseline,
  type AircraftReadingsFormValues,
  validateAircraftReadings,
} from '@/lib/aircraft-readings'
import type { FlightRecord } from '@/lib/supabase/booking-types'

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
  airports: Airport[]
  customerCreditCents: number
  initialFlightRecord: FlightRecord
  startSuggestions: AircraftContinuityBaseline
  redirectAfterSuccess?: string
}

const LANDING_FEE_CENTS = 2500
let rowIdCounter = 0

function getInitialAirportId(airports: Airport[]) {
  return airports.find((airport) => airport.icao_code === 'YSBK' || airport.name.toLowerCase().includes('bankstown'))?.id ?? ''
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
  startSuggestions,
  redirectAfterSuccess,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [hourlyRate, setHourlyRate] = useState('290')
  const [adminNotes, setAdminNotes] = useState(initialFlightRecord.customer_notes ?? '')
  const [landings, setLandings] = useState(numberInputValue(initialFlightRecord.landings))
  const [readings, setReadings] = useState<AircraftReadingsFormValues>({
    tacho_start: numberInputValue(initialFlightRecord.tacho_start),
    tacho_stop: numberInputValue(initialFlightRecord.tacho_stop),
    vdo_start: numberInputValue(initialFlightRecord.vdo_start),
    vdo_stop: numberInputValue(initialFlightRecord.vdo_stop),
    air_switch_start: numberInputValue(initialFlightRecord.air_switch_start),
    air_switch_stop: numberInputValue(initialFlightRecord.air_switch_stop),
    mr_start: numberInputValue(initialFlightRecord.mr_start),
    mr_stop: numberInputValue(initialFlightRecord.mr_stop),
    oil_added: numberInputValue(initialFlightRecord.oil_added),
    oil_total: numberInputValue(initialFlightRecord.oil_total),
    fuel_added: numberInputValue(initialFlightRecord.fuel_added),
    fuel_returned: numberInputValue(initialFlightRecord.fuel_returned),
  })
  const [landingRows, setLandingRows] = useState<LandingChargeRow[]>(() => {
    const initialAirportId = getInitialAirportId(airports)
    return initialFlightRecord.landings != null && initialFlightRecord.landings > 0
      ? [{ id: ++rowIdCounter, airportId: initialAirportId, landingCount: String(initialFlightRecord.landings) }]
      : [{ id: ++rowIdCounter, airportId: '', landingCount: '1' }]
  })

  function run(fn: () => Promise<void>) {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
        if (redirectAfterSuccess) {
          router.push(redirectAfterSuccess)
        }
        router.refresh()
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : 'Action failed. Please try again.'
        setError(message.replace(/^VALIDATION: /, ''))
      }
    })
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

  const normalisedReadings = {
    vdo_start: getNum(readings.vdo_start),
    vdo_stop: getNum(readings.vdo_stop),
    tacho_start: getNum(readings.tacho_start),
    tacho_stop: getNum(readings.tacho_stop),
    air_switch_start: getNum(readings.air_switch_start),
    air_switch_stop: getNum(readings.air_switch_stop),
    mr_start: getNum(readings.mr_start),
    mr_stop: getNum(readings.mr_stop),
    oil_added: getNum(readings.oil_added),
    oil_total: getNum(readings.oil_total),
    fuel_added: getNum(readings.fuel_added),
    fuel_returned: getNum(readings.fuel_returned),
    landings: landingsNum,
    notes: adminNotes.trim() || null,
  }

  let readingsError: string | null = null
  try {
    validateAircraftReadings(normalisedReadings)
  } catch (validationError) {
    readingsError = validationError instanceof Error ? validationError.message.replace(/^VALIDATION: /, '') : 'Invalid readings.'
  }

  const totals = readingsError ? null : calculateAircraftReadingsTotals(normalisedReadings)
  const vdoReading = totals?.vdo_total ?? null
  const landingRowErrors = landingRows.map((row) => {
    const count = Number(row.landingCount)
    const hasAirport = !!row.airportId
    const hasCount = Number.isInteger(count) && count > 0
    if (!hasAirport && !row.landingCount.trim()) return null
    if (!hasAirport) return 'Airport is required.'
    if (!hasCount) return 'Landing count must be at least 1.'
    return null
  })
  const hasIncompleteLandingRows = landingRowErrors.some(Boolean)
  const validLandingCharges = landingRows
    .filter((row) => row.airportId && Number.isInteger(Number(row.landingCount)) && Number(row.landingCount) > 0)
    .map((row) => ({ airportId: row.airportId, landingCount: Number(row.landingCount) }))
  const landingSubtotalCents = validLandingCharges.reduce((sum, row) => sum + LANDING_FEE_CENTS * row.landingCount, 0)
  const vdoBaseCents = validHourlyRate && vdoReading != null ? Math.round(vdoReading * Math.round(hourlyRateNum * 100)) : 0
  const subtotalCents = vdoBaseCents + landingSubtotalCents
  const creditApplicable = Math.min(customerCreditCents, subtotalCents)
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

    run(() => finaliseStandardBookingInvoice({
      bookingId,
      ratePerHour: hourlyRateNum,
      landingCharges: validLandingCharges.length > 0 ? validLandingCharges : undefined,
      adminNotes: adminNotes.trim() || undefined,
      readings: normalisedReadings,
    }))
  }

  return (
    <div className="bg-white/5 border border-white/5 rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">
          Flight Billing
        </h2>
        <p className="text-[10px] text-slate-600 leading-relaxed">
          Review and finalise the customer-submitted aircraft readings. The calculated VDO total becomes the billing source of truth.
        </p>
      </div>

      <section>
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#a7c8ff]/70 mb-3">
          Aircraft Readings
        </p>
        <AircraftReadingsForm
          values={readings}
          onChange={(field, value) => setReadings((current) => ({ ...current, [field]: value }))}
          notes={adminNotes}
          onNotesChange={setAdminNotes}
          landings={landings}
          onLandingsChange={setLandings}
          startBaseline={startSuggestions}
          showContinuityWarnings
          compact
        />
        {readingsError && <p className="mt-2 text-xs text-rose-400">{readingsError}</p>}
      </section>

      <div>
        <label className="block text-[10px] font-medium text-slate-400 mb-1">
          Hourly rate
        </label>
        <div className="relative max-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">$</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={hourlyRate}
            onChange={(event) => setHourlyRate(event.target.value)}
            className="w-full bg-[#0a0b0d] border border-white/10 rounded-lg pl-6 pr-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-500/50"
            disabled={isPending}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Airport landings
            </p>
            <p className="text-[9px] text-slate-600 mt-0.5">Optional — add landing fees for each airport visited.</p>
          </div>
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

        <div className="space-y-2">
          {landingRows.map((row, index) => {
            const rowError = landingRowErrors[index]
            const count = Number(row.landingCount)
            const rowTotal = row.airportId && Number.isInteger(count) && count > 0 ? LANDING_FEE_CENTS * count : 0

            return (
              <div key={row.id} className="space-y-0.5">
                <div className="flex gap-2 items-start">
                  <select
                    value={row.airportId}
                    onChange={(event) => handleLandingChange(row.id, 'airportId', event.target.value)}
                    disabled={isPending}
                    className="flex-1 bg-[#0a0b0d] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-500/50 min-w-0"
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
                    onChange={(event) => handleLandingChange(row.id, 'landingCount', event.target.value)}
                    disabled={isPending}
                    className="w-14 bg-[#0a0b0d] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 text-center focus:outline-none focus:border-slate-500/50"
                  />
                  <div className="w-16 text-right flex-shrink-0 py-1.5">
                    <span className="text-[10px] font-mono text-slate-400">
                      {rowTotal > 0 ? `$${(rowTotal / 100).toFixed(2)}` : '—'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLandingRow(row.id)}
                    disabled={isPending || landingRows.length <= 1}
                    className="flex-shrink-0 p-1.5 text-slate-600 hover:text-rose-400 transition-colors disabled:opacity-30"
                  >
                    <span className="material-symbols-outlined text-[14px]">remove_circle</span>
                  </button>
                </div>
                {rowError && <p className="text-[9px] text-rose-400/80 pl-1">{rowError}</p>}
              </div>
            )
          })}
        </div>
      </div>

      {totals && validHourlyRate && (
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500">Calculated VDO total</span>
            <span className="text-[10px] font-mono text-slate-300">{vdoReading?.toFixed(1) ?? '—'} h</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500">Aircraft hire</span>
            <span className="text-[10px] font-mono text-slate-300">${(vdoBaseCents / 100).toFixed(2)}</span>
          </div>
          {landingSubtotalCents > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500">Landing charges</span>
              <span className="text-[10px] font-mono text-slate-300">${(landingSubtotalCents / 100).toFixed(2)}</span>
            </div>
          )}
          <div className="border-t border-white/[0.06] pt-1.5 flex items-center justify-between">
            <span className="text-[10px] font-medium text-slate-300">Invoice total</span>
            <span className="text-[11px] font-bold font-mono text-white">${(subtotalCents / 100).toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500">Credit applied</span>
            <span className={`text-[10px] font-mono ${creditApplicable > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
              ${((creditApplicable ?? 0) / 100).toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-slate-300">Estimated amount due</span>
            <span className="text-[11px] font-bold font-mono text-white">${(estimatedAmountDue / 100).toFixed(2)}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 text-sm font-medium transition-colors disabled:opacity-50"
      >
        {isPending ? 'Finalising…' : 'Finalise Flight Billing'}
      </button>
    </div>
  )
}
