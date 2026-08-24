'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  note: string
  label?: string
  tooltipTitle?: string
}

const EDGE_PAD = 16
const MAX_TOOLTIP_W = 352 // 22rem

export default function AdminCancelNote({
  note,
  label = 'Checkout cancelled by admin — ',
  tooltipTitle = 'Cancelled by admin',
}: Props) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const tooltipId = useId()
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{
    top: number
    left: number
    width: number
    caretLeft: number
  } | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return

    const update = () => {
      const el = triggerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const vw = window.innerWidth
      const width = Math.min(vw - EDGE_PAD * 2, MAX_TOOLTIP_W)
      // Prefer aligning to the start of the admin message
      const preferredLeft = rect.left
      const left = Math.min(
        Math.max(EDGE_PAD, preferredLeft),
        Math.max(EDGE_PAD, vw - width - EDGE_PAD),
      )
      // Keep caret pointing at message start even when bubble is shifted
      const caretLeft = Math.min(
        Math.max(12, preferredLeft - left + 8),
        width - 18,
      )
      setCoords({
        top: rect.top - 8,
        left,
        width,
        caretLeft,
      })
    }

    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  // Close on outside tap (mobile)
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <>
      <div className="flex min-w-0 max-w-full items-center gap-1.5">
        <span
          className="material-symbols-outlined shrink-0 text-[14px] leading-none text-red-500"
          style={{ fontVariationSettings: "'FILL' 1" }}
          aria-hidden
        >
          cancel
        </span>
        <span className="shrink-0 text-[12px] font-medium leading-none text-red-500">
          {label}&nbsp;
        </span>
        <span
          ref={triggerRef}
          className="min-w-0 flex-1 truncate text-[12px] font-medium leading-none cursor-help text-[#334155] underline decoration-dotted decoration-[#334155]/50 underline-offset-2 outline-none"
          tabIndex={0}
          aria-describedby={open ? tooltipId : undefined}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onClick={() => {
            // Touch devices: tap to open (no hover)
            if (typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches) return
            setOpen(true)
          }}
        >
          {note}
        </span>
      </div>

      {mounted && open && coords
        ? createPortal(
            <div
              id={tooltipId}
              role="tooltip"
              className="pointer-events-none fixed z-[9999] -translate-y-full"
              style={{
                top: coords.top,
                left: coords.left,
                width: coords.width,
              }}
            >
              <div className="rounded-xl bg-[#152d5a] px-3.5 py-3 text-[12px] font-medium leading-relaxed text-white shadow-[0_12px_28px_rgba(15,30,52,0.28)]">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/60">
                  {tooltipTitle}
                </p>
                <p className="whitespace-normal break-words text-white/95">{note}</p>
              </div>
              <div
                className="h-0 w-0 border-x-[6px] border-t-[6px] border-x-transparent border-t-[#152d5a]"
                style={{ marginLeft: coords.caretLeft }}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
