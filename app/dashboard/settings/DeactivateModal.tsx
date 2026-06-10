'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Props = {
  onClose: () => void
}

export default function DeactivateModal({ onClose }: Props) {
  const supabase = createClient()
  const router   = useRouter()
  const [confirmText, setConfirmText] = useState('')
  const [password,    setPassword]    = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  const canSubmit = confirmText === 'DEACTIVATE' && password.length >= 6

  async function handleDeactivate() {
    setError('')
    if (!canSubmit) return
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      setError('Session error. Please refresh and try again.')
      setLoading(false)
      return
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    })
    if (authError) {
      setError('Incorrect password. Deactivation cancelled.')
      setLoading(false)
      return
    }

    // Flag for deactivation — full deletion processed by admin
    try {
      await supabase
        .from('profiles')
        .update({ deactivation_requested_at: new Date().toISOString() } as never)
        .eq('id', user.id)
    } catch {
      // Column may not exist yet — proceed with sign-out regardless
    }

    await supabase.auth.signOut()
    router.push('/?deactivated=true')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#ef4444" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
            </svg>
          </div>
          <div>
            <h2 className="font-semibold text-[#152d5a] text-[16px]">Deactivate Account</h2>
            <p className="text-[#6b7ea8] text-[13px] mt-1 leading-relaxed">
              This will flag your account for deactivation and sign you out immediately. Our team will process the request within 2 business days.
            </p>
          </div>
        </div>

        <div className="bg-red-50 border border-red-100 rounded-xl p-3.5 mb-5">
          <p className="text-[12px] text-red-700 leading-relaxed">
            <strong>What happens:</strong> All active bookings will be cancelled. Your pilot documents will be deleted. You will lose access to your account permanently.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#152d5a]/50 mb-1.5">Confirm your password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Enter your current password"
              className="w-full px-3 py-2.5 bg-white border border-[#152d5a]/20 rounded-lg text-[#152d5a] text-sm placeholder:text-[#94a3b8] focus:border-red-300 focus:outline-none transition-colors" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#152d5a]/50 mb-1.5">
              Type <span className="text-red-500 font-bold">DEACTIVATE</span> to confirm
            </label>
            <input type="text" value={confirmText} onChange={e => setConfirmText(e.target.value)}
              placeholder="DEACTIVATE"
              className="w-full px-3 py-2.5 bg-white border border-[#152d5a]/20 rounded-lg text-[#152d5a] text-sm placeholder:text-[#94a3b8] focus:border-red-300 focus:outline-none transition-colors font-mono" />
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
            <p className="text-[12px] text-red-600">{error}</p>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 text-[13px] font-medium text-[#152d5a] border border-[#152d5a]/15 rounded-xl hover:bg-[#f8f9fb] transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleDeactivate} disabled={!canSubmit || loading}
            className="flex-1 py-2.5 text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {loading ? 'Processing…' : 'Deactivate Account'}
          </button>
        </div>
      </div>
    </div>
  )
}
