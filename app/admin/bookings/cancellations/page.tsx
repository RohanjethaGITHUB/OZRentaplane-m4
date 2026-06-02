import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import AdminBookingList from '../components/AdminBookingList'

export const metadata = { title: 'Cancellations | Admin' }

export default async function CancellationsPage({ searchParams }: { searchParams: { status?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch pending cancellation requests with booking + customer info for the review queue
  const { data: pendingRequests } = await supabase
    .from('booking_cancellation_requests')
    .select(`
      id, booking_id, customer_message, booking_start_time, created_at,
      bookings (
        booking_reference, estimated_amount, estimated_hours,
        aircraft ( registration ),
        profiles:booking_owner_user_id ( full_name )
      )
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  const activeStatus = searchParams.status === 'no_show' ? 'no_show' : 'cancelled'

  return (
    <div>
      <AdminPortalHero
        eyebrow="Bookings"
        title="Cancellations & No Shows"
        subtitle="Cancelled bookings, no shows, and pending cancellation reviews."
      />

      {/* ── Pending cancellation review queue ─────────────────────────────── */}
      {pendingRequests && pendingRequests.length > 0 && (
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 py-8 pb-0">
          <div className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-widest text-amber-400 flex items-center gap-2">
              <span className="material-symbols-outlined text-base animate-pulse">pending_actions</span>
              Pending Cancellation Review
              <span className="ml-1 bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {pendingRequests.length}
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Late cancellations submitted by customers — decide whether to waive or apply the charge.
            </p>
          </div>

          <div className="space-y-3">
            {pendingRequests.map(req => {
              const booking = Array.isArray(req.bookings) ? req.bookings[0] : req.bookings
              const aircraft = booking
                ? (Array.isArray((booking as { aircraft?: unknown }).aircraft)
                    ? ((booking as { aircraft?: unknown[] }).aircraft as { registration?: string }[])?.[0]
                    : (booking as { aircraft?: { registration?: string } }).aircraft)
                : null
              const profile = booking
                ? (Array.isArray((booking as { profiles?: unknown }).profiles)
                    ? ((booking as { profiles?: unknown[] }).profiles as { full_name?: string }[])?.[0]
                    : (booking as { profiles?: { full_name?: string } }).profiles)
                : null

              const departureDisplay = new Date(req.booking_start_time).toLocaleString('en-AU', {
                timeZone: 'Australia/Sydney',
                weekday:  'short',
                month:    'short',
                day:      'numeric',
                hour:     'numeric',
                minute:   '2-digit',
              })

              return (
                <Link
                  key={req.id}
                  href={`/admin/bookings/requests/${req.booking_id}`}
                  className="block bg-[#0d1420] border border-amber-500/20 hover:border-amber-500/40 rounded-xl p-5 transition-colors group"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold font-mono text-white">
                          {(booking as { booking_reference?: string } | null)?.booking_reference ?? req.booking_id.slice(0, 8).toUpperCase()}
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-300">
                          Cancellation Requested
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {(profile as { full_name?: string } | null)?.full_name ?? 'Unknown customer'} ·{' '}
                        {(aircraft as { registration?: string } | null)?.registration ?? '—'}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Departure: <span className="text-slate-300">{departureDisplay}</span>
                      </p>
                      {req.customer_message && (
                        <p className="text-[11px] text-amber-400/70 italic mt-1 line-clamp-1">
                          &ldquo;{req.customer_message}&rdquo;
                        </p>
                      )}
                    </div>
                    <div className="text-right space-y-1">
                      {(booking as { estimated_amount?: number | null } | null)?.estimated_amount != null && (
                        <p className="text-sm font-bold text-amber-300">
                          ${((booking as { estimated_amount: number }).estimated_amount).toFixed(2)}
                        </p>
                      )}
                      {(booking as { estimated_hours?: number | null } | null)?.estimated_hours != null && (
                        <p className="text-[11px] text-slate-500">
                          {((booking as { estimated_hours: number }).estimated_hours).toFixed(1)} h
                        </p>
                      )}
                      <p className="text-[10px] text-amber-400/60 group-hover:text-amber-400 transition-colors flex items-center gap-1 justify-end">
                        Review
                        <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                      </p>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>

          <div className="my-8 border-t border-white/[0.06]" />
        </div>
      )}

      {/* ── Completed cancellations list ────────────────────────────────────── */}
      <AdminBookingList
        searchParams={{ status: activeStatus }}
        bookingTypeFilter="all"
        pageTitle="Cancellations & No Shows"
        pageSubtitle="Cancelled bookings and no shows."
        basePath="/admin/bookings/cancellations"
        hideFilters={true}
      />

    </div>
  )
}
