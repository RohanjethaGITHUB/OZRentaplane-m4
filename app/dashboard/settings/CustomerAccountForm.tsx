'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  userId: string
  email: string
  initialFirstName: string
  initialLastName: string
  initialPhoneCountryCode: string
  initialPhoneNumber: string
}

const CARD = 'bg-gradient-to-br from-[#0c1525] to-[#080e1c] border border-white/[0.07] rounded-xl shadow-[0_4px_30px_rgba(0,0,0,0.35)]'
const COUNTRY_CODE_REGEX = /^\+?\d{1,4}$/
const PHONE_NUMBER_REGEX = /^\d*$/

function buildFullName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim()
}

export default function CustomerAccountForm({
  userId,
  email,
  initialFirstName,
  initialLastName,
  initialPhoneCountryCode,
  initialPhoneNumber,
}: Props) {
  const supabase = createClient()

  const [firstName, setFirstName] = useState(initialFirstName)
  const [lastName, setLastName] = useState(initialLastName)
  const [phoneCountryCode, setPhoneCountryCode] = useState(initialPhoneCountryCode || '+61')
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    const nextFirstName = firstName.trim()
    const nextLastName = lastName.trim()
    const nextPhoneCountryCode = phoneCountryCode.trim() || '+61'
    const nextPhoneNumber = phoneNumber.trim()

    if (!nextFirstName) {
      setError('First name is required.')
      return
    }
    if (!nextLastName) {
      setError('Last name is required.')
      return
    }
    if (!COUNTRY_CODE_REGEX.test(nextPhoneCountryCode)) {
      setError('Country code must be + followed by 1-4 digits (or digits only).')
      return
    }
    if (!PHONE_NUMBER_REGEX.test(nextPhoneNumber)) {
      setError('Phone number can only contain digits.')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        first_name: nextFirstName,
        last_name: nextLastName,
        phone_country_code: nextPhoneCountryCode,
        phone_number: nextPhoneNumber || null,
        full_name: buildFullName(nextFirstName, nextLastName),
      })
      .eq('id', userId)

    setLoading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setSuccess('Profile updated successfully.')
    setFirstName(nextFirstName)
    setLastName(nextLastName)
    setPhoneCountryCode(nextPhoneCountryCode)
    setPhoneNumber(nextPhoneNumber)
  }

  return (
    <form className="space-y-6" onSubmit={handleSave}>
      <section className={`${CARD} p-8`}>
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-blue-400/80 mb-6">Personal Details</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-2">First Name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="w-full px-4 py-3 bg-[#05080f] border border-white/[0.07] rounded-lg text-white text-sm focus:border-blue-400/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-2">Last Name</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className="w-full px-4 py-3 bg-[#05080f] border border-white/[0.07] rounded-lg text-white text-sm focus:border-blue-400/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-2">Email Address</label>
            <input
              type="email"
              value={email}
              disabled
              readOnly
              className="w-full px-4 py-3 bg-[#05080f] border border-white/[0.07] rounded-lg text-white/50 text-sm cursor-not-allowed"
            />
          </div>

          <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
            <div>
              <label className="block text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-2">Country Code</label>
              <input
                type="text"
                value={phoneCountryCode}
                onChange={(e) => {
                  const value = e.target.value
                  if (/^\+?\d{0,4}$/.test(value)) setPhoneCountryCode(value)
                }}
                placeholder="+61"
                className="w-full px-4 py-3 bg-[#05080f] border border-white/[0.07] rounded-lg text-white text-sm focus:border-blue-400/60 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-2">Phone Number</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => {
                  const value = e.target.value
                  if (/^\d*$/.test(value)) setPhoneNumber(value)
                }}
                placeholder="Optional"
                className="w-full px-4 py-3 bg-[#05080f] border border-white/[0.07] rounded-lg text-white text-sm focus:border-blue-400/60 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {(error || success) && (
          <p className={`text-xs mt-5 ${error ? 'text-red-400' : 'text-emerald-400'}`}>
            {error || success}
          </p>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest bg-white text-[#07101c] hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving…' : 'Update Details'}
          </button>
        </div>
      </section>

      <section className={`${CARD} p-8 opacity-45 pointer-events-none select-none`}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-blue-400/80">Communication Preferences</h2>
          <span className="text-[9px] uppercase tracking-widest text-amber-400 border border-amber-400/20 px-2 py-0.5 rounded">Coming Soon</span>
        </div>
        <div className="space-y-3">
          {['Email Notifications', 'SMS Alerts'].map((label) => (
            <div key={label} className="flex items-center justify-between p-4 bg-white/[0.025] rounded-xl border border-white/[0.06]">
              <p className="text-sm text-white font-medium">{label}</p>
              <div className="w-10 h-5 bg-white/10 rounded-full" />
            </div>
          ))}
        </div>
      </section>
    </form>
  )
}
