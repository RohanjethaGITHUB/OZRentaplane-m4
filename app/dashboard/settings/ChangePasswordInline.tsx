'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  onClose: () => void
}

export default function ChangePasswordInline({ onClose }: Props) {
  const supabase = createClient()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword,     setNewPassword]     = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState('')
  const [success,         setSuccess]         = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!currentPassword) { setError('Please enter your current password.'); return }
    if (newPassword.length < 8) { setError('New password must be at least 8 characters.'); return }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return }

    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      setError('Session error. Please refresh and try again.')
      setLoading(false)
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    })
    if (signInError) {
      setError('Current password is incorrect.')
      setLoading(false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    setLoading(false)

    if (updateError) { setError(updateError.message); return }
    setSuccess(true)
  }

  if (success) {
    return (
      <div className="rounded-xl bg-[#f0fdf4] border border-[#16a34a]/20 p-4 flex items-start gap-3">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" className="flex-shrink-0 mt-0.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-[#16a34a]">Password updated successfully.</p>
          <p className="text-[12px] text-[#4b7a55] mt-0.5">You'll use your new password next time you log in.</p>
        </div>
        <button type="button" onClick={onClose} className="text-[#16a34a] hover:text-[#15803d] ml-1">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#152d5a]/50 mb-1.5">Current Password</label>
        <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
          placeholder="Enter your current password" autoComplete="current-password"
          className="w-full px-3 py-2.5 bg-white border border-[#152d5a]/20 rounded-lg text-[#152d5a] text-sm placeholder:text-[#94a3b8] focus:border-[#1a4fd6]/50 focus:outline-none transition-colors" />
      </div>
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#152d5a]/50 mb-1.5">New Password</label>
        <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
          placeholder="At least 8 characters" autoComplete="new-password"
          className="w-full px-3 py-2.5 bg-white border border-[#152d5a]/20 rounded-lg text-[#152d5a] text-sm placeholder:text-[#94a3b8] focus:border-[#1a4fd6]/50 focus:outline-none transition-colors" />
      </div>
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#152d5a]/50 mb-1.5">Confirm New Password</label>
        <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
          placeholder="Repeat new password" autoComplete="new-password"
          className="w-full px-3 py-2.5 bg-white border border-[#152d5a]/20 rounded-lg text-[#152d5a] text-sm placeholder:text-[#94a3b8] focus:border-[#1a4fd6]/50 focus:outline-none transition-colors" />
      </div>
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 flex items-center gap-2">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#ef4444" strokeWidth="2" className="flex-shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
          <p className="text-[12px] text-red-600">{error}</p>
        </div>
      )}
      <div className="flex items-center gap-3 pt-1">
        <button type="submit" disabled={loading}
          className="flex-1 bg-[#152d5a] hover:bg-[#1e3d7a] text-white font-semibold text-[13px] py-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          {loading ? 'Updating…' : 'Update Password'}
        </button>
        <button type="button" onClick={onClose}
          className="px-4 py-2.5 text-[13px] text-[#6b7ea8] border border-[#152d5a]/15 rounded-xl hover:bg-[#f8f9fb] transition-colors">
          Cancel
        </button>
      </div>
    </form>
  )
}
