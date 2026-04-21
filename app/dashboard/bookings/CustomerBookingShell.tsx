'use client'

import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/supabase/types'
import CustomerSidebar from '../CustomerSidebar'

type Props = {
  user: User
  profile: Profile | null
  children: React.ReactNode
}

export default function CustomerBookingShell({ user, profile, children }: Props) {
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const displayName  = profile?.full_name ?? user.email?.split('@')[0] ?? 'Pilot'
  const isVerified   = profile?.verification_status === 'verified'

  return (
    <div className="min-h-screen flex overflow-hidden bg-[#050B14] text-oz-text font-sans relative">
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none z-50 mix-blend-overlay"
        style={{ backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")' }}
      />
      <div className="fixed top-0 left-0 w-[600px] h-[600px] bg-oz-blue/5 blur-[120px] rounded-full pointer-events-none -z-10" />
      <div className="fixed top-0 right-0 w-[600px] h-[600px] bg-oz-blue/5 blur-[120px] rounded-full pointer-events-none -z-10" />

      <div className="fixed top-0 right-0 w-1/3 h-full -z-10 pointer-events-none opacity-[0.15]">
        <div className="absolute inset-0 bg-gradient-to-l from-transparent to-[#050B14] z-10" />
        <Image src="/Pilot&aircraftTwilight.webp" alt="Cessna 172 at twilight" fill className="object-cover" />
      </div>

      {/* Shared collapsible sidebar — no duplication */}
      <CustomerSidebar
        displayName={displayName}
        isVerified={isVerified}
        onLogout={handleLogout}
        /* no activeTab / onTabChange — we're on a route-based sub-page */
      />

      {/* Main */}
      <main className="ml-64 flex-1 flex flex-col relative w-[calc(100%-16rem)]">
        <header className="fixed top-0 right-0 w-[calc(100%-16rem)] h-20 flex justify-end items-center px-12 gap-6 z-40">
          <div className="flex items-center gap-6">
            <button className="flex items-center justify-center text-oz-subtle hover:text-white transition-colors">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'wght' 300" }}>notifications</span>
            </button>
            <Link href="/dashboard/settings" className="flex items-center justify-center text-oz-subtle hover:text-white transition-colors">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'wght' 300" }}>settings</span>
            </Link>
            <div className="h-8 w-[1px] bg-white/5" />
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-oz-subtle hover:text-white transition-colors group"
            >
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'wght' 300" }}>logout</span>
              <span className="text-[10px] font-bold uppercase tracking-widest group-hover:text-white transition-colors">Sign Out</span>
            </button>
          </div>
        </header>

        {children}
      </main>
    </div>
  )
}
