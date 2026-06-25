import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/formatDateTime'
import { FLIGHT_RECORD_REVIEW_STATUSES } from '@/lib/booking/status-constants'
import AdminPortalHero from '@/components/AdminPortalHero'
import { StatusPill } from '@/app/admin/components/AdminUi'

export const metadata = { title: 'Post-Flight Reviews | Admin' }

export default async function AdminPostFlightReviewsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  // Fetch flight records pending review
  const { data: records } = await supabase
    .from('flight_records')
    .select(`
      id,
      booking_id,
      date,
      pic_name,
      pic_arn,
      tacho_total,
      vdo_total,
      air_switch_total,
      add_to_mr,
      oil_added,
      fuel_returned,
      landings,
      review_flags,
      submitted_at,
      status,
      aircraft ( id, registration, aircraft_type )
    `)
    .in('status', FLIGHT_RECORD_REVIEW_STATUSES)
    .order('submitted_at', { ascending: true })

  return (
    <>
      <AdminPortalHero
        eyebrow="Bookings"
        title="Post-Flight Reviews"
        subtitle="Queue of submitted flight records requiring administrative verification and meter confirmation."
      />

      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24">
        {(!records || records.length === 0) ? (
          <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] px-6 py-14 text-center shadow-[var(--admin-shadow-panel)]">
            <span
              className="material-symbols-outlined text-4xl mb-3 text-[var(--admin-text-muted)] block"
              style={{ fontVariationSettings: "'wght' 200" }}
            >
              assignment_turned_in
            </span>
            <p className="text-[var(--admin-text)] font-medium">All caught up. No pending reviews in the queue.</p>
            <p className="mt-2 text-sm text-[var(--admin-text-muted)]">
              New post-flight records will appear here for administrative verification.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] shadow-[var(--admin-shadow-panel)]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-white/[0.02] text-[var(--admin-text-muted)]">
                  <tr className="border-b border-[var(--admin-divider)] font-medium">
                    <th className="px-5 py-4 font-medium">Aircraft</th>
                    <th className="px-5 py-4 font-medium">Status</th>
                    <th className="px-5 py-4 font-medium">Date Submitted</th>
                    <th className="px-5 py-4 font-medium">PIC</th>
                    <th className="px-5 py-4 font-medium text-right">Tacho</th>
                    <th className="px-5 py-4 font-medium text-right">VDO</th>
                    <th className="px-5 py-4 font-medium text-right">Air Switch</th>
                    <th className="px-5 py-4 font-medium text-right">Landings</th>
                    <th className="px-5 py-4 font-medium text-center">Flags</th>
                    <th className="px-5 py-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--admin-divider)]">
                  {records.map(record => {
                    const aircraft = Array.isArray(record.aircraft) ? record.aircraft[0] : record.aircraft
                    const submittedStr = formatDateTime(record.submitted_at)

                    const flagCount = Array.isArray(record.review_flags) ? record.review_flags.length : 0

                    const statusPill =
                      record.status === 'pending_review' ? <StatusPill label="Pending" tone="blue" /> :
                      record.status === 'needs_clarification' ? <StatusPill label="Awaiting Customer" tone="amber" /> :
                      record.status === 'resubmitted' ? <StatusPill label="Resubmitted" tone="green" /> :
                      <StatusPill label={record.status.replace(/_/g, ' ')} tone="slate" />

                    return (
                      <tr key={record.id} className="text-[var(--admin-text-muted)] hover:bg-[#f6f9fd] transition-colors">
                        <td className="px-5 py-4 font-medium text-[var(--admin-text)]">
                          {aircraft?.registration || 'Unknown'}
                          {aircraft?.aircraft_type ? (
                            <div className="mt-1 text-[11px] font-normal text-[var(--admin-text-muted)]">
                              {aircraft.aircraft_type}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-5 py-4">
                          {statusPill}
                        </td>
                        <td className="px-5 py-4 tabular-nums text-[var(--admin-text)]">
                          {submittedStr}
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-[var(--admin-text)]">{record.pic_name || '—'}</div>
                          {record.pic_arn ? <div className="text-[11px] text-[var(--admin-text-muted)]">ARN: {record.pic_arn}</div> : null}
                        </td>
                        <td className="px-5 py-4 text-right tabular-nums text-[var(--admin-text)]">{record.tacho_total != null ? record.tacho_total : '—'}</td>
                        <td className="px-5 py-4 text-right tabular-nums text-[var(--admin-text)]">{record.vdo_total != null ? record.vdo_total : '—'}</td>
                        <td className="px-5 py-4 text-right tabular-nums text-[var(--admin-text)]">{record.air_switch_total != null ? record.air_switch_total : '—'}</td>
                        <td className="px-5 py-4 text-right tabular-nums text-[var(--admin-text)]">{record.landings != null ? record.landings : '—'}</td>

                        <td className="px-5 py-4 text-center">
                          {flagCount > 0 ? (
                            <span className="inline-flex items-center justify-center rounded-full border border-rose-400/25 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-700">
                              {flagCount} Alert{flagCount > 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center text-emerald-600">
                              <span className="material-symbols-outlined text-[18px]">check_circle</span>
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Link
                            href={`/admin/bookings/post-flight/${record.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(26,79,214,0.22)] bg-[rgba(26,79,214,0.08)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-[#1a4fd6] transition-colors hover:bg-[rgba(26,79,214,0.14)] hover:border-[rgba(26,79,214,0.32)]"
                          >
                            Review
                            <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
