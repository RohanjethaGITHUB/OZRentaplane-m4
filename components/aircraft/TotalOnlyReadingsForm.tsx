'use client'

import type { AircraftContinuityBaseline, TotalOnlyFormValues } from '@/lib/aircraft-readings'

type Props = {
  values: TotalOnlyFormValues
  onChange: (field: keyof TotalOnlyFormValues, value: string) => void
  notes?: string
  onNotesChange?: (value: string) => void
  continuityBaseline?: AircraftContinuityBaseline | null
  showContinuityWarnings?: boolean
  disabled?: boolean
  compact?: boolean
  submitAttempted?: boolean
  showBillingCaption?: boolean
  beforeNotesSlot?: React.ReactNode
}

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
  continuityBaseline,
  showContinuityWarnings = false,
  disabled = false,
  compact = false,
  submitAttempted = false,
  showBillingCaption = false,
  beforeNotesSlot,
}: Props) {
  const renderField = (field: 'vdo_total' | 'air_switch_total', label: string) => {
    const value = values[field] ?? ''
    const parsed = numericString(value)
    const isEmpty = value.trim() === ''
    const isInvalid = submitAttempted && (isEmpty || parsed == null || parsed < 0)

    return (
      <div key={field} className="space-y-2">
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
  }

  return (
    <div className="space-y-4">
      {continuityBaseline && (
        <div className="rounded-xl border border-[#dbe7f4] bg-[#f8fbff] px-4 py-3 text-[11px] leading-relaxed text-[#4b6390]">
          <span className="font-semibold uppercase tracking-[0.14em] text-[#4b6390]">Continuity baseline</span>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono tabular-nums text-[#152d5a]">
            <span>VDO {formatBaselineValue(continuityBaseline.vdo_start)}</span>
            <span>Airswitch {formatBaselineValue(continuityBaseline.air_switch_start)}</span>
          </div>
          {showContinuityWarnings && (
            <p className="mt-2 text-[11px] text-[#4b6390]">
              Totals are anchored to the latest finalized aircraft log behind the scenes.
            </p>
          )}
        </div>
      )}

      {/* Billing Reading */}
      <div className="space-y-2">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4b6390]">Billing Reading</h3>
          {showBillingCaption && (
            <p className="text-[11px] text-[#4b6390] mt-1">This figure is the invoice source of truth</p>
          )}
        </div>
        <div className="rounded-xl border border-[#dbe7f4] bg-[#f8fbff] p-3 space-y-2 shadow-[0_1px_0_rgba(255,255,255,0.8)]">
          {renderField('vdo_total', 'VDO total')}
        </div>
      </div>

      {/* Aircraft Log Readings */}
      <div className="space-y-2">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4b6390]">Aircraft Log Readings</h3>
          {showBillingCaption && (
            <p className="text-[11px] text-[#4b6390] mt-1">For record-keeping, does not affect the amount due</p>
          )}
        </div>
        <div className="rounded-xl border border-[#dbe7f4] bg-[#f8fbff] p-3 space-y-2 shadow-[0_1px_0_rgba(255,255,255,0.8)]">
          {renderField('air_switch_total', 'Airswitch total')}
        </div>
      </div>

      {/* Before Notes slot (e.g. Flight Evidence photos) */}
      {beforeNotesSlot}

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

function formatBaselineValue(value: number | null) {
  return value == null ? '—' : value.toFixed(1)
}
