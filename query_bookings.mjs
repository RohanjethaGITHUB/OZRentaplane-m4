import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  const { data: stdBooking } = await supabase
    .from('bookings')
    .select('id, booking_type, booking_owner_user_id, status')
    .eq('booking_type', 'standard')
    .neq('id', 'c21b5ca0-2629-4a0a-ad85-21f3570ae6d1')
    .in('status', ['pending_post_flight_review', 'payment_pending', 'completed'])
    .limit(5);

  const { data: chkBooking } = await supabase
    .from('bookings')
    .select('id, booking_type, booking_owner_user_id, status')
    .eq('booking_type', 'checkout')
    .limit(5);

  console.log("Standard Bookings:", stdBooking);
  console.log("Checkout Bookings:", chkBooking);
}

main().catch(console.error);
