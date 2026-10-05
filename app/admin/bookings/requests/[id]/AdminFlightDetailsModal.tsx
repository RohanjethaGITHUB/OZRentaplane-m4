'use client'

import { useEffect, useState } from 'react'
import ModalPortal from '@/components/ModalPortal'
import DocumentViewerModal, { type DocumentFile } from '@/components/ui/DocumentViewerModal'
import type { FlightDetailsData } from './flight-details-types'

function formatCurrency(cents: number | null | undefined): string {
  if (cents == null || isNaN(cents)) return '$0.00'
  return `$${(cents / 100).toFixed(2)}`
}

function formatReading(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '—'
  return val.toFixed(1)
}

function getStatusBadge(status: string, hasReceipt?: boolean) {
  if (
    status === 'bank_transfer_pending_review' ||
    status === 'payment_verification_pending' ||
    status === 'pending_review' ||
    (hasReceipt && status !== 'paid' && status !== 'settled' && status !== 'waived')
  ) {
    return {
      label: 'Payment Verification Pending',
      bg: 'bg-amber-500/25 text-amber-200 border-amber-400/40',
      icon: 'hourglass_top',
    }
  }

  switch (status) {
    case 'paid':
    case 'settled':
      return {
        label: 'Paid in Full',
        bg: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
        icon: 'check_circle',
      }
    case 'waived':
      return {
        label: 'Payment Waived',
        bg: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
        icon: 'verified',
      }
    case 'payment_required':
    case 'payment_pending':
      return {
        label: 'Payment Pending',
        bg: 'bg-amber-500/20 text-amber-200 border-amber-400/40',
        icon: 'hourglass_top',
      }
    default:
      return {
        label: status.replace(/_/g, ' '),
        bg: 'bg-white/10 text-slate-200 border-white/20',
        icon: 'info',
      }
  }
}

