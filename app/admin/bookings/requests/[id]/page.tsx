import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/formatDateTime'
import { formatSydTime } from '@/lib/utils/sydney-time'
import AdminBookingActions from './AdminBookingActions'
import AdminClarificationForm from './AdminClarificationForm'
import AdminOperationalActions from './AdminOperationalActions'

export const metadata = { title: 'Booking Detail | Admin' }

// ── Status display config ─────────────────────────────────────────────────────

const STATUS_CFG: Record<string, {
  label:  string
  color:  string
  bg:     string
  border: string
  icon:   string
}> = {
  pending_confirmation:       { label: 'Pending Confirmation',   color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   icon: 'pending' },
  confirmed:                  { label: 'Confirmed',              color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    icon: 'check_circle' },
  cancelled:                  { label: 'Cancelled',              color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    icon: 'cancel' },
  ready_for_dispatch:         { label: 'Ready for Dispatch',     color: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/20',   icon: 'flight_takeoff' },
  dispatched:                 { label: 'Dispatched',             color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: 'flight' },
  awaiting_flight_record:     { label: 'Awaiting Flight Record', color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   icon: 'assignment' },
  flight_record_overdue:      { label: 'Record Overdue',         color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20',     icon: 'assignment_late' },
  pending_post_flight_review: { label: 'Post-Flight Review',     color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/20',  icon: 'rate_review' },
  needs_clarification:        { label: 'Needs Clarification',    color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20',  icon: 'help' },
  post_flight_approved:       { label: 'Flight Approved',        color: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/20',   icon: 'verified' },
  completed:                  { label: 'Completed',              color: 'text-slate-400',   bg: 'bg-white/5',        border: 'border-white/10',       icon: 'done_all' },
}

const VERIFICATION_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  verified:       { label: 'Verified',       color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  pending_review: { label: 'Pending Review', color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  rejected:       { label: 'Rejected',       color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20' },
  on_hold:        { label: 'On Hold',        color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20' },
  not_started:    { label: 'Unverified',     color: 'text-slate-400',   bg: 'bg-white/5',        border: 'border-white/10' },
}

// Human-readable labels for block_type values (admin context).
const BLOCK_TYPE_LABEL: Record<string, string> = {
  customer_booking: 'Flight Block',
  buffer:           'Buffer',
  temporary_hold:   'Temp Hold',
  maintenance:      'Maintenance',
  admin_unavailable:'Admin Block',
  owner_use:        'Owner Use',
}

// ── Page ──────────────────────────────────────────────────────────────────────

type PageProps = { params: { id: string } }

type ScheduleBlockRow = {
  id: string
  block_type: string
  start_time: string
  end_time: string
  status: string
  expires_at?: string | null
  related_booking_id: string | null
  public_label: string | null
  internal_reason: string | null
}

export default async function AdminBookingDetailPage({ params }: PageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  // Fetch booking — includes aircraft_id for slot queries
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select(`
      id,
      booking_reference,
      created_at,
      updated_at,
      scheduled_start,
      scheduled_end,
      status,
      pic_name,
      pic_arn,
      estimated_hours,
      estimated_amount,
      customer_notes,
      admin_notes,
      booking_owner_user_id,
      pic_user_id,
      aircraft_id,
      aircraft ( id, registration, aircraft_type, default_hourly_rate, default_preflight_buffer_minutes, default_postflight_buffer_minutes )
    `)
    .eq('id', params.id)
    .single()

  if (bookingError) console.error('[AdminBookingDetailPage] booking query error:', bookingError)
  if (!booking) notFound()

  const aircraft = Array.isArray(booking.aircraft) ? booking.aircraft[0] : booking.aircraft

  // Compute the buffer-expanded window to match the held slot precisely.
  // Buffer values on the aircraft record are used for display; the action
  // derives the window from the actual own-block times (historical buffers).
  // For the detail page approximation, current aircraft buffer values are fine.
  const preBufferMs  = ((aircraft as { default_preflight_buffer_minutes?: number } | null)?.default_preflight_buffer_minutes  ?? 0) * 60_000
  const postBufferMs = ((aircraft as { default_postflight_buffer_minutes?: number } | null)?.default_postflight_buffer_minutes ?? 0) * 60_000
  const expandedWindowStart = new Date(new Date(booking.scheduled_start).getTime() - preBufferMs).toISOString()
  const expandedWindowEnd   = new Date(new Date(booking.scheduled_end).getTime()   + postBufferMs).toISOString()

  // All parallel fetches — customer profile, status history, slot data
  const [
    { data: customer },
    { data: rawHistory },
    { data: ownBlocks },
    { data: overlappingRaw },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, verification_status, pilot_arn, created_at')
      .eq('id', booking.booking_owner_user_id)
      .single(),
    supabase
      .from('booking_status_history')
      .select('new_status, old_status, note, created_at, changed_by_user_id')
      .eq('booking_id', booking.id)
      .order('created_at', { ascending: true }),
    // Blocks owned by this booking (all statuses — shows held vs released)
    supabase
      .from('schedule_blocks')
      .select('id, block_type, start_time, end_time, status, related_booking_id, public_label, internal_reason')
      .eq('related_booking_id', booking.id)
      .order('start_time'),
    // All active blocks for this aircraft overlapping the full held window
    // (flight time + buffer zones). Used to detect external conflicts.
    supabase
      .from('schedule_blocks')
      .select('id, block_type, start_time, end_time, status, expires_at, related_booking_id, public_label, internal_reason')
      .eq('aircraft_id', booking.aircraft_id)
      .eq('status', 'active')
      .lt('start_time', expandedWindowEnd)
      .gt('end_time', expandedWindowStart)
      .order('start_time'),
  ])

  // External conflicts: active blocks in the held window NOT belonging to this booking.
  // Expired temporary holds are excluded — same rule as the submission RPC and confirm action.
  const nowDate = new Date()
  const externalConflicts = ((overlappingRaw ?? []) as ScheduleBlockRow[]).filter(b => {
    if (b.related_booking_id === booking.id) return false
    if (b.block_type === 'temporary_hold' && b.expires_at != null && new Date(b.expires_at) <= nowDate) return false
    return true
  })

  const status        = booking.status as string
  const statusCfg     = STATUS_CFG[status] ?? {
    label:  status.replace(/_/g, ' '),
    color:  'text-slate-400',
    bg:     'bg-white/5',
    border: 'border-white/10',
    icon:   'info',
  }
  const verCfg        = VERIFICATION_CFG[customer?.verification_status ?? 'not_started'] ?? VERIFICATION_CFG.not_started
  const bookingRef    = (booking as { booking_reference?: string }).booking_reference
    ?? booking.id.split('-')[0].toUpperCase()
  const statusHistory = rawHistory ?? []
  const isPending            = status === 'pending_confirmation'
  const isClarificationState = status === 'needs_clarification'
  // Statuses where the dispatch/operational action panel is shown
  const OPERATIONAL_STATUSES = ['confirmed', 'ready_for_dispatch', 'dispatched', 'post_flight_approved']
  const isOperational        = OPERATIONAL_STATUSES.includes(status)
  // Clarification can be requested from pending or confirmed
  const canRequestClarification = status === 'pending_confirmation' || status === 'confirmed'
  // Extract the most recent admin clarification question for display
  const clarificationQuestion = [...statusHistory]
    .reverse()
    .find(r => r.new_status === 'needs_clarification')?.note ?? null
  // Extract the most recent customer clarification response for display
  const clarificationResponse = [...statusHistory]
    .reverse()
    .find(r => r.old_status === 'needs_clarification' && r.new_status === 'pending_confirmation')?.note ?? null

  const activeOwnBlocks = ((ownBlocks ?? []) as ScheduleBlockRow[]).filter(b => b.status === 'active')
  const slotHeld        = activeOwnBlocks.length > 0
  const hasConflict     = externalConflicts.length > 0

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24">

      {/* Back link */}
      <Link
        href="/admin/bookings/requests"
        className="inline-flex items-center gap-1 text-slate-400 hover:text-[#a7c8ff] text-sm mb-8 transition-colors"
      >
        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
        Booking Requests
      </Link>

      {/* Header card */}
      <header className="mb-10 bg-[#0c1326]/40 border border-white/5 rounded-2xl p-8 relative overflow-hidden">
        <span
          className="material-symbols-outlined text-[130px] absolute -right-4 -bottom-8 text-white/[0.03] pointer-events-none select-none"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          flight_takeoff
        </span>
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-start justify-between gap-6">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-[#a7c8ff]/40 mb-1">
              Booking Reference
            </p>
            <p className="text-xl font-mono font-bold text-white tracking-wider mb-3">{bookingRef}</p>
            <h1 className="font-serif text-3xl font-light text-[#e2e2e6]">
              {(aircraft as { registration?: string } | null)?.registration ?? '—'}
            </h1>
            <p className="text-slate-500 text-sm mt-1 capitalize">
              {(aircraft as { aircraft_type?: string } | null)?.aircraft_type?.replace(/_/g, ' ') ?? '—'}
            </p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${statusCfg.color} ${statusCfg.bg} ${statusCfg.border}`}>
              <span
                className={`material-symbols-outlined text-[14px] ${statusCfg.color}`}
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {statusCfg.icon}
              </span>
              {statusCfg.label}
            </span>
            <p className="text-[10px] text-slate-600 font-mono">
              Submitted {formatDateTime(booking.created_at)}
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* ── Left column: details ─────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Flight details */}
          <div className="bg-white/5 border border-white/5 rounded-2xl p-6">
            <h2 className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-5">
              Flight Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
              <div>
                <p className="text-[9px] uppercase tracking-widest text-slate-600 mb-1">Scheduled Start</p>
                <p className="text-sm text-white tabular-nums">{formatDateTime(booking.scheduled_start)}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-widest text-slate-600 mb-1">Scheduled End</p>
                <p className="text-sm text-white tabular-nums">{formatDateTime(booking.scheduled_end)}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-widest text-slate-600 mb-1">Estimated Duration</p>
                <p className="text-sm text-white">{booking.estimated_hours?.toFixed(1) ?? '—'} hrs</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-widest text-slate-600 mb-1">Estimated Amount</p>
                <p className="text-sm text-white font-mono">
                  ${booking.estimated_amount?.toFixed(2) ?? '—'} AUD
                </p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-widest text-slate-600 mb-1">Pilot in Command</p>
                <p className="text-sm text-white">{booking.pic_name || '—'}</p>
              </div>
              {booking.pic_arn && (
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-slate-600 mb-1">ARN</p>
                  <p className="text-sm text-white font-mono">{booking.pic_arn}</p>
                </div>
              )}
            </div>

            {booking.customer_notes && (
              <div className="mt-6 pt-5 border-t border-white/5">
                <p className="text-[9px] uppercase tracking-widest text-slate-600 mb-2">Customer Notes</p>
                <p className="text-sm text-slate-300 leading-relaxed italic">
                  &quot;{booking.customer_notes}&quot;
                </p>
              </div>
            )}

            {booking.admin_notes && status === 'cancelled' && (
              <div className="mt-5 p-4 rounded-xl bg-rose-500/[0.06] border border-rose-500/15">
                <p className="text-[9px] uppercase tracking-widest text-rose-400/60 mb-2">Cancellation Reason</p>
                <p className="text-sm text-rose-300/80 leading-relaxed">{booking.admin_notes}</p>
              </div>
            )}
          </div>

          {/* Customer details */}
          <div className="bg-white/5 border border-white/5 rounded-2xl p-6">
            <h2 className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-5">
              Customer
            </h2>
            <div className="flex items-start justify-between gap-6">
              <div className="space-y-4 flex-1 min-w-0">
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-slate-600 mb-1">Full Name</p>
                  <p className="text-sm text-white font-medium">{customer?.full_name || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-slate-600 mb-1">Email</p>
                  <p className="text-sm text-slate-300 break-all">{customer?.email || '—'}</p>
                </div>
                {customer?.pilot_arn && (
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-slate-600 mb-1">Pilot ARN</p>
                    <p className="text-sm text-slate-300 font-mono">{customer.pilot_arn}</p>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-3 flex-shrink-0">
                <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${verCfg.color} ${verCfg.bg} ${verCfg.border}`}>
                  {verCfg.label}
                </span>
                {customer?.id && (
                  <Link
                    href={`/admin/users/${customer.id}`}
                    className="text-[10px] text-[#a7c8ff]/50 hover:text-[#a7c8ff] transition-colors"
                  >
                    View full profile →
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Status history */}
          {statusHistory.length > 0 && (
            <div className="bg-white/5 border border-white/5 rounded-2xl p-6">
              <h2 className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-6">
                Status History
              </h2>
              <ol className="space-y-0">
                {statusHistory.map((row, idx) => {
                  const cfg = STATUS_CFG[row.new_status] ?? {
                    label:  row.new_status.replace(/_/g, ' '),
                    color:  'text-slate-400',
                    bg:     'bg-white/5',
                    border: 'border-white/10',
                    icon:   'info',
                  }
                  const isLast = idx === statusHistory.length - 1
                  return (
                    <li key={idx} className="flex gap-4 relative pb-5 last:pb-0">
                      {!isLast && (
                        <div className="absolute left-[11px] top-6 bottom-0 w-[2px] bg-white/[0.07]" />
                      )}
                      <div
                        className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center z-10 mt-0.5 ${cfg.bg} border ${cfg.border}`}
                      >
                        <span
                          className={`material-symbols-outlined text-[12px] ${cfg.color}`}
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          {cfg.icon}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <p className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</p>
                          <p className="text-[10px] text-slate-600 font-mono flex-shrink-0 tabular-nums">
                            {new Date(row.created_at).toLocaleDateString('en-AU', {
                              timeZone: 'Australia/Sydney',
                              day:      'numeric',
                              month:    'short',
                              year:     'numeric',
                            })}
                          </p>
                        </div>
                        {row.note && (
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{row.note}</p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}

        </div>

        {/* ── Right column: actions, slot status, summary ───────────────────────── */}
        <div>
          <div className="sticky top-24 space-y-4">

            {/* Admin actions — confirm/cancel while pending */}
            {isPending && (
              <div className="bg-[#111316] border border-[#a7c8ff]/10 rounded-2xl p-6">
                <h2 className="text-[9px] uppercase tracking-widest font-bold text-[#a7c8ff]/50 mb-4">
                  Admin Actions
                </h2>
                <AdminBookingActions bookingId={booking.id} />
              </div>
            )}

            {/* Waiting for clarification response */}
            {isClarificationState && (
              <div className="bg-orange-500/[0.06] border border-orange-500/20 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse flex-shrink-0" />
                  <h2 className="text-[9px] uppercase tracking-widest font-bold text-orange-400/70">
                    Awaiting Customer Response
                  </h2>
                </div>
                {clarificationQuestion && (
                  <div className="mt-2">
                    <p className="text-[9px] uppercase tracking-widest text-slate-600 mb-1">Your question</p>
                    <p className="text-xs text-slate-300 leading-relaxed italic">
                      &quot;{clarificationQuestion}&quot;
                    </p>
                  </div>
                )}
                <p className="text-[10px] text-slate-600 mt-3 leading-relaxed">
                  Customer has been notified. The slot remains held. No further action needed until they respond.
                </p>
              </div>
            )}

            {/* Clarification form — available from pending or confirmed */}
            {canRequestClarification && (
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5">
                <h2 className="text-[9px] uppercase tracking-widest font-bold text-slate-600 mb-3">
                  Need More Information?
                </h2>
                <AdminClarificationForm bookingId={booking.id} />
              </div>
            )}

            {/* Customer clarification response — shown on admin side after response received */}
            {clarificationResponse && status === 'pending_confirmation' && (
              <div className="bg-white/5 border border-white/5 rounded-2xl p-5">
                <p className="text-[9px] uppercase tracking-widest text-slate-600 mb-2">Customer Clarification Response</p>
                <p className="text-xs text-slate-300 leading-relaxed italic">
                  &quot;{clarificationResponse}&quot;
                </p>
              </div>
            )}

            {/* ── Operational dispatch panel ───────────────────────────────────── */}
            {isOperational && (
              <div className="bg-[#111316] border border-white/10 rounded-2xl p-6">
                <h2 className="text-[9px] uppercase tracking-widest font-bold text-slate-500 mb-4">
                  Operational Actions
                </h2>
                <AdminOperationalActions bookingId={booking.id} status={status} />
              </div>
            )}

            {/* ── Slot Reservation panel ────────────────────────────────────────── */}
            {/*
              Source of truth: schedule_blocks table, status='active'.
              Blocks are created atomically at pending_confirmation and released on cancel.
              Confirmation is a status-only change — blocks are unchanged.
            */}
            <div className={`rounded-2xl p-5 border ${
              hasConflict
                ? 'bg-amber-500/[0.05] border-amber-500/20'
                : slotHeld
                  ? 'bg-white/5 border-white/5'
                  : 'bg-white/[0.02] border-white/5'
            }`}>
              <div className="flex items-center gap-2 mb-4">
                <span
                  className={`material-symbols-outlined text-[16px] ${
                    hasConflict ? 'text-amber-400' : slotHeld ? 'text-emerald-400' : 'text-slate-600'
                  }`}
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {hasConflict ? 'warning' : slotHeld ? 'lock_clock' : 'lock_open'}
                </span>
                <h2 className="text-[9px] uppercase tracking-widest font-bold text-slate-500">
                  Slot Reservation
                </h2>
              </div>

              {/* Slot state */}
              {slotHeld ? (
                <p className={`text-[11px] font-medium mb-3 ${hasConflict ? 'text-amber-300' : 'text-emerald-400'}`}>
                  {hasConflict ? 'Slot held — conflict detected' : 'Slot held'}
                </p>
              ) : (
                <p className="text-[11px] font-medium text-slate-500 mb-3">
                  {status === 'cancelled' ? 'Slot released (cancelled)' : 'No active slot blocks found'}
                </p>
              )}

              {/* This booking's own blocks */}
              {activeOwnBlocks.length > 0 && (
                <div className="space-y-1.5 mb-4">
                  {activeOwnBlocks.map(b => (
                    <div key={b.id} className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="text-slate-500 flex items-center gap-1">
                        <span
                          className="material-symbols-outlined text-[11px] text-emerald-500/60"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          fiber_manual_record
                        </span>
                        {BLOCK_TYPE_LABEL[b.block_type] ?? b.block_type}
                      </span>
                      <span className="font-mono text-slate-400 tabular-nums">
                        {formatSydTime(b.start_time)} – {formatSydTime(b.end_time)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* External conflict warning */}
              {hasConflict && (
                <div className="mt-3 pt-3 border-t border-amber-500/15">
                  <p className="text-[10px] text-amber-400 font-medium mb-2">
                    {externalConflicts.length} overlapping block{externalConflicts.length > 1 ? 's' : ''} from other sources
                  </p>
                  <div className="space-y-1.5">
                    {externalConflicts.map(b => (
                      <div key={b.id} className="text-[10px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-amber-400/70">
                            {BLOCK_TYPE_LABEL[b.block_type] ?? b.block_type}
                          </span>
                          <span className="font-mono text-amber-400/60 tabular-nums">
                            {formatSydTime(b.start_time)} – {formatSydTime(b.end_time)}
                          </span>
                        </div>
                        {b.internal_reason && (
                          <p className="text-slate-600 mt-0.5 text-[9px] leading-relaxed">
                            {b.internal_reason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-[9px] text-slate-600 mt-3 leading-relaxed">
                    These blocks were placed after this booking was submitted, likely via an admin override.
                  </p>
                </div>
              )}

              {/* Source note */}
              <p className="text-[9px] text-slate-700 mt-4 pt-3 border-t border-white/5 leading-relaxed">
                Source: <span className="font-mono">schedule_blocks</span> — checked at submission via advisory-locked RPC.
              </p>
            </div>

            {/* Booking summary */}
            <div className="bg-white/5 border border-white/5 rounded-2xl p-5">
              <p className="text-[9px] uppercase tracking-widest font-bold text-slate-600 mb-4">
                Booking Summary
              </p>
              <div className="space-y-3">
                <div className="flex justify-between items-start gap-3">
                  <span className="text-[10px] text-slate-500">Reference</span>
                  <span className="text-[10px] text-white font-mono font-bold">{bookingRef}</span>
                </div>
                <div className="flex justify-between items-start gap-3">
                  <span className="text-[10px] text-slate-500">Aircraft</span>
                  <span className="text-[10px] text-slate-300">
                    {(aircraft as { registration?: string } | null)?.registration ?? '—'}
                  </span>
                </div>
                <div className="flex justify-between items-start gap-3">
                  <span className="text-[10px] text-slate-500">Hourly Rate</span>
                  <span className="text-[10px] text-slate-300">
                    ${(aircraft as { default_hourly_rate?: number } | null)?.default_hourly_rate?.toFixed(2) ?? '—'}/hr
                  </span>
                </div>
                <div className="flex justify-between items-start gap-3">
                  <span className="text-[10px] text-slate-500">Est. Amount</span>
                  <span className="text-[10px] text-blue-200 font-mono">
                    ${booking.estimated_amount?.toFixed(2) ?? '—'}
                  </span>
                </div>
                <div className="h-px bg-white/5" />
                <div className="flex justify-between items-start gap-3">
                  <span className="text-[10px] text-slate-500">Submitted</span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(booking.created_at).toLocaleDateString('en-AU', {
                      timeZone: 'Australia/Sydney',
                      day:      'numeric',
                      month:    'short',
                      year:     'numeric',
                    })}
                  </span>
                </div>
                <div className="flex justify-between items-start gap-3">
                  <span className="text-[10px] text-slate-500">Last Updated</span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(booking.updated_at).toLocaleDateString('en-AU', {
                      timeZone: 'Australia/Sydney',
                      day:      'numeric',
                      month:    'short',
                      year:     'numeric',
                    })}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick nav */}
            {!isPending && (
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 text-center">
                <Link
                  href="/admin/bookings/requests?status=pending_confirmation"
                  className="inline-flex items-center gap-1 text-[10px] text-[#a7c8ff]/60 hover:text-[#a7c8ff] transition-colors"
                >
                  <span className="material-symbols-outlined text-[12px]">arrow_back</span>
                  Pending queue
                </Link>
                <span className="mx-2 text-slate-700">·</span>
                <Link
                  href="/admin/bookings/requests?status=all"
                  className="inline-flex items-center gap-1 text-[10px] text-[#a7c8ff]/60 hover:text-[#a7c8ff] transition-colors"
                >
                  All bookings
                </Link>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  )
}
