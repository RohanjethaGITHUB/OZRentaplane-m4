import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const envLocal = fs.readFileSync('.env.local', 'utf8')
let supabaseUrl = ''
let serviceRoleKey = ''

for (const line of envLocal.split('\n')) {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '')
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) serviceRoleKey = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '')
}

async function run() {
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // 1. Fetch Aircraft
  const { data: aircraft, error: acErr } = await supabase.from('aircraft').select('*').eq('registration', 'VH-KZG').single()
  if (acErr) return console.error('Aircraft fetch err:', acErr)
  
  console.log('--- AIRCRAFT MATCH ---')
  console.log('ID:', aircraft.id, 'Registration:', aircraft.registration, 'Status:', aircraft.status)
  
  // 2. Fetch active Schedule Blocks for this aircraft
  const { data: blocks, error: bErr } = await supabase.from('schedule_blocks').select('*').eq('aircraft_id', aircraft.id).eq('status', 'active')
  if (bErr) return console.error('Blocks err:', bErr)

  console.log('\n--- ACTIVE SCHEDULE BLOCKS ---')
  blocks.forEach(b => {
    console.log(`[${b.block_type}] ${b.start_time} TO ${b.end_time}`)
    console.log(`  Visible: ${b.is_public_visible}, Reason: ${b.internal_reason}`)
  })
  
  // 3. Test the exact RPC
  console.log('\n--- RPC TEST ---')
  // We'll test a window around the first block we find, or right now if none
  const testStart = blocks.length > 0 ? new Date(blocks[0].start_time) : new Date()
  const testEnd = new Date(testStart.getTime() + 86400 * 1000)
  
  const rpcParams = {
    p_aircraft_id: aircraft.id,
    p_from: testStart.toISOString(),
    p_to: testEnd.toISOString()
  }
  
  console.log('RPC Params:', rpcParams)
  
  const { data: rpcData, error: rpcErr } = await supabase.rpc('get_customer_aircraft_calendar_blocks', rpcParams)
  
  if (rpcErr) {
    console.error('RPC ERROR:', rpcErr)
  } else {
    console.log('RPC RETURNED DATA:', rpcData)
  }
}

run()
