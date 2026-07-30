import type { ThreadSummary } from '@/lib/supabase/types'

export const ADMIN_THREAD_PAGE_SIZE = 20

export type AdminThreadListFilter =
  | 'all'
  | 'unread'
  | 'pending_review'
  | 'verified'
  | 'on_hold'
  | 'rejected'

export type AdminThreadListPage = {
  threads: ThreadSummary[]
  hasMore: boolean
  total: number
}
