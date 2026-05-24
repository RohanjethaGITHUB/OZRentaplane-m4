'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function AttentionBadge({ reason }: { reason: string }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current) return
      if (rootRef.current.contains(event.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  useLayoutEffect(() => {
    if (!open || !rootRef.current || !tipRef.current) return

    const updatePosition = () => {
      const iconRect = rootRef.current!.getBoundingClientRect()
      const tipRect = tipRef.current!.getBoundingClientRect()
      const viewportW = window.innerWidth
      const viewportH = window.innerHeight
      const gutter = 14

      let left = iconRect.left + iconRect.width / 2 - tipRect.width / 2
      left = Math.max(gutter, Math.min(left, viewportW - tipRect.width - gutter))

      const roomBelow = viewportH - iconRect.bottom
      const showAbove = roomBelow < tipRect.height + 16
      let top = showAbove ? iconRect.top - tipRect.height - 12 : iconRect.bottom + 12
      top = Math.max(gutter, Math.min(top, viewportH - tipRect.height - gutter))

      setCoords({ top, left })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  return (
    <span
      ref={rootRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`Attention: ${reason}`}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[12px] font-black leading-none text-white shadow-[0_0_0_1px_rgba(255,255,255,0.14),0_8px_18px_rgba(239,68,68,0.28)]"
      >
        !
      </button>
      {open && mounted
        ? createPortal(
            <div
              ref={tipRef}
              role="tooltip"
              className="fixed z-[2147483647] max-w-[360px] rounded-xl border border-red-300/25 bg-[#050914] px-4 py-3 text-[14px] font-medium leading-relaxed text-white shadow-[0_24px_70px_rgba(0,0,0,0.72),0_0_0_1px_rgba(255,255,255,0.06)]"
              style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
            >
              {reason}
            </div>,
            document.body,
          )
        : null}
    </span>
  )
}
