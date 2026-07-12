'use client'

import Link from 'next/link'
import {
  formatLongDateFromDateKey,
  formatMonthLabelFromDateKey,
  formatWeekRangeLabel,
  getMonthOptions,
  getMonthPickerValue,
} from './calendar-range'
import type { AdminCalendarAircraftOption, AdminCalendarView } from './calendar-types'

export default function CalendarToolbar({
  view,
  dateKey,
  selectedAircraftId,
  aircraftOptions,
  onViewChange,
  onShiftRange,
  onToday,
  onAircraftChange,
  onMonthChange,
}: {
  view: AdminCalendarView
  dateKey: string
  selectedAircraftId: string | null
  aircraftOptions: AdminCalendarAircraftOption[]
  onViewChange: (view: AdminCalendarView) => void
  onShiftRange: (delta: number) => void
  onToday: () => void
  onAircraftChange: (aircraftId: string | null) => void
  onMonthChange: (value: string) => void
}) {
  const monthValue = getMonthPickerValue(dateKey)
  const monthOptions = getMonthOptions(dateKey)
  const monthLabel =
    view === 'month'
      ? formatMonthLabelFromDateKey(dateKey)
      : view === 'week'
      ? formatWeekRangeLabel(dateKey)
      : formatLongDateFromDateKey(dateKey)

  return (
    <div className="rounded-[14px] border border-[rgba(12,35,64,0.10)] bg-[rgba(247,251,255,0.92)] p-3 shadow-[0_6px_18px_rgba(15,30,52,0.05)]">
      <div className="space-y-2.5 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1 rounded-[10px] border border-[rgba(12,35,64,0.10)] bg-white p-1">
            {(['day', 'week', 'month'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onViewChange(option)}
                aria-pressed={view === option}
                className={`min-h-10 flex-1 rounded-[8px] px-2.5 text-[12px] font-semibold transition-colors ${
                  view === option ? 'bg-[#1a4fd6] text-white shadow-sm' : 'text-[#4b6390] hover:bg-[#f2f6fb] hover:text-[#152d5a]'
                }`}
              >
                {option[0].toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>

          <Link
            href="/admin/bookings/blocks/new"
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-[10px] border border-[#1a4fd6]/18 bg-[#1a4fd6] px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1949c3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30"
          >
            Block Time
          </Link>
        </div>

        <div className="grid grid-cols-[40px_minmax(0,1fr)_40px_auto] items-center gap-2">
          <button
            type="button"
            onClick={() => onShiftRange(-1)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[rgba(12,35,64,0.10)] bg-white text-[#152d5a] transition-colors hover:bg-[#f2f6fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30"
            aria-label="Previous range"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>

          <div className="min-w-0 rounded-[10px] border border-[rgba(12,35,64,0.10)] bg-white px-3 py-2">
            <p className="truncate text-[14px] font-semibold leading-tight text-[#152d5a]">{monthLabel}</p>
          </div>

          <button
            type="button"
            onClick={() => onShiftRange(1)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[rgba(12,35,64,0.10)] bg-white text-[#152d5a] transition-colors hover:bg-[#f2f6fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30"
            aria-label="Next range"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>

          <button
            type="button"
            onClick={onToday}
            className="inline-flex min-h-10 items-center justify-center rounded-[10px] border border-[rgba(12,35,64,0.10)] bg-white px-3 text-[12.5px] font-semibold text-[#152d5a] transition-colors hover:bg-[#f2f6fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30"
          >
            Today
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <select
            value={monthValue}
            onChange={(event) => onMonthChange(event.target.value)}
            className="min-h-10 rounded-[10px] border border-[rgba(12,35,64,0.10)] bg-white px-3 text-[13px] font-medium text-[#152d5a]"
            aria-label="Choose month"
          >
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={selectedAircraftId ?? ''}
            onChange={(event) => onAircraftChange(event.target.value || null)}
            className="min-h-10 rounded-[10px] border border-[rgba(12,35,64,0.10)] bg-white px-3 text-[13px] font-medium text-[#152d5a]"
            aria-label="Filter by aircraft"
          >
            <option value="">All aircraft</option>
            {aircraftOptions.map((aircraft) => (
              <option key={aircraft.id} value={aircraft.id}>
                {aircraft.registration}
                {aircraft.model ? ` · ${aircraft.model}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="hidden flex-wrap items-center gap-2.5 lg:flex">
        <div className="flex items-center gap-2 rounded-[10px] border border-[rgba(12,35,64,0.10)] bg-white p-1">
          {(['day', 'week', 'month'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onViewChange(option)}
              aria-pressed={view === option}
              className={`min-h-10 rounded-[8px] px-3.5 text-[13px] font-semibold transition-colors ${view === option ? 'bg-[#1a4fd6] text-white shadow-sm' : 'text-[#4b6390] hover:bg-[#f2f6fb] hover:text-[#152d5a]'}`}
            >
              {option[0].toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-[10px] border border-[rgba(12,35,64,0.10)] bg-white px-2 py-1">
            <button
              type="button"
              onClick={() => onShiftRange(-1)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[rgba(12,35,64,0.08)] text-[#152d5a] transition-colors hover:bg-[#f2f6fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30"
              aria-label="Previous range"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            <div className="min-w-[180px] px-2">
              <p className="truncate text-[18px] font-[650] leading-tight text-[#152d5a]">{monthLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => onShiftRange(1)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[rgba(12,35,64,0.08)] text-[#152d5a] transition-colors hover:bg-[#f2f6fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30"
              aria-label="Next range"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>

          <select
            value={monthValue}
            onChange={(event) => onMonthChange(event.target.value)}
            className="min-h-10 rounded-[10px] border border-[rgba(12,35,64,0.10)] bg-white px-3 text-[13px] font-medium text-[#152d5a]"
            aria-label="Choose month"
          >
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onToday}
            className="min-h-10 rounded-[10px] border border-[rgba(12,35,64,0.10)] bg-white px-3.5 text-[13px] font-semibold text-[#152d5a] transition-colors hover:bg-[#f2f6fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30"
          >
            Today
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedAircraftId ?? ''}
            onChange={(event) => onAircraftChange(event.target.value || null)}
            className="min-h-10 rounded-[10px] border border-[rgba(12,35,64,0.10)] bg-white px-3 text-[13px] font-medium text-[#152d5a]"
            aria-label="Filter by aircraft"
          >
            <option value="">All aircraft</option>
            {aircraftOptions.map((aircraft) => (
              <option key={aircraft.id} value={aircraft.id}>
                {aircraft.registration}{aircraft.model ? ` · ${aircraft.model}` : ''}
              </option>
            ))}
          </select>

          <Link
            href="/admin/bookings/blocks/new"
            className="inline-flex min-h-10 items-center justify-center rounded-[10px] border border-[#1a4fd6]/18 bg-[#1a4fd6] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#1949c3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30"
          >
            Block Time
          </Link>
        </div>
      </div>
    </div>
  )
}
