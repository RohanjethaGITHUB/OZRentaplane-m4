'use client'

import { useState } from 'react'
import { updateDocumentExpiryDate } from '@/app/actions/admin'

type Props = {
  documentId: string
  customerId: string
  initialExpiry: string | null
  documentType: string
}

export default function DocumentExpiryEditor({ documentId, customerId, initialExpiry, documentType }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [expiry, setExpiry] = useState(initialExpiry || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isRequiredForBooking = documentType === 'pilot_licence' || documentType === 'medical_certificate'
  
  // Calculate if expired
  let isExpired = false
  let isExpiringSoon = false
  if (initialExpiry) {
    const expDate = new Date(initialExpiry)
    const now = new Date()
    isExpired = expDate < now
    
    // Expiring within 30 days
    const thirtyDaysFromNow = new Date()
    thirtyDaysFromNow.setDate(now.getDate() + 30)
    if (!isExpired && expDate <= thirtyDaysFromNow) {
      isExpiringSoon = true
    }
  }

  const isMissing = isRequiredForBooking && !initialExpiry

  async function handleSave() {
    setError('')
    setLoading(true)
    try {
      await updateDocumentExpiryDate(documentId, customerId, expiry.trim() || null)
      setIsEditing(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update.')
    } finally {
      setLoading(false)
    }
  }

  function handleCancel() {
    setExpiry(initialExpiry || '')
    setError('')
    setIsEditing(false)
  }

  // Formatting date
  const displayExpiry = initialExpiry 
    ? new Date(initialExpiry).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'None Set'

  if (!isEditing) {
    return (
      <div className="mt-4 pt-4 border-t border-white/5 relative z-10" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-end group cursor-pointer" onClick={() => setIsEditing(true)}>
          <div className="text-[10px] text-slate-500">
            <p className="uppercase tracking-tighter flex items-center gap-1 group-hover:text-blue-300 transition-colors">
              Expiry Date
              <span className="material-symbols-outlined text-[10px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ fontVariationSettings: "'wght' 300" }}>edit</span>
            </p>
            <p className={`font-bold mt-0.5 ${
              isExpired ? 'text-red-400' 
              : isExpiringSoon ? 'text-amber-400'
              : isMissing ? 'text-amber-400 italic'
              : 'text-blue-100'
            }`}>
              {displayExpiry}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {isExpired && <span className="px-1.5 py-0.5 bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] uppercase font-bold tracking-widest rounded">Expired</span>}
            {isExpiringSoon && <span className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] uppercase font-bold tracking-widest rounded">Expiring Soon</span>}
            {isMissing && <span className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] uppercase font-bold tracking-widest rounded">Required</span>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4 pt-4 border-t border-white/5 relative z-20" onClick={(e) => e.stopPropagation()}>
      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-tighter text-blue-300">Edit Expiry Date</label>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={expiry}
            onChange={e => setExpiry(e.target.value)}
            disabled={loading}
            className="w-full px-2 py-1.5 bg-[#050B14] border border-white/10 focus:border-oz-blue/50 focus:outline-none rounded-lg text-white text-xs transition-colors disabled:opacity-50 [color-scheme:dark]"
            autoFocus
          />
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors flex-shrink-0 disabled:opacity-50"
            title="Save"
          >
            {loading ? (
               <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
            ) : (
               <span className="material-symbols-outlined text-[14px]">check</span>
            )}
          </button>
          <button
            onClick={handleCancel}
            disabled={loading}
            className="flex items-center justify-center w-7 h-7 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0 disabled:opacity-50"
            title="Cancel"
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
        {error && <p className="text-[10px] text-red-400">{error}</p>}
        {isMissing && !expiry && <p className="text-[9px] text-amber-400/80 leading-tight">Must set expiry before document supports booking access.</p>}
      </div>
    </div>
  )
}
