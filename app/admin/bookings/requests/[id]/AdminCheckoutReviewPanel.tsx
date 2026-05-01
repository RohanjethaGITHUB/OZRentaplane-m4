'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  confirmCheckoutBooking,
  cancelCheckoutBooking,
  adminUpdateCheckoutTime,
} from '@/app/actions/admin-booking'
import { sendAdminChatMessage, markAdminChatRead, getSignedDocumentUrl } from '@/app/actions/admin'
import { sydneyInputToUTC, formatSydTime } from '@/lib/utils/sydney-time'
import { formatDate, formatDateTime } from '@/lib/formatDateTime'
import type { VerificationEvent } from '@/lib/supabase/types'

// ── Types ──────────────────────────────────────────────────────────────────────

export type DocSummary = {
  document_type:   string
  status:          string
  expiry_date:     string | null
  issue_date?:     string | null
  file_name?:      string
  licence_type?:   string | null
  licence_number?: string | null
  medical_class?:  string | null
  id_type?:        string | null
  document_number?: string | null
  uploaded_at?:    string | null
}

type Props = {
  bookingId:          string
  aircraftId:         string
  bookingReference:   string
  scheduledStart:     string       // UTC ISO — current value
  scheduledEnd:       string       // UTC ISO — current value
  customerNotes:      string | null
  lastFlightDate:     string | null
  customerId:         string
  customerName:       string | null
  customerEmail:      string | null
  pilotArn:           string | null
  clearanceLabel:     string
  clearanceColor:     string
  clearanceBg:        string
  clearanceBorder:    string
  documents:          DocSummary[]
  messages:           VerificationEvent[]
}

// ── Time option helpers ────────────────────────────────────────────────────────

const ALL_TIME_OPTIONS = (() => {
  const opts: { value: string; label: string }[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const value  = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      const period = h < 12 ? 'AM' : 'PM'
      const h12    = h === 0 ? 12 : h > 12 ? h - 12 : h
      opts.push({ value, label: `${h12}:${String(m).padStart(2, '0')} ${period}` })
    }
  }
  return opts
})()

function addOneHour(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number)
  const totalMin = (h! * 60 + m!) + 60
  const newH = Math.min(23, Math.floor(totalMin / 60))
  const newM = totalMin % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}

function toSydDate(utcISO: string): string {
  return new Date(utcISO).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
}

function toSydTime(utcISO: string): string {
  const d = new Date(utcISO)
  const h = d.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', hour12: false }).slice(-2)
  const m = d.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', minute: '2-digit' }).padStart(2, '0')
  return `${h}:${m}`
}

function minDateString(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]!
}

function isChatEvent(ev: VerificationEvent): boolean {
  return ev.event_type === 'message' || (ev.event_type === 'on_hold' && !!ev.body)
}

// ── Doc row with view button ───────────────────────────────────────────────────

