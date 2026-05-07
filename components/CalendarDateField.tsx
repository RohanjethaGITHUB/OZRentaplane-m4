'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function toDisplayDate(isoDate: string): string {
  if (!isoDate) return ''
  const parts = isoDate.split('-')
  if (parts.length !== 3) return ''
  const [y, m, d] = parts
  if (!y || !m || !d) return ''
  return `${d}/${m}/${y}`
}

function isValidDateObject(date: Date): boolean {
  return !Number.isNaN(date.getTime())
}

function isoToDate(iso: string): Date | null {
  if (!iso) return null
  const date = new Date(`${iso}T00:00:00`)
  return isValidDateObject(date) ? date : null
}

function toIso(year: number, month: number, day: number): string {
  return `${String(year)}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export default function CalendarDateField({
  label,
  required = false,
  value,
  onChange,
  minYear,
  maxYear,
  placeholder = 'DD/MM/YYYY',
  minDate,
  maxDate,
  disabled = false,
  error,
  className,
}: {
  label?: string
  required?: boolean
  value: string
  onChange: (nextIsoDate: string) => void
  minYear: number
  maxYear: number
  placeholder?: string
  minDate?: string
  maxDate?: string
  disabled?: boolean
  error?: string
  className?: string
}) {
  const now = new Date()
  const initial = isoToDate(value) ?? now
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(initial.getFullYear())
  const [viewMonth, setViewMonth] = useState(initial.getMonth())
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const years = useMemo(() => {
    const result: number[] = []
    for (let y = minYear; y <= maxYear; y += 1) result.push(y)
    return result
  }, [minYear, maxYear])

  const minIso = minDate?.trim() || ''
  const maxIso = maxDate?.trim() || ''

  const firstOfMonth = new Date(viewYear, viewMonth, 1)
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const startOffset = (firstOfMonth.getDay() + 6) % 7
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  function isDisabled(day: number): boolean {
    const iso = toIso(viewYear, viewMonth, day)
    if (minIso && iso < minIso) return true
    if (maxIso && iso > maxIso) return true
    return false
  }

  function pickDay(day: number) {
    if (isDisabled(day)) return
    onChange(toIso(viewYear, viewMonth, day))
    setOpen(false)
  }

  return (
    <div className="relative" ref={rootRef}>
      {label && (
        <label className="block text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600 mb-2">
          {label}
          {required && <span className="text-red-400 font-normal normal-case ml-1">Required</span>}
        </label>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className={
          className ??
          `w-full bg-white/[0.03] border border-white/8 focus:border-oz-blue/40 focus:outline-none text-sm text-white/80 rounded-xl px-4 py-2.5 text-left flex items-center justify-between ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`
        }
      >
        <span>{value ? toDisplayDate(value) : placeholder}</span>
        <span className="material-symbols-outlined text-white/45 text-[18px]">calendar_month</span>
      </button>

      {open && (
        <div className="absolute z-[120] mt-1 w-[280px] max-w-[calc(100vw-3rem)] rounded-xl border border-white/12 bg-[#0b1322] shadow-[0_16px_32px_rgba(0,0,0,0.5)] p-3">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <select
              value={viewMonth}
              onChange={(e) => setViewMonth(Number(e.target.value))}
              className="bg-white/[0.04] border border-white/10 rounded-lg px-2 py-2 text-xs text-white/80 focus:outline-none focus:border-oz-blue/40"
            >
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i} className="bg-[#0b1322]">{m}</option>
              ))}
            </select>
            <select
              value={viewYear}
              onChange={(e) => setViewYear(Number(e.target.value))}
              className="bg-white/[0.04] border border-white/10 rounded-lg px-2 py-2 text-xs text-white/80 focus:outline-none focus:border-oz-blue/40"
            >
              {years.map((y) => (
                <option key={y} value={y} className="bg-[#0b1322]">{y}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {weekday.map((d) => (
              <div key={d} className="text-[10px] text-white/35 text-center py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`pad-${i}`} className="h-8" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const day = idx + 1
              const iso = toIso(viewYear, viewMonth, day)
              const selected = iso === value
              const disabled = isDisabled(day)
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => pickDay(day)}
                  disabled={disabled}
                  className={`h-8 rounded-md text-xs border transition-colors ${
                    selected
                      ? 'bg-oz-blue/25 border-oz-blue/60 text-oz-blue'
                      : disabled
                      ? 'bg-white/[0.01] border-white/6 text-white/20 cursor-not-allowed'
                      : 'bg-white/[0.02] border-white/8 text-white/75 hover:bg-white/[0.08] hover:border-white/20'
                  }`}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {error && (
        <p className="text-[11px] text-red-400 mt-1.5 flex items-center gap-1">
          <span className="material-symbols-outlined text-[13px]">error</span>
          {error}
        </p>
      )}
    </div>
  )
}
