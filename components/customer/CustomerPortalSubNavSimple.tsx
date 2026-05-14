'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type CustomerPortalItem = {
  label: string
  href: string
  icon: string
  exact?: boolean
}

const ITEMS: CustomerPortalItem[] = [
  { label: 'Pilot Dashboard', href: '/dashboard', icon: 'dashboard', exact: true },
  { label: 'Checkout', href: '/dashboard/checkout', icon: 'flight_takeoff' },
  { label: 'Bookings', href: '/dashboard/bookings', icon: 'event' },
  { label: 'Profile', href: '/dashboard/settings', icon: 'person' },
]

function isActive(pathname: string | null, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href
  return pathname === href || (pathname?.startsWith(href + '/') ?? false)
}

export default function CustomerPortalSubNavSimple({ hideCheckout = false }: { hideCheckout?: boolean }) {
  const pathname = usePathname()
  const visibleItems = ITEMS.filter((item) => !(hideCheckout && item.href === '/dashboard/checkout'))

  return (
    <div className="relative max-w-full overflow-x-auto bg-transparent scrollbar-none">
      <div className="relative isolate mx-auto inline-flex w-fit min-w-max max-w-max items-center gap-2 rounded-b-2xl border border-white/[0.08] bg-[#071629]/82 px-2 py-1.5 backdrop-blur-xl shadow-[0_10px_24px_rgba(2,10,24,0.34)] before:pointer-events-none before:absolute before:-left-3 before:top-0 before:h-full before:w-4 before:-skew-x-[20deg] before:rounded-bl-xl before:border-l before:border-b before:border-white/[0.08] before:bg-[#071629]/82 after:pointer-events-none after:absolute after:-right-3 after:top-0 after:h-full after:w-4 after:skew-x-[20deg] after:rounded-br-xl after:border-r after:border-b after:border-white/[0.08] after:bg-[#071629]/82">
        {visibleItems.map((item) => {
          const active = isActive(pathname, item.href, item.exact)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm whitespace-nowrap transition-all ${
                active
                  ? 'border-[#9ec4ff]/45 bg-[#6aa6ff]/16 text-[#e8f3ff] shadow-[0_0_0_1px_rgba(120,170,255,0.22),0_0_18px_rgba(56,118,235,0.25)]'
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
