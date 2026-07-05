'use client'

import { useEffect, useRef } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import ModalPortal from '@/components/ModalPortal'

type SuccessModalProps = {
  open: boolean
  eyebrow?: string
  title: string
  message: string
  actionLabel?: string
  actionUrl?: string
  onClose: () => void
}

export default function SuccessModal({
  open,
  eyebrow,
  title,
  message,
  actionLabel,
  actionUrl,
  onClose,
}: SuccessModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    closeButtonRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
        <button
          type="button"
          aria-label="Close success dialog"
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="purchase-success-title"
          className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-[#1a4fd6] text-white shadow-[0_32px_100px_rgba(2,10,22,0.35)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="absolute inset-x-0 top-0 h-1.5 bg-white/25" />

          <div className="flex items-start gap-4 px-6 pb-5 pt-6">
            <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white">
              <CheckCircle2 className="h-6 w-6" />
            </div>

            <div className="min-w-0 flex-1">
              {eyebrow ? (
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75">
                  {eyebrow}
                </p>
              ) : null}
              <h3 id="purchase-success-title" className="mt-1 text-2xl font-semibold leading-tight">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-white/88">{message}</p>

              {actionUrl && actionLabel ? (
                <a
                  href={actionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#1a4fd6] transition-colors hover:bg-[#f3f7ff]"
                >
                  <span className="material-symbols-outlined text-[18px]">download</span>
                  {actionLabel}
                </a>
              ) : null}
            </div>

            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close success dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
