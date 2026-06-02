'use client'

import { useEffect, useState } from 'react'
import LoginContent from '@/app/login/LoginContent'

interface AuthModalProps {
  open: boolean
  onClose: () => void
}

export default function AuthModal({ open, onClose }: AuthModalProps) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [busy, onClose, open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-4 md:p-6">
      <button
        type="button"
        aria-label="Close authentication modal"
        onClick={() => {
          if (!busy) onClose()
        }}
        className="absolute inset-0 bg-[#03070f]/72 backdrop-blur-md"
      />
      <div className="relative z-10 w-full flex items-center justify-center">
        <LoginContent presentation="modal" onRequestClose={onClose} onBusyChange={setBusy} />
      </div>
    </div>
  )
}
