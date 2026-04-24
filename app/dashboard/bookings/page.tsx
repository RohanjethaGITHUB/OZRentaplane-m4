import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import PortalPageHero from '@/components/PortalPageHero'
import type { Profile } from '@/lib/supabase/types'
import { formatDateFromISO } from '@/lib/formatDateTime'
import { formatSydTime } from '@/lib/utils/sydney-time'

export const metadata = { title: 'My Bookings | OZRentAPlane' }

// ── Status config ─────────────────────────────────────────────────────────────
// Customer-facing labels only — DB status values are never changed.

const STATUS_CFG: Record<string, {
  label:       string
  sublabel?:   string    // optional clarifying note shown on the detail page
  color:       string
  bg:          string
  border:      string
  icon:        string
}> = {
  pending_confirmation:       { label: 'Request Pending',       sublabel: 'Not yet confirmed',         color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  icon: 'pending'            },
  confirmed:                  { label: 'Confirmed',              sublabel: 'Booking approved',          color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   icon: 'check_circle'       },
  ready_for_dispatch:         { label: 'Ready to Fly',           sublabel: 'Pre-flight checks done',    color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20',  icon: 'flight_takeoff'     },
  dispatched:                 { label: 'Airborne',               sublabel: 'Flight in progress',        color: 'text-green-300',  bg: 'bg-green-500/10',  border: 'border-green-400/20',  icon: 'flight'             },
  awaiting_flight_record:     { label: 'Awaiting Record',        sublabel: 'Please submit flight log',  color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  icon: 'assignment'         },
  flight_record_overdue:      { label: 'Record Overdue',         sublabel: 'Flight log required',       color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    icon: 'assignment_late'    },
  pending_post_flight_review: { label: 'Under Review',           sublabel: 'Post-flight review',        color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', icon: 'rate_review'        },
  needs_clarification:        { label: 'Clarification Needed',   sublabel: 'Admin has a question',      color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', icon: 'help'               },
  post_flight_approved:       { label: 'Flight Approved',        sublabel: 'Records accepted',          color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20',  icon: 'verified'           },
  completed:                  { label: 'Completed',              sublabel: 'Booking closed',            color: 'text-slate-400',  bg: 'bg-white/5',       border: 'border-white/10',      icon: 'done_all'           },
  cancelled:                  { label: 'Cancelled',              sublabel: 'Will not proceed',          color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    icon: 'cancel'             },
  no_show:                    { label: 'No Show',                sublabel: 'Marked absent',             color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    icon: 'person_off'         },
}

const ACTIVE_STATUSES = [
  'pending_confirmation', 'confirmed', 'ready_for_dispatch',
  'dispatched', 'awaiting_flight_record', 'flight_record_overdue',
  'pending_post_flight_review', 'needs_clarification', 'post_flight_approved',
]

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? {
    label: status.replace(/_/g, ' '),
    color: 'text-slate-400',
    bg: 'bg-white/5',
    border: 'border-white/10',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      {cfg.label}
    </span>
  )
}

type BookingRow = {
  id:                string
  booking_reference: string | null
  status:            string
  scheduled_start:   string
  scheduled_end:     string
  estimated_hours:   number | null
  estimated_amount:  number | null
  pic_name:          string | null
  created_at:        string
  aircraft:          { registration: string } | null
}

const CARD = 'bg-gradient-to-br from-[#0c1525] to-[#080e1c] border border-white/[0.07] rounded-xl shadow-[0_4px_30px_rgba(0,0,0,0.35)]'

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

  const verificationStatus = (profile as Profile | null)?.verification_status ?? 'not_started'
  const isVerified = verificationStatus === 'verified'

  // ── Verification gate ──────────────────────────────────────────────────────
  if (!isVerified) {
    const isPending    = verificationStatus === 'pending_review'
    const isNotStarted = verificationStatus === 'not_started'

    return (
      <>
        <PortalPageHero
          eyebrow="Flight Records"
          title="My Bookings"
          subtitle="Review upcoming flight requests, confirmed bookings, and previous aircraft use."
        />
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 xl:px-12 py-10">
          <div className={`border rounded-xl p-10 text-center ${isPending ? 'bg-blue-500/[0.07] border-blue-500/20' : 'bg-amber-500/[0.07] border-amber-500/20'}`}>
            <span
              className={`material-symbols-outlined text-4xl mb-4 block ${isPending ? 'text-blue-400' : 'text-amber-400'}`}
              style={{ fontVariationSettings: "'wght' 200" }}
            >
              {isPending ? 'verified_user' : isNotStarted ? 'assignment_ind' : 'lock'}
            </span>
            <h2 className="text-xl font-serif text-white mb-3">
              {isPending ? 'Account Under Review' : isNotStarted ? 'Verification Required' : 'Booking Access Unavailable'}
            </h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-6">
              {isPending
                ? 'Your account is under review. Booking access will be enabled once your documents are approved by our safety team.'
                : isNotStarted
                ? 'Complete your pilot verification before requesting a booking. Upload your licence, medical certificate, and ID to get started.'
                : 'Booking access is currently unavailable. Please contact the operations team for assistance.'}
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-xs font-bold uppercase tracking-widest transition-colors"
            >
              {isNotStarted ? 'Start Verification' : 'Return to Overview'}
            </Link>
          </div>
        </div>
      </>
    )
  }

  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id, booking_reference, status, scheduled_start, scheduled_end,
      estimated_hours, estimated_amount, pic_name, created_at,
      aircraft ( registration )
    `)
    .eq('booking_owner_user_id', user.id)
    .order('scheduled_start', { ascending: false })

  const rows    = (bookings ?? []) as unknown as BookingRow[]
  const active  = rows.filter(b => ACTIVE_STATUSES.includes(b.status))
  const archived = rows.filter(b => !ACTIVE_STATUSES.includes(b.status))

  return (
    <>
      <PortalPageHero
        eyebrow="Flight Records"
        title="My Bookings"
        subtitle="Review upcoming flight requests, confirmed bookings, and previous aircraft use."
      />

      <div className="max-w-[1280px] mx-auto px-6 md:px-10 xl:px-12 py-10">

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          {[
            { label: 'Total Flights',   value: rows.length },
            { label: 'Active',          value: active.length },
            { label: 'Requests Pending', value: rows.filter(b => b.status === 'pending_confirmation').length },
            { label: 'Completed',       value: rows.filter(b => b.status === 'completed').length },
          ].map(s => (
            <div key={s.label} className={`${CARD} p-5 text-center`}>
              <div className="text-2xl font-serif font-light text-white mb-1">{s.value}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Active / Upcoming ──────────────────────────────────────────────── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              Active &amp; Upcoming
            </h3>
            <Link
              href="/dashboard/bookings/new"
              className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors shadow-[0_0_16px_rgba(37,99,235,0.25)]"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              New Booking
            </Link>
          </div>

          {active.length === 0 ? (
            <div className={`${CARD} p-12 text-center`}>
              <span className="material-symbols-outlined text-3xl text-slate-700 mb-3 block" style={{ fontVariationSettings: "'wght' 200" }}>
                flight_land
              </span>
              <h3 className="text-lg font-serif text-white/60 mb-2">No active bookings</h3>
              <p className="text-slate-600 text-sm mb-6 max-w-sm mx-auto leading-relaxed">
                Once you&apos;re ready, request your first aircraft booking and the operations team will confirm it.
              </p>
              <Link
                href="/dashboard/bookings/new"
                className="inline-flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-xs font-bold uppercase tracking-widest transition-colors"
              >
                <span className="material-symbols-outlined text-sm">flight_takeoff</span>
                Book a Flight
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {active.map(b => {
                const aircraft = Array.isArray(b.aircraft) ? b.aircraft[0] : b.aircraft
                const cfg = STATUS_CFG[b.status]
                return (
                  <Link
                    key={b.id}
                    href={`/dashboard/bookings/${b.id}`}
                    className={`block ${CARD} p-5 hover:border-blue-500/30 transition-all group`}
                  >
                    <div className="flex items-start justify-between gap-4">

                      {/* Left: icon + aircraft + reference + date/time */}
                      <div className="flex items-start gap-4 min-w-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${cfg?.bg ?? 'bg-blue-500/10'} border ${cfg?.border ?? 'border-blue-500/20'}`}>
                          <span
                            className={`material-symbols-outlined text-[18px] ${cfg?.color ?? 'text-blue-400'}`}
                            style={{ fontVariationSettings: "'wght' 300" }}
                          >
                            {cfg?.icon ?? 'flight_takeoff'}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors">
                              {aircraft?.registration ?? 'VH-KZG'}
                            </p>
                            {b.booking_reference && (
                              <span className="text-[10px] font-mono text-slate-600 bg-white/[0.04] px-1.5 py-0.5 rounded">
                                {b.booking_reference}
                              </span>
                            )}
                          </div>
                          <p className="text-[12px] font-medium text-slate-300 mt-1.5">
                            {formatDateFromISO(b.scheduled_start)}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                            {formatSydTime(b.scheduled_start)} – {formatSydTime(b.scheduled_end)}
                          </p>
                          <p className="text-[10px] text-slate-700 mt-2">
                            Submitted {formatDateFromISO(b.created_at)}
                          </p>
                        </div>
                      </div>

                      {/* Right: amount + hours + badge + arrow */}
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <StatusBadge status={b.status} />
                        {b.estimated_amount != null && (
                          <span className="text-sm font-semibold text-white/80 tabular-nums font-mono">
                            ${b.estimated_amount.toFixed(0)}
                          </span>
                        )}
                        {b.estimated_hours != null && (
                          <span className="text-[11px] text-slate-600 tabular-nums">
                            {b.estimated_hours.toFixed(1)} h est.
                          </span>
                        )}
                        <span className="material-symbols-outlined text-slate-600 group-hover:text-blue-400 text-base transition-colors mt-1">
                          arrow_forward
                        </span>
                      </div>

                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {/* History ─────────────────────────────────────────────────────────── */}
        {archived.length > 0 && (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-4">
              Past &amp; Cancelled
            </h3>
            <div className={`${CARD} overflow-hidden divide-y divide-white/[0.05]`}>
              {archived.map(b => {
                const aircraft = Array.isArray(b.aircraft) ? b.aircraft[0] : b.aircraft
                return (
                  <Link
                    key={b.id}
                    href={`/dashboard/bookings/${b.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-white/60 group-hover:text-white/80 transition-colors">
                          {aircraft?.registration ?? 'VH-KZG'}
                        </p>
                        {b.booking_reference && (
                          <span className="text-[10px] font-mono text-slate-700">
                            {b.booking_reference}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5 tabular-nums">
                        {formatDateFromISO(b.scheduled_start)}{' · '}
                        {formatSydTime(b.scheduled_start)} – {formatSydTime(b.scheduled_end)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <StatusBadge status={b.status} />
                      <span className="material-symbols-outlined text-slate-600 group-hover:text-slate-400 text-sm transition-colors">
                        arrow_forward
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

      </div>
    </>
  )
}
