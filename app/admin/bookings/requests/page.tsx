import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import PendingBookingActions from './PendingBookingActions'
import { formatDateTime } from '@/lib/formatDateTime'
import AdminPortalHero from '@/components/AdminPortalHero'

export const metadata = { title: 'Booking Requests | Admin' }

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending_confirmation:       { label: 'Pending',            className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  confirmed:                  { label: 'Confirmed',           className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  cancelled:                  { label: 'Cancelled',           className: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  ready_for_dispatch:         { label: 'Ready',               className: 'bg-green-500/10 text-green-400 border-green-500/20' },
  dispatched:                 { label: 'Dispatched',          className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  awaiting_flight_record:     { label: 'Awaiting Record',     className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  flight_record_overdue:      { label: 'Record Overdue',      className: 'bg-red-500/10 text-red-400 border-red-500/20' },
  pending_post_flight_review: { label: 'Post-Flight Review',  className: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  needs_clarification:        { label: 'Clarification',       className: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  post_flight_approved:       { label: 'Approved',            className: 'bg-green-500/10 text-green-400 border-green-500/20' },
  completed:                  { label: 'Completed',           className: 'bg-white/5 text-slate-400 border-white/10' },
}

const FILTER_TABS = [
  { label: 'Pending',   value: 'pending_confirmation' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'All',       value: 'all' },
]

type SearchParams = { status?: string }

export default async function AdminBookingRequestsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const activeFilter = searchParams.status ?? 'pending_confirmation'

  let query = supabase
    .from('bookings')
    .select(`
      id,
      booking_reference,
      created_at,
      scheduled_start,
      scheduled_end,
      status,
      pic_name,
      pic_arn,
      estimated_hours,
      estimated_amount,
      customer_notes,
      booking_owner_user_id,
      aircraft ( id, registration, aircraft_type )
    `)
    .order('created_at', { ascending: false })

  if (activeFilter !== 'all') {
    query = query.eq('status', activeFilter)
  }

  const { data: bookings, error: bookingsError } = await query
  if (bookingsError) {
    console.error('[AdminBookingRequestsPage] bookings query error:', bookingsError)
  }

  const authorIds = Array.from(new Set((bookings ?? []).map(b => b.booking_owner_user_id)))
  let profilesData: { id: string; full_name: string | null; email: string | null; verification_status: string }[] = []
  if (authorIds.length > 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, verification_status')
      .in('id', authorIds)
    if (data) profilesData = data
  }

  const getProfile = (id: string) => profilesData.find(p => p.id === id)

  return (
    <>
      <AdminPortalHero
        eyebrow="Booking Operations"
        title="Booking Requests"
        subtitle="Review and action customer flight booking requests."
      />

      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24">

        {/* Filter tabs */}
        <div className="flex items-center gap-2 mb-8">
          {FILTER_TABS.map(tab => (
            <Link
              key={tab.value}
              href={`/admin/bookings/requests?status=${tab.value}`}
              className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors border ${
                activeFilter === tab.value
                  ? 'bg-[#a7c8ff]/10 border-[#a7c8ff]/30 text-[#a7c8ff]'
                  : 'border-white/10 text-white/30 hover:text-white/60 hover:border-white/20'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {(!bookings || bookings.length === 0) ? (
          <div className="p-12 text-center text-slate-500 border border-white/5 rounded-2xl bg-white/5">
            <span
              className="material-symbols-outlined text-4xl mb-3 text-slate-600 block"
              style={{ fontVariationSettings: "'wght' 200" }}
            >
              inbox
            </span>
            No booking requests found for this filter.
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map(booking => {
              const author = getProfile(booking.booking_owner_user_id)
              const aircraft = Array.isArray(booking.aircraft) ? booking.aircraft[0] : booking.aircraft
              const startStr     = formatDateTime(booking.scheduled_start)
              const endStr       = formatDateTime(booking.scheduled_end)
              const submittedStr = formatDateTime(booking.created_at)
              const status       = booking.status as string
              const badge        = STATUS_BADGE[status] ?? {
                label: status.replace(/_/g, ' '),
                className: 'bg-white/5 text-slate-400 border-white/10',
              }
              const bookingRef = (booking as { booking_reference?: string }).booking_reference
                ?? booking.id.split('-')[0].toUpperCase()

              return (
                <div
                  key={booking.id}
                  className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden flex flex-col md:flex-row hover:border-white/10 transition-colors"
                >
                  {/* Details Section */}
                  <div className="p-6 md:flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-lg font-medium text-white">
                              {aircraft?.registration || 'Unknown Aircraft'}
                            </h3>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${badge.className}`}>
                              {badge.label}
                            </span>
                          </div>
                          <p className="text-[11px] font-mono text-slate-600 mb-1">{bookingRef}</p>
                          <p className="text-sm text-slate-400 tabular-nums">
                            {startStr} &mdash; {endStr}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-2xl font-serif text-blue-200">
                            ${booking.estimated_amount?.toFixed(2) ?? '—'}
                          </div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500">
                            Est {booking.estimated_hours?.toFixed(1) ?? '—'} hrs
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mt-2">
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Customer</p>
                          <p className="text-sm font-medium text-slate-300">{author?.full_name || 'Unknown'}</p>
                          <p className="text-xs text-slate-500">{author?.email || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Pilot in Command</p>
                          <p className="text-sm text-slate-300">{booking.pic_name || '—'}</p>
                          {booking.pic_arn && (
                            <p className="text-xs text-slate-500">ARN: {booking.pic_arn}</p>
                          )}
                        </div>
                      </div>

                      {booking.customer_notes && (
                        <div className="mt-4 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                          <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Customer Notes</p>
                          <p className="text-sm text-slate-300 leading-relaxed italic line-clamp-2">
                            &quot;{booking.customer_notes}&quot;
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between">
                      <span className="text-xs text-slate-500">Submitted: {submittedStr}</span>
                      <Link
                        href={`/admin/bookings/requests/${booking.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-[10px] font-bold uppercase tracking-widest transition-colors border border-white/10"
                      >
                        <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                        View Details
                      </Link>
                    </div>
                  </div>

                  {/* Quick actions — only shown inline for pending */}
                  {status === 'pending_confirmation' && (
                    <div className="bg-[#0a0b0d] p-6 md:w-52 border-l border-white/5 flex items-center justify-center">
                      <PendingBookingActions bookingId={booking.id} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
