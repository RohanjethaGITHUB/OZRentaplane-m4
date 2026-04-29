'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Called when the customer opens the notification bell popover.
// Advances last_notification_seen_at so the unread badge resets.
export async function markNotificationsSeen() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('profiles')
    .update({ last_notification_seen_at: new Date().toISOString() })
    .eq('id', user.id)

  revalidatePath('/dashboard', 'layout')
}

// Called when the customer visits My Bookings.
// Advances last_bookings_viewed_at so the badge resets.
export async function markBookingsViewed() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('profiles')
    .update({ last_bookings_viewed_at: new Date().toISOString() })
    .eq('id', user.id)

  revalidatePath('/dashboard', 'layout')
}
