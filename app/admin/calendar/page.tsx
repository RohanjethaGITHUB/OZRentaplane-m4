import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import type { ScheduleBlock } from '@/lib/supabase/booking-types'
import AdminCalendarClient from './AdminCalendarClient'
import { mapScheduleBlockToAdminCalendarEvent } from './calendar-event-mapper'
import { getCurrentSydneyDateKey, getRangeForView, isValidSydneyDateKey } from './calendar-range'
import type { AdminCalendarAircraftOption, AdminCalendarView } from './calendar-types'
import { CalendarRealtimeListener } from '@/components/realtime/CalendarRealtimeListener'

export const metadata = { title: 'Calendar | Admin' }
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

type SearchParams = {
  view?: string
  date?: string
  aircraft?: string
}

function isCalendarView(value: string | undefined): value is AdminCalendarView {
  return value === 'month' || value === 'week' || value === 'day'
}

function getAircraftStatusLabel(status: string | null) {
  if (!status) return null
  return status.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

export default async function AdminCalendarPage({ searchParams }: { searchParams?: SearchParams }) {
  noStore()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const view: AdminCalendarView = isCalendarView(searchParams?.view) ? searchParams.view : 'month'
  const dateKey = isValidSydneyDateKey(searchParams?.date) ? searchParams!.date : getCurrentSydneyDateKey()
  const requestedAircraftId = searchParams?.aircraft?.trim() || null
  const visibleRange = getRangeForView(view, dateKey)

  const { data: aircraftRows } = await supabase
    .from('aircraft')
    .select('id, registration, aircraft_type, status')
    .neq('status', 'inactive')
    .order('registration', { ascending: true })

  const aircraftOptions: AdminCalendarAircraftOption[] = (aircraftRows ?? []).map((aircraft) => ({
    id: aircraft.id,
    registration: aircraft.registration,
    model: aircraft.aircraft_type ?? null,
    status: aircraft.status ?? null,
    statusLabel: getAircraftStatusLabel(aircraft.status ?? null),
  }))

  if (aircraftOptions.length === 0) {
    return <div className="p-8 text-white">No aircraft found.</div>
  }

  const aircraftIds = new Set(aircraftOptions.map((aircraft) => aircraft.id))
  const selectedAircraftId = requestedAircraftId && aircraftIds.has(requestedAircraftId) ? requestedAircraftId : null
  const scopedAircraftIds = selectedAircraftId ? [selectedAircraftId] : aircraftOptions.map((aircraft) => aircraft.id)
  const aircraftMap = new Map(
    (aircraftRows ?? []).map((aircraft) => [
      aircraft.id,
      {
        id: aircraft.id,
        registration: aircraft.registration,
        aircraft_type: aircraft.aircraft_type ?? null,
      },
    ]),
  )

  const { data: blocks } = await supabase
    .from('schedule_blocks')
    .select('id, aircraft_id, related_booking_id, related_usage_record_id, block_type, start_time, end_time, public_label, internal_reason, created_by_user_id, created_by_role, is_public_visible, status, expires_at, created_at, updated_at')
    .in('aircraft_id', scopedAircraftIds)
    .eq('status', 'active')
    .lt('start_time', visibleRange.rangeEndUtc)
    .gt('end_time', visibleRange.rangeStartUtc)
    .order('start_time', { ascending: true })

  const now = new Date()
  const overlappingBlocks = ((blocks ?? []) as ScheduleBlock[]).filter((block) => {
    if (block.block_type !== 'temporary_hold' || !block.expires_at) return true
    return new Date(block.expires_at) > now
  })

  const relatedBookingIds = Array.from(
    new Set(
      overlappingBlocks
        .map((b) => b.related_booking_id)
        .filter((id): id is string => Boolean(id)),
    ),
  )

  const { data: bookings } = relatedBookingIds.length
    ? await supabase
        .from('bookings')
        .select('id, booking_reference, pic_name, status, booking_type, booking_owner_user_id, payment_status, checkout_lifecycle_status')
        .in('id', relatedBookingIds)
    : {
        data: [] as Array<{
          id: string
          booking_reference: string | null
          pic_name: string | null
          status: string
          booking_type: 'checkout' | 'standard'
          booking_owner_user_id: string
          payment_status: string | null
          checkout_lifecycle_status: string | null
        }>,
      }

  const bookingOwnerIds = Array.from(
    new Set((bookings ?? []).map((b) => b.booking_owner_user_id).filter(Boolean)),
  )

  const { data: profiles } = bookingOwnerIds.length
    ? await supabase
        .from('profiles')
        .select('id, full_name, first_name, last_name, email, phone_country_code, phone_number')
        .in('id', bookingOwnerIds)
    : {
        data: [] as Array<{
          id: string
          full_name: string | null
          first_name: string | null
          last_name: string | null
          email: string | null
          phone_country_code: string | null
          phone_number: string | null
        }>,
      }

  const bookingsById = new Map((bookings ?? []).map((b) => [b.id, b]))
  const profilesById = new Map((profiles ?? []).map((p) => [p.id, p]))

  const events = overlappingBlocks.flatMap((block) => {
    const aircraft = aircraftMap.get(block.aircraft_id)
    if (!aircraft) return []

    const booking = block.related_booking_id ? bookingsById.get(block.related_booking_id) ?? null : null
    const profile = booking ? profilesById.get(booking.booking_owner_user_id) ?? null : null

    return [
      mapScheduleBlockToAdminCalendarEvent({
        block,
        aircraft,
        booking,
        profile,
      }),
    ]
  })

  const selectedAircraftRegistration =
    selectedAircraftId ? aircraftOptions.find((aircraft) => aircraft.id === selectedAircraftId)?.registration ?? null : null

  return (
    <>
      <CalendarRealtimeListener />
      <div className="pt-[calc(4.5rem+env(safe-area-inset-top))] sm:pt-0">
        <AdminPortalHero
          eyebrow="Calendar"
          title="Operations Calendar"
          subtitle="Day, week, and month scheduling for bookings and aircraft blocks."
        />
      </div>
      <div className="admin-calendar-pilot mx-auto max-w-[1520px] px-4 py-8 pb-24 sm:px-6 md:px-8 lg:px-10">
        <AdminCalendarClient
          events={events}
          aircraftOptions={aircraftOptions}
          selectedAircraftId={selectedAircraftId}
          selectedAircraftRegistration={selectedAircraftRegistration}
          view={view}
          dateKey={dateKey}
        />
      </div>
    </>
  )
}
