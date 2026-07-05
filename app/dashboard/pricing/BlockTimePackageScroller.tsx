'use client'

import { useEffect } from 'react'

export default function BlockTimePackageScroller({ targetId }: { targetId: string | null }) {
  useEffect(() => {
    if (!targetId) return

    const element = document.getElementById(targetId)
    if (!element) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    window.requestAnimationFrame(() => {
      element.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'center',
      })
    })
  }, [targetId])

  return null
}
