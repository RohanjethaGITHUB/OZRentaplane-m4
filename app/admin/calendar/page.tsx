import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import AdminCalendarClient, { type CalEvent } from './AdminCalendarClient'

export const metadata = { title: 'Calendar | Admin' }
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function AdminCalendarPage() {
  noStore()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: aircraft } = await supabase.from('aircraft').select('id, registration').eq('registration', 'VH-KZG').single()
  if (!aircraft) return <div className="p-8 text-white">No aircraft found.</div>

  const start = new Date()
  start.setDate(start.getDate() - 7)
  const end = new Date()
  end.setDate(end.getDate() + 45)

  const { data: blocks } = await supabase
    .from('schedule_blocks')
    .select('id, block_type, start_time, end_time, status, related_booking_id')
    .eq('aircraft_id', aircraft.id)
    .eq('status', 'active')
    .gte('start_time', start.toISOString())
    .lte('start_time', end.toISOString())
    .order('start_time', { ascending: true })

  const relatedBookingIds = Array.from(
    new Set(
      (blocks ?? [])
        .map((b) => b.related_booking_id)
        .filter((id): id is string => Boolean(id)),
    ),
  )

  const { data: bookings } = relatedBookingIds.length
    ? await supabase
        .from('bookings')
        .select('id, pic_name, status, booking_type, booking_owner_user_id')
        .in('id', relatedBookingIds)
    : { data: [] as Array<{ id: string; pic_name: string | null; status: string; booking_type: string; booking_owner_user_id: string }> }

  const bookingOwnerIds = Array.from(
    new Set((bookings ?? []).map((b) => b.booking_owner_user_id).filter(Boolean)),
  )

  const { data: profiles } = bookingOwnerIds.length
    ? await supabase
        .from('profiles')
        .select('id, full_name, first_name, last_name')
        .in('id', bookingOwnerIds)
    : { data: [] as Array<{ id: string; full_name: string | null; first_name: string | null; last_name: string | null }> }

  const bookingsById = new Map((bookings ?? []).map((b) => [b.id, b]))
  const profilesById = new Map((profiles ?? []).map((p) => [p.id, p]))

  const events: CalEvent[] = (blocks ?? []).map((b) => {
    const booking = b.related_booking_id ? bookingsById.get(b.related_booking_id) : null
    const profile = booking ? profilesById.get(booking.booking_owner_user_id) : null
    const profileName = profile?.full_name?.trim() || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || null
    const isOrphanCustomerBlock = b.block_type === 'customer_booking' && !booking

    const type = isOrphanCustomerBlock
      ? 'blocked'
      : b.block_type === 'customer_booking'
      ? booking?.booking_type === 'checkout' ? 'checkout' : 'booking'
      : b.block_type === 'buffer'
      ? 'buffer'
      : b.block_type === 'maintenance' || b.block_type === 'inspection'
      ? 'maintenance'
      : 'blocked'

    const title = isOrphanCustomerBlock ? 'Orphan schedule block' : b.block_type.replace(/_/g, ' ')

    return {
      id: b.id,
      type,
      title,
      customer: profileName || booking?.pic_name || null,
      aircraft: aircraft.registration,
      start: b.start_time,
      end: b.end_time,
      status: b.status,
      paymentStatus: booking?.status === 'checkout_payment_required' ? 'Payment Required' : null,
    }
  })

  return (
    <>
      <AdminPortalHero
        eyebrow="Calendar"
        title="Operations Calendar"
        subtitle="Day, week, and month scheduling for bookings and aircraft blocks."
      />
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24">
        <AdminCalendarClient events={events} />
      </div>
    </>
  )
}
