'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: 'dashboard', exact: true },
  { label: 'Checkout', href: '/dashboard/checkout', icon: 'flight_takeoff' },
  { label: 'Bookings', href: '/dashboard/bookings', icon: 'event' },
  { label: 'Profile', href: '/dashboard/settings', icon: 'person' },
] as const

function isActive(pathname: string | null, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href
  return pathname === href || (pathname?.startsWith(href + '/') ?? false)
}

export default function CustomerPortalSubNavSimple({ hideCheckout = false }: { hideCheckout?: boolean }) {
  const pathname = usePathname()
  const visibleItems = ITEMS.filter((item) => !(hideCheckout && item.href === '/dashboard/checkout'))

  return (
    <div className="hidden md:block">
      <div className="inline-flex min-w-max items-center gap-2 rounded-2xl border border-white/6 bg-[#0b1a2d] px-2 py-2 shadow-[0_6px_14px_rgba(2,10,24,0.24)]">
        <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-100/75">Customer Portal</p>

        {visibleItems.map((item) => {
          const active = isActive(pathname, item.href, item.exact)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm whitespace-nowrap transition-all ${
                active
                  ? 'border-blue-300/45 bg-blue-500/22 text-blue-50 shadow-[0_0_0_1px_rgba(96,165,250,0.24),0_0_20px_rgba(37,99,235,0.35)]'
                  : 'border-transparent text-slate-300 hover:border-white/12 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
