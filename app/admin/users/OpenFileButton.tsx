'use client'

import { useState } from 'react'
import { getSignedDocumentUrl } from '@/app/actions/admin'

type Props = {
  storagePath: string
  fileName: string
}

export default function OpenFileButton({ storagePath, fileName }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError]    = useState('')

  async function handleOpen() {
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

  return (
    <div>
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
