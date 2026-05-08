import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import AdminCalendarClient, { type CalEvent } from './AdminCalendarClient'

export const metadata = { title: 'Calendar | Admin' }

export default async function AdminCalendarPage() {
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
    .select('id, block_type, start_time, end_time, status, related_booking_id, bookings ( pic_name, status, booking_type )')
    .eq('aircraft_id', aircraft.id)
    .gte('start_time', start.toISOString())
    .lte('start_time', end.toISOString())
    .order('start_time', { ascending: true })

  const events: CalEvent[] = (blocks ?? []).map((b) => {
    const booking = Array.isArray(b.bookings) ? b.bookings[0] : b.bookings
    const type = b.block_type === 'customer_booking'
      ? booking?.booking_type === 'checkout' ? 'checkout' : 'booking'
      : b.block_type === 'buffer'
      ? 'buffer'
      : b.block_type === 'maintenance' || b.block_type === 'inspection'
      ? 'maintenance'
      : 'blocked'

    return {
      id: b.id,
      type,
      title: b.block_type.replace(/_/g, ' '),
      customer: booking?.pic_name ?? null,
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
