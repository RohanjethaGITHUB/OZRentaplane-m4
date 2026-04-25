const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

async function test() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  // Use service role to inspect DB independently of RLS
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const supabase = createClient(supabaseUrl, supabaseKey)

  // 1. Get aircraft
  const { data: aircraft, error: acErr } = await supabase
    .from('aircraft')
    .select('*')
    .eq('registration', 'VH-KZG')
    .single()

  console.log('Aircraft:', acErr ? acErr : aircraft?.id)

  const pFrom = '2026-04-19T14:00:00.000Z'
  const pTo = '2026-04-21T14:00:00.000Z'

  // If using ANON key, the RPC might throw UNAUTHORIZED if auth.uid() is null.
  // We'll test with the admin token if we have it, or we try an RLS-bypassing direct select.
  const { data: dbBlocks, error: bErr } = await supabase
      .from('schedule_blocks')
      .select('*')
      .eq('aircraft_id', aircraft?.id)
  
  console.log('Total Schedule Blocks for VH-KZG:', dbBlocks?.length)
  console.log('Blocks:', dbBlocks?.map(b => ({
      id: b.id,
      type: b.block_type,
      start: b.start_time,
      end: b.end_time,
      public: b.is_public_visible
  })))

}

test()