export function AdminFlightDetailsModal({
  data,
  isOpen,
  onClose,
}: {
  data: FlightDetailsData | null
  isOpen: boolean
  onClose: () => void
}) {
  const [evidenceViewerOpen, setEvidenceViewerOpen] = useState(false)
  const [evidenceFiles, setEvidenceFiles] = useState<DocumentFile[]>([])
  const [evidenceTitle, setEvidenceTitle] = useState('')

  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !data) return null

  const activeReceiptUrl = data.receiptUrl || data.operational?.receiptUrl || null
  const isVerificationPending =
    data.pricing.status === 'bank_transfer_pending_review' ||
    data.pricing.status === 'payment_verification_pending' ||
    (Boolean(activeReceiptUrl) && data.pricing.status !== 'paid' && data.pricing.status !== 'settled' && data.pricing.status !== 'waived')

  const statusBadge = getStatusBadge(data.pricing.status, Boolean(activeReceiptUrl))

  return (
    <ModalPortal>
      {/* Backdrop: Clicking outside modal dialog closes it */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs overflow-y-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose()
          }
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          className="relative w-full max-w-2xl my-auto rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Modal Header: Solid dark navy background with high contrast ── */}
          <div className="flex items-start justify-between gap-4 bg-[#0f2747] px-6 py-4 text-white shrink-0 border-b border-[#152d5a]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-white tracking-wide border border-white/20">
                  <span className="material-symbols-outlined text-[13px]">airplane_ticket</span>
                  {data.bookingReference}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/25 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-blue-200 border border-blue-400/30">
                  {data.bookingType === 'checkout' ? 'Checkout Flight' : 'Standard Flight'}
                </span>
                <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${statusBadge.bg}`}>
                  <span className="material-symbols-outlined text-[12px]">{statusBadge.icon}</span>
                  {statusBadge.label}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                Flight Details & Price Calculation
              </h2>
              <p className="text-xs text-slate-200 mt-1 font-medium">
                {data.aircraft.model} ({data.aircraft.registration}) · Flight Date: {data.flightDate || 'Scheduled flight'}
                {data.scheduledTimeRange ? ` · ${data.scheduledTimeRange}` : ''}
              </p>
            </div>

            {/* Cross icon at top right */}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/40 cursor-pointer shrink-0"
              aria-label="Close modal"
            >
              <span className="material-symbols-outlined text-[20px] block leading-none">close</span>
            </button>
          </div>

          {/* ── Modal Scrollable Body ── */}
          <div className="overflow-y-auto p-5 sm:p-6 space-y-6 text-[#152d5a]">
            {/* ── Pilot & Aircraft Overview ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Pilot in Command</p>
                <p className="font-semibold text-sm text-[#0f2747]">{data.pilot.name}</p>
                {data.pilot.arn && (
                  <p className="text-slate-600 font-mono mt-0.5">ARN: {data.pilot.arn}</p>
                )}
                {data.pilot.email && (
                  <p className="text-slate-600 truncate mt-0.5">{data.pilot.email}</p>
                )}
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Aircraft & Schedule</p>
                <p className="font-semibold text-sm text-[#0f2747]">{data.aircraft.model} · {data.aircraft.registration}</p>
                <p className="text-slate-600 mt-0.5 font-medium">Flight Date: {data.flightDate || '—'}</p>
                {data.scheduledTimeRange && (
                  <p className="text-slate-600 mt-0.5">{data.scheduledTimeRange}</p>
                )}
              </div>
            </div>

            {/* ── Section: Aircraft Meter Telemetry (VDO & AirSwitch totals only, no start/stop) ── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-[18px] text-[#1a4fd6]">speed</span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0f2747]">
                  Aircraft Meter Telemetry
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* VDO Card */}
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 shadow-xs flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#1a4fd6] block mb-1">
                      VDO (Flight Billing)
                    </span>
                    <span className="text-[11px] text-slate-600 font-medium">
                      Total billable engine time
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-2xl font-bold text-[#0f2747]">
                      {formatReading(data.readings.vdoHours)}h
                    </span>
                  </div>
                </div>

                {/* AirSwitch Card */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-xs flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-1">
                      AirSwitch
                    </span>
                    <span className="text-[11px] text-slate-600 font-medium">
                      Total airborne flight time
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-2xl font-bold text-[#0f2747]">
                      {formatReading(data.readings.airSwitchHours)}h
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Section: Airport Landings ── */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-[#1a4fd6]">flight_land</span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#0f2747]">
                    Airport Landings & Fees
                  </h3>
                </div>
                <span className="text-xs font-semibold text-slate-600">
                  Total Landings: <strong className="font-bold text-[#0f2747]">{data.landings.totalLandings}</strong>
                </span>
              </div>

              {data.landings.breakdown.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-[10px] uppercase font-bold tracking-wider text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Airport / Aerodrome</th>
                        <th className="py-2.5 px-3 text-center">ICAO</th>
                        <th className="py-2.5 px-3 text-center">Landings</th>
                        <th className="py-2.5 px-3 text-right">Fee / Landing</th>
                        <th className="py-2.5 px-3 text-right">Total Fee</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.landings.breakdown.map((item, idx) => (
                        <tr key={`${item.icaoCode}-${idx}`} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-[#0f2747]">
                            {item.airportName}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-[#1a4fd6]">
                            {item.icaoCode}
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold text-[#0f2747]">
                            {item.count}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-slate-700 font-medium">
                            {formatCurrency(item.unitFeeCents)}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-bold text-[#0f2747]">
                            {formatCurrency(item.totalFeeCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200 text-xs font-semibold text-slate-700">
                      <tr>
                        <td colSpan={4} className="py-2 px-3 text-right">Landings Subtotal:</td>
                        <td className="py-2 px-3 text-right tabular-nums font-bold text-[#0f2747]">
                          {formatCurrency(data.pricing.landingSubtotalCents)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500 bg-slate-50">
                  No airport landing charges recorded for this flight.
                </div>
              )}
            </div>

            {/* ── Section: Price Calculation Breakdown ── */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-amber-200 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-amber-800">calculate</span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-950">
                    Price Calculation Breakdown
                  </h3>
                </div>
                {data.pricing.invoiceNumber && (
                  <span className="font-mono text-[11px] font-bold text-amber-900 bg-amber-100/90 border border-amber-300 px-2 py-0.5 rounded">
                    Invoice: {data.pricing.invoiceNumber}
                  </span>
                )}
              </div>

              <div className="space-y-2 text-xs">
                {/* Flight Hours Calculation with 'X' multiplication */}
                <div className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-700 font-medium">Aircraft Flight Charge:</span>
                    <span className="font-bold text-slate-900">
                      {data.pricing.billableHours.toFixed(1)} hrs X {formatCurrency(data.pricing.hourlyRateCents)}/hr
                    </span>
                  </div>
                  <span className="font-mono font-bold tabular-nums text-slate-900">
                    {formatCurrency(data.pricing.flightAmountCents)}
                  </span>
                </div>

                {/* Landing Fees */}
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-700 font-medium">
                    Airport Landing Fees ({data.landings.totalLandings} landing{data.landings.totalLandings === 1 ? '' : 's'}):
                  </span>
                  <span className="font-mono font-bold tabular-nums text-slate-900">
                    {formatCurrency(data.pricing.landingSubtotalCents)}
                  </span>
                </div>

                {/* Subtotal */}
                <div className="flex items-center justify-between border-t border-slate-200 pt-2 font-medium">
                  <span className="text-slate-800 font-semibold">Subtotal (Flight + Landings):</span>
                  <span className="font-mono font-black tabular-nums text-slate-900">
                    {formatCurrency(data.pricing.subtotalCents)}
                  </span>
                </div>

                {/* Advance/Credit Applied */}
                {data.pricing.advanceAppliedCents > 0 && (
                  <div className="flex items-center justify-between py-1 text-emerald-800 font-medium">
                    <span>Account Credit Applied:</span>
                    <span className="font-mono font-bold tabular-nums">
                      -{formatCurrency(data.pricing.advanceAppliedCents)}
                    </span>
                  </div>
                )}

                {/* Block time details if applicable */}
                {data.pricing.isBlockTime && data.pricing.blockTimeDetails && (
                  <div className="border-t border-slate-200 pt-2 space-y-1">
                    {data.pricing.blockTimeDetails.map((line, idx) => (
                      <div key={idx} className="flex items-center justify-between text-[11px] text-slate-700">
                        <span>{line.label}</span>
                        <span className="font-bold">{line.value}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── High Contrast Net Amount Box (Dark navy with bright bold white text) ── */}
                <div className="mt-3 rounded-xl bg-[#0f2747] border border-[#152d5a] p-4 text-white flex items-center justify-between shadow-md">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-blue-200">
                      {data.pricing.status === 'paid'
                        ? 'Total Settled Amount'
                        : isVerificationPending
                        ? 'Payment Verification Pending'
                        : 'Payment Amount Due'}
                    </p>
                    <p className="text-xs text-slate-300 mt-0.5">
                      {data.pricing.status === 'paid'
                        ? `Paid in full${data.pricing.paymentMethod ? ` via ${data.pricing.paymentMethod}` : ''}${data.pricing.paidAt ? ` on ${new Date(data.pricing.paidAt).toLocaleDateString('en-AU')}` : ''}`
                        : isVerificationPending
                        ? 'Bank transfer proof submitted · Awaiting admin review'
                        : data.pricing.waiverReason
                        ? `Payment waived: ${data.pricing.waiverReason}`
                        : 'Awaiting payment confirmation'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-2xl font-black tracking-tight text-white tabular-nums">
                      {formatCurrency(data.pricing.amountDueCents || data.pricing.subtotalCents)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Operational Notes & Evidence Attachments ── */}
            {(data.operational?.customerNotes ||
              data.operational?.adminNotes ||
              (data.operational?.evidenceAttachments && data.operational.evidenceAttachments.length > 0) ||
              Boolean(activeReceiptUrl)) && (
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-slate-600">sticky_note_2</span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#0f2747]">
                      Operational Notes & Evidence
                    </h3>
                  </div>

                  {/* View Receipt button beside Operational Notes & Evidence */}
                  {activeReceiptUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setEvidenceFiles([{ url: activeReceiptUrl, name: 'Bank Transfer Receipt' }])
                        setEvidenceTitle('Bank Transfer Receipt')
                        setEvidenceViewerOpen(true)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#bfdbfe] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold text-[#1d4ed8] hover:bg-[#eff6ff] hover:border-[#93c5fd] hover:text-[#1e40af] transition-colors cursor-pointer shrink-0 shadow-2xs"
                    >
                      <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                      View Receipt
                    </button>
                  )}
                </div>

                {data.operational?.customerNotes && (
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs">
                    <p className="font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Customer / Pilot Notes</p>
                    <p className="text-slate-800 whitespace-pre-wrap">{data.operational.customerNotes}</p>
                  </div>
                )}

                {data.operational?.adminNotes && (
                  <div className="rounded-lg bg-amber-50/70 border border-amber-200 p-3 text-xs">
                    <p className="font-bold text-[10px] uppercase tracking-wider text-amber-800 mb-1">Admin Notes</p>
                    <p className="text-amber-950 whitespace-pre-wrap">{data.operational.adminNotes}</p>
                  </div>
                )}

                {/* Flight Record Evidence Photos */}
                {data.operational?.evidenceAttachments && data.operational.evidenceAttachments.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Flight Record Evidence Photos</p>
                    <div className="flex flex-wrap gap-2">
                      {data.operational.evidenceAttachments.map((att) => (
                        <button
                          key={att.id}
                          type="button"
                          onClick={() => {
                            setEvidenceFiles([{ url: att.signedUrl, name: att.fileName }])
                            setEvidenceTitle(att.fileName)
                            setEvidenceViewerOpen(true)
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[14px]">image</span>
                          <span className="max-w-[180px] truncate">{att.fileName}</span>
                          <span className="material-symbols-outlined text-[12px] opacity-70">open_in_new</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Modal Footer ── */}
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3 shrink-0">
            <span className="text-[11px] text-slate-500 font-medium">
              OZ Rent A Plane Aviation Command Centre
            </span>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-xl bg-slate-800 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      <DocumentViewerModal
        isOpen={evidenceViewerOpen}
        onClose={() => setEvidenceViewerOpen(false)}
        files={evidenceFiles}
        title={evidenceTitle}
      />
    </ModalPortal>
  )
}

/**
 * Reusable Button that triggers the Flight Details Modal
 */
export function AdminViewFlightDetailsButton({
  data,
  label = 'View Flight Details',
  variant = 'panel',
  className = '',
}: {
  data: FlightDetailsData | null
  label?: string
  variant?: 'banner' | 'panel' | 'inline' | 'pill'
  className?: string
}) {
  const [modalOpen, setModalOpen] = useState(false)

  if (!data) return null

  let baseStyles = ''
  if (variant === 'banner') {
    baseStyles =
      'inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#1a4fd6]/20 bg-white px-3.5 py-2 text-xs font-semibold text-[#1a4fd6] shadow-xs hover:bg-[#f0f6ff] hover:border-[#1a4fd6]/30 transition-all focus:outline-none focus:ring-2 focus:ring-[#1a4fd6]/30 cursor-pointer'
  } else if (variant === 'panel') {
    baseStyles =
      'inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-800 shadow-xs hover:bg-amber-50 hover:border-amber-400 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/20 cursor-pointer'
  } else if (variant === 'inline') {
    baseStyles =
      'inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-emerald-300 bg-[#f0fdf4] px-3.5 py-2 text-sm font-semibold text-emerald-800 transition-colors hover:border-emerald-400 hover:bg-[#dcfce7] focus:outline-none focus:ring-2 focus:ring-emerald-500/25 cursor-pointer'
  } else if (variant === 'pill') {
    baseStyles =
      'inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50/80 px-2.5 py-1 text-[11px] font-semibold text-[#1a4fd6] hover:bg-blue-100 hover:border-blue-300 transition-colors focus:outline-none cursor-pointer'
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={`${baseStyles} ${className}`.trim()}
      >
        <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>
          receipt_long
        </span>
        {label}
      </button>

      <AdminFlightDetailsModal
        data={data}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  )
}
