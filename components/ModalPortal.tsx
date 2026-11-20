'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  children: ReactNode
  lockScroll?: boolean
}

// Shared scroll lock: counts open modals so that when several are open at once
// (or close in any order) the page is only unlocked after the last one closes,
// and always back to the value it had before the first one opened.
let openLocks = 0
let overflowBeforeLock = ''

function acquireScrollLock() {
  if (openLocks === 0) {
    overflowBeforeLock = document.body.style.overflow === 'hidden' ? '' : document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  openLocks += 1
}

function releaseScrollLock() {
  openLocks = Math.max(0, openLocks - 1)
  if (openLocks === 0) document.body.style.overflow = overflowBeforeLock
}

export default function ModalPortal({ children, lockScroll = true }: Props) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!lockScroll) return
    acquireScrollLock()
    return releaseScrollLock
  }, [lockScroll])

  if (!mounted) return null
  return createPortal(children, document.body)
}
