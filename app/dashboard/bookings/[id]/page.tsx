import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import CustomerBookingShell from '../CustomerBookingShell'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/supabase/types'
import type { BookingStatus } from '@/lib/supabase/booking-types'

export const metadata = { title: 'Booking Details | Pilot Dashboard' }

// ── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending_confirmation:      { label: 'Pending Approval',   color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20'  },
  confirmed:                 { label: 'Confirmed',           color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20'   },
  ready_for_dispatch:        { label: 'Ready to Fly',        color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20'  },
  dispatched:                { label: 'Airborne',            color: 'text-green-300',  bg: 'bg-green-500/10',  border: 'border-green-400/20'  },
  awaiting_flight_record:    { label: 'Awaiting Record',    color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20'  },
  flight_record_overdue:     { label: 'Record Overdue',     color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20'    },
  pending_post_flight_review:{ label: 'Under Review',       color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  post_flight_approved:      { label: 'Approved',           color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20'  },
  completed:                 { label: 'Completed',          color: 'text-slate-400',  bg: 'bg-white/5',       border: 'border-white/10'      },
  cancelled:                 { label: 'Cancelled',          color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20'    },
  no_show:                   { label: 'No Show',            color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20'    },
}

// Status pipeline — in display order
const PIPELINE: { key: BookingStatus; label: string }[] = [
  { key: 'pending_confirmation',       label: 'Requested'            },
  { key: 'confirmed',                  label: 'Confirmed'            },
  { key: 'ready_for_dispatch',         label: 'Ready for Dispatch'   },
  { key: 'dispatched',                 label: 'Departed'             },
  { key: 'awaiting_flight_record',     label: 'Awaiting Record'      },
  { key: 'pending_post_flight_review', label: 'Post-Flight Review'   },
  { key: 'post_flight_approved',       label: 'Review Approved'      },
  { key: 'completed',                  label: 'Completed'            },
]

const PIPELINE_ORDER = PIPELINE.map(p => p.key)

function getPipelineState(current: string): 'done' | 'active' | 'pending' | 'cancelled' {
  return 'pending' // resolved per-step below
}

function formatSYD(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'long', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Next action card ─────────────────────────────────────────────────────────

function NextActionCard({ status }: { status: string }) {
  const isCancelled = status === 'cancelled' || status === 'no_show'

  if (isCancelled) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-[1.25rem] p-6">
        <h3 className="text-xs font-bold uppercase tracking-widest text-red-400 mb-2">Booking Ended</h3>
        <p className="text-sm text-oz-muted">This booking has been cancelled or marked as no show.</p>
        <Link href="/dashboard/bookings/new" className="inline-flex items-center gap-2 mt-4 text-oz-blue hover:text-blue-300 text-sm font-medium transition-colors">
          Request a new booking <span className="material-symbols-outlined text-sm">arrow_forward</span>
        </Link>
      </div>
    )
  }

  if (status === 'pending_confirmation') {
    return (
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-[1.25rem] p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-amber-400">Awaiting Confirmation</h3>
        </div>
        <p className="text-sm text-oz-muted leading-relaxed">
          Your booking request has been submitted and is awaiting confirmation from the operations team. You will be notified by email once a decision is made.
        </p>
        <p className="text-[10px] text-amber-400/60 mt-3 uppercase tracking-widest">Typical response time: within 24 hours</p>
      </div>
    )
  }

  if (status === 'confirmed' || status === 'ready_for_dispatch') {
    return (
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-[1.25rem] p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="material-symbols-outlined text-blue-400 text-lg">check_circle</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-blue-400">Booking Confirmed</h3>
        </div>
        <p className="text-sm text-oz-muted leading-relaxed">
          Your booking is confirmed. Please arrive at the aircraft at least 30 minutes before your scheduled departure for pre-flight checks.
        </p>
      </div>
    )
  }

  if (status === 'dispatched' || status === 'awaiting_flight_record' || status === 'flight_record_overdue') {
    return (
      <div className="bg-green-500/10 border border-green-500/20 rounded-[1.25rem] p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="material-symbols-outlined text-green-400 text-lg">flight_takeoff</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-green-400">
            {status === 'dispatched' ? 'Flight in Progress' : 'Flight Record Required'}
          </h3>
        </div>
        <p className="text-sm text-oz-muted leading-relaxed">
          {status === 'dispatched'
            ? 'Your flight is currently active. Safe flying!'
            : 'Your flight is complete. You will receive instructions to submit your flight record soon.'}
        </p>
        <p className="text-[10px] text-amber-400 mt-3 uppercase tracking-widest font-medium">
          ✦ Flight record submission — coming soon
        </p>
      </div>
    )
  }

  if (status === 'pending_post_flight_review') {
    return (
      <div className="bg-purple-500/10 border border-purple-500/20 rounded-[1.25rem] p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="material-symbols-outlined text-purple-400 text-lg">assignment_turned_in</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-purple-400">Under Post-Flight Review</h3>
        </div>
        <p className="text-sm text-oz-muted leading-relaxed">
          Your flight record has been submitted and is currently being reviewed by the operations team.
        </p>
      </div>
    )
  }

  if (status === 'post_flight_approved' || status === 'completed') {
    return (
      <div className="bg-green-500/10 border border-green-500/20 rounded-[1.25rem] p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="material-symbols-outlined text-green-400 text-lg">verified</span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-green-400">
            {status === 'completed' ? 'Booking Complete' : 'Flight Approved'}
          </h3>
        </div>
        <p className="text-sm text-oz-muted">
          {status === 'completed'
            ? 'This booking is fully closed. Thank you for flying with OZRentAPlane.'
            : 'Your post-flight records have been reviewed and approved.'}
        </p>
      </div>
    )
  }

  // Generic fallback
  return (
    <div className="bg-white/5 border border-white/5 rounded-[1.25rem] p-6">
      <p className="text-sm text-oz-muted">
        Need to make a change? <span className="text-oz-blue">Contact the operations team.</span>
      </p>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

type PageProps = { params: { id: string } }

export default async function BookingDetailPage({ params }: PageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  if (profile?.role === 'admin') redirect('/admin')

  // ── Server-side verification gate ────────────────────────────────────────
  if (profile?.verification_status !== 'verified') {
    return (
      <CustomerBookingShell user={user as User} profile={profile as Profile | null}>
        <div className="pt-28 px-8 md:px-12 xl:px-16 pb-16 max-w-2xl mx-auto w-full">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-[1.25rem] p-10 text-center">
            <span className="material-symbols-outlined text-4xl text-amber-400 mb-4 block" style={{ fontVariationSettings: "'wght' 200" }}>lock</span>
            <h2 className="text-xl font-serif text-white mb-3">Booking Access Unavailable</h2>
            <p className="text-oz-muted text-sm leading-relaxed mb-6">
              Your account must be verified to access booking details. Please contact the operations team if you believe this is an error.
            </p>
            <Link href="/dashboard" className="inline-flex items-center gap-2 px-5 py-2.5 bg-oz-blue hover:bg-blue-400 text-white rounded-full text-xs font-bold uppercase tracking-widest transition-colors">
              Return to Dashboard
            </Link>
          </div>
        </div>
      </CustomerBookingShell>
    )
  }

  // SECURITY: filter by booking_owner_user_id = user.id
  const { data: booking } = await supabase
    .from('bookings')
    .select(`
      id, status, scheduled_start, scheduled_end,
      estimated_hours, estimated_amount,
      pic_name, pic_arn, customer_notes,
      created_at, updated_at,
      aircraft ( registration, type )
    `)
    .eq('id', params.id)
    .eq('booking_owner_user_id', user.id)
    .single()

  if (!booking) notFound()

  const aircraft = Array.isArray(booking.aircraft) ? booking.aircraft[0] : booking.aircraft
  const status   = booking.status as string
  const cfg      = STATUS_CFG[status] ?? { label: status.replace(/_/g, ' '), color: 'text-slate-400', bg: 'bg-white/5', border: 'border-white/10' }

  // Pipeline step states
  const isCancelled = status === 'cancelled' || status === 'no_show'
  const currentIdx  = PIPELINE_ORDER.indexOf(status as BookingStatus)

  return (
    <CustomerBookingShell user={user as User} profile={profile as Profile | null}>
      <div className="pt-28 px-8 md:px-12 xl:px-16 pb-16 w-full max-w-4xl mx-auto">

        {/* Back */}
        <Link href="/dashboard/bookings" className="inline-flex items-center gap-1 text-oz-blue hover:text-blue-300 text-sm mb-6 transition-colors">
          <span className="material-symbols-outlined text-base">arrow_back</span>
          My Bookings
        </Link>

        {/* Hero */}
        <header className="mb-10 bg-[#0c121e]/60 border border-white/5 rounded-[1.5rem] p-8 relative overflow-hidden">
          <span className="material-symbols-outlined text-[120px] absolute -right-6 -bottom-6 text-white/5 pointer-events-none" style={{ fontVariationSettings: "'FILL' 1" }}>flight_takeoff</span>
          <div className="relative z-10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-oz-blue/60 mb-1">Booking Ref</p>
                <p className="text-xs font-mono text-white/40">{booking.id.split('-')[0].toUpperCase()}</p>
              </div>
              <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                {cfg.label}
              </span>
            </div>

            <h2 className="text-3xl font-serif italic text-white mb-1">{aircraft?.registration ?? 'VH-KZG'}</h2>
            <p className="text-oz-muted text-sm capitalize">{aircraft?.type?.replace('_', ' ') ?? '—'}</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

          {/* Left: Details + Pipeline */}
          <div className="lg:col-span-3 space-y-6">

            {/* Flight Details */}
            <div className="bg-[#0c121e]/60 border border-white/5 rounded-[1.25rem] p-6 space-y-5">
              <h3 className="text-[10px] uppercase tracking-widest font-bold text-oz-muted">Flight Details</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-slate-600 font-bold mb-1">Departure (Sydney)</p>
                  <p className="text-sm text-white">{formatSYD(booking.scheduled_start)}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-slate-600 font-bold mb-1">Return (Sydney)</p>
                  <p className="text-sm text-white">{formatSYD(booking.scheduled_end)}</p>
                </div>
                {booking.estimated_hours != null && (
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-slate-600 font-bold mb-1">Estimated Hours</p>
                    <p className="text-sm text-white">{booking.estimated_hours.toFixed(1)} h</p>
                  </div>
                )}
                {booking.estimated_amount != null && (
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-slate-600 font-bold mb-1">Estimated Cost</p>
                    <p className="text-sm text-white">${booking.estimated_amount.toFixed(2)} AUD</p>
                  </div>
                )}
                {booking.pic_name && (
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-slate-600 font-bold mb-1">PIC Name</p>
                    <p className="text-sm text-white">{booking.pic_name}</p>
                  </div>
                )}
                {booking.pic_arn && (
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-slate-600 font-bold mb-1">PIC ARN</p>
                    <p className="text-sm text-white font-mono">{booking.pic_arn}</p>
                  </div>
                )}
              </div>

              {booking.customer_notes && (
                <div className="pt-4 border-t border-white/5">
                  <p className="text-[9px] uppercase tracking-widest text-slate-600 font-bold mb-2">Your Notes</p>
                  <p className="text-sm text-oz-muted leading-relaxed">{booking.customer_notes}</p>
                </div>
              )}
            </div>

            {/* Status Pipeline */}
            {!isCancelled && (
              <div className="bg-[#0c121e]/60 border border-white/5 rounded-[1.25rem] p-6">
                <h3 className="text-[10px] uppercase tracking-widest font-bold text-oz-muted mb-6">Status Timeline</h3>
                <ol className="relative space-y-0">
                  {PIPELINE.map((step, idx) => {
                    let stepState: 'done' | 'active' | 'pending'
                    if (currentIdx === -1) {
                      stepState = 'pending'
                    } else if (idx < currentIdx) {
                      stepState = 'done'
                    } else if (idx === currentIdx) {
                      stepState = 'active'
                    } else {
                      stepState = 'pending'
                    }

                    return (
                      <li key={step.key} className="flex gap-4 pb-6 last:pb-0 relative">
                        {/* Connector line */}
                        {idx < PIPELINE.length - 1 && (
                          <div className={`absolute left-[11px] top-6 bottom-0 w-[2px] ${stepState === 'done' ? 'bg-oz-blue/60' : 'bg-white/10'}`} />
                        )}
                        {/* Dot */}
                        <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center border-2 mt-0.5 z-10 ${
                          stepState === 'done'   ? 'bg-oz-blue border-oz-blue'    :
                          stepState === 'active' ? 'bg-transparent border-oz-blue' :
                                                   'bg-transparent border-white/20'
                        }`}>
                          {stepState === 'done' && (
                            <span className="material-symbols-outlined text-white text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                          )}
                          {stepState === 'active' && (
                            <div className="w-2 h-2 rounded-full bg-oz-blue" />
                          )}
                        </div>
                        {/* Label */}
                        <div className="pt-0.5">
                          <p className={`text-sm font-medium ${
                            stepState === 'active' ? 'text-white' :
                            stepState === 'done'   ? 'text-oz-blue' :
                                                     'text-oz-muted/50'
                          }`}>{step.label}</p>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </div>
            )}
          </div>

          {/* Right: Next action + contact */}
          <div className="lg:col-span-2 space-y-4">
            <NextActionCard status={status} />

            {/* Cancellation placeholder */}
            <div className="bg-white/5 border border-white/5 rounded-[1.25rem] p-5 opacity-60">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Request a Change</h3>
              <p className="text-xs text-oz-muted leading-relaxed">
                Need to cancel or modify this booking?{' '}
                <span className="text-oz-blue">Contact the operations team.</span>
              </p>
              {/* TODO: Add self-service cancellation once cancelBookingRequest() customer action exists */}
              <p className="text-[9px] text-slate-600 mt-3 uppercase tracking-widest">Self-service cancellation — coming soon</p>
            </div>

            {/* Timestamps */}
            <div className="bg-white/5 border border-white/5 rounded-[1.25rem] p-5">
              <p className="text-[9px] uppercase tracking-widest text-slate-600 font-bold mb-3">Booking Info</p>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-[10px] text-slate-500">Submitted</span>
                  <span className="text-[10px] text-oz-muted font-mono">
                    {new Date(booking.created_at).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] text-slate-500">Last updated</span>
                  <span className="text-[10px] text-oz-muted font-mono">
                    {new Date(booking.updated_at).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </CustomerBookingShell>
  )
}
