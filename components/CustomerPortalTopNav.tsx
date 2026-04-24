'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const PUBLIC_LINKS = [
  { label: 'Fleet',        href: '/fleet' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Safety',       href: '/safety' },
  { label: 'Resources',    href: '/pilotRequirements' },
  { label: 'Pricing',      href: '/pricing' },
]

type Props = {
  displayName: string
}

export default function CustomerPortalTopNav({ displayName }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const router   = useRouter()
  const pathname = usePathname()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?'

  return (
    <header className="sticky top-0 z-50 bg-[#091421] border-b border-white/[0.07] shadow-[0_1px_0_rgba(255,255,255,0.04)]">
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 h-16 flex items-center justify-between gap-6">

        {/* Logo */}
        <Link href="/dashboard" className="shrink-0 flex items-center select-none">
          <img
            src="/OZRentAPlanelogo.png"
            alt="OZRentAPlane"
            className="h-[52px] w-auto object-contain scale-[2.5] origin-left"
          />
        </Link>

        {/* Desktop public nav links */}
        <nav className="hidden lg:flex items-center gap-7">
          {PUBLIC_LINKS.map(link => (
            <a
              key={link.label}
              href={link.href}
              className="font-sans text-[12.5px] font-medium text-white/55 hover:text-white/90 transition-colors duration-200 whitespace-nowrap"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Right controls */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Book a Flight — primary CTA */}
          <Link
            href="/dashboard/bookings/new"
            className={`hidden md:inline-flex items-center gap-1.5 text-[12px] font-semibold px-4 py-2 rounded-full transition-colors duration-200 whitespace-nowrap ${
              pathname === '/dashboard/bookings/new'
                ? 'bg-white text-[#0c1a2e]'
                : 'bg-[#c8dcff] text-[#0c1a2e] hover:bg-white'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 600" }}>
              flight_takeoff
            </span>
            Book a Flight
          </Link>

          {/* Notifications */}
          <button
            className="flex items-center justify-center w-8 h-8 rounded-full text-white/40 hover:text-white/80 hover:bg-white/5 transition-colors"
            title="Notifications"
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'wght' 300" }}>
              notifications
            </span>
          </button>

          {/* User avatar + name */}
          <Link
            href="/dashboard/settings"
            title={`Account — ${displayName}`}
            className="flex items-center gap-2 rounded-full hover:opacity-80 transition-opacity"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#a7c8ff]/10 border border-[#a7c8ff]/25 flex-shrink-0">
              <span className="text-[11px] font-bold text-[#a7c8ff]">{initials}</span>
            </div>
            <span className="hidden lg:flex items-center gap-1 text-[12px] font-medium text-white/60 hover:text-white/90 transition-colors whitespace-nowrap">
              {displayName}
              <span className="material-symbols-outlined text-[14px] text-white/30">expand_more</span>
            </span>
          </Link>

          {/* Logout — desktop */}
          <button
            onClick={handleLogout}
            className="hidden md:flex items-center gap-1.5 text-[11px] font-semibold text-white/25 hover:text-white/60 transition-colors"
            title="Sign out"
          >
            <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'wght' 300" }}>
              logout
            </span>
          </button>

          {/* Hamburger — mobile */}
          <button
            className="lg:hidden flex flex-col justify-center gap-[5px] w-8 h-8 ml-1"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <span className={`block w-5 h-0.5 bg-white/60 transition-all duration-300 origin-center ${menuOpen ? 'rotate-45 translate-y-[7px]' : ''}`} />
            <span className={`block w-5 h-0.5 bg-white/60 transition-all duration-300 ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-5 h-0.5 bg-white/60 transition-all duration-300 origin-center ${menuOpen ? '-rotate-45 -translate-y-[7px]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="lg:hidden bg-[#091421]/98 backdrop-blur-xl border-t border-white/[0.06] px-6 py-5 flex flex-col gap-4">
          {PUBLIC_LINKS.map(link => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="font-sans text-[14px] font-medium text-white/70 hover:text-white transition-colors"
            >
              {link.label}
            </a>
          ))}
          <div className="h-px bg-white/5 my-1" />
          <Link
            href="/dashboard/bookings/new"
            onClick={() => setMenuOpen(false)}
            className="inline-flex justify-center items-center gap-2 text-sm px-5 py-3 rounded-full font-semibold bg-[#c8dcff] text-[#0c1a2e] hover:bg-white transition-colors"
          >
            Book a Flight
          </Link>
          <button
            onClick={() => { setMenuOpen(false); handleLogout() }}
            className="text-[13px] text-white/50 hover:text-white transition-colors text-center"
          >
            Sign Out
          </button>
        </div>
      )}
    </header>
  )
}
