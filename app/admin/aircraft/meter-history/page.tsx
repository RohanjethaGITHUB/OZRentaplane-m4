import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/formatDateTime'

export const metadata = { title: 'Meter History | Admin' }

export default async function AdminMeterHistoryPage({
  searchParams
}: {
  searchParams: { aircraftId?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  // Identify target aircraft
  let targetAircraftId = searchParams.aircraftId
  let aircraftData = null

  if (!targetAircraftId) {
    const { data: fallback } = await supabase.from('aircraft').select('id, registration').neq('status', 'inactive').limit(1).single()
    if (fallback) {
      targetAircraftId = fallback.id
      aircraftData = fallback
    }
  } else {
    const { data: specific } = await supabase.from('aircraft').select('id, registration').eq('id', targetAircraftId).single()
    if (specific) aircraftData = specific
  }

  if (!targetAircraftId) {
    return <div className="p-10 text-white">No active aircraft found.</div>
  }

  // Fetch meter history for target aircraft
  const { data: history } = await supabase
    .from('aircraft_meter_history')
    .select(`
      id,
      meter_type,
      start_reading,
      stop_reading,
      total,
      source_type,
      is_official,
      is_correction,
      approved_at,
      flight_records ( pic_name ),
      approved_by_profile:profiles!approved_by_user_id ( full_name )
    `)
    .eq('aircraft_id', targetAircraftId)
    .order('approved_at', { ascending: false })
    .limit(100)

  return (
    <div className="p-10 max-w-7xl mx-auto">
      <header className="mb-12">
        <h2 className="font-serif text-4xl font-light text-[#e2e2e6] tracking-tight">Meter History</h2>
        <p className="text-slate-400 mt-2 font-light tracking-wide flex items-center gap-2">
          Official aircraft meter log for <span className="px-2 py-0.5 rounded bg-blue-900/30 text-blue-200 border border-blue-500/20 font-medium text-xs">{aircraftData?.registration || 'Unknown'}</span>
        </p>
        <div className="h-0.5 w-10 bg-[#44474c] mt-6" />
      </header>

      {(!history || history.length === 0) ? (
        <div className="p-12 text-center text-slate-500 border border-white/5 rounded-2xl bg-white/5">
          <span className="material-symbols-outlined text-4xl mb-3 text-slate-600 block" style={{ fontVariationSettings: "'wght' 200" }}>history</span>
          No meter history is recorded for this aircraft.
        </div>
      ) : (
        <div className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-[#111316]">
                <tr className="border-b border-white/5 text-slate-500 font-medium">
                  <th className="px-6 py-4 font-normal">Approved At</th>
                  <th className="px-6 py-4 font-normal">Type</th>
                  <th className="px-6 py-4 font-normal text-right">Start</th>
                  <th className="px-6 py-4 font-normal text-right">Stop</th>
                  <th className="px-6 py-4 font-normal text-right whitespace-nowrap">Net Total</th>
                  <th className="px-6 py-4 font-normal">Source</th>
                  <th className="px-6 py-4 font-normal">Context</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {history.map(row => {
                  const aprvStr = formatDateTime(row.approved_at)
                  
                  const frData = Array.isArray(row.flight_records) ? row.flight_records[0] : row.flight_records
                  const adminData = Array.isArray(row.approved_by_profile) ? row.approved_by_profile[0] : row.approved_by_profile

                  return (
                    <tr key={row.id} className="text-slate-300 hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 tabular-nums">{aprvStr}</td>
                      <td className="px-6 py-4">
                        <span className="capitalize font-medium text-white">{row.meter_type.replace('_', ' ')}</span>
                      </td>
                      <td className="px-6 py-4 text-right tabular-nums">{row.start_reading.toFixed(2)}</td>
                      <td className="px-6 py-4 text-right tabular-nums">{row.stop_reading.toFixed(2)}</td>
                      <td className="px-6 py-4 text-right tabular-nums font-medium text-blue-300">
                        {row.is_correction && row.total < 0 ? '' : '+'}{row.total.toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          row.is_correction 
                            ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
                            : 'bg-white/5 text-slate-400 border border-white/5'
                        }`}>
                          {row.is_correction ? 'Correction' : row.source_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        <div>PIC: {frData?.pic_name || '—'}</div>
                        <div>Approved by {adminData?.full_name || 'Admin'}</div>
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
