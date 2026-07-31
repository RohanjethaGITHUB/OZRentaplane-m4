'use client'

import { useEffect, useRef } from 'react'
import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import ModalPortal from '@/components/ModalPortal'
import Spinner from '@/components/ui/Spinner'

type ConfirmModalProps = {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'primary' | 'danger'
  isPending?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export default function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  variant = 'primary',
  isPending = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    confirmButtonRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isPending) onCancel()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel, isPending])

  if (!open) return null

  const isDanger = variant === 'danger'
  const icon = isDanger ? (
    <AlertTriangle className="h-6 w-6 text-rose-500" />
  ) : (
    <CheckCircle2 className="h-6 w-6 text-blue-600" />
  )

  const confirmButtonClass = isDanger
    ? 'bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-70'
    : 'bg-[#1a4fd6] hover:bg-[#1540a8] text-white disabled:opacity-70'

  const panelAccentClass = isDanger
    ? 'border-rose-200 bg-rose-50'
    : 'border-blue-200 bg-blue-50'

  const resolvedConfirmLabel = confirmLabel ?? (isDanger ? 'Yes, confirm' : 'Continue')

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
        <button
          type="button"
          aria-label="Close confirmation dialog"
          onClick={isPending ? undefined : onCancel}
          disabled={isPending}
          className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm disabled:cursor-default"
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
          aria-busy={isPending || undefined}
          className={`relative z-10 w-full max-w-md rounded-2xl border shadow-2xl ${panelAccentClass} bg-white`}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-start gap-4 px-6 pt-6">
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white border border-slate-200 shadow-sm">
              {icon}
            </div>
            <div className="min-w-0 flex-1">
              <h3 id="confirm-modal-title" className="text-lg font-semibold text-slate-900">
                {title}
              </h3>
              {description && (
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onCancel}
              disabled={isPending}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              aria-label="Close confirmation dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-6">
            <button
              type="button"
              onClick={onCancel}
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmButtonRef}
              type="button"
              onClick={onConfirm}
              disabled={isPending}
              aria-busy={isPending || undefined}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${confirmButtonClass}`}
            >
              {isPending && <Spinner size="sm" variant="ring" />}
              {resolvedConfirmLabel}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
