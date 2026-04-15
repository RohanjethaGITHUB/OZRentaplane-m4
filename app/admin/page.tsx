import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AdminQueueTable from './AdminQueueTable'
import type { QueueProfile } from './AdminQueueTable'

export const metadata = { title: 'Admin Overview' }

export default async function AdminPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ── Fetch stats ──────────────────────────────────────────────────────────
  const [
    { count: pendingCount  },
    { count: onHoldCount   },
    { count: verifiedCount },
    { count: rejectedCount },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').eq('verification_status', 'pending_review'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').eq('verification_status', 'on_hold'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').eq('verification_status', 'verified'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').eq('verification_status', 'rejected'),
  ])

  // ── Fetch pending queue ───────────────────────────────────────────────────
  const { data: pendingProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, verification_status, updated_at, reviewed_at, admin_review_note')
    .eq('role', 'customer')
    .eq('verification_status', 'pending_review')
    .order('updated_at', { ascending: false })
    .limit(20)

  const profileIds = (pendingProfiles ?? []).map(p => p.id)
  const { data: allDocs } = profileIds.length > 0
    ? await supabase.from('user_documents').select('user_id, document_type, uploaded_at').in('user_id', profileIds)
    : { data: [] }

  const docsByUser: Record<string, Array<{ document_type: string; uploaded_at: string }>> = {}
  for (const doc of allDocs ?? []) {
    if (!docsByUser[doc.user_id]) docsByUser[doc.user_id] = []
    docsByUser[doc.user_id].push(doc)
  }

  const stats = [
    { icon: 'pending',       label: 'Pending Review',     value: pendingCount  ?? 0, note: 'Awaiting action',        noteColor: 'text-slate-500',      href: '/admin/pending-verifications' },
    { icon: 'pause_circle',  label: 'On Hold',            value: onHoldCount   ?? 0, note: 'Awaiting customer info', noteColor: 'text-amber-500/60',   href: '/admin/on-hold' },
    { icon: 'verified',      label: 'Verified Customers', value: verifiedCount ?? 0, note: 'Approved',               noteColor: 'text-blue-400/60',    href: '/admin/verified-users' },
    { icon: 'gavel',         label: 'Rejected Cases',     value: rejectedCount ?? 0, note: 'Reviewed',               noteColor: 'text-red-400/60',     href: '/admin/rejected-users' },
  ]

  return (
    <div className="p-10 max-w-7xl">
      {/* Page header */}
      <header className="mb-12">
        <h2 className="font-serif text-4xl font-light text-[#e2e2e6] tracking-tight">Admin Dashboard</h2>
        <p className="text-slate-400 mt-2 font-light tracking-wide">Manage customer verification and booking readiness</p>
        <div className="h-0.5 w-10 bg-[#44474c] mt-6" />
      </header>

      {/* Stat bento grid */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
        {stats.map(stat => (
          <Link
            key={stat.label}
            href={stat.href}
            className={`bg-[#1e2023]/60 backdrop-blur-xl border p-6 rounded-xl flex flex-col justify-between group hover:bg-[#282a2d] transition-all duration-300 ${
              stat.label === 'On Hold' ? 'border-amber-500/10' : 'border-white/5'
            }`}
          >
            <div className="flex justify-between items-start">
              <span
                className={`material-symbols-outlined ${stat.label === 'On Hold' ? 'text-amber-500/60' : 'text-blue-300/70'}`}
                style={{ fontVariationSettings: "'wght' 300" }}
              >
                {stat.icon}
              </span>
              <span className={`text-[10px] uppercase tracking-tighter font-medium ${stat.noteColor}`}>{stat.note}</span>
            </div>
            <div className="mt-8">
              <p className="text-3xl font-light font-serif text-[#e2e2e6]">
                {String(stat.value).padStart(2, '0')}
              </p>
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-1">{stat.label}</p>
            </div>
          </Link>
        ))}
      </section>

      {/* Verification Queue */}
      <section className="mb-12">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-serif text-2xl font-light">Verification Queue</h3>
          <Link
            href="/admin/pending-verifications"
            className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest border border-white/10 rounded-full hover:bg-white/5 transition-all"
          >
            View All
          </Link>
        </div>
        <AdminQueueTable
          profiles={pendingProfiles as QueueProfile[] ?? []}
          docsByUser={docsByUser}
          totalCount={pendingCount ?? 0}
          dateMode="submitted"
          actionLabel="Review"
        />
      </section>

      {/* Latest Submissions strip */}
      {(pendingProfiles ?? []).length > 0 && (
        <section className="bg-[#1e2023]/60 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden">
          <div className="px-8 py-5 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              <h3 className="font-sans text-xs font-bold uppercase tracking-widest text-slate-400">Latest Pending Submissions</h3>
            </div>
            <Link
              href="/admin/pending-verifications"
              className="text-[10px] text-slate-500 hover:text-blue-300 uppercase tracking-widest transition-colors"
            >
              See all →
            </Link>
          </div>
          <div className="divide-y divide-white/5">
            {(pendingProfiles ?? []).slice(0, 5).map(profile => {
              const name    = profile.full_name ?? 'Unknown User'
              const initials = name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
              const when    = profile.updated_at
                ? new Date(profile.updated_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                : '—'
              return (
                <Link
                  key={profile.id}
                  href={`/admin/users/${profile.id}`}
                  className="flex items-center gap-4 px-8 py-4 hover:bg-white/[0.02] transition-colors group"
                >
                  <div className="w-7 h-7 rounded-full bg-blue-900/50 border border-blue-300/20 flex items-center justify-center text-blue-200 text-[10px] font-bold flex-shrink-0">
                    {initials}
                  </div>
                  <span className="text-sm font-medium text-[#e2e2e6] group-hover:text-blue-200 transition-colors flex-1 truncate">
                    {name}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">{when}</span>
                  <span className="material-symbols-outlined text-slate-600 group-hover:text-blue-300 text-base transition-colors" style={{ fontVariationSettings: "'wght' 300" }}>
                    arrow_forward
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
