import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { createPerfLogger } from '@/lib/perf/timing'
import type { Profile } from '@/lib/supabase/types'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — safe to ignore.
            // Add middleware to refresh sessions if needed later.
          }
        },
      },
    }
  )
}

export const getCachedUser = cache(async () => {
  const perf = createPerfLogger({ route: 'shared_auth', role: 'unknown' })
  const supabase = await createClient()
  return perf.time('cached_auth_helper', 'authenticated_user_lookup', () => supabase.auth.getUser())
})

type CachedProfileScope = 'admin' | 'dashboard'
type CachedAdminProfile = Pick<Profile, 'role' | 'full_name'>
type CachedDashboardProfile = Pick<
  Profile,
  | 'id'
  | 'full_name'
  | 'first_name'
  | 'email'
  | 'role'
  | 'account_status'
  | 'account_lock_reason'
  | 'pilot_clearance_status'
  | 'has_night_vfr_rating'
  | 'last_flight_date'
  | 'last_login_at'
  | 'login_count'
  | 'must_change_password'
>
type CachedProfileByScope = {
  admin: CachedAdminProfile
  dashboard: CachedDashboardProfile
}
type CachedProfileResult<TProfile> = {
  data: TProfile | null
  error: unknown
  count?: number | null
  status?: number
  statusText?: string
}

const PROFILE_SELECT_BY_SCOPE: Record<CachedProfileScope, string> = {
  admin: 'role, full_name',
  dashboard: [
    'id',
    'full_name',
    'first_name',
    'email',
    'role',
    'account_status',
    'account_lock_reason',
    'pilot_clearance_status',
    'has_night_vfr_rating',
    'last_flight_date',
    'last_login_at',
    'login_count',
    'must_change_password',
  ].join(', '),
}

async function loadCachedProfile<TScope extends CachedProfileScope>(
  userId: string,
  scope: TScope,
): Promise<CachedProfileResult<CachedProfileByScope[TScope]>> {
  const perf = createPerfLogger({ route: 'shared_profile', role: scope === 'admin' ? 'admin' : 'customer' })
  const supabase = await createClient()
  const result = await perf.time(
    'cached_profile_helper',
    `profile_query_${scope}`,
    () => supabase
      .from('profiles')
      .select(PROFILE_SELECT_BY_SCOPE[scope])
      .eq('id', userId)
      .single(),
    (result) => ({ rowCount: result.data ? 1 : 0 }),
  )
  return result as CachedProfileResult<CachedProfileByScope[TScope]>
}

export const getCachedProfile = cache(loadCachedProfile)
