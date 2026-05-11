'use client'

import { Tooltip, type TooltipProps } from 'recharts'
import { TIME_RANGE_OPTIONS, type TimeRangeValue } from './AdminUi'

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
            className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
              active
                ? 'bg-blue-400/15 border-blue-300/40 text-blue-200'
                : 'border-white/10 text-slate-300 hover:text-white hover:bg-white/5'
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
  return <div className="h-[240px] rounded-xl border border-dashed border-white/10 bg-white/[0.01] text-sm text-slate-400 flex items-center justify-center">{message}</div>
}

export function ReadableTooltip(props: TooltipProps<number, string>) {
  return (
    <Tooltip
      {...props}
      contentStyle={{
        backgroundColor: '#0b1220',
        border: '1px solid #334155',
        borderRadius: '10px',
        boxShadow: '0 12px 30px rgba(2,6,23,0.55)',
      }}
      labelStyle={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600 }}
      itemStyle={{ color: '#cbd5e1', fontSize: 12 }}
      cursor={{ fill: 'rgba(148,163,184,0.12)' }}
    />
  )
}
