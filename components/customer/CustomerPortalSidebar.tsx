'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  { label: 'Checkout', href: '/dashboard/checkout', icon: 'flight_takeoff' },
  { label: 'Bookings', href: '/dashboard/bookings', icon: 'event' },
  { label: 'Profile', href: '/dashboard/settings', icon: 'person' },
] as const

export default function CustomerPortalSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-full md:w-[260px] md:min-h-screen bg-[#071426] text-white border-r border-white/10 md:sticky md:top-0 md:self-start md:flex md:flex-col">
      <div className="p-5 md:p-6">
        <Link href="/dashboard" className="block">
          <p className="text-lg font-semibold tracking-tight">Oz Rent A Plane</p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-blue-200/70 mt-1">Customer Portal</p>
        </Link>
      </div>

      <nav className="px-3 pb-4">
        <ul className="flex md:block gap-2 overflow-x-auto md:overflow-visible">
          {NAV.map((item) => {
            const active = pathname === item.href || (pathname?.startsWith(`${item.href}/`) ?? false)
            return (
              <li key={item.href} className="md:mb-1">
                <Link
                  href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm whitespace-nowrap border transition-colors ${
                    active
                      ? 'bg-blue-500/20 border-blue-400/35 text-blue-100'
                      : 'border-transparent text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="hidden md:block p-4 mt-auto">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-semibold">Need help?</p>
          <p className="text-xs text-slate-300 mt-1">We&apos;re here to help you get ready to fly.</p>
          <Link href="/dashboard/messages" className="inline-block text-xs text-blue-200 mt-3 hover:text-white">
            Contact support
          </Link>
        </div>
      </div>
    </aside>
  )
}
