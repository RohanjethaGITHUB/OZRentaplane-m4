'use client'

import { useEffect } from 'react'

/** Scrolls to a hash target after navigation (Next.js often skips native hash scroll). */
export default function ScrollToHash({ hash = 'payment' }: { hash?: string }) {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.hash !== `#${hash}`) return

    let attempts = 0
    const maxAttempts = 20

    const tryScroll = () => {
      const el = document.getElementById(hash)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
      attempts += 1
      if (attempts < maxAttempts) {
        window.setTimeout(tryScroll, 50)
      }
    }

    const timer = window.setTimeout(tryScroll, 50)
    return () => window.clearTimeout(timer)
  }, [hash])

  return null
}
