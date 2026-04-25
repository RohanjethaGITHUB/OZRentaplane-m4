import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function DebugAvailabilityPage() {
  const supabase = await createClient()

  // 1. Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  // 1. Aircraft record
  const { data: aircraft, error: acError } = await supabase
    .from('aircraft')
    .select('*')
    .eq('registration', 'VH-KZG')
    .single()

  // 2. Latest 20 schedule blocks for VH-KZG
  let blocks: any[] = []
  let blocksError: any = null
  if (aircraft) {
    const res = await supabase
      .from('schedule_blocks')
      .select('*')
      .eq('aircraft_id', aircraft.id)
      .order('start_time', { ascending: false })
      .limit(20)
    blocks = res.data || []
    blocksError = res.error
  }

  // 3. Test RPC call
  // We simulate "2026-04-20T00:00:00+10:00" string bounds to represent Sydney days (April 20 to April 22)
  const pFrom = '2026-04-19T14:00:00.000Z' // Midnight 20th in Sydney
  const pTo = '2026-04-21T14:00:00.000Z' // Midnight 22nd in Sydney

  let rpcData: any = null
  let rpcError: any = null

  if (aircraft) {
    const res = await supabase.rpc('get_customer_aircraft_calendar_blocks', {
      p_aircraft_id: aircraft.id,
      p_from: pFrom,
      p_to: pTo,
    })
    rpcData = res.data
    rpcError = res.error
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 bg-black text-white min-h-screen">
      <h1 className="text-2xl font-bold text-red-500 mb-6 border-b border-red-500 pb-2">Admin Debug: Availability RPC</h1>

      <section>
        <h2 className="text-xl text-yellow-400 mb-4">1. Aircraft Record (VH-KZG)</h2>
        {acError ? (
          <pre className="p-4 bg-red-900/30 text-red-300 rounded overflow-auto border border-red-500/30">{JSON.stringify(acError, null, 2)}</pre>
        ) : (
          <pre className="p-4 bg-gray-900 text-green-300 rounded overflow-auto border border-gray-700">{JSON.stringify(aircraft, null, 2)}</pre>
        )}
      </section>

      <section>
        <h2 className="text-xl text-yellow-400 mb-4">2. Latest 20 Schedule Blocks</h2>
        {blocksError ? (
          <pre className="p-4 bg-red-900/30 text-red-300 rounded border border-red-500/30">{JSON.stringify(blocksError, null, 2)}</pre>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-400 mb-2">Total blocks found: {blocks.length}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-800 text-gray-400">
                  <tr>
                    <th className="p-2">ID</th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Public</th>
                    <th className="p-2">Start (UTC)</th>
                    <th className="p-2">End (UTC)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {blocks.map((b: any) => (
                    <tr key={b.id} className="hover:bg-gray-900">
                      <td className="p-2 font-mono text-gray-500 truncate max-w-xs">{b.id}</td>
                      <td className="p-2 text-yellow-300">{b.block_type} ({b.public_label || '-'})</td>
                      <td className="p-2 text-green-400">{b.status}</td>
                      <td className="p-2">{b.is_public_visible ? 'Yes' : 'No'}</td>
                      <td className="p-2 font-mono">{b.start_time}</td>
                      <td className="p-2 font-mono">{b.end_time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {blocks.slice(0, 3).map((b: any, idx: number) => (
               <details key={'d'+idx} className="bg-gray-900 p-2 text-xs rounded border border-gray-800">
                 <summary className="cursor-pointer text-blue-400">View exact JSON of most recent {idx + 1}</summary>
                 <pre className="mt-2 text-gray-300 whitespace-pre-wrap">{JSON.stringify(b, null, 2)}</pre>
               </details>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl text-yellow-400 mb-2">3. Customer Safe RPC Call</h2>
        <div className="mb-4 bg-gray-900 p-4 rounded text-sm text-gray-300 font-mono border border-gray-700">
          <p className="text-gray-500">get_customer_aircraft_calendar_blocks(</p>
          <p className="pl-4">p_aircraft_id: <span className="text-yellow-300">'{aircraft?.id}'</span>,</p>
          <p className="pl-4">p_from: <span className="text-green-300">'{pFrom}'</span>,</p>
          <p className="pl-4">p_to: <span className="text-green-300">'{pTo}'</span></p>
          <p className="text-gray-500">)</p>
        </div>

        {rpcError ? (
          <div>
             <h3 className="text-lg font-bold text-red-500">RPC Threw an Error!</h3>
             <pre className="p-4 bg-red-900/30 text-red-300 rounded overflow-auto border border-red-500/30 mt-2">{JSON.stringify(rpcError, null, 2)}</pre>
          </div>
        ) : (
          <div>
            <h3 className="text-lg font-bold text-green-500">RPC Succeeded (returned {rpcData?.length || 0} rows)</h3>
            <pre className="p-4 bg-gray-900 text-green-300 rounded overflow-auto border border-gray-700 mt-2">{JSON.stringify(rpcData, null, 2)}</pre>
          </div>
        )}
      </section>
    </div>
  )
}