function DocRow({
  label,
  doc,
  docType,
  customerId,
}: {
  label:      string
  doc:        DocSummary | undefined
  docType:    string
  customerId: string
}) {
  const today   = new Date().toISOString().split('T')[0]!
  const expired = doc?.expiry_date && doc.expiry_date < today
  const ok      = doc && !expired && doc.status !== 'rejected'
  const [viewLoading, setViewLoading] = useState(false)
  const [viewError,   setViewError]   = useState('')

  async function handleView() {
    setViewLoading(true)
    setViewError('')
    try {
      const storagePath = `${customerId}/${docType}`
      const url = await getSignedDocumentUrl(storagePath)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      setViewError('Could not open file.')
    } finally {
      setViewLoading(false)
    }
  }

  return (
    <div className="py-3 border-b border-white/[0.05] last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-medium ${ok ? 'text-slate-300' : 'text-slate-600'}`}>{label}</span>
            {/* Status chip */}
            {!doc
              ? <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600 border border-white/10 px-1.5 py-0.5 rounded">Missing</span>
              : expired
              ? <span className="text-[9px] font-bold uppercase tracking-widest text-red-400 border border-red-400/30 bg-red-500/10 px-1.5 py-0.5 rounded">Expired</span>
              : doc.status === 'rejected'
              ? <span className="text-[9px] font-bold uppercase tracking-widest text-red-400 border border-red-400/30 bg-red-500/10 px-1.5 py-0.5 rounded">Rejected</span>
              : <span className="text-[9px] font-bold uppercase tracking-widest text-green-400 border border-green-400/30 bg-green-500/10 px-1.5 py-0.5 rounded">Uploaded</span>
            }
            {/* Metadata chips */}
            {doc?.licence_type   && <span className="text-[9px] text-blue-400/70 bg-blue-500/10 border border-blue-500/15 px-1.5 py-0.5 rounded">{doc.licence_type}</span>}
            {doc?.medical_class  && <span className="text-[9px] text-blue-400/70 bg-blue-500/10 border border-blue-500/15 px-1.5 py-0.5 rounded">{doc.medical_class}</span>}
            {doc?.id_type        && <span className="text-[9px] text-blue-400/70 bg-blue-500/10 border border-blue-500/15 px-1.5 py-0.5 rounded">{doc.id_type}</span>}
          </div>
          {doc && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
              {doc.licence_number  && <span className="text-[9px] text-slate-500">ARN: {doc.licence_number}</span>}
              {doc.document_number && <span className="text-[9px] text-slate-500">#{doc.document_number}</span>}
              {doc.issue_date      && <span className="text-[9px] text-slate-600">Issued: {doc.issue_date}</span>}
              {doc.expiry_date && (
                <span className={`text-[9px] ${expired ? 'text-red-400' : 'text-slate-600'}`}>
                  {expired ? 'Expired' : 'Expires'}: {doc.expiry_date}
                </span>
              )}
              {doc.uploaded_at && (
                <span className="text-[9px] text-slate-700">
                  Uploaded: {new Date(doc.uploaded_at).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>
          )}
          {viewError && <p className="text-[9px] text-red-400 mt-0.5">{viewError}</p>}
        </div>
        {/* View button */}
        {doc && (
          <button
            onClick={handleView}
            disabled={viewLoading}
            className="flex-shrink-0 flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-[#a7c8ff]/60 hover:text-[#a7c8ff] transition-colors disabled:opacity-40"
          >
            {viewLoading
              ? <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span>
              : <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'wght' 300" }}>open_in_new</span>
            }
            View
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AdminCheckoutReviewPanel({
  bookingId, aircraftId, bookingReference,
  scheduledStart, scheduledEnd,
  customerNotes, lastFlightDate, customerId, customerName, customerEmail, pilotArn,
  clearanceLabel, clearanceColor, clearanceBg, clearanceBorder,
  documents, messages,
}: Props) {
  const router = useRouter()

  // ── Time edit state ──────────────────────────────────────────────────────────
  const [editingTime, setEditingTime] = useState(false)
  const [newDate, setNewDate]         = useState(toSydDate(scheduledStart))
  const [newStartTime, setNewStartTime] = useState(toSydTime(scheduledStart))
  const newEndTime  = addOneHour(newStartTime)
  const newEndDT    = newDate && newEndTime   ? `${newDate}T${newEndTime}`   : ''
  const newEndUTC   = newEndDT ? sydneyInputToUTC(newEndDT) : null
  const newStartDT  = newDate && newStartTime ? `${newDate}T${newStartTime}` : ''
  const newStartUTC = newStartDT ? sydneyInputToUTC(newStartDT) : null

  const [timeUpdateStatus, setTimeUpdateStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [timeError, setTimeError]               = useState<string | null>(null)

  // ── Confirm/cancel state ─────────────────────────────────────────────────────
  const [confirmPending, startConfirmTransition] = useTransition()
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelPending, startCancelTransition] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)

  // ── Message state ────────────────────────────────────────────────────────────
  const [message, setMessage]     = useState('')
  const [msgLoading, setMsgLoading] = useState(false)
  const [msgError, setMsgError]   = useState('')
  const bottomRef                 = useRef<HTMLDivElement>(null)

  const chatEvents = messages
    .filter(isChatEvent)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  useEffect(() => {
    markAdminChatRead(customerId).catch(() => {})
  }, [customerId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatEvents.length])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleSaveTime() {
    if (!newStartUTC) { setTimeError('Invalid date or time selection.'); return }
    setTimeUpdateStatus('saving')
    setTimeError(null)
    try {
      await adminUpdateCheckoutTime(bookingId, newStartUTC)
      setTimeUpdateStatus('saved')
      setEditingTime(false)
      router.refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update time.'
      setTimeError(msg.replace(/^VALIDATION: |^AVAILABILITY: /, ''))
      setTimeUpdateStatus('error')
    }
  }

  function handleConfirm() {
    setActionError(null)
    startConfirmTransition(async () => {
      try {
        await confirmCheckoutBooking(bookingId)
        router.refresh()
      } catch (e) {
        setActionError(e instanceof Error ? e.message.replace(/^VALIDATION: /, '') : 'Failed to confirm.')
      }
    })
  }

  function handleCancel() {
    if (!cancelReason.trim()) return
    setActionError(null)
    startCancelTransition(async () => {
      try {
        await cancelCheckoutBooking(bookingId, cancelReason)
        router.push('/admin/bookings/checkout?status=checkout_requested')
      } catch (e) {
        setActionError(e instanceof Error ? e.message.replace(/^VALIDATION: /, '') : 'Failed to cancel.')
      }
    })
  }

  async function handleSendMessage() {
    if (!message.trim()) return
    setMsgError('')
    setMsgLoading(true)
    try {
      await sendAdminChatMessage(customerId, message.trim())
      setMessage('')
      router.refresh()
    } catch (err) {
      setMsgError(err instanceof Error ? err.message.replace('VALIDATION:', '').trim() : 'Failed to send.')
    } finally {
      setMsgLoading(false)
    }
  }

  function handleMsgKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // ── Derived doc lookups ───────────────────────────────────────────────────────
  const licenceDoc = documents.find(d => d.document_type === 'pilot_licence')
  const medicalDoc = documents.find(d => d.document_type === 'medical_certificate')
  const photoIdDoc = documents.find(d => d.document_type === 'photo_id')
  const allDocsOk  = [licenceDoc, medicalDoc, photoIdDoc].every(d => {
    if (!d) return false
    if (d.status === 'rejected') return false
    const today = new Date().toISOString().split('T')[0]!
    if (d.expiry_date && d.expiry_date < today) return false
    return true
  })

  const endTimeLabel = ALL_TIME_OPTIONS.find(o => o.value === newEndTime)?.label ?? newEndTime

  return (
    <div className="space-y-6">

      {/* ── 1. Checkout request summary ───────────────────────────────────────── */}
      <div className="bg-white/5 border border-white/5 rounded-2xl p-6 space-y-5">
        <h2 className="text-[10px] uppercase tracking-widest font-bold text-blue-400/80 flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'wght' 300" }}>how_to_reg</span>
          Checkout Request Review
        </h2>

        {/* Customer row */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] uppercase tracking-widest text-slate-600 mb-1">Customer</p>
            <p className="text-sm font-medium text-white">{customerName || 'Unknown'}</p>
            <p className="text-[11px] text-slate-500">{customerEmail || '—'}</p>
            {pilotArn && <p className="text-[10px] text-slate-600 font-mono mt-0.5">ARN: {pilotArn}</p>}
          </div>
          <span className={`inline-block px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider border ${clearanceColor} ${clearanceBg} ${clearanceBorder} flex-shrink-0`}>
            {clearanceLabel}
          </span>
        </div>

        {/* Documents */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] uppercase tracking-widest text-slate-600">Pilot Documents</p>
            {allDocsOk
              ? <span className="text-[9px] font-bold text-green-400 uppercase tracking-widest flex items-center gap-1">
                  <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  All uploaded
                </span>
              : <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest">Incomplete</span>
            }
          </div>
          <DocRow label="Pilot Licence"       doc={licenceDoc} docType="pilot_licence"       customerId={customerId} />
          <DocRow label="Medical Certificate" doc={medicalDoc} docType="medical_certificate" customerId={customerId} />
          <DocRow label="Photo ID"            doc={photoIdDoc} docType="photo_id"            customerId={customerId} />
        </div>

        {/* Requested time */}
        <div>
          <p className="text-[9px] uppercase tracking-widest text-slate-600 mb-2">Requested Checkout Time</p>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-3">
            <p className="text-sm text-white font-medium">{formatDateTime(scheduledStart)}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{formatDateTime(scheduledEnd)}</p>
            <div className="flex gap-4 mt-2">
              <span className="text-[10px] text-slate-600">Duration: varies (typically 1–2 hours)</span>
              <span className="text-[10px] text-slate-600">Rate: $290 / hour</span>
            </div>
          </div>
        </div>

        {/* Last flight date */}
        {lastFlightDate && (
          <div>
            <p className="text-[9px] uppercase tracking-widest text-slate-600 mb-1">Last Flight Date</p>
            <p className="text-[11px] text-slate-300">{lastFlightDate}</p>
          </div>
        )}

        {/* Customer notes */}
        {customerNotes && (
          <div>
            <p className="text-[9px] uppercase tracking-widest text-slate-600 mb-1">Customer Notes</p>
            <p className="text-[11px] text-slate-300 leading-relaxed italic">
              &quot;{customerNotes}&quot;
            </p>
          </div>
        )}


      </div>

      {/* ── 2. Edit checkout time ─────────────────────────────────────────────── */}
      <div className="bg-white/5 border border-white/5 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
            Adjust Checkout Time
          </h2>
          {!editingTime && (
            <button
              onClick={() => { setEditingTime(true); setTimeUpdateStatus('idle'); setTimeError(null) }}
              className="text-[10px] font-bold uppercase tracking-widest text-[#a7c8ff]/60 hover:text-[#a7c8ff] transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[12px]">edit</span>
              Edit
            </button>
          )}
        </div>

        {!editingTime ? (
          <div className="space-y-1">
            <p className="text-[11px] text-slate-400 leading-relaxed">
              The customer&apos;s requested time is shown above. If it doesn&apos;t work, click Edit to propose a different time, message the customer, then confirm once agreed.
            </p>
            {timeUpdateStatus === 'saved' && (
              <p className="text-[10px] text-green-400 flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                Time updated successfully.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-[11px] text-slate-500">
              Duration is fixed at 1 hour. Select the departure date and time.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block">Date</label>
                <input
                  type="date"
                  value={newDate}
                  min={minDateString()}
                  onChange={e => { setNewDate(e.target.value); setTimeError(null) }}
                  className="w-full bg-[#0a0b0d] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/40"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block">Departure</label>
                <select
                  value={newStartTime}
                  onChange={e => { setNewStartTime(e.target.value); setTimeError(null) }}
                  className="w-full bg-[#0a0b0d] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/40"
                >
                  {ALL_TIME_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Computed return */}
            <div className="flex items-center justify-between bg-white/[0.03] border border-white/[0.05] rounded-lg px-3 py-2">
              <span className="text-[10px] text-slate-500">Return (auto)</span>
              <span className="text-[10px] text-white/70">{endTimeLabel} <span className="text-slate-600">(fixed 1 hour)</span></span>
            </div>

            {timeError && (
              <p className="text-[10px] text-red-400 leading-relaxed">{timeError}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setEditingTime(false); setTimeError(null) }}
                disabled={timeUpdateStatus === 'saving'}
                className="flex-1 px-3 py-2 rounded-lg text-[11px] font-medium bg-white/5 text-slate-300 hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTime}
                disabled={timeUpdateStatus === 'saving' || !newStartUTC}
                className="flex-1 px-3 py-2 rounded-lg text-[11px] font-medium bg-blue-700 hover:bg-blue-600 text-white transition-colors disabled:opacity-50"
              >
                {timeUpdateStatus === 'saving' ? 'Checking…' : 'Save New Time'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 3. Message thread ─────────────────────────────────────────────────── */}
      <div className="bg-white/5 border border-white/5 rounded-2xl p-6">
        <h2 className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-4">
          Customer Messages
        </h2>

        {chatEvents.length === 0 ? (
          <p className="text-[11px] text-slate-600 leading-relaxed mb-4">
            No messages yet. Use this to propose a different time, clarify documents, or communicate with the customer before confirming.
          </p>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1 mb-4">
            {chatEvents.map(ev => {
              const isAdmin = ev.actor_role === 'admin'
              return (
                <div key={ev.id} className={`flex gap-2.5 ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                  {!isAdmin && (
                    <div className="w-6 h-6 rounded-full bg-blue-900/40 border border-blue-300/15 flex items-center justify-center flex-shrink-0 mt-1">
                      <span className="material-symbols-outlined text-[11px] text-blue-300/70" style={{ fontVariationSettings: "'wght' 300" }}>person</span>
                    </div>
                  )}
                  <div className={`max-w-[75%] space-y-1 flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                      {isAdmin ? 'Admin' : (customerName || 'Customer')}
                    </span>
                    <div className={`px-3 py-2.5 rounded-2xl text-[11px] leading-relaxed whitespace-pre-wrap ${
                      isAdmin
                        ? 'bg-blue-600/15 border border-blue-400/15 text-blue-100 rounded-tr-sm'
                        : 'bg-[#1e2023]/80 border border-white/8 text-[#e2e2e6] rounded-tl-sm'
                    }`}>
                      {ev.body}
                    </div>
                    <span className="text-[9px] text-slate-600 font-mono">
                      {formatDateTime(ev.created_at)}
                    </span>
                  </div>
                  {isAdmin && (
                    <div className="w-6 h-6 rounded-full bg-blue-600/20 border border-blue-400/15 flex items-center justify-center flex-shrink-0 mt-1">
                      <span className="material-symbols-outlined text-[11px] text-blue-400/70" style={{ fontVariationSettings: "'wght' 300" }}>admin_panel_settings</span>
                    </div>
                  )}
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Compose */}
        <div className="bg-[#1e2023]/60 border border-blue-300/8 rounded-xl p-3 space-y-2">
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={handleMsgKeyDown}
            disabled={msgLoading}
            placeholder="Message the customer — e.g. propose a different time, request documents…"
            rows={3}
            className="w-full bg-transparent focus:outline-none text-xs text-[#e2e2e6] placeholder:text-slate-600 resize-none"
          />
          {msgError && <p className="text-[10px] text-red-400">{msgError}</p>}
          <div className="flex items-center justify-between border-t border-white/5 pt-2">
            <p className="text-[9px] text-slate-600 italic">⌘ + Enter to send · Visible to customer</p>
            <button
              type="button"
              onClick={handleSendMessage}
              disabled={msgLoading || !message.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600/20 border border-blue-400/20 text-blue-300 hover:bg-blue-600/30 rounded-full text-[9px] font-bold uppercase tracking-[0.15em] transition-all disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'wght' 300" }}>
                {msgLoading ? 'progress_activity' : 'send'}
              </span>
              Send
            </button>
          </div>
        </div>
      </div>

      {/* ── 4. Confirm / Cancel actions ───────────────────────────────────────── */}
      <div className="bg-[#111316] border border-[#a7c8ff]/10 rounded-2xl p-6 space-y-3">
        <h2 className="text-[9px] uppercase tracking-widest font-bold text-[#a7c8ff]/50 mb-1">
          Checkout Request Actions
        </h2>

        {isCancelling ? (
          <div className="space-y-3">
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              rows={3}
              placeholder="Reason for cancellation (recorded in audit trail)…"
              className="w-full bg-[#0a0b0d] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none resize-none"
              disabled={cancelPending}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setIsCancelling(false); setActionError(null) }}
                disabled={cancelPending}
                className="flex-1 px-3 py-2 rounded-lg text-xs bg-white/5 text-slate-300 hover:bg-white/10 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelPending || !cancelReason.trim()}
                className="flex-1 px-3 py-2 rounded-lg text-xs bg-rose-700 hover:bg-rose-600 text-white transition-colors disabled:opacity-50"
              >
                {cancelPending ? 'Cancelling…' : 'Cancel Request'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={handleConfirm}
              disabled={confirmPending}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">how_to_reg</span>
              {confirmPending ? 'Confirming…' : 'Confirm Checkout Flight'}
            </button>
            <p className="text-[9px] text-slate-600 leading-relaxed text-center">
              Confirms the time shown above. Customer will be notified.
            </p>
            <button
              onClick={() => setIsCancelling(true)}
              disabled={confirmPending}
              className="w-full flex items-center justify-center gap-2 border border-rose-500/25 text-rose-400 hover:bg-rose-500/10 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">cancel</span>
              Cancel Request
            </button>
          </>
        )}

        {actionError && <p className="text-[10px] text-rose-400 text-center leading-tight">{actionError}</p>}
      </div>

    </div>
  )
}

