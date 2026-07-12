'use client'

import { Tooltip, type TooltipProps } from 'recharts'
import { TIME_RANGE_OPTIONS, type TimeRangeValue } from './time-range'

export function getRangeStart(value: TimeRangeValue): Date | null {
  const now = new Date()
  if (value === 'max') return null
  if (value === 'today') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    return start
  }
  const d = new Date(now)
  if (value === '7d') d.setDate(d.getDate() - 7)
  if (value === '30d') d.setDate(d.getDate() - 30)
  if (value === '6m') d.setMonth(d.getMonth() - 6)
  return d
}

export function isInRange(dateValue: string | null | undefined, range: TimeRangeValue): boolean {
  if (!dateValue) return false
  const start = getRangeStart(range)
  if (!start) return true
  const d = new Date(dateValue)
  return Number.isFinite(d.getTime()) && d >= start
}

export function ChartRangeControl({ value, onChange }: { value: TimeRangeValue; onChange: (v: TimeRangeValue) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TIME_RANGE_OPTIONS.map((opt) => {
        const active = value === opt.value
        return (
        <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`inline-flex min-h-11 items-center justify-center px-3 py-1.5 rounded-md text-[12.5px] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(96,165,250,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${
              active
                ? 'bg-[rgba(26,79,214,0.10)] border-[rgba(26,79,214,0.24)] text-[var(--admin-accent-blue)]'
                : 'border-[var(--admin-card-border)] text-[var(--admin-text-muted)] hover:text-[var(--admin-text)] hover:bg-[var(--admin-muted-surface)]'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export function EmptyChartState({ message = 'No data available' }: { message?: string }) {
  return <div className="h-[240px] rounded-xl border border-dashed border-[var(--admin-card-border)] bg-[var(--admin-muted-surface)] text-[var(--admin-text-sm)] text-[var(--admin-text-muted)] flex items-center justify-center">{message}</div>
}

export function ReadableTooltip(props: TooltipProps<number, string>) {
  return (
    <Tooltip
      {...props}
      contentStyle={{
        backgroundColor: '#ffffff',
        border: '1px solid rgba(12,35,64,0.12)',
        borderRadius: '10px',
        boxShadow: '0 14px 36px rgba(2,7,18,0.08)',
      }}
      labelStyle={{ color: 'var(--admin-text)', fontSize: 13, fontWeight: 600 }}
      itemStyle={{ color: 'var(--admin-text-muted)', fontSize: 13 }}
      cursor={{ fill: 'rgba(148,163,184,0.10)' }}
    />
  )
}
