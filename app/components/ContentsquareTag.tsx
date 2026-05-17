'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'

export default function ContentsquareTag() {
  const pathname = usePathname()

  if (pathname?.startsWith('/admin')) {
    return null
  }

  return (
    // Contentsquare tracking tag
    <Script
      id="contentsquare-tracking"
      src="https://t.contentsquare.net/uxa/7768e33a06ae4.js"
      strategy="afterInteractive"
    />
  )
}
