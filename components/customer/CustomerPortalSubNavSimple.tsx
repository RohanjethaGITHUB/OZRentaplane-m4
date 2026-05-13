'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { label: 'Dashboard', href: '/dashboard', exact: true },
  { label: 'Checkout', href: '/dashboard/checkout' },
  { label: 'Bookings', href: '/dashboard/bookings' },
  { label: 'Profile', href: '/dashboard/settings' },
  { label: 'Messages', href: '/dashboard/messages' },
]

function isActive(pathname: string | null, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href
  return pathname === href || (pathname?.startsWith(href + '/') ?? false)
}

export default function CustomerPortalSubNavSimple() {
  const pathname = usePathname()

  return (
    <div className="relative z-40 -mt-px">
      <div className="max-w-[1400px] mx-auto px-6 md:px-10">
        <div className="flex justify-center">
          <ul className="inline-flex items-center gap-6 md:gap-8 overflow-x-auto whitespace-nowrap px-6 md:px-10 py-3 bg-[#0f1c30] border border-white/[0.06] rounded-b-xl shadow-[0_8px_22px_rgba(2,8,16,0.35)]">
            {ITEMS.map((item) => {
              const active = isActive(pathname, item.href, item.exact)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`text-[11px] tracking-[0.16em] uppercase font-semibold transition-colors border-b pb-1 ${
                      active
                        ? 'text-[#f4c84f] border-[#f4c84f]/90'
                        : 'text-[#9db0cc] border-transparent hover:text-[#d7e2ff]'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
