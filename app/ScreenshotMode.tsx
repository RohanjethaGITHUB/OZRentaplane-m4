'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

const CLASS_NAME = 'screenshot-mode'

export default function ScreenshotMode() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const enabled = searchParams?.get('screenshot') === '1'
    const html = document.documentElement
    const body = document.body

    html.classList.toggle(CLASS_NAME, enabled)
    body.classList.toggle(CLASS_NAME, enabled)
  }, [searchParams])

  return null
}
