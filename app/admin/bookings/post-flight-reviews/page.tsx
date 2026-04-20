import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

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
      fuel_actual,
      landings,
      review_flags,
      submitted_at,
      status,
      aircraft ( id, registration, type )
    `)
    .in('status', ['submitted', 'pending_review', 'needs_clarification', 'resubmitted'])
    .order('submitted_at', { ascending: true })

  return (
    <div className="p-10 max-w-7xl mx-auto">
      <header className="mb-12">
        <h2 className="font-serif text-4xl font-light text-[#e2e2e6] tracking-tight">Post-Flight Reviews</h2>
        <p className="text-slate-400 mt-2 font-light tracking-wide">
          Queue of submitted flight records requiring administrative verification and meter confirmation.
        </p>
        <div className="h-0.5 w-10 bg-[#44474c] mt-6" />
      </header>

      {(!records || records.length === 0) ? (
        <div className="p-12 text-center text-slate-500 border border-white/5 rounded-2xl bg-white/5">
          <span className="material-symbols-outlined text-4xl mb-3 text-slate-600 block" style={{ fontVariationSettings: "'wght' 200" }}>assignment_turned_in</span>
          All caught up. No pending reviews in the queue.
        </div>
      ) : (
        <div className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-[#111316]">
                <tr className="border-b border-white/5 text-slate-500 font-medium">
                  <th className="px-6 py-4 font-normal">Aircraft</th>
                  <th className="px-6 py-4 font-normal">Date Submitted</th>
                  <th className="px-6 py-4 font-normal">PIC</th>
                  <th className="px-6 py-4 font-normal text-right">Tacho</th>
                  <th className="px-6 py-4 font-normal text-right">VDO</th>
                  <th className="px-6 py-4 font-normal text-right">Air Switch</th>
                  <th className="px-6 py-4 font-normal text-right">Landings</th>
                  <th className="px-6 py-4 font-normal text-center">Flags</th>
                  <th className="px-6 py-4 font-normal text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {records.map(record => {
                  const aircraft = Array.isArray(record.aircraft) ? record.aircraft[0] : record.aircraft
                  const submittedStr = new Date(record.submitted_at).toLocaleString('en-AU', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                  })
                  
                  // Parse flags
                  let flagCount = 0
                  if (Array.isArray(record.review_flags)) {
                    flagCount = record.review_flags.length
                  }

                  return (
                    <tr key={record.id} className="text-slate-300 hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 font-medium text-white flex items-center gap-2">
                        {aircraft?.registration || 'Unknown'}
                        {record.status === 'resubmitted' && (
                          <span className="w-2 h-2 rounded-full bg-amber-500" title="Resubmitted"></span>
                        )}
                      </td>
                      <td className="px-6 py-4 tabular-nums">{submittedStr}</td>
                      <td className="px-6 py-4">
                        <div className="text-white">{record.pic_name || '—'}</div>
                        {record.pic_arn && <div className="text-[10px] text-slate-500">ARN: {record.pic_arn}</div>}
                      </td>
                      <td className="px-6 py-4 text-right tabular-nums">{record.tacho_total != null ? record.tacho_total : '—'}</td>
                      <td className="px-6 py-4 text-right tabular-nums">{record.vdo_total != null ? record.vdo_total : '—'}</td>
                      <td className="px-6 py-4 text-right tabular-nums">{record.air_switch_total != null ? record.air_switch_total : '—'}</td>
                      <td className="px-6 py-4 text-right tabular-nums">{record.landings != null ? record.landings : '—'}</td>
                      
                      <td className="px-6 py-4 text-center">
                        {flagCount > 0 ? (
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            {flagCount} Alert{flagCount > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="text-emerald-500/50 material-symbols-outlined text-[16px]">check</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link 
                          href={`/admin/bookings/post-flight-reviews/${record.id}`}
                          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-medium transition-colors border border-blue-500"
                        >
                          Review
                          <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
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
  )
}
