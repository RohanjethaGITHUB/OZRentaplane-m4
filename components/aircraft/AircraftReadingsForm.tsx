'use client'

import {
  calcReadingTotal,
  type AircraftContinuityBaseline,
  type AircraftReadingsFormValues,
} from '@/lib/aircraft-readings'

type Props = {
  values: AircraftReadingsFormValues
  onChange: (field: keyof AircraftReadingsFormValues, value: string) => void
  notes?: string
  onNotesChange?: (value: string) => void
  landings?: string
  onLandingsChange?: (value: string) => void
  startBaseline?: AircraftContinuityBaseline
  showContinuityWarnings?: boolean
  disabled?: boolean
  compact?: boolean
  /** Wide table layout: desktop shows a horizontal table, mobile shows stacked cards. */
  tableLayout?: boolean
}

const METER_GROUPS = [
  { label: 'VDO', prefix: 'vdo' },
  { label: 'Tacho', prefix: 'tacho' },
  { label: 'Air Switch', prefix: 'air_switch' },
  { label: 'MR', prefix: 'mr' },
] as const

function numericString(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function inputClass(compact = false) {
  return compact
    ? 'w-full bg-[#0a0b0d] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50'
    : 'w-full bg-[#0a0b0d] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50'
}

const wideInput =
  'w-full bg-[#0a0b0d] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 min-h-[40px]'

export default function AircraftReadingsForm({
  values,
  onChange,
  notes,
  onNotesChange,
  landings,
  onLandingsChange,
  startBaseline,
  showContinuityWarnings = false,
  disabled = false,
  compact = false,
  tableLayout = false,
}: Props) {

  // ── Wide table layout (used in admin billing panel) ──────────────────────────
  if (tableLayout) {
    return (
      <div className="space-y-6">

        {/* ── Meter Readings ─────────────────────────────────────────────── */}
        <div>
          {/* Desktop table */}
          <div className="hidden md:block rounded-xl border border-white/10 overflow-hidden">
            {/* Header row */}
            <div
              className="grid bg-white/[0.04] border-b border-white/10 px-4 py-3"
              style={{ gridTemplateColumns: '120px 130px 1fr 1fr 100px' }}
            >
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Reading</span>
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Prev. Stop</span>
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Start</span>
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Stop</span>
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium text-right">Total</span>
            </div>

            {METER_GROUPS.map(({ label, prefix }, idx) => {
              const startField = `${prefix}_start` as keyof AircraftReadingsFormValues
              const stopField  = `${prefix}_stop`  as keyof AircraftReadingsFormValues
              const startValue = values[startField] ?? ''
              const stopValue  = values[stopField]  ?? ''
              const total      = calcReadingTotal(numericString(startValue), numericString(stopValue))
              const baselineValue = startBaseline?.[startField as keyof AircraftContinuityBaseline]
              const hasMismatch =
                showContinuityWarnings &&
                baselineValue != null &&
                startValue !== '' &&
                Number(startValue) !== baselineValue

              return (
                <div key={prefix}>
                  <div
                    className={`grid items-center px-4 py-3 border-b border-white/[0.05] ${idx % 2 === 0 ? 'bg-white/[0.015]' : ''}`}
                    style={{ gridTemplateColumns: '120px 130px 1fr 1fr 100px' }}
                  >
                    <span className="text-sm font-medium text-slate-200">{label}</span>
                    <span className="text-sm text-slate-500 font-mono tabular-nums pr-4">
                      {baselineValue != null ? baselineValue.toFixed(1) : <span className="text-slate-700">—</span>}
                    </span>
                    <div className="pr-3">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={startValue}
                        onChange={(e) => onChange(startField, e.target.value)}
                        disabled={disabled}
                        className={wideInput}
                      />
                    </div>
                    <div className="pr-3">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={stopValue}
                        onChange={(e) => onChange(stopField, e.target.value)}
                        disabled={disabled}
                        className={wideInput}
                      />
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-mono tabular-nums ${total == null ? 'text-slate-700' : 'text-white font-semibold'}`}>
                        {total == null ? '—' : total.toFixed(1)}
                      </span>
                    </div>
                  </div>

                  {hasMismatch && (
                    <div className="flex items-start gap-2.5 px-4 py-2.5 bg-amber-500/[0.07] border-b border-amber-500/20">
                      <span
                        className="material-symbols-outlined text-amber-400 text-[16px] flex-shrink-0 mt-px"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        warning
                      </span>
                      <p className="text-xs text-amber-300 leading-relaxed">
                        {label} start reading ({Number(startValue).toFixed(1)}) does not match the previous stop reading for this aircraft ({baselineValue!.toFixed(1)}). Please confirm this is intentional.
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Mobile cards */}
          <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-3">
            {METER_GROUPS.map(({ label, prefix }) => {
              const startField = `${prefix}_start` as keyof AircraftReadingsFormValues
              const stopField  = `${prefix}_stop`  as keyof AircraftReadingsFormValues
              const startValue = values[startField] ?? ''
              const stopValue  = values[stopField]  ?? ''
              const total      = calcReadingTotal(numericString(startValue), numericString(stopValue))
              const baselineValue = startBaseline?.[startField as keyof AircraftContinuityBaseline]
              const hasMismatch =
                showContinuityWarnings &&
                baselineValue != null &&
                startValue !== '' &&
                Number(startValue) !== baselineValue

              return (
                <div key={prefix} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-200">{label}</p>
                    {baselineValue != null && (
                      <span className="text-[10px] text-slate-600 font-mono tabular-nums">
                        prev. {baselineValue.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[11px] text-slate-400 block mb-1.5">Start</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={startValue}
                        onChange={(e) => onChange(startField, e.target.value)}
                        disabled={disabled}
                        className={wideInput}
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] text-slate-400 block mb-1.5">Stop</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={stopValue}
                        onChange={(e) => onChange(stopField, e.target.value)}
                        disabled={disabled}
                        className={wideInput}
                      />
                    </label>
                  </div>
                  <div className="flex items-center justify-between pt-0.5 border-t border-white/5">
                    <span className="text-[11px] text-slate-500">Total</span>
                    <span className={`text-sm font-mono tabular-nums ${total == null ? 'text-slate-700' : 'text-white font-semibold'}`}>
                      {total == null ? '—' : total.toFixed(1)}
                    </span>
                  </div>
                  {hasMismatch && (
                    <div className="rounded-lg bg-amber-500/[0.07] border border-amber-500/20 px-3 py-2.5 flex items-start gap-2">
                      <span
                        className="material-symbols-outlined text-amber-400 text-[14px] flex-shrink-0 mt-px"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        warning
                      </span>
                      <p className="text-[11px] text-amber-300 leading-relaxed">
                        Start ({Number(startValue).toFixed(1)}) does not match previous stop ({baselineValue!.toFixed(1)}). Confirm this is intentional.
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Consumables & Landings ─────────────────────────────────────── */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
            Consumables & Landings
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="block">
              <span className="text-[11px] text-slate-400 block mb-1.5">Oil Added</span>
              <input
                type="number" step="0.1" min="0"
                value={values['oil_added'] ?? ''}
                onChange={(e) => onChange('oil_added' as keyof AircraftReadingsFormValues, e.target.value)}
                disabled={disabled}
                className={wideInput}
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-400 block mb-1.5">Oil Total</span>
              <input
                type="number" step="0.1" min="0"
                value={values['oil_total'] ?? ''}
                onChange={(e) => onChange('oil_total' as keyof AircraftReadingsFormValues, e.target.value)}
                disabled={disabled}
                className={wideInput}
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-400 block mb-1.5">Fuel Added</span>
              <input
                type="number" step="0.1" min="0"
                value={values['fuel_added'] ?? ''}
                onChange={(e) => onChange('fuel_added' as keyof AircraftReadingsFormValues, e.target.value)}
                disabled={disabled}
                className={wideInput}
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-400 block mb-1.5">Fuel Returned</span>
              <input
                type="number" step="0.1" min="0"
                value={values['fuel_returned'] ?? ''}
                onChange={(e) => onChange('fuel_returned' as keyof AircraftReadingsFormValues, e.target.value)}
                disabled={disabled}
                className={wideInput}
              />
            </label>
          </div>
          {onLandingsChange && (
            <div className="mt-3">
              <label className="block max-w-[160px]">
                <span className="text-[11px] text-slate-400 block mb-1.5">Landings</span>
                <input
                  type="number" min="0" step="1"
                  value={landings ?? ''}
                  onChange={(e) => onLandingsChange(e.target.value)}
                  disabled={disabled}
                  className={wideInput}
                />
              </label>
            </div>
          )}
        </div>

        {/* ── Admin Notes ────────────────────────────────────────────────── */}
        {onNotesChange && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
              Admin Notes
            </p>
            <textarea
              rows={3}
              value={notes ?? ''}
              onChange={(e) => onNotesChange(e.target.value)}
              disabled={disabled}
              placeholder="Optional notes for internal reference…"
              className="w-full bg-[#0a0b0d] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>
        )}

      </div>
    )
  }

  // ── Default compact / normal card layout ─────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {METER_GROUPS.map(({ label, prefix }) => {
          const startField = `${prefix}_start` as keyof AircraftReadingsFormValues
          const stopField  = `${prefix}_stop`  as keyof AircraftReadingsFormValues
          const startValue = values[startField] ?? ''
          const stopValue  = values[stopField]  ?? ''
          const total      = calcReadingTotal(numericString(startValue), numericString(stopValue))
          const baselineValue = startBaseline?.[startField as keyof AircraftContinuityBaseline]
          const hasContinuityMismatch =
            showContinuityWarnings &&
            baselineValue != null &&
            startValue !== '' &&
            Number(startValue) !== baselineValue

          return (
            <div key={prefix} className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
              <p className="text-xs uppercase tracking-widest text-slate-400">{label}</p>
              <label className="block">
                <span className="text-[11px] text-slate-400 block mb-1">Start</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={startValue}
                  onChange={(event) => onChange(startField, event.target.value)}
                  className={inputClass(compact)}
                  disabled={disabled}
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-slate-400 block mb-1">Stop</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={stopValue}
                  onChange={(event) => onChange(stopField, event.target.value)}
                  className={inputClass(compact)}
                  disabled={disabled}
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-slate-400 block mb-1">Total</span>
                <input
                  value={total == null ? '' : total.toFixed(1)}
                  readOnly
                  className="w-full bg-slate-800/30 border border-white/5 rounded-lg px-3 py-2.5 text-sm text-slate-400"
                />
              </label>
              {hasContinuityMismatch && (
                <p className="text-[11px] text-amber-300">
                  This start reading does not match the previous stop reading for this aircraft. Please confirm this is intentional.
                </p>
              )}
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        <Field label="Oil added"      name="oil_added"      values={values} onChange={onChange} disabled={disabled} compact={compact} />
        <Field label="Oil Total"      name="oil_total"      values={values} onChange={onChange} disabled={disabled} compact={compact} />
        <Field label="Fuel added"     name="fuel_added"     values={values} onChange={onChange} disabled={disabled} compact={compact} />
        <Field label="Fuel Returned"  name="fuel_returned"  values={values} onChange={onChange} disabled={disabled} compact={compact} />
        {onLandingsChange ? (
          <label className="block">
            <span className="text-[11px] text-slate-400 block mb-1">Landings</span>
            <input
              type="number"
              min="0"
              step="1"
              value={landings ?? ''}
              onChange={(event) => onLandingsChange(event.target.value)}
              className={inputClass(compact)}
              disabled={disabled}
            />
          </label>
        ) : null}
      </div>

      {onNotesChange ? (
        <label className="block">
          <span className="text-[11px] text-slate-400 block mb-1">Notes</span>
          <textarea
            rows={3}
            value={notes ?? ''}
            onChange={(event) => onNotesChange(event.target.value)}
            className="w-full bg-[#0a0b0d] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"
            disabled={disabled}
          />
        </label>
      ) : null}
    </div>
  )
}

function Field({
  label,
  name,
  values,
  onChange,
  disabled,
  compact,
}: {
  label: string
  name: keyof AircraftReadingsFormValues
  values: AircraftReadingsFormValues
  onChange: (field: keyof AircraftReadingsFormValues, value: string) => void
  disabled: boolean
  compact: boolean
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-slate-400 block mb-1">{label}</span>
      <input
        type="number"
        step="0.1"
        min="0"
        value={values[name] ?? ''}
        onChange={(event) => onChange(name, event.target.value)}
        className={inputClass(compact)}
        disabled={disabled}
      />
    </label>
  )
}
