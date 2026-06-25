'use client'

import type { TotalOnlyFormValues } from '@/lib/aircraft-readings'

type Props = {
  values: TotalOnlyFormValues
  onChange: (field: keyof TotalOnlyFormValues, value: string) => void
  notes?: string
  onNotesChange?: (value: string) => void
  disabled?: boolean
  compact?: boolean
  submitAttempted?: boolean
}

const METER_LABELS: { field: keyof TotalOnlyFormValues; label: string }[] = [
  { field: 'vdo_total',        label: 'VDO total'      },
  { field: 'tacho_total',      label: 'Tacho total'    },
  { field: 'air_switch_total', label: 'Airswitch total' },
  { field: 'mr_total',         label: 'MR total'       },
]

function numericString(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function inputClass(compact = false, hasError = false) {
  const base = compact
    ? 'w-full border rounded-lg px-3 py-2 text-sm text-[#152d5a] placeholder:text-[#94a3b8] focus:outline-none focus:ring-1 transition-colors bg-white'
    : 'w-full border rounded-lg px-3 py-2.5 text-sm text-[#152d5a] placeholder:text-[#94a3b8] focus:outline-none focus:ring-1 transition-colors bg-white'
  return hasError
    ? `${base} border-red-300 bg-red-50/70 focus:border-red-400 focus:ring-red-200`
    : `${base} border-[#cbdcf0] focus:border-[#93c5fd] focus:ring-blue-200`
}

export default function TotalOnlyReadingsForm({
  values,
  onChange,
  notes,
  onNotesChange,
  disabled = false,
  compact = false,
  submitAttempted = false,
}: Props) {
  return (
    <div className="space-y-4">
      {/* Meter totals grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {METER_LABELS.map(({ field, label }) => {
          const value = values[field] ?? ''
          const parsed = numericString(value)
          const isEmpty = value.trim() === ''
          const isInvalid = submitAttempted && (isEmpty || parsed == null || parsed < 0)

          return (
            <div key={field} className="rounded-xl border border-[#dbe7f4] bg-[#f8fbff] p-3 space-y-2 shadow-[0_1px_0_rgba(255,255,255,0.8)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4b6390]">{label}</p>
              <label className="block">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={value}
                  onChange={(e) => onChange(field, e.target.value)}
                  placeholder="0.0"
                  className={inputClass(compact, isInvalid)}
                  disabled={disabled}
                />
              </label>
              {isInvalid && (
                <p className="text-[11px] text-red-400">
                  {isEmpty ? `${label} is required.` : 'Must be a valid number ≥ 0.'}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Oil and fuel fields */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SimpleField label="Oil added"   field="oil_added"   values={values} onChange={onChange} disabled={disabled} compact={compact} />
        <SimpleField label="Oil total"   field="oil_total"   values={values} onChange={onChange} disabled={disabled} compact={compact} />
        <SimpleField label="Fuel added"  field="fuel_added"  values={values} onChange={onChange} disabled={disabled} compact={compact} />
        <SimpleField label="Fuel returned"  field="fuel_returned"  values={values} onChange={onChange} disabled={disabled} compact={compact} />
      </div>

      {/* Notes */}
      {onNotesChange ? (
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4b6390] block mb-1">Notes</span>
          <textarea
            rows={3}
            value={notes ?? ''}
            onChange={(e) => onNotesChange(e.target.value)}
            className="w-full bg-white border border-[#cbdcf0] rounded-lg px-3 py-2.5 text-sm text-[#152d5a] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#93c5fd] focus:ring-1 focus:ring-blue-200"
            disabled={disabled}
          />
        </label>
      ) : null}
    </div>
  )
}

function SimpleField({
  label,
  field,
  values,
  onChange,
  disabled,
  compact,
}: {
  label: string
  field: keyof TotalOnlyFormValues
  values: TotalOnlyFormValues
  onChange: (field: keyof TotalOnlyFormValues, value: string) => void
  disabled: boolean
  compact: boolean
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4b6390] block mb-1">{label}</span>
      <input
        type="number"
        step="0.1"
        min="0"
        value={values[field] ?? ''}
        onChange={(e) => onChange(field, e.target.value)}
        className={inputClass(compact)}
        disabled={disabled}
      />
    </label>
  )
}
