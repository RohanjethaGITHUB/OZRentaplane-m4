'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { updatePilotClearanceStatus } from '@/app/actions/admin'
import HistoricalCheckoutEditor from './HistoricalCheckoutEditor'
import { LoadingButtonContent } from '@/components/ui/Spinner'

type Props = {
  customerId: string
  currentStatus: string
  documentSummary: string
  activeBookingsSummary: {
    count: number
    primaryBookingId: string | null
  } | null
  selectedStatus: string
  onSelectedStatusChange: (status: string) => void
  historicalCheckout: {
    customerName: string
    clearanceStatus: string
    hasActiveCheckoutRequest: boolean
    defaultPicArn?: string | null
    aircraftOptions: Array<{ id: string; registration: string; displayName: string }>
    existingLogs: Array<{
      id: string
      aircraftId: string
      aircraftRegistration: string
      aircraftDisplayName: string | null
      flightDate: string
      picName: string
      picArn: string | null
      vdoStart: number | null
      vdoStop: number | null
      vdoTotal: number | null
      tachoStart: number | null
      tachoStop: number | null
      tachoTotal: number | null
      airSwitchStart: number | null
      airSwitchStop: number | null
      airSwitchTotal: number | null
      mrStart: number | null
      mrStop: number | null
      mrTotal: number | null
      oilAdded: number | null
      oilTotal: number | null
      fuelAdded: number | null
      fuelReturned: number | null
      landings: number | null
      source: string | null
      reviewStatus: string | null
    }>
    historicalRecord: {
      id: string
      checkoutDate: string
      checkoutOutcome: 'cleared_to_fly' | 'additional_checkout_required' | 'not_currently_eligible'
      adminNotes: string | null
      recordedAt: string
      recordedByName: string | null
      recordedByEmail: string | null
      linkedFlightLogId: string | null
      linkedFlightLogAircraftId: string | null
      linkedFlightLogAircraftRegistration: string | null
      linkedFlightLogDate: string | null
    } | null
  }
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

export function AdminActionsPanel({
  customerId,
  currentStatus,
  documentSummary,
  activeBookingsSummary,
  selectedStatus,
  onSelectedStatusChange,
  historicalCheckout,
}: Props) {
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [historicalOpen, setHistoricalOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const infoWrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!infoOpen) return

    function onMouseDown(event: MouseEvent) {
      const target = event.target as Node
      if (!infoWrapRef.current?.contains(target)) {
        setInfoOpen(false)
      }
    }

    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [infoOpen])

  const canSubmit = selectedStatus !== ''

  function handleUpdate() {
    startTransition(async () => {
      setSuccessMessage('')
      setErrorMessage('')
      try {
        await updatePilotClearanceStatus(customerId, selectedStatus)
        setSuccessMessage('Clearance status updated.')
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

      <div className="grid items-start grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="self-start h-fit bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-5">
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
              <p className="text-base font-bold text-[#152d5a]">Create Booking</p>
              <p className="text-sm text-gray-500 leading-relaxed mt-1">
                Manually create a checkout or standard booking request on this customer's behalf.
              </p>
            </div>
          </div>

          <hr className="border-t border-gray-100" />

          <div
            className={`rounded-lg border px-4 py-3 text-sm leading-6 ${
              activeBookingsSummary
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-slate-200 bg-slate-50 text-slate-500'
            }`}
          >
            <div className="space-y-2.5">
              <p className="flex items-center gap-2 text-[13px] font-medium text-[#152d5a]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#1a4fd6] flex-shrink-0" />
                <span>{documentSummary}</span>
              </p>
              <p className="flex items-center gap-2 text-[13px] font-medium text-[#152d5a]">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                <span>Clearance: {currentBadge.label}</span>
              </p>
              <p className="flex items-center gap-2 text-[13px] font-medium text-[#152d5a]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                {activeBookingsSummary ? (
                  activeBookingsSummary.count === 1 && activeBookingsSummary.primaryBookingId ? (
                    <span>
                      Active bookings: 1 in progress,{' '}
                      <Link
                        href={`/admin/bookings/requests/${activeBookingsSummary.primaryBookingId}`}
                        className="font-semibold text-[#1a4fd6] hover:text-[#152d5a] underline underline-offset-2"
                      >
                        view booking
                      </Link>
                    </span>
                  ) : (
                    <span>
                      Active bookings: {activeBookingsSummary.count}{' '}
                      <Link
                        href={`/admin/users/${customerId}?tab=bookings`}
                        className="font-semibold text-[#1a4fd6] hover:text-[#152d5a] underline underline-offset-2"
                      >
                        open bookings tab
                      </Link>
                    </span>
                  )
                ) : (
                  <span>Active bookings: none</span>
                )}
              </p>
            </div>
          </div>

          <Link
            href={`/admin/users/${customerId}/create-booking`}
            className="flex items-center justify-center gap-2 w-full bg-[#1a4fd6] hover:bg-[#1640b0] text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors"
          >
            Start New Booking
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
              <p className="text-base font-bold text-[#152d5a]">Update Checkout Result</p>
              <p className="text-sm text-gray-500 leading-relaxed mt-1">
                Manually set this customer's checkout result.
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
                onChange={(e) => onSelectedStatusChange(e.target.value)}
                disabled={isPending}
                className="appearance-none w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 pr-9 text-sm text-slate-900 shadow-sm transition-colors focus:outline-none focus:border-[#152d5a] focus:ring-1 focus:ring-[#152d5a] disabled:opacity-50"
              >
                <option value="" disabled>
                  Select new status
                </option>
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div ref={infoWrapRef} className="relative pt-2">
              <fieldset className="flex flex-col gap-2">
                <legend className="flex items-center gap-2 text-sm font-medium text-gray-500">
                  <span>Create a checkout flight record?</span>
                  <button
                    type="button"
                    onClick={() => {
                      console.log('[info-button] clicked, current infoOpen:', infoOpen)
                      setInfoOpen((v) => !v)
                    }}
                    aria-label="What does checkout flight record do?"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[#1a4fd6] transition-colors hover:bg-[#e0edff] hover:text-[#1540a8]"
                  >
                    <span
                      className="material-symbols-outlined text-[15px]"
                      style={{ fontVariationSettings: "'wght' 300" }}
                    >
                      info
                    </span>
                  </button>
                </legend>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-[#152d5a]">
                    <input
                      type="radio"
                      name={`checkout-flight-record-${customerId}`}
                      checked={historicalOpen}
                      onChange={() => setHistoricalOpen(true)}
                      className="h-4 w-4 border-gray-300 text-[#1a4fd6] focus:ring-[#1a4fd6]"
                    />
                    <span>Yes</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[#152d5a]">
                    <input
                      type="radio"
                      name={`checkout-flight-record-${customerId}`}
                      checked={!historicalOpen}
                      onChange={() => setHistoricalOpen(false)}
                      className="h-4 w-4 border-gray-300 text-[#1a4fd6] focus:ring-[#1a4fd6]"
                    />
                    <span>No</span>
                  </label>
                </div>
              </fieldset>
              {infoOpen ? (
                <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-10 rounded-2xl border border-[#152d5a]/15 bg-white p-4 shadow-[0_16px_40px_rgba(21,45,90,0.16)]">
                  <p className="text-[13px] leading-6 text-[#4b6390]">
                    Stores the checkout flight record, including completion date and any linked aircraft log details.
                  </p>
                </div>
              ) : null}
            </div>

            <button
              onClick={handleUpdate}
              disabled={isPending || !canSubmit}
              aria-busy={isPending || undefined}
              className="w-full bg-[#152d5a] hover:bg-[#0e1f3d] text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <LoadingButtonContent loading={isPending} loadingLabel="Updating...">
                Update checkout status
              </LoadingButtonContent>
            </button>

            {successMessage && (
              <p className="text-xs text-green-600 font-medium">{successMessage}</p>
            )}
            {errorMessage && (
              <p className="text-xs text-red-600 font-medium">{errorMessage}</p>
            )}

            <HistoricalCheckoutEditor
              renderMode="summary_only"
              customerId={customerId}
              customerName={historicalCheckout.customerName}
              clearanceStatus={historicalCheckout.clearanceStatus}
              hasActiveCheckoutRequest={historicalCheckout.hasActiveCheckoutRequest}
              defaultPicArn={historicalCheckout.defaultPicArn}
              aircraftOptions={historicalCheckout.aircraftOptions}
              existingLogs={historicalCheckout.existingLogs}
              historicalRecord={historicalCheckout.historicalRecord}
              checkoutOutcome={selectedStatus}
              isOpen={historicalOpen}
              onOpenChange={setHistoricalOpen}
            />
          </div>
          </div>
        </div>
    </section>
  )
}
