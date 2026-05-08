import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AdminPortalHero from '@/components/AdminPortalHero'

export const metadata = { title: 'Blocked Customers | Admin' }

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
      <div className="max-w-[1200px] mx-auto px-6 md:px-10 py-10 pb-24 space-y-3">
        {(blocked ?? []).map((c) => (
          <div key={c.id} className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-white text-base">{c.full_name || 'Unnamed customer'}</p>
              <p className="text-sm text-slate-300">Date blocked: {new Date(c.updated_at).toLocaleDateString('en-AU')}</p>
              <p className="text-sm text-rose-200">Reason: {c.admin_review_note || 'No reason recorded'}</p>
            </div>
            <Link href={`/admin/users/${c.id}`} className="text-blue-200">View Customer</Link>
          </div>
        ))}
        {(!blocked || blocked.length === 0) && <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-slate-400">No blocked customers.</div>}
      </div>
    </>
  )
}
