const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
  const { data, error } = await supabase.from('bookings').select('id, booking_owner_user_id, profiles:booking_owner_user_id(id, first_name, last_name, full_name, email)').limit(1)
  console.log("With profiles:", data, error)
}
run()
