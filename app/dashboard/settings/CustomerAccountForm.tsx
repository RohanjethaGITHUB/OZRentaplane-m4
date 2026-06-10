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
      <section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-[#152d5a] mb-2">First Name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="w-full px-4 py-3.5 bg-white border border-[#152d5a]/20 rounded-lg text-[#152d5a] text-sm placeholder:text-[#94a3b8] focus:border-[#1a4fd6]/50 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-[#152d5a] mb-2">Last Name</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className="w-full px-4 py-3.5 bg-white border border-[#152d5a]/20 rounded-lg text-[#152d5a] text-sm placeholder:text-[#94a3b8] focus:border-[#1a4fd6]/50 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-[#152d5a] mb-2">Email Address</label>
            <input
              type="email"
              value={email}
              disabled
              readOnly
              className="w-full px-4 py-3.5 bg-white border border-[#152d5a]/20 rounded-lg text-[#6b7ea8] text-sm cursor-not-allowed transition-colors"
            />
          </div>

          <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-[#152d5a] mb-2">Country Code</label>
              <input
                type="text"
                value={phoneCountryCode}
                onChange={(e) => {
                  const value = e.target.value
                  if (/^\+?\d{0,4}$/.test(value)) setPhoneCountryCode(value)
                }}
                placeholder="+61"
                className="w-full px-4 py-3.5 bg-white border border-[#152d5a]/20 rounded-lg text-[#152d5a] text-sm placeholder:text-[#94a3b8] focus:border-[#1a4fd6]/50 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-[#152d5a] mb-2">Phone Number</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => {
                  const value = e.target.value
                  if (/^\d*$/.test(value)) setPhoneNumber(value)
                }}
                placeholder="Optional"
                className="w-full px-4 py-3.5 bg-white border border-[#152d5a]/20 rounded-lg text-[#152d5a] text-sm placeholder:text-[#94a3b8] focus:border-[#1a4fd6]/50 focus:outline-none transition-colors"
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
            className="flex items-center gap-2 bg-[#e8a020] hover:bg-[#d4911a] text-white font-semibold text-sm px-6 py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving…' : (
              <>
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/>
                </svg>
                Save Changes
              </>
            )}
          </button>
        </div>
      </section>
    </form>
  )
}
