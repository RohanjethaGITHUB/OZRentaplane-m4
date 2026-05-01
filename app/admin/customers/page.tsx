import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AdminQueueTable from '../AdminQueueTable'
import type { QueueProfile } from '../AdminQueueTable'
import AdminPortalHero from '@/components/AdminPortalHero'
import { CLEARANCE_BADGE, CLEARANCE_LABEL } from '@/lib/pilot-status'
import type { PilotClearanceStatus } from '@/lib/supabase/types'

export const metadata = { title: 'Customers | Admin' }

export default async function AdminCustomersOverview() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  // ── Metric counts using clearance-based model ─────────────────────────────
  const [
    { count: totalCustomers },
    { count: clearedCount },
    { count: inCheckoutCount },
    { count: needsActionCount },
    { count: blockedCount },
    { count: checkoutRequestedCount },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').eq('pilot_clearance_status', 'cleared_to_fly'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').in('pilot_clearance_status', ['checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review', 'checkout_payment_required']),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').in('pilot_clearance_status', ['additional_checkout_required', 'checkout_reschedule_required', 'not_currently_eligible']),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').eq('account_status', 'blocked'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').eq('pilot_clearance_status', 'checkout_requested'),
  ])

  // ── Fetch customers with pending checkout requests ────────────────────────
  const { data: pendingProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, pilot_clearance_status, account_status, updated_at, reviewed_at, admin_review_note')
    .eq('role', 'customer')
    .eq('pilot_clearance_status', 'checkout_requested')
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

  const safeTotal = totalCustomers || 0
  const newRegistrations = safeTotal - ((clearedCount || 0) + (inCheckoutCount || 0) + (needsActionCount || 0))

  const heroActions = (
    <>
      <Link href="/admin/customers/all" className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 border border-white/10">
        <span className="material-symbols-outlined text-sm">people</span> All Customers
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
        subtitle="View customer profiles, pilot clearance status, documents, and booking history."
        actions={heroActions}
      />

      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 pb-24">

        {/* Metrics Row */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          <div className="bg-[#1e2023]/60 backdrop-blur-xl border border-white/5 p-6 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-4">Total Customers</span>
            <div className="text-3xl font-light font-serif text-[#e2e2e6]">{safeTotal}</div>
          </div>
          <div className="bg-[#1e2023]/60 backdrop-blur-xl border border-green-500/10 p-6 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] uppercase tracking-widest font-bold text-green-500/70 mb-4">Cleared for Solo Hire</span>
            <div className="text-3xl font-light font-serif text-green-400">{clearedCount || 0}</div>
          </div>
          <Link href="/admin/bookings/checkout?status=checkout_requested" className="bg-[#1e2023]/60 backdrop-blur-xl border border-blue-500/10 p-6 rounded-2xl flex flex-col justify-between hover:bg-[#282a2d] transition-colors group">
            <div className="flex justify-between items-start mb-4">
              <span className="text-[10px] uppercase tracking-widest font-bold text-blue-400/80">Checkout Requests</span>
              <span className="material-symbols-outlined text-sm text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">arrow_forward</span>
            </div>
            <div className="text-3xl font-light font-serif text-blue-300">{checkoutRequestedCount || 0}</div>
          </Link>
          <div className="bg-[#1e2023]/60 backdrop-blur-xl border border-amber-500/10 p-6 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] uppercase tracking-widest font-bold text-amber-500/70 mb-4">Needs Attention</span>
            <div className="text-3xl font-light font-serif text-amber-500">{needsActionCount || 0}</div>
          </div>
        </section>

        {/* Pilot Clearance Pipeline */}
        <section className="mb-12 border border-white/5 rounded-2xl p-8 bg-[#0c1326]/30 overflow-hidden relative">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-8">
            Pilot Clearance Pipeline
          </h3>
          <div className="flex flex-col md:flex-row gap-2 h-16 md:h-8">
            {safeTotal === 0 ? (
              <div className="w-full bg-white/5 rounded flex justify-center items-center text-xs text-slate-500">No data</div>
            ) : (
              <>
                {newRegistrations > 0 && <div className="bg-slate-700/50 rounded flex justify-center items-center text-[10px] text-white font-bold tracking-widest" style={{ width: `${(newRegistrations / safeTotal) * 100}%` }}>{newRegistrations}</div>}
                {(inCheckoutCount || 0) > 0 && <div className="bg-blue-600/50 rounded flex justify-center items-center text-[10px] text-white font-bold tracking-widest" style={{ width: `${((inCheckoutCount||0) / safeTotal) * 100}%` }}>{inCheckoutCount}</div>}
                {(needsActionCount || 0) > 0 && <div className="bg-amber-600/50 rounded flex justify-center items-center text-[10px] text-white font-bold tracking-widest" style={{ width: `${((needsActionCount||0) / safeTotal) * 100}%` }}>{needsActionCount}</div>}
                {(clearedCount || 0) > 0 && <div className="bg-green-600/50 rounded flex justify-center items-center text-[10px] text-white font-bold tracking-widest" style={{ width: `${((clearedCount||0) / safeTotal) * 100}%` }}>{clearedCount}</div>}
                {(blockedCount || 0) > 0 && <div className="bg-red-600/50 rounded flex justify-center items-center text-[10px] text-white font-bold tracking-widest" style={{ width: `${((blockedCount||0) / safeTotal) * 100}%` }}>{blockedCount}</div>}
              </>
            )}
          </div>
          <div className="flex flex-col md:flex-row justify-between mt-4 text-[10px] uppercase tracking-widest font-semibold text-slate-500">
            <span>New Registration</span>
            <span className="text-blue-400/60">In Checkout</span>
            <span className="text-amber-500/60">Needs Attention</span>
            <span className="text-green-500/60">Cleared</span>
            {(blockedCount || 0) > 0 && <span className="text-red-500/60">Blocked</span>}
          </div>
        </section>

        {/* Pending Checkout Requests Queue */}
        <section>
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-serif text-2xl font-light">Checkout Requests</h3>
            <Link href="/admin/bookings/checkout?status=checkout_requested" className="text-[10px] font-bold uppercase tracking-widest text-blue-400/70 hover:text-blue-300 transition-colors flex items-center gap-1">
              View All <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </Link>
          </div>
          <AdminQueueTable
            profiles={pendingProfiles as QueueProfile[] ?? []}
            docsByUser={docsByUser}
            totalCount={checkoutRequestedCount ?? 0}
            dateMode="submitted"
            actionLabel="Review"
          />
        </section>

      </div>
    </>
  )
}
