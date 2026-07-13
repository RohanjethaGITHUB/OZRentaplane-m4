import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  const { data: stdBooking } = await supabase
    .from('pilot_block_time_purchases')
    .select('id')
    .eq('user_id', 'b3398532-7436-4f6a-82c1-3c84d4fb1cfa')
    .eq('status', 'active');
  
  console.log("Active packages for b339...:", stdBooking);
}

main().catch(console.error);
