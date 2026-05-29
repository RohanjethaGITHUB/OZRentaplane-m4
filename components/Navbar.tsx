'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import AuthModal from './AuthModal'

const NAV_LINKS = [
  { label: 'Checkout Process', href: '/checkout-process' },
  { label: 'Safety', href: '/safety' },
  { label: 'Resources', href: '/resources' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Contact Us', href: '/contact-us' },
  { label: 'Shop', href: '/shop', disabled: true },
]

type CustomerPortalLink = {
  label: string
  href: string
  icon: string
  exact?: boolean
}

const CUSTOMER_PORTAL_LINKS: CustomerPortalLink[] = [
  { label: 'Dashboard', href: '/dashboard', icon: 'dashboard', exact: true },
  { label: 'Checkout', href: '/dashboard/checkout', icon: 'flight_takeoff' },
  { label: 'Bookings', href: '/dashboard/bookings', icon: 'event' },
  { label: 'Profile', href: '/dashboard/settings', icon: 'person' },
]

const FLEET_ITEMS = [
  { label: 'Cessna 172N', href: '/cessna-172', disabled: false },
  { label: 'More coming soon', href: null, disabled: true },
]

export default function Navbar({
  initialUser,
  hideCustomerCheckoutLink = false,
}: {
  initialUser: User | null
  hideCustomerCheckoutLink?: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileFleetOpen, setMobileFleetOpen] = useState(false)
  const [user, setUser] = useState<User | null>(initialUser)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const isAuthPage = pathname === '/login'

  useEffect(() => {
    const supabase = createClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const ctaClass =
    'font-sans font-semibold text-[#0c1a2e] bg-[#c8dcff] hover:bg-white rounded-full transition-colors duration-200'

  const isFleetActive = pathname === '/cessna-172' || pathname === '/fleet'
  const isPortalLinkActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || (pathname?.startsWith(`${href}/`) ?? false)
  const visibleCustomerPortalLinks = CUSTOMER_PORTAL_LINKS.filter(
    (link) => !(hideCustomerCheckoutLink && link.href === '/dashboard/checkout'),
  )

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${isAuthPage
        ? 'bg-transparent border-b border-white/5 backdrop-blur-md opacity-40 hover:opacity-100'
        : 'bg-deep-ink'
        }`}
    >
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 h-[84px] flex items-center justify-between gap-8">
        {/* Logo */}
        <a href="/" className="shrink-0 flex items-center select-none bg-transparent">
          <img
            src="/Logo/ozrentaplane-transparent-bg.png"
            alt="OZRentAPlane logo"
            className="h-12 w-auto object-contain bg-transparent"
            style={{ background: 'transparent', objectFit: 'contain' }}
          />
        </a>

        {/* Desktop links */}
        <nav className="hidden lg:flex items-center gap-7 xl:gap-9">
          {/* Fleet dropdown — pure CSS group-hover, no JS state on desktop */}
          <div className="relative group">
            <button
              className={`whitespace-nowrap font-sans text-[13.5px] font-medium transition-colors duration-200 flex items-center gap-1 ${isFleetActive
                ? 'text-white border-b border-runway-amber pb-0.5'
                : 'text-white/70 hover:text-white'
                }`}
              aria-haspopup="true"
              tabIndex={0}
            >
              Fleet
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden="true"
                className="transition-transform duration-200 group-hover:rotate-180"
              >
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/*
              pt-3 is the invisible hover bridge — it fills the visual gap between
              the button bottom edge and the visible panel, keeping the mouse inside
              the group element so group-hover never fires a leave event mid-travel.
            */}
            <div
              className={`
                absolute top-full left-1/2 -translate-x-1/2 w-44 pt-3
                opacity-0 -translate-y-1 pointer-events-none
                transition-all duration-200
                group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto
              `}
            >
              {/* Arrow tip */}
              <div className="flex justify-center mb-[-1px] relative z-10">
                <div className="w-2.5 h-2.5 rotate-45 bg-[#0d1e34] border-l border-t border-white/[0.08]" />
              </div>
              <div className="bg-[#0d1e34] border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl shadow-black/50 backdrop-blur-xl">
                {FLEET_ITEMS.map((item) =>
                  item.disabled ? (
                    <span
                      key={item.label}
                      className="block px-4 py-3 font-sans text-[13px] text-white/25 cursor-default select-none border-t border-white/5"
                    >
                      {item.label}
                    </span>
                  ) : (
                    <a
                      key={item.label}
                      href={item.href!}
                      className="block px-4 py-3 font-sans text-[13px] text-white/80 hover:text-white hover:bg-white/5 transition-colors duration-150"
                    >
                      {item.label}
                    </a>
                  )
                )}
              </div>
            </div>
          </div>

          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href

            if (link.disabled) {
              return (
                <div key={link.label} className="relative group">
                  <span
                    className="whitespace-nowrap font-sans text-[13.5px] font-medium text-white/30 cursor-not-allowed select-none"
                    tabIndex={0}
                    aria-disabled="true"
                  >
                    {link.label}
                  </span>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 rounded-md bg-[#0d1e34] border border-white/[0.08] text-[11px] font-sans text-white/60 whitespace-nowrap opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                    Coming soon
                  </div>
                </div>
              )
            }

            return (
              <a
                key={link.label}
                href={link.href}
                className={`whitespace-nowrap font-sans text-[13.5px] font-medium transition-colors duration-200 ${isActive
                  ? 'text-white border-b border-runway-amber pb-0.5'
                  : 'text-white/70 hover:text-white'
                  }`}
              >
                {link.label}
              </a>
            )
          })}
        </nav>

        {/* CTA + hamburger */}
        <div className="flex items-center gap-4 shrink-0">
          {user ? (
            <>
              <a
                href="/dashboard"
                className="hidden md:inline-flex items-center text-[13px] px-5 py-2 whitespace-nowrap font-sans font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-full transition-colors duration-200 shadow-[0_0_15px_rgba(37,99,235,0.4)]"
              >
                Pilot Portal
              </a>
              <button
                onClick={handleLogout}
                className="hidden md:inline-flex items-center text-[13px] px-4 py-2 whitespace-nowrap text-white/50 hover:text-white transition-colors duration-200"
              >
                Logout
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (isAuthPage) return
                setAuthModalOpen(true)
              }}
              className={`hidden md:inline-flex items-center text-[13px] px-5 py-2 whitespace-nowrap ${ctaClass}`}
            >
              Login
            </button>
          )}

          {/* Hamburger, mobile only */}
          <button
            className="lg:hidden flex flex-col justify-center gap-[5px] w-8 h-8"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <span className={`block w-6 h-0.5 bg-white/70 transition-all duration-300 origin-center ${menuOpen ? 'rotate-45 translate-y-[7px]' : ''}`} />
            <span className={`block w-6 h-0.5 bg-white/70 transition-all duration-300 ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-6 h-0.5 bg-white/70 transition-all duration-300 origin-center ${menuOpen ? '-rotate-45 -translate-y-[7px]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          className="lg:hidden bg-deep-ink/98 backdrop-blur-xl border-t border-white/[0.08] px-6 pt-5 flex flex-col gap-4 overflow-y-auto"
          style={{ maxHeight: 'calc(100dvh - 84px)', paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {/* Fleet expandable */}
          <div>
            <button
              className={`w-full text-left font-sans text-[15px] font-medium transition-colors flex items-center justify-between ${isFleetActive ? 'text-white' : 'text-white/80 hover:text-white'}`}
              onClick={() => setMobileFleetOpen(!mobileFleetOpen)}
              aria-expanded={mobileFleetOpen}
            >
              Fleet
              <svg
                width="14"
                height="14"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden="true"
                className={`transition-transform duration-200 ${mobileFleetOpen ? 'rotate-180' : ''}`}
              >
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {mobileFleetOpen && (
              <div className="mt-2 ml-3 flex flex-col gap-2 border-l border-white/[0.08] pl-4">
                {FLEET_ITEMS.map((item) =>
                  item.disabled ? (
                    <span
                      key={item.label}
                      className="font-sans text-[14px] text-white/30 cursor-default select-none"
                    >
                      {item.label}
                    </span>
                  ) : (
                    <a
                      key={item.label}
                      href={item.href!}
                      onClick={() => { setMenuOpen(false); setMobileFleetOpen(false) }}
                      className="font-sans text-[14px] text-white/70 hover:text-white transition-colors"
                    >
                      {item.label}
                    </a>
                  )
                )}
              </div>
            )}
          </div>

          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href

            if (link.disabled) {
              return (
                <span
                  key={link.label}
                  className="font-sans text-[15px] font-medium text-white/30 cursor-not-allowed flex items-center gap-2"
                  aria-disabled="true"
                >
                  {link.label}
                  <span className="text-[11px] text-white/40 tracking-wide">Coming soon</span>
                </span>
              )
            }

            return (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={`font-sans text-[15px] font-medium transition-colors ${isActive ? 'text-white' : 'text-white/80 hover:text-white'}`}
              >
                {link.label}
              </a>
            )
          })}

          {user && (
            <>
              <div className="my-1 h-px bg-white/[0.08]" />
              <Link
                href="/dashboard"
                onClick={() => setMenuOpen(false)}
                className="text-[10px] uppercase tracking-[0.18em] text-blue-100/70 transition-colors hover:text-blue-50"
              >
                Pilot Portal
              </Link>
              {visibleCustomerPortalLinks.map((link) => {
                const isActive = isPortalLinkActive(link.href, link.exact)
                return (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[14px] font-medium transition-colors ${
                      isActive
                        ? 'border-blue-300/35 bg-blue-500/20 text-blue-100'
                        : 'border-transparent text-white/80 hover:border-white/10 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[17px]" aria-hidden="true">{link.icon}</span>
                    <span>{link.label}</span>
                  </a>
                )
              })}
            </>
          )}

          {user ? (
            <>
              <a
                href="/dashboard"
                onClick={() => setMenuOpen(false)}
                className="mt-2 inline-flex justify-center text-sm px-5 py-3 font-sans font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-full transition-colors duration-200"
              >
                Pilot Portal
              </a>
              <button
                onClick={() => { setMenuOpen(false); handleLogout() }}
                className="mt-1 inline-flex justify-center text-sm px-5 py-3 text-white/50 hover:text-white transition-colors duration-200"
              >
                Logout
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                if (isAuthPage) return
                setAuthModalOpen(true)
              }}
              className={`mt-2 inline-flex justify-center text-sm px-5 py-3 ${ctaClass}`}
            >
              Login
            </button>
          )}
        </div>
      )}

      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </header>
  )
}
