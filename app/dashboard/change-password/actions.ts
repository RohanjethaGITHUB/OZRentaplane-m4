'use server'

import { createClient } from '@/lib/supabase/server'

export async function markPasswordChanged(): Promise<{ success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('Unauthorized')
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', user.id)

  if (profileError) {
    throw new Error(profileError.message)
  }

  return { success: true }
}
