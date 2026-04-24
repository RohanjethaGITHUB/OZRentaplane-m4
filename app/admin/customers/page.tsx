import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AdminQueueTable from '../AdminQueueTable'
import type { QueueProfile } from '../AdminQueueTable'
import AdminPortalHero from '@/components/AdminPortalHero'

export const metadata = { title: 'Customers | Admin' }

export default async function AdminCustomersOverview() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  // EXACT COUNTS FETCHING
  const [
    { count: totalCustomers },
    { count: verifiedCount },
    { count: pendingCount },
    { count: actionRequiredCount }, // on_hold + rejected
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').eq('verification_status', 'verified'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').eq('verification_status', 'pending_review'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').in('verification_status', ['on_hold', 'rejected']),
  ])

  // Fetch 10 most recent verifications
  const { data: pendingProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, verification_status, updated_at, reviewed_at, admin_review_note')
    .eq('role', 'customer')
    .eq('verification_status', 'pending_review')
    .order('updated_at', { ascending: false })
    .limit(10)

  const profileIds = (pendingProfiles ?? []).map(p => p.id)
  const { data: allDocs } = profileIds.length > 0
    ? await supabase.from('user_documents').select('user_id, document_type, uploaded_at').in('user_id', profileIds)
    : { data: [] }

  const docsByUser: Record<string, Array<{ document_type: string; uploaded_at: string }>> = {}
  for (const doc of allDocs ?? []) {
    if (!docsByUser[doc.user_id]) docsByUser[doc.user_id] = []
    docsByUser[doc.user_id].push(doc)
  }

  // Not started mathematical inference since they exist but aren't categorized anywhere else explicitly
  const safeTotal = totalCustomers || 0
  const notStartedCount = safeTotal - ((verifiedCount || 0) + (pendingCount || 0) + (actionRequiredCount || 0))

  const heroActions = (
    <>
      <Link href="/admin/all-customers" className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 border border-white/10">
        <span className="material-symbols-outlined text-sm">people</span> Directory
      </Link>
      <Link href="/admin/messages" className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 border border-white/10">
        <span className="material-symbols-outlined text-sm">chat</span> Messages
      </Link>
    </>
  )

  return (
    <>
      <AdminPortalHero
        eyebrow="Customer Management"
        title="Customers"
        subtitle="View customer profiles, verification state, documents, and booking history."
        actions={heroActions}
      />

      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24">

      {/* Metrics Row */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
        <div className="bg-[#1e2023]/60 backdrop-blur-xl border border-white/5 p-6 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-4">Total System Users</span>
          <div className="text-3xl font-light font-serif text-[#e2e2e6]">{totalCustomers || 0}</div>
        </div>
        <div className="bg-[#1e2023]/60 backdrop-blur-xl border border-green-500/10 p-6 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-widest font-bold text-green-500/70 mb-4">Verified Members</span>
          <div className="text-3xl font-light font-serif text-green-400">{verifiedCount || 0}</div>
        </div>
        <Link href="/admin/pending-verifications" className="bg-[#1e2023]/60 backdrop-blur-xl border border-blue-500/10 p-6 rounded-2xl flex flex-col justify-between hover:bg-[#282a2d] transition-colors group">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[10px] uppercase tracking-widest font-bold text-blue-400/80">Pending Review</span>
            <span className="material-symbols-outlined text-sm text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">arrow_forward</span>
          </div>
          <div className="text-3xl font-light font-serif text-blue-300">{pendingCount || 0}</div>
        </Link>
        <div className="bg-[#1e2023]/60 backdrop-blur-xl border border-amber-500/10 p-6 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-widest font-bold text-amber-500/70 mb-4">Action Required</span>
          <div className="text-3xl font-light font-serif text-amber-500">{actionRequiredCount || 0}</div>
        </div>
      </section>

      {/* Verification Funnel */}
      <section className="mb-12 border border-white/5 rounded-2xl p-8 bg-[#0c1326]/30 overflow-hidden relative">
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-8 flex items-center gap-2">
          Verification Funnel
        </h3>
        <div className="flex flex-col md:flex-row gap-2 h-16 md:h-8">
          {safeTotal === 0 ? (
            <div className="w-full bg-white/5 rounded flex justify-center items-center text-xs text-slate-500">No data</div>
          ) : (
            <>
              {notStartedCount > 0 && <div className="bg-slate-700/50 rounded flex justify-center items-center text-[10px] text-white font-bold tracking-widest" style={{ width: `${(notStartedCount / safeTotal) * 100}%` }}>{notStartedCount}</div>}
              {(pendingCount || 0) > 0 && <div className="bg-blue-600/50 rounded flex justify-center items-center text-[10px] text-white font-bold tracking-widest" style={{ width: `${((pendingCount||0) / safeTotal) * 100}%` }}>{pendingCount}</div>}
              {(actionRequiredCount || 0) > 0 && <div className="bg-amber-600/50 rounded flex justify-center items-center text-[10px] text-white font-bold tracking-widest" style={{ width: `${((actionRequiredCount||0) / safeTotal) * 100}%` }}>{actionRequiredCount}</div>}
              {(verifiedCount || 0) > 0 && <div className="bg-green-600/50 rounded flex justify-center items-center text-[10px] text-white font-bold tracking-widest" style={{ width: `${((verifiedCount||0) / safeTotal) * 100}%` }}>{verifiedCount}</div>}
            </>
          )}
        </div>
        <div className="flex flex-col md:flex-row justify-between mt-4 text-[10px] uppercase tracking-widest font-semibold text-slate-500">
          <span>Registered</span>
          <span>Submitted Docs</span>
          <span className="text-amber-500/60">Hold</span>
          <span className="text-green-500/60">Verified</span>
        </div>
      </section>

      {/* Pending Verifications Table */}
      <section>
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-serif text-2xl font-light">Action Queue</h3>
        </div>
        <AdminQueueTable
          profiles={pendingProfiles as QueueProfile[] ?? []}
          docsByUser={docsByUser}
          totalCount={pendingCount ?? 0}
          dateMode="submitted"
          actionLabel="Review"
        />
      </section>

      </div>
    </>
  )
}
