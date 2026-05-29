'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

const CLASS_NAME = 'screenshot-mode'

export default function ScreenshotMode() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const enabled = searchParams?.get('screenshotMode') === '1'
    const html = document.documentElement

    if (enabled) {
      html.setAttribute('data-screenshot-mode', 'true')
    } else {
      html.removeAttribute('data-screenshot-mode')
    }
  }, [searchParams])

  return null
}
