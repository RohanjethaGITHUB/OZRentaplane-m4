'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type NavItem = {
  label: string
  href: string
  matchPrefixes?: string[]
  excludePrefixes?: string[]
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Overview',
    href: '/admin',
    matchPrefixes: ['/admin'],
    excludePrefixes: [
      '/admin/customers', '/admin/all-customers', '/admin/pending-verifications',
      '/admin/on-hold', '/admin/rejected-users', '/admin/verified-users',
      '/admin/users', '/admin/messages', '/admin/bookings', '/admin/aircraft',
      '/admin/settings', '/admin/debug',
    ],
  },
  {
    label: 'Customers',
    href: '/admin/customers',
    matchPrefixes: ['/admin/customers', '/admin/all-customers', '/admin/users', '/admin/verified-users', '/admin/on-hold', '/admin/rejected-users'],
  },
  {
    label: 'Verifications',
    href: '/admin/pending-verifications',
    matchPrefixes: ['/admin/pending-verifications'],
  },
  {
    label: 'Bookings',
    href: '/admin/bookings',
    matchPrefixes: ['/admin/bookings'],
    excludePrefixes: ['/admin/bookings/calendar'],
  },
  {
    label: 'Calendar',
    href: '/admin/bookings/calendar',
    matchPrefixes: ['/admin/bookings/calendar'],
  },
  {
    label: 'Aircraft',
    href: '/admin/aircraft',
    matchPrefixes: ['/admin/aircraft'],
  },
  {
    label: 'Messages',
    href: '/admin/messages',
    matchPrefixes: ['/admin/messages'],
  },
  {
    label: 'Settings',
    href: '/admin/settings',
    matchPrefixes: ['/admin/settings'],
  },
]

function isActive(item: NavItem, pathname: string): boolean {
  const excluded = item.excludePrefixes?.some(p => pathname.startsWith(p))
  if (excluded) return false
  return item.matchPrefixes?.some(p => pathname.startsWith(p)) ?? (pathname === item.href)
}

export default function AdminPortalSubNav() {
  const pathname = usePathname()

  return (
    <nav
      className="sticky top-16 z-40 bg-[#0a0f18]/95 backdrop-blur-xl border-b border-white/[0.05]"
      aria-label="Admin operations navigation"
    >
      <div className="max-w-[1400px] mx-auto px-6 md:px-10">
        <ul className="flex items-center overflow-x-auto scrollbar-none h-11">
          {NAV_ITEMS.map(item => {
            const active = isActive(item, pathname)
            return (
              <li key={item.href} className="flex-shrink-0">
                <Link
                  href={item.href}
                  className={`relative flex items-center h-11 px-4 text-[10.5px] font-bold uppercase tracking-[0.12em] transition-colors duration-200 whitespace-nowrap ${
                    active
                      ? 'text-[#a7c8ff]'
                      : 'text-white/30 hover:text-white/65'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute bottom-0 left-4 right-4 h-[2px] bg-[#a7c8ff] rounded-t-full" />
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}
