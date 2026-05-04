import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import FlightRecordApprovalForm from './FlightRecordApprovalForm'
import RequestClarificationFormWrapper from './RequestClarificationFormWrapper'
import { formatDateTime } from '@/lib/formatDateTime'
import type { FlightRecordClarification, FlightRecordAttachment } from '@/lib/supabase/booking-types'

export const metadata = { title: 'Review Detail | Admin' }

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending_review:     { label: 'Pending Review',     cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20'   },
  needs_clarification:{ label: 'Needs Clarification', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  resubmitted:        { label: 'Resubmitted',         cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
}

export default async function AdminPostFlightReviewDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: record } = await supabase
    .from('flight_records')
    .select(`
      *,
      aircraft ( id, registration, aircraft_type, default_hourly_rate ),
      bookings ( id, scheduled_start, scheduled_end, customer_notes, booking_owner_user_id, booking_reference )
    `)
    .eq('id', params.id)
    .single()

  if (!record) {
    return <div className="p-10 text-white">Record not found.</div>
  }

  const aircraft = Array.isArray(record.aircraft) ? record.aircraft[0] : record.aircraft
  const booking  = Array.isArray(record.bookings)  ? record.bookings[0]  : record.bookings
  const customerId    = booking?.booking_owner_user_id ?? null
  const bookingId     = booking?.id ?? null
  const bookingRef    = booking?.booking_reference ?? null

  // Fetch latest open clarification (if any)
  const { data: clarifications } = await supabase
    .from('flight_record_clarifications')
    .select('*')
    .eq('flight_record_id', record.id)
    .order('created_at', { ascending: false })
    .limit(5)

  const latestOpen = (clarifications ?? []).find(
    (c: FlightRecordClarification) => !c.is_resolved,
  ) ?? null

  const flags     = Array.isArray(record.review_flags) ? record.review_flags : []
  const startStr  = booking?.scheduled_start ? formatDateTime(booking.scheduled_start) : 'Unknown'
  const endStr    = booking?.scheduled_end   ? formatDateTime(booking.scheduled_end)   : 'Unknown'
  const estBill   = record.tacho_total && aircraft?.default_hourly_rate
    ? (record.tacho_total * aircraft.default_hourly_rate).toFixed(2)
    : 'Unknown'

  const statusBadge = STATUS_BADGE[record.status] ?? {
    label: record.status,
    cls:   'bg-white/5 text-slate-400 border-white/10',
  }

  // Fetch evidence attachments + generate signed URLs (1-hour expiry)
  const { data: rawAttachments } = await supabase
    .from('flight_record_attachments')
    .select('*')
    .eq('flight_record_id', record.id)
    .order('created_at', { ascending: true })

  type AttachmentWithUrl = FlightRecordAttachment & { signedUrl: string | null }
  const attachments: AttachmentWithUrl[] = await Promise.all(
    (rawAttachments ?? []).map(async (att: FlightRecordAttachment) => {
      const { data } = await supabase.storage
        .from('flight_record_evidence')
        .createSignedUrl(att.storage_path, 3600)
      return { ...att, signedUrl: data?.signedUrl ?? null }
    }),
  )

  const canRequestClarification = ['pending_review', 'resubmitted'].includes(record.status)
  const awaitingCustomer         = record.status === 'needs_clarification'

  return (
    <div className="p-10 max-w-7xl mx-auto">
      <Link href="/admin/bookings/post-flight" className="text-blue-400 hover:text-blue-300 text-sm mb-6 inline-flex items-center gap-1">
        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
        Back to Queue
      </Link>

      <header className="mb-10 mt-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-4xl font-light text-[#e2e2e6] tracking-tight">Post-Flight Verification</h2>
            <p className="text-slate-400 mt-2 font-light tracking-wide flex items-center gap-2">
              Approving flight metrics for{' '}
              <span className="px-2 py-0.5 rounded bg-blue-900/30 text-blue-200 border border-blue-500/20 font-medium text-xs">
                {aircraft?.registration || 'Unknown'}
              </span>
            </p>
          </div>
          {/* Status badge + conversation link */}
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${statusBadge.cls}`}>
              {statusBadge.label}
            </span>
            {customerId && (
              <Link
                href={`/admin/users/${customerId}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-white/10 hover:border-white/20 text-slate-400 hover:text-white rounded-lg text-xs font-medium transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">chat</span>
                Open Conversation
              </Link>
            )}
          </div>
        </div>
        {bookingRef && (
          <p className="text-[10px] text-slate-600 uppercase tracking-widest mt-3 font-mono">{bookingRef}</p>
        )}
        <div className="h-0.5 w-10 bg-[#44474c] mt-4" />
      </header>

      {/* Awaiting customer banner */}
      {awaitingCustomer && latestOpen && (
        <div className="mb-8 p-5 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex gap-4">
          <span className="material-symbols-outlined text-amber-400 text-xl flex-shrink-0 mt-0.5">hourglass_empty</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-300 mb-1">Awaiting customer response</p>
            <p className="text-xs text-slate-400 mb-3">
              A clarification request was sent. The flight record is locked until the customer resubmits.
            </p>
            <div className="bg-amber-500/[0.06] border border-amber-500/15 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400/60">Category</span>
                <span className="text-xs text-amber-300/80 font-medium">{latestOpen.category}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400/60 block mb-1">Message sent</span>
                <p className="text-sm text-slate-300 leading-relaxed">{latestOpen.message}</p>
              </div>
              <p className="text-[10px] text-slate-600">
                Sent {new Date(latestOpen.created_at).toLocaleDateString('en-AU', {
                  timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: 'numeric',
                })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Resubmitted banner */}
      {record.status === 'resubmitted' && (
        <div className="mb-8 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-3">
          <span className="material-symbols-outlined text-emerald-400 text-lg">refresh</span>
          <p className="text-sm text-emerald-300">
            Customer has resubmitted this flight record for review. Please check the updated readings below.
          </p>
        </div>
      )}

      {/* Clarification history */}
      {clarifications && clarifications.length > 0 && (
        <div className="mb-8 bg-white/5 border border-white/5 rounded-2xl p-6">
          <h3 className="text-xs font-light tracking-widest text-slate-400 uppercase mb-4">Clarification History</h3>
          <div className="space-y-3">
            {(clarifications as FlightRecordClarification[]).map((c, i) => (
              <div key={c.id} className={`p-4 rounded-xl border text-sm ${c.is_resolved ? 'bg-white/[0.02] border-white/5 opacity-60' : 'bg-amber-500/[0.04] border-amber-500/15'}`}>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${c.is_resolved ? 'text-slate-500' : 'text-amber-400'}`}>
                    {i === 0 ? 'Latest' : `Cycle ${clarifications.length - i}`} · {c.category}
                  </span>
                  {c.is_resolved && (
                    <span className="text-[10px] text-emerald-500/70 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">check</span>
                      Resolved
                    </span>
                  )}
                </div>
                <p className="text-slate-300">{c.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">

        {/* Left: Flight metrics */}
        <div className="lg:col-span-2 space-y-6">

          <div className="bg-white/5 border border-white/5 rounded-2xl p-6">
            <h3 className="text-lg font-light tracking-wide text-white mb-6">Flight Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Date</p>
                <p className="text-sm border-b border-white/10 pb-2 tabular-nums">{record.date}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">PIC Name</p>
                <p className="text-sm border-b border-white/10 pb-2">{record.pic_name || '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Scheduled Window</p>
                <p className="text-sm border-b border-white/10 pb-2 tabular-nums text-slate-300">
                  {startStr} &mdash; {endStr}
                </p>
              </div>
            </div>
            {record.customer_notes && (
              <div className="mt-6 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-2">Customer Remarks</p>
                <p className="text-sm text-slate-300 italic">&quot;{record.customer_notes}&quot;</p>
              </div>
            )}
          </div>

          <div className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden">
            <h3 className="text-lg font-light tracking-wide text-white px-6 py-5 bg-white/[0.02] border-b border-white/5">Meter Readings</h3>
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-[#111316]/50">
                <tr className="border-b border-white/5 text-slate-500">
                  <th className="px-6 py-4 font-normal">Type</th>
                  <th className="px-6 py-4 font-normal text-right">Start</th>
                  <th className="px-6 py-4 font-normal text-right">Stop</th>
                  <th className="px-6 py-4 font-normal text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {[
                  { label: 'Tacho',      start: record.tacho_start,      stop: record.tacho_stop,      total: record.tacho_total      },
                  { label: 'VDO',        start: record.vdo_start,        stop: record.vdo_stop,        total: record.vdo_total        },
                  { label: 'Air Switch', start: record.air_switch_start, stop: record.air_switch_stop, total: record.air_switch_total },
                ].map(row => (
                  <tr key={row.label}>
                    <td className="px-6 py-4 font-medium text-slate-300">{row.label}</td>
                    <td className="px-6 py-4 text-right tabular-nums">{row.start ?? '—'}</td>
                    <td className="px-6 py-4 text-right tabular-nums">{row.stop ?? '—'}</td>
                    <td className="px-6 py-4 text-right tabular-nums font-bold text-blue-200">{row.total ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Evidence Photos */}
          <div className="bg-white/5 border border-white/5 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xs font-light tracking-widest text-slate-400 uppercase">Evidence Photos</h3>
              <span className="text-[10px] text-slate-600 uppercase tracking-widest">
                {attachments.length} file{attachments.length !== 1 ? 's' : ''}
              </span>
            </div>
            {attachments.length === 0 ? (
              <div className="h-20 flex items-center justify-center text-sm text-slate-600 bg-white/[0.02] rounded-xl border border-white/5">
                No evidence photos uploaded.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {attachments.map(att => (
                  <div key={att.id} className="group relative aspect-square rounded-xl overflow-hidden border border-white/10 bg-[#0a0c10]">
                    {att.signedUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={att.signedUrl}
                        alt={att.file_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="material-symbols-outlined text-slate-600 text-3xl">image_not_supported</span>
                      </div>
                    )}
                    {/* Hover overlay with filename */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-end">
                      <div className="w-full p-2 translate-y-full group-hover:translate-y-0 transition-transform">
                        <p className="text-[9px] text-white/80 truncate leading-tight">{att.file_name}</p>
                        <p className="text-[8px] text-white/40">
                          {new Date(att.created_at).toLocaleDateString('en-AU', {
                            timeZone: 'Australia/Sydney',
                            day: 'numeric', month: 'short',
                          })}
                          {att.file_size != null && ` · ${(att.file_size / 1024).toFixed(0)} KB`}
                        </p>
                      </div>
                    </div>
                    {/* Open in new tab */}
                    {att.signedUrl && (
                      <a
                        href={att.signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-lg bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <span className="material-symbols-outlined text-white text-[13px]">open_in_new</span>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white/5 border border-white/5 rounded-2xl p-6">
              <h3 className="text-xs font-light tracking-widest text-slate-400 uppercase mb-4">Consumables</h3>
              <div className="space-y-3">
                {[
                  { label: 'Oil Added',    val: record.oil_added   != null ? `${record.oil_added} qts`  : '—' },
                  { label: 'Fuel Actual',  val: record.fuel_actual != null ? `${record.fuel_actual} L`  : '—' },
                  { label: 'Landings',     val: record.landings    ?? '—' },
                ].map(({ label, val }) => (
                  <div key={label} className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-sm text-slate-400">{label}</span>
                    <span className="text-sm text-white">{val}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white/5 border border-white/5 rounded-2xl p-6">
              <h3 className="text-xs font-light tracking-widest text-slate-400 uppercase mb-4">System Flags</h3>
              {flags.length > 0 ? (
                <div className="space-y-3">
                  {flags.map((flag: { key: string; severity: string; message: string }, idx: number) => (
                    <div key={idx} className={`p-3 rounded-lg text-xs leading-relaxed ${flag.severity === 'error' ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20' : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'}`}>
                      <strong className="block uppercase tracking-wider mb-1">{flag.key.replace(/_/g, ' ')}</strong>
                      {flag.message}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-24 flex items-center justify-center text-sm text-slate-500 bg-white/[0.02] rounded-xl border border-white/5">
                  <span className="material-symbols-outlined text-emerald-500/50 mr-2 text-[20px]">verified</span>
                  No flags detected.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Admin actions */}
        <div>
          <div className="sticky top-10 space-y-4">

            {/* Approval panel — shown unless record is awaiting customer */}
            <div className="bg-[#1a1c21] rounded-3xl border border-blue-500/20 p-8 shadow-2xl">
              <div className="mb-8">
                <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold uppercase tracking-wider">
                  Admin Verification
                </span>
                <h3 className="font-serif text-2xl mt-4 text-white">Review & Commit</h3>
                <p className="text-sm text-slate-400 mt-2">
                  {awaitingCustomer
                    ? 'Approval is locked pending customer resubmission. Use the clarification history above to track the open request.'
                    : 'Finalizing this review permanently logs official meter offsets and generates booking billing details.'}
                </p>
              </div>

              <div className="bg-[#0a0b0d] rounded-2xl p-6 border border-white/5 mb-8 text-center">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Estimated Tacho Billing</p>
                <div className="text-4xl font-serif text-blue-200 mb-1">${estBill}</div>
                <p className="text-xs text-slate-500">Subject to actual aircraft setup parameters.</p>
              </div>

              <FlightRecordApprovalForm
                flightRecordId={record.id}
                currentStatus={record.status}
              />

              {/* Request Clarification (only when not already awaiting) */}
              {!awaitingCustomer && canRequestClarification && customerId && bookingId && (
                <RequestClarificationFormWrapper
                  flightRecordId={record.id}
                  bookingId={bookingId}
                  customerId={customerId}
                />
              )}
            </div>

          </div>
        </div>

      </div>
    </div>
  )
}

