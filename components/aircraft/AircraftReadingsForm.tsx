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
}: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {METER_GROUPS.map(({ label, prefix }) => {
          const startField = `${prefix}_start` as keyof AircraftReadingsFormValues
          const stopField = `${prefix}_stop` as keyof AircraftReadingsFormValues
          const startValue = values[startField] ?? ''
          const stopValue = values[stopField] ?? ''
          const total = calcReadingTotal(numericString(startValue), numericString(stopValue))
          const baselineValue = startBaseline?.[startField as keyof AircraftContinuityBaseline]
          const hasContinuityMismatch = showContinuityWarnings && baselineValue != null && startValue !== '' && Number(startValue) !== baselineValue

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
        <Field label="Oil added" name="oil_added" values={values} onChange={onChange} disabled={disabled} compact={compact} />
        <Field label="Oil Total" name="oil_total" values={values} onChange={onChange} disabled={disabled} compact={compact} />
        <Field label="Fuel added" name="fuel_added" values={values} onChange={onChange} disabled={disabled} compact={compact} />
        <Field label="Fuel Returned" name="fuel_returned" values={values} onChange={onChange} disabled={disabled} compact={compact} />
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
