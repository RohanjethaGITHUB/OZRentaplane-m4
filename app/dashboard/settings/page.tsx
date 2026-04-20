import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import Image from 'next/image'

export const metadata = { title: 'Settings | Pilot Dashboard' }

export default async function CustomerSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const isVerified = profile.verification_status === 'verified'

  return (
    <div className="min-h-screen flex flex-col md:flex-row overflow-hidden bg-[#050B14] text-[#e2e2e6] font-sans relative">
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none z-50 mix-blend-overlay"
        style={{ backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")' }}
      />
      <div className="fixed top-0 left-0 w-[600px] h-[600px] bg-oz-blue/5 blur-[120px] rounded-full pointer-events-none -z-10" />
      <div className="fixed top-0 right-0 w-[600px] h-[600px] bg-oz-blue/5 blur-[120px] rounded-full pointer-events-none -z-10" />

      <div className="flex-1 w-full max-w-4xl mx-auto pt-24 px-8 pb-16 z-10">
        
        <Link href="/dashboard" className="text-oz-blue hover:text-white text-sm mb-6 inline-flex items-center gap-1 transition-colors">
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Return to Dashboard
        </Link>

        <header className="mb-12">
          <h2 className="text-3xl md:text-4xl font-serif italic tracking-tight text-white mb-2">My Settings</h2>
          <p className="text-oz-muted font-sans font-light">
            Manage your personal profile, credentials, and notification preferences. <span className="text-oz-blue ml-2 font-medium">Updates available shortly.</span>
          </p>
        </header>

        <div className="space-y-8">
          {/* Section 1: Profile */}
          <section className="bg-[#0c121e]/60 backdrop-blur-2xl border border-white/5 rounded-[1.25rem] p-8 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
            <h3 className="text-xs font-bold uppercase tracking-widest text-oz-blue mb-6">Profile Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-oz-muted mb-2">Full Name</p>
                <div className="px-4 py-3 bg-[#050B14] border border-white/5 rounded-xl text-white text-sm opacity-80 cursor-not-allowed">
                  {profile.full_name || 'Not provided'}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-oz-muted mb-2">Email Address</p>
                <div className="px-4 py-3 bg-[#050B14] border border-white/5 rounded-xl text-white text-sm opacity-80 cursor-not-allowed">
                  {user.email || 'Not provided'}
                </div>
              </div>
            </div>
            <p className="text-[10px] text-oz-subtle mt-4">Contact concierge to update primary contact information.</p>
          </section>

          {/* Section 2: Pilot Details & Docs */}
          <section className="bg-[#0c121e]/60 backdrop-blur-2xl border border-white/5 rounded-[1.25rem] p-8 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
            <h3 className="text-xs font-bold uppercase tracking-widest text-oz-blue mb-6">Pilot Credentials</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-oz-muted mb-2">Pilot In Command Name</p>
                <div className="px-4 py-3 bg-[#050B14] border border-white/5 rounded-xl text-white text-sm opacity-80 cursor-not-allowed">
                  {profile.full_name || 'Not provided'}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-oz-muted mb-2">Aviation Reference Number (ARN)</p>
                <div className="px-4 py-3 bg-[#050B14] border border-white/5 rounded-xl text-white text-sm opacity-80 cursor-not-allowed flex items-center justify-between">
                  <span>{/* Assuming ARN isn't directly on profile yet, show placeholder */} Setup through verification</span>
                  <span className="material-symbols-outlined text-[16px] text-amber-500/50">lock</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between p-5 bg-white/5 border border-white/5 rounded-xl">
              <div>
                <p className="text-sm text-white font-medium mb-1">Verification Status</p>
                <p className="text-xs text-oz-muted">
                  {isVerified 
                    ? "Your pilot credentials exist and are mathematically verified." 
                    : "You must complete document upload checks to legally operate the aircraft."}
                </p>
              </div>
              <div className="mt-4 md:mt-0 flex items-center gap-4">
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${
                  isVerified 
                    ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  {profile.verification_status?.replace('_', ' ')}
                </span>
                <Link 
                  href="/dashboard"
                  className="px-4 py-2 bg-oz-blue hover:bg-white text-oz-deep text-[10px] font-bold uppercase tracking-widest rounded-full transition-colors whitespace-nowrap"
                >
                  Manage Docs
                </Link>
              </div>
            </div>
          </section>

          {/* Section 4: Preferences */}
          <section className="bg-[#0c121e]/60 backdrop-blur-2xl border border-white/5 rounded-[1.25rem] p-8 shadow-[0_8px_24px_rgba(0,0,0,0.3)] opacity-60 pointer-events-none">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-oz-blue">Communication Preferences</h3>
              <span className="text-[9px] uppercase tracking-widest text-amber-400 border border-amber-400/20 px-2 py-0.5 rounded">Coming Soon</span>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                <div>
                  <p className="text-sm text-white font-medium mb-1">Email Notifications</p>
                  <p className="text-xs text-oz-muted">Flight dispatch authorizations and receipts.</p>
                </div>
                <div className="w-12 h-6 bg-oz-blue/20 rounded-full relative border border-oz-blue/50">
                  <div className="w-4 h-4 bg-oz-blue rounded-full absolute top-1 right-1" />
                </div>
              </div>
              
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                <div>
                  <p className="text-sm text-white font-medium mb-1">SMS Alerts</p>
                  <p className="text-xs text-oz-muted">Emergent weather grounding and schedule adjustments.</p>
                </div>
                <div className="w-12 h-6 bg-white/10 rounded-full relative border border-white/10">
                  <div className="w-4 h-4 bg-white/30 rounded-full absolute top-1 left-1" />
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
