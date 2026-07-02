'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { updatePilotClearanceStatus } from '@/app/actions/admin'

type Props = {
  customerId: string
  currentStatus: string
  activeBookingsSummary: {
    count: number
    primaryBookingId: string | null
  } | null
}

const STATUS_OPTIONS = [
  { value: 'cleared_to_fly', label: 'Cleared to fly' },
  { value: 'checkout_requested', label: 'Checkout required' },
  { value: 'additional_checkout_required', label: 'Additional checkout required' },
  { value: 'not_currently_eligible', label: 'Not eligible' },
]

function getStatusBadge(status: string): { label: string; className: string } {
  if (status === 'cleared_to_fly') {
    return { label: 'Cleared to fly', className: 'bg-green-50 text-green-700 border border-green-200' }
  }
  if (status === 'checkout_requested') {
    return { label: 'Checkout required', className: 'bg-amber-50 text-amber-700 border border-amber-200' }
  }
  if (status === 'additional_checkout_required') {
    return { label: 'Additional checkout required', className: 'bg-orange-50 text-orange-700 border border-orange-200' }
  }
  if (status === 'not_currently_eligible') {
    return { label: 'Not eligible', className: 'bg-red-50 text-red-700 border border-red-200' }
  }
  return { label: status, className: 'bg-gray-100 text-gray-600 border border-gray-200' }
}

export function AdminActionsPanel({ customerId, currentStatus, activeBookingsSummary }: Props) {
  const [selectedStatus, setSelectedStatus] = useState('')
  const [note, setNote] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const canSubmit = selectedStatus !== ''

  function handleUpdate() {
    startTransition(async () => {
      setSuccessMessage('')
      setErrorMessage('')
      try {
        await updatePilotClearanceStatus(customerId, selectedStatus, note)
        setSuccessMessage('Clearance status updated.')
        setNote('')
        window.setTimeout(() => setSuccessMessage(''), 3000)
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  const currentBadge = getStatusBadge(currentStatus)

  return (
    <section className="mt-6">
      <p className="text-[11px] font-medium tracking-widest uppercase text-gray-400 mb-3">
        Admin actions
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a4fd6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <line x1="12" y1="15" x2="12" y2="19" />
                <line x1="10" y1="17" x2="14" y2="17" />
              </svg>
            </div>
            <div>
              <p className="text-base font-bold text-[#152d5a]">Create booking</p>
              <p className="text-sm text-gray-500 leading-relaxed mt-1">
                Create a new booking on behalf of this customer without them needing to use the portal.
              </p>
            </div>
          </div>

          <hr className="border-t border-gray-100" />

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink: 0}}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Bypasses the standard self-service flow
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink: 0}}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Supports checkout and standard bookings
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink: 0}}>
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              Customer receives a confirmation email
            </div>
          </div>

          <div
            className={`rounded-lg border px-3 py-2 text-sm leading-5 ${
              activeBookingsSummary
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-slate-200 bg-slate-50 text-slate-500'
            }`}
          >
            {activeBookingsSummary ? (
              activeBookingsSummary.count === 1 && activeBookingsSummary.primaryBookingId ? (
                <>
                  <span className="font-medium">Active booking in progress.</span>{' '}
                  <Link
                    href={`/admin/bookings/requests/${activeBookingsSummary.primaryBookingId}`}
                    className="font-semibold text-[#1a4fd6] hover:text-[#152d5a] underline underline-offset-2"
                  >
                    View booking
                  </Link>
                </>
              ) : (
                <>
                  <span className="font-medium">{activeBookingsSummary.count} active bookings.</span>{' '}
                  <Link
                    href={`/admin/users/${customerId}?tab=bookings`}
                    className="font-semibold text-[#1a4fd6] hover:text-[#152d5a] underline underline-offset-2"
                  >
                    Open bookings tab
                  </Link>
                </>
              )
            ) : (
              <span>No active bookings</span>
            )}
          </div>

          <Link
            href={`/admin/users/${customerId}/create-booking`}
            className="mt-auto flex items-center justify-center gap-2 w-full bg-[#1a4fd6] hover:bg-[#1640b0] text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors"
          >
            Go to create booking
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </div>
            <div>
              <p className="text-base font-bold text-[#152d5a]">Checkout status</p>
              <p className="text-sm text-gray-500 leading-relaxed mt-1">
                Manually update this customer's checkout status, bypassing the normal checkout process.
              </p>
            </div>
          </div>

          <hr className="border-t border-gray-100" />

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-500">Current status</span>
              <span className={`text-sm font-medium px-2.5 py-1 rounded-full ${currentBadge.className}`}>
                {currentBadge.label}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-500">Set new status</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                disabled={isPending}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#152d5a] bg-white focus:outline-none focus:ring-2 focus:ring-[#1a4fd6]/20 focus:border-[#1a4fd6] disabled:opacity-50"
              >
                <option value="" disabled>
                  Select new status
                </option>
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-500">
                Admin note <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={isPending}
                placeholder="Add a reason for this override..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#152d5a] placeholder-gray-400 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-[#1a4fd6]/20 focus:border-[#1a4fd6] disabled:opacity-50"
              />
            </div>

            <button
              onClick={handleUpdate}
              disabled={isPending || !canSubmit}
              className="w-full bg-[#152d5a] hover:bg-[#0e1f3d] text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'Updating...' : 'Update checkout status'}
            </button>

            {successMessage && (
              <p className="text-xs text-green-600 font-medium">{successMessage}</p>
            )}
            {errorMessage && (
              <p className="text-xs text-red-600 font-medium">{errorMessage}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
