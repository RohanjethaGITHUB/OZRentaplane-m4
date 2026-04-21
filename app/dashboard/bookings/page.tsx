import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import CustomerBookingShell from './CustomerBookingShell'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/supabase/types'

export const metadata = { title: 'My Bookings | Pilot Dashboard' }

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending_confirmation:      { label: 'Pending Approval',  color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20'  },
  confirmed:                 { label: 'Confirmed',          color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20'   },
  ready_for_dispatch:        { label: 'Ready to Fly',       color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20'  },
  dispatched:                { label: 'Airborne',           color: 'text-green-300',  bg: 'bg-green-500/10',  border: 'border-green-400/20'  },
  awaiting_flight_record:    { label: 'Awaiting Record',   color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20'  },
  flight_record_overdue:     { label: 'Record Overdue',    color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20'    },
  pending_post_flight_review:{ label: 'Under Review',      color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  post_flight_approved:      { label: 'Approved',          color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20'  },
  completed:                 { label: 'Completed',         color: 'text-slate-400',  bg: 'bg-white/5',       border: 'border-white/10'      },
  cancelled:                 { label: 'Cancelled',         color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20'    },
  no_show:                   { label: 'No Show',           color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20'    },
}

const ACTIVE_STATUSES = [
  'pending_confirmation', 'confirmed', 'ready_for_dispatch',
  'dispatched', 'awaiting_flight_record', 'flight_record_overdue',
  'pending_post_flight_review', 'post_flight_approved',
]

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status.replace(/_/g, ' '), color: 'text-slate-400', bg: 'bg-white/5', border: 'border-white/10' }
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      {cfg.label}
    </span>
  )
}

function formatSYD(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

type BookingRow = {
  id: string
  status: string
  scheduled_start: string
  scheduled_end: string
  estimated_hours: number | null
  estimated_amount: number | null
  pic_name: string | null
  aircraft: { registration: string } | null
}

export default async function CustomerBookingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  if (profile?.role === 'admin') redirect('/admin')

  const verificationStatus = profile?.verification_status ?? 'not_started'
  const isVerified = verificationStatus === 'verified'

  // — Server-side verification gate —
  if (!isVerified) {
    const isPending    = verificationStatus === 'pending_review'
    const isNotStarted = verificationStatus === 'not_started'

    return (
      <CustomerBookingShell user={user as User} profile={profile as Profile | null}>
        <div className="pt-28 px-8 md:px-12 xl:px-16 pb-16 max-w-2xl mx-auto w-full">
          <div className={`border rounded-[1.25rem] p-10 text-center ${isPending ? 'bg-blue-500/10 border-blue-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
            <span className={`material-symbols-outlined text-4xl mb-4 block ${isPending ? 'text-blue-400' : 'text-amber-400'}`}
              style={{ fontVariationSettings: "'wght' 200" }}>
              {isPending ? 'verified_user' : isNotStarted ? 'assignment_ind' : 'lock'}
            </span>
            <h2 className="text-xl font-serif text-white mb-3">
              {isPending
                ? 'Account Under Review'
                : isNotStarted
                ? 'Verification Required'
                : 'Booking Access Unavailable'}
            </h2>
            <p className="text-oz-muted text-sm leading-relaxed mb-6">
              {isPending
                ? 'Your account is under review. Booking access will be enabled once your documents are approved by our safety team.'
                : isNotStarted
                ? 'Complete your pilot verification before requesting a booking. Upload your licence, medical certificate, and ID to get started.'
                : 'Booking access is currently unavailable. Please contact the operations team for assistance.'}
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-oz-blue hover:bg-blue-400 text-white rounded-full text-xs font-bold uppercase tracking-widest transition-colors"
            >
              {isNotStarted ? 'Start Verification' : 'Return to Dashboard'}
            </Link>
          </div>
        </div>
      </CustomerBookingShell>
    )
  }

  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id, status, scheduled_start, scheduled_end,
      estimated_hours, estimated_amount, pic_name,
      aircraft ( registration )
    `)
    .eq('booking_owner_user_id', user.id)
    .order('scheduled_start', { ascending: false })

  const rows    = (bookings ?? []) as unknown as BookingRow[]
  const active  = rows.filter(b => ACTIVE_STATUSES.includes(b.status))
  const archived = rows.filter(b => !ACTIVE_STATUSES.includes(b.status))

  return (
    <CustomerBookingShell user={user as User} profile={profile as Profile | null}>
      <div className="pt-28 px-8 md:px-12 xl:px-16 pb-16 w-full max-w-5xl mx-auto">

        {/* Header */}
        <header className="mb-10 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-oz-blue/60 mb-2">Pilot Dashboard</p>
            <h2 className="text-3xl md:text-4xl font-serif italic tracking-tight text-white">My Bookings</h2>
            <p className="text-oz-muted text-sm font-light mt-1">Your booking history and upcoming flights.</p>
          </div>
          <Link
            href="/dashboard/bookings/new"
            className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs font-bold uppercase tracking-widest transition-colors shadow-[0_0_20px_rgba(37,99,235,0.3)]"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Request a Booking
          </Link>
        </header>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          {[
            { label: 'Total Flights', value: rows.length },
            { label: 'Active',        value: active.length },
            { label: 'Pending',       value: rows.filter(b => b.status === 'pending_confirmation').length },
            { label: 'Completed',     value: rows.filter(b => b.status === 'completed').length },
          ].map(s => (
            <div key={s.label} className="bg-[#0c121e]/60 backdrop-blur-xl border border-white/5 rounded-[1rem] p-4 text-center">
              <div className="text-2xl font-serif font-light text-white">{s.value}</div>
              <div className="text-[10px] uppercase tracking-widest text-oz-muted mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Active / Upcoming */}
        <section className="mb-10">
          <h3 className="text-xs font-bold uppercase tracking-widest text-oz-blue/70 mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-oz-blue animate-pulse" /> Active &amp; Upcoming
          </h3>
          {active.length === 0 ? (
            <div className="bg-[#0c121e]/60 border border-white/5 rounded-[1.25rem] p-10 text-center">
              <span className="material-symbols-outlined text-3xl text-oz-muted mb-3 block" style={{ fontVariationSettings: "'wght' 200" }}>flight_land</span>
              <p className="text-oz-muted text-sm">No active or upcoming bookings.</p>
              <Link href="/dashboard/bookings/new" className="inline-flex items-center gap-1 mt-4 text-oz-blue hover:text-blue-300 text-sm font-medium transition-colors">
                Request your first booking <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {active.map(b => {
                const aircraft = Array.isArray(b.aircraft) ? b.aircraft[0] : b.aircraft
                return (
                  <Link key={b.id} href={`/dashboard/bookings/${b.id}`} className="block bg-[#0c121e]/60 border border-white/5 hover:border-oz-blue/30 rounded-[1.25rem] p-5 transition-all group">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-oz-blue/10 border border-oz-blue/20 flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-oz-blue text-lg" style={{ fontVariationSettings: "'wght' 300" }}>flight_takeoff</span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white group-hover:text-oz-blue transition-colors">{aircraft?.registration ?? 'VH-KZG'}</p>
                          <p className="text-[11px] text-oz-muted mt-0.5">{formatSYD(b.scheduled_start)} → {formatSYD(b.scheduled_end)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 sm:ml-auto">
                        {b.estimated_hours != null && (
                          <span className="text-[11px] text-oz-muted tabular-nums">{b.estimated_hours.toFixed(1)}h</span>
                        )}
                        {b.estimated_amount != null && (
                          <span className="text-[11px] text-oz-muted tabular-nums">${b.estimated_amount.toFixed(0)}</span>
                        )}
                        <StatusBadge status={b.status} />
                        <span className="material-symbols-outlined text-slate-600 group-hover:text-oz-blue text-base transition-colors">arrow_forward</span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {/* History */}
        {archived.length > 0 && (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Past &amp; Cancelled</h3>
            <div className="bg-[#0c121e]/40 border border-white/5 rounded-[1.25rem] overflow-hidden divide-y divide-white/5">
              {archived.map(b => {
                const aircraft = Array.isArray(b.aircraft) ? b.aircraft[0] : b.aircraft
                return (
                  <Link key={b.id} href={`/dashboard/bookings/${b.id}`} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 px-6 py-4 hover:bg-white/[0.02] transition-colors group">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white/70 group-hover:text-white transition-colors">{aircraft?.registration ?? 'VH-KZG'}</p>
                      <p className="text-[11px] text-oz-muted mt-0.5">{formatSYD(b.scheduled_start)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={b.status} />
                      <span className="material-symbols-outlined text-slate-600 group-hover:text-slate-400 text-sm transition-colors">arrow_forward</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

      </div>
    </CustomerBookingShell>
  )
}
