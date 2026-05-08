import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/formatDateTime'
import AdminPortalHero from '@/components/AdminPortalHero'
import { TabLink } from '@/app/admin/components/AdminUi'

export const metadata = { title: 'Booking Requests | Admin' }

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  checkout_requested: { label: 'New Request', className: 'bg-blue-500/10 text-blue-300 border-blue-500/20' },
  checkout_confirmed: { label: 'Scheduled', className: 'bg-green-500/10 text-green-300 border-green-500/20' },
  checkout_completed_under_review: { label: 'Awaiting Outcome', className: 'bg-amber-500/10 text-amber-300 border-amber-500/20' },
  checkout_payment_required: { label: 'Payment Required', className: 'bg-orange-500/10 text-orange-300 border-orange-500/20' },
  pending_confirmation: { label: 'Requested', className: 'bg-blue-500/10 text-blue-300 border-blue-500/20' },
  confirmed: { label: 'Upcoming', className: 'bg-green-500/10 text-green-300 border-green-500/20' },
  ready_for_dispatch: { label: 'Upcoming', className: 'bg-green-500/10 text-green-300 border-green-500/20' },
  dispatched: { label: 'Active / Dispatched', className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' },
  awaiting_flight_record: { label: 'Awaiting Flight Record', className: 'bg-amber-500/10 text-amber-300 border-amber-500/20' },
  pending_post_flight_review: { label: 'Review Queue', className: 'bg-purple-500/10 text-purple-300 border-purple-500/20' },
  completed: { label: 'Completed', className: 'bg-white/5 text-slate-300 border-white/10' },
  cancelled: { label: 'Cancelled', className: 'bg-rose-500/10 text-rose-300 border-rose-500/20' },
  no_show: { label: 'No Show', className: 'bg-rose-500/10 text-rose-300 border-rose-500/20' },
  cancellation_requested: { label: 'Cancellation Requested', className: 'bg-amber-500/10 text-amber-300 border-amber-500/20' },
}

type SearchParams = { status?: string }

export default async function AdminBookingList({
  searchParams,
  bookingTypeFilter,
  pageTitle,
  pageSubtitle,
  basePath,
  hideFilters,
}: {
  searchParams: SearchParams
  bookingTypeFilter: 'checkout' | 'standard' | 'all'
  pageTitle: string
  pageSubtitle: string
  basePath: string
  hideFilters?: boolean
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const activeFilter = searchParams.status ?? 'all'

  let query = supabase
    .from('bookings')
    .select(`
      id, booking_reference, booking_type, created_at, scheduled_start, scheduled_end, status,
      pic_name, estimated_hours, estimated_amount, booking_owner_user_id,
      aircraft ( id, registration, aircraft_type )
    `)
    .order('scheduled_start', { ascending: true })

  if (activeFilter !== 'all') query = query.eq('status', activeFilter)
  if (bookingTypeFilter !== 'all') query = query.eq('booking_type', bookingTypeFilter)

  const { data: bookings } = await query

  const checkoutTabs = [
    { label: 'New Requests', value: 'checkout_requested' },
    { label: 'Scheduled', value: 'checkout_confirmed' },
    { label: 'Awaiting Outcome', value: 'checkout_completed_under_review' },
    { label: 'Payment Required', value: 'checkout_payment_required' },
    { label: 'Completed', value: 'completed' },
  ]

  const standardTabs = [
    { label: 'Upcoming', value: 'confirmed' },
    { label: 'Active / Dispatched', value: 'dispatched' },
    { label: 'Awaiting Flight Record', value: 'awaiting_flight_record' },
    { label: 'Completed', value: 'completed' },
    { label: 'All', value: 'all' },
  ]

  const tabs = bookingTypeFilter === 'checkout' ? checkoutTabs : bookingTypeFilter === 'standard' ? standardTabs : []

  return (
    <>
      <AdminPortalHero eyebrow="Bookings" title={pageTitle} subtitle={pageSubtitle} />
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24">
        {!hideFilters && tabs.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-6 flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <TabLink
                key={tab.value}
                active={activeFilter === tab.value || (tab.value === 'all' && activeFilter === 'all')}
                href={tab.value === 'all' ? basePath : `${basePath}?status=${tab.value}`}
                label={tab.label}
              />
            ))}
          </div>
        )}

        {(!bookings || bookings.length === 0) ? (
          <div className="p-12 text-center text-slate-400 border border-white/10 rounded-2xl bg-white/[0.02]">
            No bookings found for this tab.
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map((booking) => {
              const aircraft = Array.isArray(booking.aircraft) ? booking.aircraft[0] : booking.aircraft
              const status = booking.status as string
              const badge = STATUS_BADGE[status] ?? { label: status.replace(/_/g, ' '), className: 'bg-white/5 text-slate-300 border-white/10' }
              const actionLabel = status === 'checkout_requested' ? 'Review Request' : status === 'checkout_completed_under_review' ? 'Mark Outcome' : status === 'checkout_payment_required' ? 'Review Payment' : 'View Details'

              return (
                <Link key={booking.id} href={`/admin/bookings/requests/${booking.id}`} className="block rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] transition-colors p-5">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={`px-2.5 py-1 text-xs rounded-full border ${badge.className}`}>{badge.label}</span>
                        <span className="px-2.5 py-1 text-xs rounded-full border bg-white/5 border-white/10 text-slate-300">{booking.booking_type === 'checkout' ? 'Checkout Flight' : 'Customer Booking'}</span>
                      </div>
                      <p className="text-lg text-white font-medium">{booking.pic_name || 'Customer'} · {aircraft?.registration || 'VH-KZG'}</p>
                      <p className="text-sm text-slate-400">{formatDateTime(booking.scheduled_start)} to {formatDateTime(booking.scheduled_end)}</p>
                      <p className="text-xs text-slate-500 mt-1">{booking.booking_reference || booking.id.slice(0, 8).toUpperCase()}</p>
                    </div>
                    <div className="text-left lg:text-right">
                      <p className="text-sm text-slate-400">Payment state</p>
                      <p className="text-base text-white capitalize">{status === 'checkout_payment_required' ? 'Payment Required' : 'N/A'}</p>
                      <p className="text-sm text-blue-200 mt-2">{actionLabel} →</p>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
