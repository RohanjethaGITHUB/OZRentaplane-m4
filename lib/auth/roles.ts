import { createClient } from '@/lib/supabase/server'

export async function getUserRoles(userId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)

  if (error) {
    console.error('[getUserRoles] error:', error)
    return []
  }

  return (data || []).map((row) => row.role)
}

export async function userHasRole(userId: string, role: string): Promise<boolean> {
  const roles = await getUserRoles(userId)
  return roles.includes(role)
}
