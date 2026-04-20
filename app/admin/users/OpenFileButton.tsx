'use client'

import { useState } from 'react'
import { getSignedDocumentUrl } from '@/app/actions/admin'

type Props = {
  storagePath: string
  fileName: string
  /**
   * When true, renders as an invisible full-card overlay instead of a visible button.
   * Use this to make the entire document card clickable while keeping the
   * explicit "Open File" button separately rendered for visibility.
   */
  asCardOverlay?: boolean
}

export default function OpenFileButton({ storagePath, fileName, asCardOverlay = false }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError]    = useState('')

  async function handleOpen(e: React.MouseEvent) {
    // Prevent double-triggering if both overlay and button are in the same card
    e.stopPropagation()
    setLoading(true)
    setError('')
    try {
      const url = await getSignedDocumentUrl(storagePath)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      setError('Unable to open file. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Invisible full-card overlay — sits on top of the card content
  if (asCardOverlay) {
    return (
      <button
        onClick={handleOpen}
        disabled={loading}
        aria-label={`Open ${fileName}`}
        className="absolute inset-0 z-0 cursor-pointer rounded-xl"
        tabIndex={-1}  // skip in tab order — explicit button handles keyboard
      />
    )
  }

  // Standard visible button
  return (
    <div className="relative z-10">
      <button
        onClick={handleOpen}
        disabled={loading}
        className="flex items-center gap-1 text-xs text-blue-200 hover:text-white transition-colors disabled:opacity-50"
      >
        {loading ? (
          <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
        ) : (
          <>
            <span>Open File</span>
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'wght' 300" }}>open_in_new</span>
          </>
        )}
      </button>
      {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
    </div>
  )
}
