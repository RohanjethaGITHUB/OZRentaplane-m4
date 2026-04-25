import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Wait, I can't fetch schedule_blocks without auth.uid() if there is RLS.
  // I will just fetch Aircraft and try calling get_customer_aircraft_calendar_blocks
  
  const { data: aircraft, error: aErr } = await supabase.from('aircraft').select('id, registration').eq('registration', 'VH-KZG').single()
  
  if (aErr) return NextResponse.json({ error: aErr }, { status: 500 })

  const from = new Date()
  const to = new Date()
  to.setDate(to.getDate() + 60)

  // Wait! The RPC expects NO AUTH? The RPC has auth.uid() IS NULL.
  // To bypass, we could temporarily mock? No we can't.
  
  const { data: rpcData, error: rpcErr } = await supabase.rpc('get_customer_aircraft_calendar_blocks', {
    p_aircraft_id: aircraft.id,
    p_from: from.toISOString(),
    p_to: to.toISOString()
  })

  return NextResponse.json({
    aircraft,
    rpcData,
    rpcErr
  })
}
