'use client'

import { usePathname } from 'next/navigation'

const BASE_OVERLAY = 'linear-gradient(to bottom, rgba(2,10,22,0.45), rgba(2,10,22,0.35), rgba(2,10,22,0.48))'
const DARKER_OVERLAY = 'linear-gradient(180deg, rgba(3,10,24,0.68) 0%, rgba(3,10,24,0.58) 45%, rgba(3,10,24,0.72) 100%)'

export default function CustomerDashboardBackgroundOverlay() {
  const pathname = usePathname()
  const isSettingsRoute = pathname === '/dashboard/settings' || pathname?.startsWith('/dashboard/settings/')

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0"
      style={{ background: isSettingsRoute ? BASE_OVERLAY : DARKER_OVERLAY }}
      aria-hidden="true"
    />
  )
}
