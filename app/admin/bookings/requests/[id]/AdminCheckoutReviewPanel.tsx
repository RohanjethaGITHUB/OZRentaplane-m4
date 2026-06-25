'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  confirmCheckoutBooking,
  cancelCheckoutBooking,
  adminUpdateCheckoutTime,
} from '@/app/actions/admin-booking'
import { sendAdminChatMessage, markAdminChatRead, getSignedDocumentUrl } from '@/app/actions/admin'
import { updateDocumentStatus } from '@/app/actions/verification'
import { sydneyInputToUTC } from '@/lib/utils/sydney-time'
import { formatDate, formatDateTime } from '@/lib/formatDateTime'
import CalendarDateField from '@/components/CalendarDateField'
import DocumentViewerModal from '@/components/ui/DocumentViewerModal'
import type { DocumentFile } from '@/components/ui/DocumentViewerModal'
import ConfirmModal from '@/components/ui/ConfirmModal'
import type { VerificationEvent } from '@/lib/supabase/types'
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  DollarSign,
  Eye,
  FileText,
  HelpCircle,
  XCircle,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

export type DocSummary = {
  id?:              string | null
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
  files?:          { id: string; file_name: string; storage_path: string }[]
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
  customerPhone:      string | null
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

const CHECKOUT_DURATION_MINUTES = 120

function addCheckoutDuration(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number)
  const totalMin = (h! * 60 + m!) + CHECKOUT_DURATION_MINUTES
  const newH = Math.floor((totalMin % (24 * 60)) / 60)
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

function isChatEvent(ev: VerificationEvent): boolean {
  return ev.event_type === 'message' || (ev.event_type === 'on_hold' && !!ev.body)
}

function formatRequestedTimeLabel(utcISO: string): string {
  const date = new Date(utcISO)
  const day = date.toLocaleDateString('en-GB', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const time = date.toLocaleTimeString('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).replace(/\s?(am|pm)$/i, (_, suffix) => ` ${suffix.toUpperCase()}`)
  return `${day}, ${time} / Sydney time (AEST)`
}

// ── Doc row with view button ───────────────────────────────────────────────────

function DocRow({
  label,
  doc,
  docType,
  customerId,
  statusOverride,
  onOpenDocumentViewer,
}: {
  label:      string
  doc:        DocSummary | undefined
  docType:    string
  customerId: string
  statusOverride?: string
  onOpenDocumentViewer: (files: NonNullable<DocSummary['files']>, index: number, title: string) => void
}) {
  const today   = new Date().toISOString().split('T')[0]!
  const expired = doc?.expiry_date && doc.expiry_date < today
  const [viewLoadingIndex, setViewLoadingIndex] = useState<number | null>(null)
  const [viewError, setViewError] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState<'approved' | 'rejected' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [currentStatus, setCurrentStatus] = useState(doc?.status ?? '')

  async function handleDocAction(newStatus: 'approved' | 'rejected') {
    if (!doc?.id) return
    setActionPending(newStatus)
    setActionError(null)
    const result = await updateDocumentStatus({
      documentId: doc.id,
      userId: customerId,
      status: newStatus,
    })
    if (result.success) {
      setCurrentStatus(newStatus)
    } else {
      setActionError(result.error ?? 'Action failed.')
    }
    setActionPending(null)
  }

  const resolvedStatus = statusOverride ?? currentStatus
  const statusLabel = statusOverride ?? (
    resolvedStatus === 'approved'
      ? 'Approved'
      : resolvedStatus === 'rejected'
        ? 'Rejected'
        : !doc
          ? 'Not uploaded'
          : expired
            ? 'Expired'
            : doc.status === 'rejected'
              ? 'Rejected'
              : 'Uploaded'
  )

  const statusClass = statusOverride
    ? 'bg-amber-50 text-amber-700 border border-amber-200'
    : resolvedStatus === 'approved'
      ? 'bg-green-50 text-green-700 border border-green-200'
      : resolvedStatus === 'rejected'
        ? 'bg-red-50 text-red-700 border border-red-200'
        : !doc
          ? 'bg-gray-50 text-gray-500 border border-gray-200'
          : expired
            ? 'bg-amber-50 text-amber-700 border border-amber-200'
            : doc.status === 'rejected'
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-green-50 text-green-700 border border-green-200'

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 py-4 border-b border-gray-100 last:border-b-0">
        <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-gray-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[#152d5a]">{label}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusClass}`}>
              {statusLabel}
            </span>
            {doc?.licence_type   && <span className="bg-blue-50 text-blue-700 border border-blue-200 text-xs px-2 py-0.5 rounded-full font-medium">{doc.licence_type}</span>}
            {doc?.medical_class  && <span className="bg-blue-50 text-blue-700 border border-blue-200 text-xs px-2 py-0.5 rounded-full font-medium">{doc.medical_class}</span>}
            {doc?.id_type        && <span className="bg-blue-50 text-blue-700 border border-blue-200 text-xs px-2 py-0.5 rounded-full font-medium">{doc.id_type}</span>}
          </div>

          {doc && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-gray-400">
              {doc.licence_number  && <span>ARN: {doc.licence_number}</span>}
              {doc.document_number && <span>#{doc.document_number}</span>}
              {doc.issue_date      && <span>Issued: {doc.issue_date}</span>}
              {doc.expiry_date     && <span>{expired ? 'Expired' : 'Expires'}: {doc.expiry_date}</span>}
              {doc.uploaded_at     && <span>Uploaded: {new Date(doc.uploaded_at).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: 'numeric' })}</span>}
            </div>
          )}
        </div>

        {doc && (
          <div className="flex items-center gap-3 sm:gap-4 justify-between sm:justify-end flex-shrink-0 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              {(() => {
                const documentFiles = doc.files ?? []
                return documentFiles.length > 0
                  ? documentFiles.map((f, fileIndex) => (
                    <button
                      key={f.id}
                      onClick={() => onOpenDocumentViewer(documentFiles, fileIndex, label)}
                      disabled={viewLoadingIndex === fileIndex}
                      title={f.file_name ?? `File ${fileIndex + 1}`}
                      className="inline-flex items-center gap-1 text-xs text-[#1a4fd6] hover:text-[#152d5a] font-medium transition-colors disabled:opacity-40 whitespace-nowrap underline-offset-2 hover:underline"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {documentFiles.length > 1 ? `File ${fileIndex + 1}` : 'View'}
                    </button>
                  ))
                  : <span className="text-xs text-gray-300 italic">No file</span>
              })()}
            </div>

            <div className="flex items-center gap-1.5 w-[180px] justify-end">
              {currentStatus === 'approved' ? (
                <span className="inline-flex items-center gap-1 text-xs text-green-600 font-semibold bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                  <CheckCircle2 className="w-3 h-3" /> Approved
                </span>
              ) : currentStatus === 'rejected' ? (
                <span className="inline-flex items-center gap-1 text-xs text-red-500 font-semibold bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                  <XCircle className="w-3 h-3" /> Rejected
                </span>
              ) : (
                <>
                  <button
                    onClick={() => handleDocAction('approved')}
                    disabled={!!actionPending}
                    className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 border border-green-200 font-semibold hover:bg-green-100 transition-colors disabled:opacity-40 whitespace-nowrap"
                  >
                    {actionPending === 'approved' ? '…' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleDocAction('rejected')}
                    disabled={!!actionPending}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 font-semibold hover:bg-red-100 transition-colors disabled:opacity-40 whitespace-nowrap"
                  >
                    {actionPending === 'rejected' ? '…' : 'Reject'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {(viewError || actionError) && (
        <p className="text-xs text-red-500 mt-1">
          {viewError ?? actionError}
        </p>
      )}
    </>
  )
}

function TimeDropdown({
  value,
  options,
  onChange,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  useEffect(() => {
    if (!open || !listRef.current) return
    const selected = listRef.current.querySelector('[data-selected="true"]') as HTMLElement | null
    selected?.scrollIntoView({ block: 'nearest' })
  }, [open])

  const selectedLabel = options.find(o => o.value === value)?.label ?? value

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#152d5a] focus:outline-none focus:border-[#1a4fd6] appearance-none cursor-pointer transition-colors hover:border-gray-300 flex items-center justify-between"
      >
        <span>{selectedLabel}</span>
        <span
          className={`material-symbols-outlined text-[16px] text-gray-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          style={{ fontVariationSettings: "'wght' 300" }}
        >
          expand_more
        </span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-2xl overflow-hidden">
          <div ref={listRef} className="max-h-52 overflow-y-auto overscroll-contain">
            {options.map(o => (
              <button
                key={o.value}
                type="button"
                data-selected={o.value === value ? 'true' : undefined}
                onClick={() => { onChange(o.value); setOpen(false) }}
                className={`w-full px-3 py-2 text-xs text-left transition-colors ${
                  o.value === value
                    ? 'bg-blue-50 text-[#1a4fd6] font-medium'
                    : 'text-[#152d5a] hover:bg-gray-50 hover:text-[#152d5a]'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AdminCheckoutReviewPanel({
  bookingId, aircraftId, bookingReference,
  scheduledStart, scheduledEnd,
  customerNotes, lastFlightDate, customerId, customerName, customerEmail, customerPhone, pilotArn,
  clearanceLabel, clearanceColor, clearanceBg, clearanceBorder,
  documents, messages,
}: Props) {
  const router = useRouter()

  // ── Time edit state ──────────────────────────────────────────────────────────
  const [editingTime, setEditingTime] = useState(false)
  const [newDate, setNewDate]         = useState(toSydDate(scheduledStart))
  const [newStartTime, setNewStartTime] = useState(toSydTime(scheduledStart))
  const newEndTime  = addCheckoutDuration(newStartTime)
  const newEndDT    = newDate && newEndTime   ? `${newDate}T${newEndTime}`   : ''
  const newEndUTC   = newEndDT ? sydneyInputToUTC(newEndDT) : null
  const newStartDT  = newDate && newStartTime ? `${newDate}T${newStartTime}` : ''
  const newStartUTC = newStartDT ? sydneyInputToUTC(newStartDT) : null

  const [timeUpdateStatus, setTimeUpdateStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [timeError, setTimeError]               = useState<string | null>(null)

  // ── Confirm/cancel state ─────────────────────────────────────────────────────
  const [confirmPending, startConfirmTransition] = useTransition()
  const [confirmCheckoutOpen, setConfirmCheckoutOpen] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelPending, startCancelTransition] = useTransition()
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // ── Message state ────────────────────────────────────────────────────────────
  const [message, setMessage]     = useState('')
  const [msgLoading, setMsgLoading] = useState(false)
  const [msgError, setMsgError]   = useState('')
  const messageTextareaRef        = useRef<HTMLTextAreaElement>(null)
  const timeSectionRef            = useRef<HTMLDivElement>(null)
  const bottomRef                 = useRef<HTMLDivElement>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerFiles, setViewerFiles] = useState<DocumentFile[]>([])
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0)
  const [viewerTitle, setViewerTitle] = useState('')

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
    const now = new Date()
    const sydToday = now.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
    const sydNowHm = `${now.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', hour12: false }).slice(-2)}:${now.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', minute: '2-digit' }).padStart(2, '0')}`
    if (newDate < sydToday) { setTimeError('Checkout date/time must be now or in the future.'); return }
    if (newDate === sydToday && newStartTime < sydNowHm) { setTimeError('For today, choose a future time.'); return }
    setTimeUpdateStatus('saving')
    setTimeError(null)
    try {
      await adminUpdateCheckoutTime(bookingId, newStartUTC, newDate, newStartTime)
      setTimeUpdateStatus('saved')
      setEditingTime(false)
      router.refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update time.'
      if (msg.includes('INVALID_SCHEDULE_BLOCK_TIME_ORDER')) {
        setTimeError('Could not update checkout time because the generated schedule block was invalid. Please try another time or contact support.')
      } else {
        setTimeError(msg.replace(/^VALIDATION: |^AVAILABILITY: /, ''))
      }
      setTimeUpdateStatus('error')
    }
  }

  function handleConfirm() {
    setConfirmCheckoutOpen(true)
  }

  function handleConfirmCheckout() {
    setConfirmCheckoutOpen(false)
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
    setCancelConfirmOpen(true)
  }

  function handleCancelCheckout() {
    setCancelConfirmOpen(false)
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

  function handleRequestDocuments() {
    messageTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    messageTextareaRef.current?.focus()
  }

  function handleProposeDifferentTime() {
    setEditingTime(true)
    setTimeUpdateStatus('idle')
    setTimeError(null)
    window.requestAnimationFrame(() => {
      timeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

  async function openDocumentViewer(
    files: NonNullable<DocSummary['files']>,
    index: number,
    title: string,
  ) {
    const viewerDocs = await Promise.all(
      files.map(async (file) => ({
        url: await getSignedDocumentUrl(file.storage_path),
        name: file.file_name,
      })),
    )
    setViewerFiles(viewerDocs)
    setViewerInitialIndex(index)
    setViewerTitle(title)
    setViewerOpen(true)
  }

  // ── Derived doc lookups ───────────────────────────────────────────────────────
  const licenceDoc        = documents.find(d => d.document_type === 'pilot_licence')
  const medicalDoc        = documents.find(d => d.document_type === 'medical_certificate')
  const photoIdDoc        = documents.find(d => d.document_type === 'photo_id')
  const nightVfrEvidenceDoc = documents.find(d => d.document_type === 'night_vfr_evidence')
  const allDocsOk  = [licenceDoc, medicalDoc, photoIdDoc].every(d => {
    if (!d) return false
    if (d.status === 'rejected') return false
    const today = new Date().toISOString().split('T')[0]!
    if (d.expiry_date && d.expiry_date < today) return false
    return true
  })

  const endTimeLabel = ALL_TIME_OPTIONS.find(o => o.value === newEndTime)?.label ?? newEndTime
  const requestedTimeLabel = formatRequestedTimeLabel(scheduledStart)
  const now = new Date()
  const sydToday = now.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
  const sydNowHm = `${now.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', hour12: false }).slice(-2)}:${now.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', minute: '2-digit' }).padStart(2, '0')}`
  const timeOptions = newDate === sydToday
    ? ALL_TIME_OPTIONS.filter((o) => o.value >= sydNowHm)
    : ALL_TIME_OPTIONS

  return (
    <div className="space-y-4 pb-24">
      <section className="bg-white border-t border-r border-b border-gray-100 border-l-4 border-l-[#1a4fd6] rounded-xl p-6 mb-4 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-full bg-[#152d5a] text-white text-sm font-semibold flex items-center justify-center flex-shrink-0">
            1
          </div>
          <h2 className="text-lg font-semibold text-[#152d5a]">Customer Snapshot</h2>
          <ChevronDown className="ml-auto w-5 h-5 text-gray-400" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Name</p>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/admin/users/${customerId}`} className="text-sm font-medium text-[#152d5a] underline decoration-[#152d5a]/20 underline-offset-2 hover:text-blue-400">
                {customerName || 'Unknown'}
              </Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Email</p>
            <p className="text-sm font-medium text-[#152d5a] break-all">{customerEmail || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">ARN</p>
            <p className="text-sm font-medium text-[#152d5a]">{pilotArn || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Phone</p>
            <p className="text-sm font-medium text-[#152d5a]">{customerPhone ?? '—'}</p>
          </div>
        </div>
      </section>

      <section className="bg-white border-t border-r border-b border-gray-100 border-l-4 border-l-[#059669] rounded-xl p-6 mb-4 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-full bg-[#152d5a] text-white text-sm font-semibold flex items-center justify-center flex-shrink-0">
            2
          </div>
          <h2 className="text-lg font-semibold text-[#152d5a]">Documents</h2>
          <ChevronDown className="ml-auto w-5 h-5 text-gray-400" />
        </div>

        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1 mb-4">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {allDocsOk ? 'All uploaded' : 'Incomplete'}
        </div>

        <div className="space-y-0">
          <DocRow label="Pilot Licence" doc={licenceDoc} docType="pilot_licence" customerId={customerId} onOpenDocumentViewer={openDocumentViewer} />
          <DocRow label="Medical Certificate" doc={medicalDoc} docType="medical_certificate" customerId={customerId} onOpenDocumentViewer={openDocumentViewer} />
          <DocRow label="Photo ID" doc={photoIdDoc} docType="photo_id" customerId={customerId} onOpenDocumentViewer={openDocumentViewer} />
          <DocRow
            label="Night VFR"
            doc={nightVfrEvidenceDoc}
            docType="night_vfr_evidence"
            customerId={customerId}
            statusOverride={nightVfrEvidenceDoc ? 'Claimed' : undefined}
            onOpenDocumentViewer={openDocumentViewer}
          />
        </div>

        {!allDocsOk && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            One or more required documents are not yet approved. Review document status before proceeding.
          </div>
        )}
      </section>

      <section ref={timeSectionRef} className="bg-white border-t border-r border-b border-gray-100 border-l-4 border-l-[#f59e0b] rounded-xl p-6 mb-4 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-full bg-[#152d5a] text-white text-sm font-semibold flex items-center justify-center flex-shrink-0">
            3
          </div>
          <h2 className="text-lg font-semibold text-[#152d5a]">Schedule Review</h2>
          <ChevronDown className="ml-auto w-5 h-5 text-gray-400" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-5">
          <div>
            <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center mb-2">
              <CalendarDays className="w-4 h-4 text-gray-500" />
            </div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Requested Time</p>
            <p className="text-sm font-semibold text-[#152d5a]">{requestedTimeLabel}</p>
          </div>
          <div>
            <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center mb-2">
              <Clock className="w-4 h-4 text-gray-500" />
            </div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Duration</p>
            <p className="text-sm font-semibold text-[#152d5a]">1–2 hours (varies)</p>
          </div>
          <div>
            <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center mb-2">
              <DollarSign className="w-4 h-4 text-gray-500" />
            </div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Rate</p>
            <p className="text-sm font-semibold text-[#152d5a]">$290 / hour</p>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleProposeDifferentTime}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#152d5a] text-[#152d5a] text-sm font-medium hover:bg-[#152d5a] hover:text-white transition-colors"
          >
            <CalendarDays className="w-4 h-4" />
            Propose Different Time
          </button>
        </div>

        <div className={`mt-5 border-t border-gray-100 pt-5 ${editingTime ? '' : 'hidden'}`}>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Duration is fixed at 2 hours. Select the departure date and time.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block">Date</label>
                <CalendarDateField
                  value={newDate}
                  onChange={(next) => { setNewDate(next); setTimeError(null) }}
                  minYear={new Date().getFullYear() - 20}
                  maxYear={new Date().getFullYear() + 20}
                  minDate={sydToday}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-[#152d5a] focus:outline-none focus:border-[#1a4fd6] text-left flex items-center justify-between"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 block">Departure</label>
                <TimeDropdown
                  value={newStartTime}
                  options={timeOptions}
                  onChange={(next) => { setNewStartTime(next); setTimeError(null) }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
              <span className="text-[10px] text-gray-500">Return (auto)</span>
              <span className="text-[10px] text-[#152d5a]">{endTimeLabel} <span className="text-gray-400">(fixed 2 hours)</span></span>
            </div>

            {timeError && <p className="text-xs text-red-500 leading-relaxed">{timeError}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setEditingTime(false); setTimeError(null) }}
                disabled={timeUpdateStatus === 'saving'}
                className="flex-1 px-3 py-2 rounded-lg text-xs font-medium border border-gray-200 bg-white text-[#152d5a] hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTime}
                disabled={timeUpdateStatus === 'saving' || !newStartUTC}
                className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-[#152d5a] hover:bg-[#1a4fd6] text-white transition-colors disabled:opacity-50"
                >
                  {timeUpdateStatus === 'saving' ? 'Checking…' : 'Save New Time'}
                </button>
            </div>
          </div>
        </div>

        {isCancelling ? (
          <div className="mt-5 border-t border-gray-100 pt-5 space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 block">Cancel reason</label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                rows={3}
                placeholder="Reason for cancellation (recorded in audit trail)…"
                className="w-full border border-gray-200 rounded-xl p-4 text-sm text-[#152d5a] placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#1a4fd6]/20 focus:border-[#1a4fd6] bg-white"
                disabled={cancelPending}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setIsCancelling(false); setActionError(null) }}
                disabled={cancelPending}
                className="flex-1 px-3 py-2 rounded-lg text-xs border border-gray-200 bg-white text-[#152d5a] hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelPending || !cancelReason.trim()}
                className="flex-1 px-3 py-2 rounded-lg text-xs bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
              >
                {cancelPending ? 'Cancelling…' : 'Cancel Request'}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="bg-white border-t border-r border-b border-gray-100 border-l-4 border-l-[#8b5cf6] rounded-xl p-6 mb-4 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-full bg-[#152d5a] text-white text-sm font-semibold flex items-center justify-center flex-shrink-0">
            4
          </div>
          <h2 className="text-lg font-semibold text-[#152d5a]">Notes & Communication</h2>
          <ChevronDown className="ml-auto w-5 h-5 text-gray-400" />
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Customer Note</p>
          {customerNotes ? (
            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 border border-gray-100">
              {customerNotes}
            </p>
          ) : (
            <p className="text-sm text-gray-400 italic">No note provided.</p>
          )}
        </div>

        <div className="mt-5">
          <h3 className="text-sm font-semibold text-[#152d5a] mb-2">Send a message to the customer</h3>
          <div className="space-y-2">
            {chatEvents.length === 0 ? (
              <p className="text-sm text-gray-400">No messages yet.</p>
            ) : (
              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {chatEvents.map((ev) => {
                  const isAdmin = ev.actor_role === 'admin'
                  return (
                    <div key={ev.id} className="bg-gray-50 rounded-lg p-3 border border-gray-100 mb-2 text-sm text-[#152d5a]">
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-[#1a4fd6]">
                          {isAdmin ? 'Admin' : (customerName || 'Customer')}
                        </span>
                        <span className="text-[11px] text-gray-400">{formatDateTime(ev.created_at)}</span>
                      </div>
                      <p className="text-sm text-[#152d5a] whitespace-pre-wrap">{ev.body}</p>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>
            )}

            <textarea
              ref={messageTextareaRef}
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={handleMsgKeyDown}
              disabled={msgLoading}
              placeholder="Write your message..."
              rows={4}
              className="w-full border border-gray-200 rounded-xl p-4 text-sm text-[#152d5a] placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#1a4fd6]/20 focus:border-[#1a4fd6] min-h-[100px] bg-white"
            />
            {msgError && <p className="text-xs text-red-500">{msgError}</p>}
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">⌘ + Enter to send · Visible to customer</p>
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={msgLoading || !message.trim()}
                className="bg-[#1a4fd6] hover:bg-[#1540a8] text-white rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-colors disabled:opacity-40"
              >
                {msgLoading ? 'Sending…' : 'SEND'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] px-4 py-3 md:px-6 md:py-4">
        <div className="mx-auto max-w-7xl flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="hidden sm:flex items-center gap-3 bg-[#eef2ff] rounded-xl px-4 py-2.5 border border-[#c7d2fe]">
            <div className="w-7 h-7 rounded-lg bg-[#4f46e5] flex items-center justify-center flex-shrink-0">
              <HelpCircle className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#3730a3] leading-none">
                Ready to decide?
              </p>
              <p className="text-xs text-[#6366f1] mt-0.5">
                Choose the best action for this request.
              </p>
            </div>
            {actionError && <p className="mt-1 text-xs text-rose-500">{actionError}</p>}
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-end w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                setIsCancelling(true)
                timeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              disabled={confirmPending || cancelPending}
              className="inline-flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              Cancel Request
            </button>
            <button
              type="button"
              onClick={handleRequestDocuments}
              disabled={msgLoading}
              className="inline-flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl border border-gray-200 bg-white text-[#152d5a] text-xs font-medium hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              Request Documents
            </button>
            <button
              type="button"
              onClick={handleProposeDifferentTime}
              disabled={timeUpdateStatus === 'saving'}
              className="inline-flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl border border-gray-200 bg-white text-[#152d5a] text-xs font-medium hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
            >
              <CalendarDays className="w-4 h-4" />
              Propose New Time
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirmPending}
              className="inline-flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl bg-[#152d5a] text-white text-xs font-semibold hover:bg-[#1a4fd6] transition-colors shadow-md disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {confirmPending ? 'Confirming…' : 'Confirm Checkout'}
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmCheckoutOpen}
        title="Confirm checkout request?"
        description={`Confirm checkout request for ${formatDate(newStartUTC ?? scheduledStart)} at ${ALL_TIME_OPTIONS.find((o) => o.value === newStartTime)?.label ?? newStartTime} (Sydney time).`}
        confirmLabel={confirmPending ? 'Confirming…' : 'Confirm Checkout'}
        variant="primary"
        onCancel={() => setConfirmCheckoutOpen(false)}
        onConfirm={handleConfirmCheckout}
      />

      <ConfirmModal
        open={cancelConfirmOpen}
        title="Cancel this checkout request?"
        description="The customer will be returned to checkout required / not scheduled state."
        confirmLabel={cancelPending ? 'Cancelling…' : 'Yes, cancel request'}
        cancelLabel="Back"
        variant="danger"
        onCancel={() => setCancelConfirmOpen(false)}
        onConfirm={handleCancelCheckout}
      />

      <DocumentViewerModal
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        files={viewerFiles}
        initialIndex={viewerInitialIndex}
        title={viewerTitle}
      />
    </div>
  )
}
