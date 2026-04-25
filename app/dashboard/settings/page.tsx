import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import PortalPageHero from '@/components/PortalPageHero'

export const metadata = { title: 'Account | OZRentAPlane' }

const CARD = 'bg-gradient-to-br from-[#0c1525] to-[#080e1c] border border-white/[0.07] rounded-xl shadow-[0_4px_30px_rgba(0,0,0,0.35)]'

export default async function CustomerSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const isVerified = profile.verification_status === 'verified'

  const verificationPill = isVerified
    ? { label: 'Ready to Fly', color: 'green' as const }
    : profile.verification_status === 'pending_review'
    ? { label: 'Pending Review', color: 'blue' as const, pulse: true }
    : { label: 'Setup Required', color: 'slate' as const }

  return (
    <>
      <PortalPageHero
        eyebrow="Pilot Profile"
        title="Account"
        subtitle="Manage your personal details, ARN, preferences, and account settings."
        statusPill={verificationPill}
      />

      <div className="max-w-[1280px] mx-auto px-6 md:px-10 xl:px-12 py-10">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* Personal Details */}
          <section className={`${CARD} p-8`}>
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-blue-400/80 mb-6">Personal Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-2">Full Name</p>
                <div className="px-4 py-3 bg-[#05080f] border border-white/[0.07] rounded-lg text-white/80 text-sm">
                  {profile.full_name || <span className="text-slate-600">Not provided</span>}
                </div>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-2">Email Address</p>
                <div className="px-4 py-3 bg-[#05080f] border border-white/[0.07] rounded-lg text-white/80 text-sm">
                  {user.email || <span className="text-slate-600">Not provided</span>}
                </div>
              </div>
            </div>
            <p className="text-[10px] text-slate-700 mt-4">Contact support to update your primary contact details.</p>
          </section>

          {/* Pilot Credentials */}
          <section className={`${CARD} p-8`}>
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-blue-400/80 mb-6">Pilot Credentials</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-2">Pilot in Command</p>
                <div className="px-4 py-3 bg-[#05080f] border border-white/[0.07] rounded-lg text-white/80 text-sm">
                  {profile.full_name || <span className="text-slate-600">Not provided</span>}
                </div>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-2">Aviation Reference Number (ARN)</p>
                <div className="px-4 py-3 bg-[#05080f] border border-white/[0.07] rounded-lg text-sm flex items-center justify-between gap-3">
                  {profile.pilot_arn
                    ? <span className="text-white/80 font-mono">{profile.pilot_arn}</span>
                    : <span className="text-slate-600">Not set</span>
                  }
                  <Link
                    href="/dashboard/documents"
                    className="flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-oz-blue hover:text-blue-300 transition-colors"
                  >
                    {profile.pilot_arn ? 'Update' : 'Add ARN'}
                  </Link>
                </div>
              </div>
            </div>

            {/* Verification status row */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 bg-white/[0.025] border border-white/[0.06] rounded-xl">
              <div>
                <p className="text-sm text-white font-medium mb-1">Verification Status</p>
                <p className="text-xs text-slate-500">
                  {isVerified
                    ? 'Your pilot credentials are verified and you have full fleet access.'
                    : 'Complete document verification to unlock aircraft access.'}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${
                  isVerified
                    ? 'bg-green-500/10 text-green-400 border-green-500/20'
                    : profile.verification_status === 'pending_review'
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  {profile.verification_status?.replace(/_/g, ' ')}
                </span>
                <Link
                  href="/dashboard/documents"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold uppercase tracking-widest rounded-full transition-colors whitespace-nowrap"
                >
                  Manage Docs
                </Link>
              </div>
            </div>
          </section>

          {/* Communication Preferences — coming soon */}
          <section className={`${CARD} p-8 opacity-45 pointer-events-none select-none`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-blue-400/80">Communication Preferences</h2>
              <span className="text-[9px] uppercase tracking-widest text-amber-400 border border-amber-400/20 px-2 py-0.5 rounded">Coming Soon</span>
            </div>
            <div className="space-y-3">
              {['Email Notifications', 'SMS Alerts'].map(label => (
                <div key={label} className="flex items-center justify-between p-4 bg-white/[0.025] rounded-xl border border-white/[0.06]">
                  <p className="text-sm text-white font-medium">{label}</p>
                  <div className="w-10 h-5 bg-white/10 rounded-full" />
                </div>
              ))}
            </div>
          </section>

        </div>
      </div>
    </>
  )
}
