'use client'

import { useState } from 'react'
import { updateCustomerPilotArn } from '@/app/actions/admin'

type Props = {
  customerId: string
  initialArn: string | null
}

export default function PilotMetadataEditor({ customerId, initialArn }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [arn, setArn] = useState(initialArn || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setError('')
    if (!arn.trim()) {
      setError('ARN cannot be empty.')
      return
    }

    setLoading(true)
    try {
      await updateCustomerPilotArn(customerId, arn.trim())
      setIsEditing(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update.'
      setError(msg.replace('VALIDATION:', '').trim())
    } finally {
      setLoading(false)
    }
  }

  function handleCancel() {
    setArn(initialArn || '')
    setError('')
    setIsEditing(false)
  }

  if (!isEditing) {
    return (
      <div className="group flex items-center gap-3 mt-1 cursor-pointer" onClick={() => setIsEditing(true)}>
        {initialArn ? (
          <p className="text-blue-200 text-sm font-mono">{initialArn}</p>
        ) : (
          <p className="text-amber-400 text-sm italic">Not set</p>
        )}
        <span className="material-symbols-outlined text-sm text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" style={{ fontVariationSettings: "'wght' 300" }}>edit</span>
      </div>
    )
  }

  return (
    <div className="mt-1 space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={arn}
          onChange={e => setArn(e.target.value)}
          disabled={loading}
          placeholder="Enter ARN..."
          className="w-full max-w-[200px] px-3 py-1.5 bg-[#050B14] border border-white/10 focus:border-oz-blue/50 focus:outline-none rounded-lg text-white text-xs font-mono transition-colors disabled:opacity-50"
          autoFocus
        />
        <button
          onClick={handleSave}
          disabled={loading}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
          title="Save"
        >
          {loading ? (
             <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
          ) : (
             <span className="material-symbols-outlined text-sm">check</span>
          )}
        </button>
        <button
          onClick={handleCancel}
          disabled={loading}
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
          title="Cancel"
        >
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>
      {error && <p className="text-[10px] text-red-400">{error}</p>}
    </div>
  )
}
