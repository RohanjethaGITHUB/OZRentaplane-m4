'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { finaliseStandardBookingInvoice } from '@/app/actions/admin-booking'

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
  bookingId:              string
  airports:              Airport[]
  customerCreditCents:   number
  initialVdo?:           number
  initialLandings?:      number
  initialNotes?:         string
  redirectAfterSuccess?: string
}

const LANDING_FEE_CENTS = 2500

let rowIdCounter = 0

function parseVdoReading(s: string): number {
  const n = parseFloat(s)
  if (isNaN(n) || n <= 0) return NaN
  if (!/^\d+(\.\d)?$/.test(s.trim())) return NaN
  return n
}

export default function AdminStandardBillingPanel({ bookingId, airports, customerCreditCents, initialVdo, initialLandings, initialNotes, redirectAfterSuccess }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const initialAirportId = airports.find(a => a.icao_code === 'YSBK' || a.name.toLowerCase().includes('bankstown'))?.id ?? ''

  const [vdoReading, setVdoReading] = useState(initialVdo != null ? initialVdo.toString() : '')
  const [hourlyRate, setHourlyRate] = useState('290')
  const [adminNotes, setAdminNotes] = useState(initialNotes ?? '')
  const [landingRows, setLandingRows] = useState<LandingChargeRow[]>(
    initialLandings != null && initialLandings > 0
      ? [{ id: ++rowIdCounter, airportId: initialAirportId, landingCount: initialLandings.toString() }]
      : [{ id: ++rowIdCounter, airportId: '', landingCount: '1' }]
  )

  function run(fn: () => Promise<void>) {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
        if (redirectAfterSuccess) {
          router.push(redirectAfterSuccess)
        }
        router.refresh()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Action failed. Please try again.'
        setError(msg.replace(/^VALIDATION: /, ''))
      }
    })
  }

  // ── Parsed values ─────────────────────────────────────────────────────────
  const hourlyRateNum   = parseFloat(hourlyRate)
  const validHourlyRate = !isNaN(hourlyRateNum) && hourlyRateNum > 0
  const hourlyRateCents = validHourlyRate ? Math.round(hourlyRateNum * 100) : 0

  const vdoReadingNum   = parseVdoReading(vdoReading)
  const validVdoReading = !isNaN(vdoReadingNum)
  const vdoReadingValid = validVdoReading && vdoReadingNum >= 0.1 && vdoReadingNum <= 24.0

  const vdoBaseCents = vdoReadingValid && validHourlyRate
    ? Math.round(vdoReadingNum * hourlyRateCents)
    : 0

  const landingSubtotalCents = landingRows.reduce((sum, row) => {
    const count = parseInt(row.landingCount, 10)
    if (!row.airportId || isNaN(count) || count <= 0) return sum
    return sum + LANDING_FEE_CENTS * count
  }, 0)

  const subtotalCents      = vdoBaseCents + landingSubtotalCents
  const creditApplicable   = Math.min(customerCreditCents, subtotalCents)
  const estimatedAmountDue = Math.max(subtotalCents - creditApplicable, 0)

  const vdoErrorMsg = validVdoReading && !vdoReadingValid
    ? vdoReadingNum < 0.1
      ? `VDO reading (${vdoReadingNum}h) is below the 0.1h minimum — check the paper sheet`
      : `VDO reading (${vdoReadingNum}h) exceeds the 24.0h maximum — check the paper sheet`
    : null

  const hasIncompleteLandingRows = landingRows.some(row => {
    const count     = parseInt(row.landingCount, 10)
    const hasAirport = !!row.airportId
    const hasCount   = !isNaN(count) && count > 0
    return (hasCount && !hasAirport) || (hasAirport && !hasCount)
  })

  const hasValidLandingRow = landingRows.some(row => {
    const count = parseInt(row.landingCount, 10)
    return !!row.airportId && !isNaN(count) && count > 0
  })

  const canSubmit =
    vdoReadingValid &&
    validHourlyRate &&
    !hasIncompleteLandingRows &&
    subtotalCents > 0

  function addLandingRow() {
    setLandingRows(rows => [...rows, { id: ++rowIdCounter, airportId: '', landingCount: '1' }])
  }

  function removeLandingRow(id: number) {
    setLandingRows(rows => rows.length > 1 ? rows.filter(r => r.id !== id) : rows)
  }

  function handleLandingChange(id: number, field: 'airportId' | 'landingCount', value: string) {
    setLandingRows(rows => rows.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  function handleSubmit() {
    const validLandingCharges = landingRows
      .filter(r => r.airportId && parseInt(r.landingCount, 10) > 0)
      .map(r => ({ airportId: r.airportId, landingCount: parseInt(r.landingCount, 10) }))

    run(() => finaliseStandardBookingInvoice({
      bookingId,
      vdoReading:    vdoReadingNum,
      ratePerHour:   hourlyRateNum,
      landingCharges: validLandingCharges.length > 0 ? validLandingCharges : undefined,
      adminNotes:    adminNotes.trim() || undefined,
    }))
  }

  return (
    <div className="bg-white/5 border border-white/5 rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">
          Flight Billing
        </h2>
        <p className="text-[10px] text-slate-600 leading-relaxed">
          Enter the VDO reading from the paper sheet to generate a payment request for the customer.
        </p>
      </div>

      {/* ── Hourly rate ────────────────────────────────────────────────────── */}
      <div>
        <label className="block text-[10px] font-medium text-slate-400 mb-1">
          Hourly rate <span className="text-rose-400">*</span>
        </label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 pointer-events-none">$</span>
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={hourlyRate}
              onChange={e => setHourlyRate(e.target.value)}
              placeholder="290.00"
              className={`w-full bg-[#0a0b0d] border rounded-lg pl-6 pr-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-500/50 ${
                hourlyRate && !validHourlyRate ? 'border-rose-500/40' : 'border-white/10'
              }`}
              disabled={isPending}
            />
          </div>
          <span className="text-[10px] text-slate-500 flex-shrink-0">/hr</span>
        </div>
        {hourlyRate && !validHourlyRate && (
          <p className="text-[9px] text-rose-400/70 mt-0.5">Enter a positive dollar amount, e.g. 290</p>
        )}
      </div>

      {/* ── VDO reading ────────────────────────────────────────────────────── */}
      <div>
        <label className="block text-[10px] font-medium text-slate-400 mb-1">
          VDO reading <span className="text-rose-400">*</span>
        </label>
        <input
          type="text"
          inputMode="decimal"
          value={vdoReading}
          onChange={e => setVdoReading(e.target.value)}
          placeholder="e.g. 1.4"
          className={`w-full bg-[#0a0b0d] border rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-500/50 ${
            vdoReading && !validVdoReading ? 'border-rose-500/40' : 'border-white/10'
          }`}
          disabled={isPending}
        />
        <p className="text-[9px] text-slate-600 mt-0.5">
          Enter the total billable hours from the aircraft paper sheet (one decimal place).
        </p>
        {vdoReading && !validVdoReading && (
          <p className="text-[9px] text-rose-400/70 mt-0.5">Enter a positive value with one decimal place, e.g. 1.4</p>
        )}
        {vdoErrorMsg && <p className="text-[9px] text-rose-400/70 mt-0.5">{vdoErrorMsg}</p>}
      </div>

      {/* ── Airport landings ───────────────────────────────────────────────── */}
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
          {landingRows.map(row => {
            const landingCount = parseInt(row.landingCount, 10)
            const hasAirport   = !!row.airportId
            const hasCount     = !isNaN(landingCount) && landingCount > 0
            const rowError     = (hasCount && !hasAirport)
              ? 'Select an airport'
              : (hasAirport && !hasCount)
                ? 'Enter a landing count ≥ 1'
                : null
            const rowTotal = hasAirport && hasCount ? LANDING_FEE_CENTS * landingCount : 0

            return (
              <div key={row.id} className="space-y-0.5">
                <div className="flex gap-2 items-start">
                  <select
                    value={row.airportId}
                    onChange={e => handleLandingChange(row.id, 'airportId', e.target.value)}
                    disabled={isPending}
                    className={`flex-1 bg-[#0a0b0d] border rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-500/50 min-w-0 ${
                      hasCount && !hasAirport ? 'border-rose-500/40' : 'border-white/10'
                    }`}
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
                    className={`w-14 bg-[#0a0b0d] border rounded-lg px-2 py-1.5 text-xs text-slate-200 text-center focus:outline-none focus:border-slate-500/50 ${
                      hasAirport && !hasCount ? 'border-rose-500/40' : 'border-white/10'
                    }`}
                    title="Number of landings"
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
                    title={landingRows.length <= 1 ? 'At least one row is required' : 'Remove this row'}
                    className="flex-shrink-0 p-1.5 text-slate-600 hover:text-rose-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-[14px]">remove_circle</span>
                  </button>
                </div>
                {rowError && (
                  <p className="text-[9px] text-rose-400/80 pl-1">{rowError} — or remove this row.</p>
                )}
              </div>
            )
          })}

          {!hasValidLandingRow && !hasIncompleteLandingRows && (
            <p className="text-[9px] text-slate-600/70 px-1">
              No landing fees will be added. Add a row above if landings occurred at other airports.
            </p>
          )}
          {hasIncompleteLandingRows && (
            <p className="text-[9px] text-rose-400/80 px-1">
              Complete or remove incomplete landing rows before submitting.
            </p>
          )}
        </div>
      </div>

      {/* ── Invoice preview ────────────────────────────────────────────────── */}
      {vdoReadingValid && validHourlyRate && (
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500">VDO reading</span>
            <span className="text-[10px] font-mono text-slate-300">{vdoReadingNum.toFixed(1)} h</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500">
              Aircraft hire ({vdoReadingNum.toFixed(1)}h × ${hourlyRateNum.toFixed(2)})
            </span>
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
        </div>
      )}

      {/* ── Credit preview ─────────────────────────────────────────────────── */}
      {vdoReadingValid && validHourlyRate && (
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
              <span className="text-[10px] font-mono text-emerald-400">−${(creditApplicable / 100).toFixed(2)}</span>
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
      )}

      {/* ── Admin notes ────────────────────────────────────────────────────── */}
      <div>
        <textarea
          value={adminNotes}
          onChange={e => setAdminNotes(e.target.value)}
          rows={3}
          placeholder="Optional internal note…"
          className="w-full bg-[#0a0b0d] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none resize-none"
          disabled={isPending}
        />
      </div>

      {error && (
        <div className="rounded-lg bg-rose-500/[0.08] border border-rose-500/20 px-3 py-2">
          <p className="text-[10px] text-rose-400 leading-relaxed">{error}</p>
        </div>
      )}

      <button
        type="button"
        disabled={isPending || !canSubmit}
        onClick={handleSubmit}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-[18px]">receipt_long</span>
        {isPending ? 'Sending Payment Request…' : 'Send Payment Request'}
      </button>
      <p className="text-[9px] text-slate-600 text-center leading-relaxed">
        This will finalise the invoice and notify the customer that payment is required.
      </p>
    </div>
  )
}
