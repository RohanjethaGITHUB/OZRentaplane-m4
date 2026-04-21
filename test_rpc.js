const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envLocal = fs.readFileSync('.env.local', 'utf8');
const lines = envLocal.split('\n');
let supabaseUrl = '';
let serviceRoleKey = '';
let anonKey = '';

for (const line of lines) {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) serviceRoleKey = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) anonKey = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
}

async function run() {
  const key = serviceRoleKey || anonKey;
  if(!key) {
    console.error('No key found!');
    return;
  }
  const supabase = createClient(supabaseUrl, key);
  
  // Login with a test user to get around auth.uid() check?
  // Wait, I can't login without credentials.
  // Instead, let's just query schedule_blocks directly using anonymous key if RLS allows it? No, schedule blocks are secure.
  
  // If I have the serviceRoleKey, I can bypass RLS on tables.
  const { data: aircrafts, error: aErr } = await supabase.from('aircraft').select('id, registration');
  if (aErr) {
    console.log('Aircraft Fetch Error:', aErr);
    return;
  }
  
  if (!aircrafts || aircrafts.length === 0) {
    console.log('No aircraft found in database!');
    return;
  }
  const aircraft = aircrafts[0];
  console.log('Using Aircraft:', aircraft.registration, aircraft.id);

  const start = new Date();
  const end = new Date(start.getTime() + 86400 * 1000);

  const params = {
    p_aircraft_id: aircraft.id,
    p_from: start.toISOString(),
    p_to: end.toISOString()
  };
  
  console.log('Parameters:', params);

  const { data, error } = await supabase.rpc('get_customer_aircraft_calendar_blocks', params);

  if (error) {
    console.error('RPC Error:', JSON.stringify(error, null, 2));
  } else {
    console.log(`RPC returned ${data ? data.length : 0} blocks:`, data);
  }
}

run();
