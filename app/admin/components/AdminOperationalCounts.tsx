import { createClient } from '@/lib/supabase/server'
import { createPerfLogger } from '@/lib/perf/timing'
import { fetchAdminShellBadges } from '@/lib/admin/operational-counts'
import AdminSidebarShellSync from '../AdminSidebarShellSync'

export default async function AdminOperationalCounts({ displayName }: { displayName: string }) {
  const perf = createPerfLogger({ route: '/admin/layout/counts', role: 'admin' })
  const markTotal = perf.start('admin_layout', 'admin_operational_counts_total')

  try {
    const supabase = await createClient()
    const badges = await perf.time('admin_layout', 'admin_operational_counts_query_group', () =>
      fetchAdminShellBadges(supabase),
    )

    markTotal()

    return (
      <AdminSidebarShellSync
        displayName={displayName}
        unreadMessageCount={badges.unreadMessageCount}
        actionCounts={badges.actionCounts}
      />
    )
  } catch (error) {
    console.error('Failed to fetch admin operational counts:', error)
    markTotal()
    return (
      <AdminSidebarShellSync
        displayName={displayName}
        unreadMessageCount={0}
      />
    )
  }
}
