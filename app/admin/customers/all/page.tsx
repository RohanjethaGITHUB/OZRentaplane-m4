import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'
import { TabLink } from '@/app/admin/components/AdminUi'

export const metadata = { title: 'Customer Directory | Admin' }

export default async function AllCustomersPage({ searchParams }: { searchParams: { clearance?: string; account?: string; q?: string } }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  let query = supabase
    .from('profiles')
    .select('id, full_name, email, pilot_clearance_status, account_status, updated_at', { count: 'exact' })
    .eq('role', 'customer')
    .order('updated_at', { ascending: false })

  if (searchParams.clearance) query = query.eq('pilot_clearance_status', searchParams.clearance)
  if (searchParams.account) query = query.eq('account_status', searchParams.account)
  if (searchParams.q) query = query.ilike('full_name', `%${searchParams.q}%`)

  const { data: profiles, count } = await query

  const clearanceTabs = [
    { label: 'All', value: '' },
    { label: 'Cleared', value: 'cleared_to_fly' },
    { label: 'In checkout', value: 'checkout_requested' },
    { label: 'Needs attention', value: 'additional_checkout_required' },
  ]

  return (
    <>
      <AdminPortalHero eyebrow="Customers" title="Customer Directory" subtitle="Search and filter all customer accounts." />
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24 space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-wrap gap-2">
          {clearanceTabs.map((tab) => (
            <TabLink key={tab.label} active={(searchParams.clearance ?? '') === tab.value} href={tab.value ? `/admin/customers/all?clearance=${tab.value}` : '/admin/customers/all'} label={tab.label} />
          ))}
          <TabLink active={(searchParams.account ?? '') === 'blocked'} href="/admin/customers/all?account=blocked" label="Blocked" />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-white/10 text-sm text-slate-400">
              <tr>
                <th className="px-5 py-4">Customer</th>
                <th className="px-5 py-4">Clearance status</th>
                <th className="px-5 py-4">Account</th>
                <th className="px-5 py-4">Updated</th>
                <th className="px-5 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {(profiles ?? []).map((p) => (
                <tr key={p.id} className="border-b border-white/5">
                  <td className="px-5 py-4"><p className="text-white text-base">{p.full_name || 'Unnamed customer'}</p><p className="text-sm text-slate-400">{p.email || 'No email'}</p></td>
                  <td className="px-5 py-4"><span className="text-sm text-slate-200 capitalize">{(p.pilot_clearance_status || 'unknown').replace(/_/g, ' ')}</span></td>
                  <td className="px-5 py-4"><span className="text-sm text-slate-300 capitalize">{(p.account_status || 'active').replace(/_/g, ' ')}</span></td>
                  <td className="px-5 py-4 text-sm text-slate-400">{new Date(p.updated_at).toLocaleDateString('en-AU')}</td>
                  <td className="px-5 py-4 text-right"><Link href={`/admin/users/${p.id}`} className="text-blue-200">View Customer</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!profiles || profiles.length === 0) && <div className="p-8 text-slate-400">No customers found for this filter.</div>}
        </div>
        <p className="text-sm text-slate-400">Showing {(profiles ?? []).length} of {count ?? 0} customers.</p>
      </div>
    </>
  )
}
