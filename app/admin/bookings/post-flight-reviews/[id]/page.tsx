import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import FlightRecordApprovalForm from './FlightRecordApprovalForm'
import { formatDateTime } from '@/lib/formatDateTime'

export const metadata = { title: 'Review Detail | Admin' }

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
      aircraft ( id, registration, type, default_hourly_rate ),
      bookings ( scheduled_start, scheduled_end, customer_notes, booking_owner_user_id )
    `)
    .eq('id', params.id)
    .single()

  if (!record) {
    return <div className="p-10 text-white">Record not found.</div>
  }

  const aircraft = Array.isArray(record.aircraft) ? record.aircraft[0] : record.aircraft
  const booking = Array.isArray(record.bookings) ? record.bookings[0] : record.bookings

  const flags = Array.isArray(record.review_flags) ? record.review_flags : []
  const startStr = booking?.scheduled_start ? formatDateTime(booking.scheduled_start) : 'Unknown'
  const endStr = booking?.scheduled_end ? formatDateTime(booking.scheduled_end) : 'Unknown'

  // Estimate bill
  // We don't bill inside page render natively (done inside atomic), but we display what it will look like based on tacho usually.
  const estBill = record.tacho_total && aircraft?.default_hourly_rate 
    ? (record.tacho_total * aircraft.default_hourly_rate).toFixed(2) 
    : 'Unknown'

  return (
    <div className="p-10 max-w-7xl mx-auto">
      <Link href="/admin/bookings/post-flight-reviews" className="text-blue-400 hover:text-blue-300 text-sm mb-6 inline-flex items-center gap-1">
        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
        Back to Queue
      </Link>
      
      <header className="mb-12 mt-4">
        <h2 className="font-serif text-4xl font-light text-[#e2e2e6] tracking-tight">Post-Flight Verification</h2>
        <p className="text-slate-400 mt-2 font-light tracking-wide flex items-center gap-2">
          Approving flight metrics for <span className="px-2 py-0.5 rounded bg-blue-900/30 text-blue-200 border border-blue-500/20 font-medium text-xs">{aircraft?.registration || 'Unknown'}</span>
        </p>
        <div className="h-0.5 w-10 bg-[#44474c] mt-6" />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        
        {/* Left Column: Metrics Input */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Submission Info */}
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

          {/* Meter Readings Matrix */}
          <div className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden">
            <h3 className="text-lg font-light tracking-wide text-white px-6 py-5 bg-white/[0.02] border-b border-white/5">Meter Readings</h3>
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-[#111316]/50">
                <tr className="border-b border-white/5 text-slate-500">
                  <th className="px-6 py-4 font-normal">Type</th>
                  <th className="px-6 py-4 font-normal text-right">Start</th>
                  <th className="px-6 py-4 font-normal text-right">Target / Stop</th>
                  <th className="px-6 py-4 font-normal text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr>
                  <td className="px-6 py-4 font-medium text-slate-300">Tacho</td>
                  <td className="px-6 py-4 text-right tabular-nums">{record.tacho_start ?? '—'}</td>
                  <td className="px-6 py-4 text-right tabular-nums">{record.tacho_stop ?? '—'}</td>
                  <td className="px-6 py-4 text-right tabular-nums font-bold text-blue-200">{record.tacho_total ?? '—'}</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium text-slate-300">VDO</td>
                  <td className="px-6 py-4 text-right tabular-nums">{record.vdo_start ?? '—'}</td>
                  <td className="px-6 py-4 text-right tabular-nums">{record.vdo_stop ?? '—'}</td>
                  <td className="px-6 py-4 text-right tabular-nums font-bold text-blue-200">{record.vdo_total ?? '—'}</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium text-slate-300">Air Switch</td>
                  <td className="px-6 py-4 text-right tabular-nums">{record.air_switch_start ?? '—'}</td>
                  <td className="px-6 py-4 text-right tabular-nums">{record.air_switch_stop ?? '—'}</td>
                  <td className="px-6 py-4 text-right tabular-nums font-bold text-blue-200">{record.air_switch_total ?? '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white/5 border border-white/5 rounded-2xl p-6">
              <h3 className="text-xs font-light tracking-widest text-slate-400 uppercase mb-4">Consumables</h3>
              <div className="space-y-3">
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-sm text-slate-400">Oil Added</span>
                  <span className="text-sm text-white">{record.oil_added ?? '0'} qts</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-sm text-slate-400">Fuel Actual</span>
                  <span className="text-sm text-white">{record.fuel_actual ?? '0'} L</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-sm text-slate-400">Landings</span>
                  <span className="text-sm text-white">{record.landings ?? '0'}</span>
                </div>
              </div>
            </div>
            
            <div className="bg-white/5 border border-white/5 rounded-2xl p-6">
              <h3 className="text-xs font-light tracking-widest text-slate-400 uppercase mb-4">System Flags</h3>
              {flags.length > 0 ? (
                <div className="space-y-3">
                  {flags.map((flag: any, idx: number) => (
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

        {/* Right Column: Admin Actions */}
        <div>
          <div className="sticky top-10">
            <div className="bg-[#1a1c21] rounded-3xl border border-blue-500/20 p-8 shadow-2xl">
              <div className="mb-8">
                <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold uppercase tracking-wider">
                  Admin Verification
                </span>
                <h3 className="font-serif text-2xl mt-4 text-white">Review & Commit</h3>
                <p className="text-sm text-slate-400 mt-2">
                  Finalizing this review will permanently log official meter offsets and generate booking billing details.
                </p>
              </div>

              {/* Estimate Display */}
              <div className="bg-[#0a0b0d] rounded-2xl p-6 border border-white/5 mb-8 text-center">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Estimated Tacho Billing</p>
                <div className="text-4xl font-serif text-blue-200 mb-1">${estBill}</div>
                <p className="text-xs text-slate-500">Subject to actual aircraft setup parameters.</p>
              </div>

              <FlightRecordApprovalForm flightRecordId={record.id} />
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
