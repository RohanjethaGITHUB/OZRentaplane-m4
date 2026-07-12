'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { StatusPill } from '@/app/admin/components/AdminUi'
import {
  formatWeekdayDayFromDateKey,
  getCurrentSydneyDateKey,
  getOrderedEventsForSydneyDate,
  getWeekDateKeys,
  shiftDateKeyForView,
} from './calendar-range'
import type { AdminCalendarAircraftOption, AdminCalendarEvent, AdminCalendarView } from './calendar-types'
import CalendarToolbar from './CalendarToolbar'
import CalendarMonthView from './CalendarMonthView'
import CalendarEventDrawer from './CalendarEventDrawer'
import CalendarMobileMonth from './CalendarMobileMonth'
import CalendarDayAgenda from './CalendarDayAgenda'
import CalendarDesktopDayView from './CalendarDesktopDayView'
import CalendarDesktopWeekView from './CalendarDesktopWeekView'

type DrawerState =
  | { mode: 'event'; event: AdminCalendarEvent }
  | { mode: 'day'; dateKey: string; events: AdminCalendarEvent[]; scopeLabel?: string | null }

export default function AdminCalendarClient({
  events,
  aircraftOptions,
  selectedAircraftId,
  selectedAircraftRegistration,
  view,
  dateKey,
}: {
  events: AdminCalendarEvent[]
  aircraftOptions: AdminCalendarAircraftOption[]
  selectedAircraftId: string | null
  selectedAircraftRegistration: string | null
  view: AdminCalendarView
  dateKey: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const safePathname = pathname ?? '/admin/calendar'
  const [drawerState, setDrawerState] = useState<DrawerState | null>(null)
  const [lastTrigger, setLastTrigger] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (drawerState?.mode === 'event' && !events.some((event) => event.eventId === drawerState.event.eventId)) {
      setDrawerState(null)
    }
  }, [events, drawerState])

  useEffect(() => {
    if (!drawerState && lastTrigger) {
      lastTrigger.focus()
    }
  }, [drawerState, lastTrigger])

  function replaceCalendarState(next: {
    view?: AdminCalendarView
    dateKey?: string
    aircraftId?: string | null
  }) {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('view', next.view ?? view)
    params.set('date', next.dateKey ?? dateKey)

    const nextAircraftId = next.aircraftId === undefined ? selectedAircraftId : next.aircraftId
    if (nextAircraftId) params.set('aircraft', nextAircraftId)
    else params.delete('aircraft')

    const query = params.toString()
    router.replace(query ? `${safePathname}?${query}` : safePathname, { scroll: false })
  }

  const weekDays = useMemo(() => getWeekDateKeys(dateKey), [dateKey])
  const selectedDayEvents = useMemo(() => getOrderedEventsForSydneyDate(events, dateKey), [events, dateKey])

  const shiftRange = (delta: number) => {
    replaceCalendarState({
      dateKey: shiftDateKeyForView(view, dateKey, delta),
    })
  }

  function openEvent(event: AdminCalendarEvent, trigger: HTMLButtonElement | null) {
    setLastTrigger(trigger)
    setDrawerState({ mode: 'event', event })
  }

  function openDayList(
    nextDateKey: string,
    trigger: HTMLButtonElement | null,
    scopedEvents?: AdminCalendarEvent[],
    scopeLabel?: string | null,
  ) {
    const dayEvents = scopedEvents ?? getOrderedEventsForSydneyDate(events, nextDateKey)
    setLastTrigger(trigger)
    setDrawerState({ mode: 'day', dateKey: nextDateKey, events: dayEvents, scopeLabel })
  }

  function clearAircraftFilter() {
    replaceCalendarState({ aircraftId: null })
  }

  return (
    <div className="space-y-5">
      <CalendarToolbar
        view={view}
        dateKey={dateKey}
        selectedAircraftId={selectedAircraftId}
        aircraftOptions={aircraftOptions}
        onViewChange={(nextView) => replaceCalendarState({ view: nextView })}
        onShiftRange={shiftRange}
        onToday={() => replaceCalendarState({ dateKey: getCurrentSydneyDateKey() })}
        onAircraftChange={(aircraftId) => replaceCalendarState({ aircraftId })}
        onMonthChange={(value) => {
          const nextDateKey = `${value}-01`
          replaceCalendarState({ dateKey: nextDateKey })
        }}
      />

      <div className="rounded-[16px] border border-[rgba(12,35,64,0.10)] bg-white p-4 shadow-[0_12px_28px_rgba(15,30,52,0.08)]">
        <div className="mb-4 hidden flex-wrap gap-2 lg:flex">
          <StatusPill tone="blue" label="Checkout Flight" />
          <StatusPill tone="green" label="Customer Booking" />
          <StatusPill tone="slate" label="Buffer" />
          <StatusPill tone="rose" label="Blocked Time" />
          <StatusPill tone="amber" label="Maintenance" />
        </div>

        {view === 'month' ? (
          <>
            <div className="lg:hidden">
              <CalendarMobileMonth
                visibleMonthDateKey={dateKey}
                selectedDateKey={dateKey}
                events={events}
                onSelectDate={(nextDateKey) => replaceCalendarState({ dateKey: nextDateKey })}
              />
              <div className="mt-4">
                <CalendarDayAgenda
                  dateKey={dateKey}
                  events={selectedDayEvents}
                  selectedAircraftRegistration={selectedAircraftRegistration}
                  onOpenEvent={openEvent}
                  onClearAircraft={selectedAircraftId ? clearAircraftFilter : undefined}
                />
              </div>
            </div>

            <div className="hidden lg:block">
              <CalendarMonthView
                visibleMonthDateKey={dateKey}
                selectedDateKey={dateKey}
                events={events}
                selectedAircraftRegistration={selectedAircraftRegistration}
                onSelectDate={(nextDateKey) => replaceCalendarState({ dateKey: nextDateKey })}
                onOpenEvent={openEvent}
                onOpenDayList={(nextDateKey, trigger) => {
                  replaceCalendarState({ dateKey: nextDateKey })
                  openDayList(nextDateKey, trigger)
                }}
                onShowAllAircraft={selectedAircraftId ? clearAircraftFilter : undefined}
              />
            </div>
          </>
        ) : null}

        {view === 'day' && (
          <>
            <div className="lg:hidden">
              <CalendarDayAgenda
                dateKey={dateKey}
                events={selectedDayEvents}
                selectedAircraftRegistration={selectedAircraftRegistration}
                onOpenEvent={openEvent}
                onClearAircraft={selectedAircraftId ? clearAircraftFilter : undefined}
              />
            </div>

            <div className="hidden space-y-2 lg:block">
              <CalendarDesktopDayView
                dateKey={dateKey}
                events={events}
                aircraftOptions={aircraftOptions}
                selectedAircraftId={selectedAircraftId}
                selectedAircraftRegistration={selectedAircraftRegistration}
                onOpenEvent={openEvent}
              />
            </div>
          </>
        )}

        {view === 'week' && (
          <>
            <div className="space-y-4 lg:hidden">
              <div className="grid grid-cols-7 gap-1 rounded-[16px] border border-[rgba(12,35,64,0.10)] bg-[rgba(247,251,255,0.9)] p-2">
                {weekDays.map((dayKey) => {
                  const isSelected = dayKey === dateKey
                  return (
                    <button
                      key={dayKey}
                      type="button"
                      onClick={() => replaceCalendarState({ dateKey: dayKey })}
                      aria-pressed={isSelected}
                      className={`rounded-[12px] px-1 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30 ${
                        isSelected ? 'bg-[#1a4fd6] text-white' : 'bg-white text-[#152d5a] hover:bg-[#f6faff]'
                      }`}
                    >
                      <span className="block text-[10px] font-bold uppercase tracking-[0.06em]">
                        {formatWeekdayDayFromDateKey(dayKey).split(' ')[0]}
                      </span>
                      <span className="mt-1 block text-[13px] font-semibold">
                        {dayKey.slice(-2).replace(/^0/, '')}
                      </span>
                    </button>
                  )
                })}
              </div>

              <CalendarDayAgenda
                dateKey={dateKey}
                events={selectedDayEvents}
                selectedAircraftRegistration={selectedAircraftRegistration}
                onOpenEvent={openEvent}
                onClearAircraft={selectedAircraftId ? clearAircraftFilter : undefined}
              />
            </div>

            <div className="hidden lg:block">
              <CalendarDesktopWeekView
                dateKey={dateKey}
                events={events}
                aircraftOptions={aircraftOptions}
                selectedAircraftId={selectedAircraftId}
                onSelectDate={(nextDateKey) => replaceCalendarState({ dateKey: nextDateKey })}
                onOpenEvent={openEvent}
                onOpenDayList={openDayList}
              />
            </div>
          </>
        )}

      </div>

      <CalendarEventDrawer
        state={drawerState}
        onClose={() => setDrawerState(null)}
        onOpenEvent={openEvent}
      />
    </div>
  )
}
