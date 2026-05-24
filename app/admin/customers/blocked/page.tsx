import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import { AdminDataTable, AdminStatusBadge } from '@/app/admin/components/AdminListView'

export const metadata = { title: 'Blocked Customers | Admin' }
const DATE_FMT = new Intl.DateTimeFormat('en-AU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Australia/Sydney',
})

export default async function BlockedCustomersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: blocked } = await supabase
    .from('profiles')
    .select('id, full_name, updated_at, admin_review_note')
    .eq('role', 'customer')
    .eq('account_status', 'blocked')
    .order('updated_at', { ascending: false })

  return (
    <>
      <AdminPortalHero eyebrow="Customers" title="Blocked Customers" subtitle="Operationally blocked customer accounts and review reasons." />
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24">
        <AdminDataTable columns={['Customer', 'Status', 'Last updated']}>
          {(!blocked || blocked.length === 0) ? (
            <tr>
              <td colSpan={3} className="px-5 py-12 text-center text-[var(--admin-text-muted)]">No blocked customers.</td>
            </tr>
          ) : (
            blocked.map((c) => (
              <tr key={c.id} className="border-t border-[var(--admin-divider)] hover:bg-[var(--admin-row-hover)] transition-colors">
                <td className="px-5 py-[16px]">
                  <Link href={`/admin/users/${c.id}`} className="block">
                    <p className="text-lg leading-tight font-semibold text-[var(--admin-text)]">{c.full_name || 'Unnamed customer'}</p>
                    <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{c.admin_review_note || 'No reason recorded'}</p>
                  </Link>
                </td>
                <td className="px-5 py-[16px]">
                  <Link href={`/admin/users/${c.id}`} className="block"><AdminStatusBadge label="Blocked" tone="red" /></Link>
                </td>
                <td className="px-5 py-[16px] text-[14px] text-[var(--admin-text)]">
                  <Link href={`/admin/users/${c.id}`} className="block">{DATE_FMT.format(new Date(c.updated_at))}</Link>
                </td>
              </tr>
            ))
          )}
        </AdminDataTable>
      </div>
    </>
  )
}
