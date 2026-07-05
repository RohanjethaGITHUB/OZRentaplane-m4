'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type PortalLink = {
  label: string
  href: string
  icon: string
  exact?: boolean
}

type CustomerPortalNavProps = {
  firstName: string
  email: string
  hideCheckout?: boolean
}

const BASE_PORTAL_LINKS: PortalLink[] = [
  { label: 'Dashboard', href: '/dashboard', icon: 'dashboard', exact: true },
  { label: 'Documents', href: '/dashboard/documents', icon: 'description' },
  { label: 'Bookings', href: '/dashboard/bookings', icon: 'event' },
  { label: 'Pricing', href: '/dashboard/pricing', icon: 'sell' },
]

const CHECKOUT_LINK: PortalLink = { label: 'Checkout', href: '/dashboard/checkout', icon: 'flight_takeoff' }

const BOTTOM_NAV_LINKS: PortalLink[] = [
  { label: 'Home', href: '/dashboard', icon: 'dashboard', exact: true },
  { label: 'Bookings', href: '/dashboard/bookings', icon: 'event' },
  { label: 'Documents', href: '/dashboard/documents', icon: 'description' },
]

function isActive(pathname: string | null, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false)
}

function initialsFor(firstName: string, email: string): string {
  const source = firstName.trim().charAt(0) || email.trim().charAt(0) || 'P'
  return source.toUpperCase()
}

function buildPortalLinks(hideCheckout: boolean): PortalLink[] {
  if (hideCheckout) return BASE_PORTAL_LINKS
  return [BASE_PORTAL_LINKS[0], CHECKOUT_LINK, ...BASE_PORTAL_LINKS.slice(1)]
}

export default function CustomerPortalNav({ firstName, email, hideCheckout = false }: CustomerPortalNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const portalLinks = buildPortalLinks(hideCheckout)
  const avatarInitial = initialsFor(firstName, email)
  const displayName = firstName.trim() || email.split('@')[0] || 'Pilot'

  useEffect(() => {
    function onMouseDown(event: MouseEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  async function handleLogout() {
    setMenuOpen(false)
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          backgroundColor: 'rgba(22, 48, 92, 0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(167, 200, 255, 0.12)',
        }}
      >
        <div className="relative max-w-[1400px] mx-auto h-[64px] px-6 md:px-10 flex items-center justify-between gap-6">
          <Link
            href="/"
            className="shrink-0 flex items-center gap-3 select-none"
            style={{
              borderLeft: '3px solid rgba(245, 158, 11, 0.6)',
              paddingLeft: '12px',
            }}
          >
            <img
              src="/Logo/ozrentaplane-transparent-bg.png"
              alt="OZRentAPlane logo"
              className="block h-12 w-auto object-contain bg-transparent"
              style={{
                filter: 'drop-shadow(0 0 8px rgba(167,200,255,0.45)) drop-shadow(0 0 3px rgba(167,200,255,0.3))',
              }}
            />
            <div className="flex flex-col justify-center leading-none">
              <span
                style={{
                  fontFamily: 'Manrope, system-ui, sans-serif',
                  fontSize: '20px',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  color: '#f59e0b',
                }}
              >
                OZ
              </span>
              <span
                style={{
                  fontFamily: 'Manrope, system-ui, sans-serif',
                  fontSize: '13px',
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  color: 'rgba(167,200,255,0.85)',
                  textTransform: 'uppercase',
                }}
              >
                Rent A Plane
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-6">
            {portalLinks.map((link) => {
              const active = isActive(pathname, link.href, link.exact)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`inline-flex items-center gap-1.5 text-[13.5px] font-medium font-sans transition-colors ${
                    active
                      ? 'text-[#f59e0b] border-b-2 border-[#f59e0b] pb-0.5'
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                    {link.icon}
                  </span>
                  <span>{link.label}</span>
                </Link>
              )
            })}
          </nav>

          <div className="relative shrink-0" ref={containerRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="w-8 h-8 rounded-full bg-[#1a4fd6] flex items-center justify-center text-white text-[13px] font-bold font-sans"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Open account menu"
            >
              {avatarInitial}
            </button>

            {menuOpen && (
              <div className="absolute top-full right-0 mt-2 w-52 rounded-xl border border-white/[0.08] bg-[#0d1e34] shadow-2xl py-1">
                <div className="px-4 py-3 border-b border-white/[0.06]">
                  <div className="text-[13px] font-semibold text-white">{displayName}</div>
                  <div className="text-[11px] text-white/50 truncate">{email}</div>
                </div>

                <Link
                  href="/dashboard/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-white/75 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                    settings
                  </span>
                  <span>Profile</span>
                </Link>

                <Link
                  href="/"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-white/75 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                    home
                  </span>
                  <span>Back to main site</span>
                </Link>

                <div className="my-1 h-px bg-white/[0.06]" />

                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-white/75 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                    logout
                  </span>
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
        style={{
          backgroundColor: 'rgba(22, 48, 92, 0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(167, 200, 255, 0.12)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="flex items-center justify-around px-2 pt-2 pb-2">
          {BOTTOM_NAV_LINKS.map((link) => {
            const active = isActive(pathname, link.href, link.exact)
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg transition-colors"
              >
                <span
                  className={`material-symbols-outlined text-[22px] ${
                    active ? 'text-[#f59e0b]' : 'text-white/50 hover:text-white/80'
                  }`}
                  aria-hidden="true"
                >
                  {link.icon}
                </span>
                <span className={`text-[10px] font-medium font-sans tracking-wide ${active ? 'text-[#f59e0b]' : 'text-white/50'}`}>
                  {link.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
