'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  confirmCheckoutBooking,
  cancelCheckoutBooking,
  adminProposeCheckoutTime,
  adminDirectlyUpdateCheckoutTime,
  adminWithdrawProposedCheckoutTime,
  adminUpdateCheckoutTime,
} from '@/app/actions/admin-booking'
import { sendAdminChatMessage, markAdminChatRead, getSignedDocumentUrl } from '@/app/actions/admin'
import { bulkUpdateDocumentStatus, updateDocumentStatus } from '@/app/actions/verification'
import { sydneyInputToUTC } from '@/lib/utils/sydney-time'
import { formatDate, formatDateTime } from '@/lib/formatDateTime'
import CalendarDateField from '@/components/CalendarDateField'
import DocumentViewerModal from '@/components/ui/DocumentViewerModal'
import type { DocumentFile } from '@/components/ui/DocumentViewerModal'
import ConfirmModal from '@/components/ui/ConfirmModal'
import ModalPortal from '@/components/ModalPortal'
import type { VerificationEvent } from '@/lib/supabase/types'
import { formatDateFromISO } from '@/lib/formatDateTime'
import { CHECKOUT_RATE_PER_HOUR } from '@/lib/pricing-constants'
import { CHECKOUT_BLOCKING_DOCUMENT_TYPES } from '@/lib/checkout-document-gate'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  DollarSign,
  Eye,
  FileText,
  XCircle,
} from 'lucide-react'
import { RescheduleReviewFooterWarning } from './AdminRescheduleReviewProvider'

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
  red_card_expiry_month?: number | null
  red_card_expiry_year?: number | null
  review_notes?: string | null
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
  redCardExpiryMonth: number | null
  redCardExpiryYear:  number | null
  customerId:         string
  customerName:       string | null
  customerEmail:      string | null
  customerPhone:      string | null
  pilotArn:           string | null
  hasNightVfrRating?: boolean
  clearanceLabel:     string
  clearanceColor:     string
  clearanceBg:        string
  clearanceBorder:    string
  documents:          DocSummary[]
  messages:           VerificationEvent[]
  /** When true, keep the action footer but block Confirm Checkout until the new time is reviewed */
  pendingRescheduleReview?: boolean
  pendingProposal?: {
    id: string
    requested_scheduled_start: string
    requested_scheduled_end: string
    admin_note: string | null
    created_at?: string
  } | null
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
  onOpenDocumentViewer,
}: {
  label:      string
  doc:        DocSummary | undefined
  docType:    string
  customerId: string
  onOpenDocumentViewer: (files: NonNullable<DocSummary['files']>, index: number, title: string) => void
}) {
  const router = useRouter()
  const today   = new Date().toISOString().split('T')[0]!
  const expired = doc?.expiry_date && doc.expiry_date < today
  const [viewLoadingIndex, setViewLoadingIndex] = useState<number | null>(null)
  const [viewError, setViewError] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState<'approved' | 'rejected' | 'uploaded' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [currentStatus, setCurrentStatus] = useState(doc?.status ?? '')
  const [rejectionMessage, setRejectionMessage] = useState('')
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)

  useEffect(() => {
    setCurrentStatus(doc?.status ?? '')
  }, [doc?.id, doc?.status])

  async function handleDocAction(newStatus: 'approved' | 'rejected' | 'uploaded', reviewNotes?: string) {
    if (!doc?.id || actionPending) return
    setActionPending(newStatus)
    setActionError(null)
    const result = await updateDocumentStatus({
      documentId: doc.id,
      userId: customerId,
      status: newStatus,
      reviewNotes,
    })
    if (result.success) {
      setCurrentStatus(newStatus)
      try {
        await Promise.resolve(router.refresh())
      } finally {
        setRejectDialogOpen(false)
        setRejectionMessage('')
        setActionPending(null)
      }
    } else {
      setActionError(result.error ?? 'Action failed.')
      setActionPending(null)
    }
  }

  const resolvedStatus = currentStatus
  // Expiry wins over "approved" for medical/photo/night VFR (pilot licence expiry is not a blocker).
  const treatExpiryAsBlocker = docType !== 'pilot_licence'
  const showExpired = Boolean(expired && treatExpiryAsBlocker && resolvedStatus !== 'rejected')
  const decisionRecorded = currentStatus === 'approved' || currentStatus === 'rejected'

  const statusLabel = showExpired
    ? 'Expired'
    : resolvedStatus === 'approved'
      ? 'Approved'
      : resolvedStatus === 'rejected'
        ? 'Rejected'
        : !doc
          ? 'Not uploaded'
          : doc.status === 'rejected'
            ? 'Rejected'
            : 'Uploaded'

  const statusClass = showExpired
    ? 'bg-red-50 text-red-700 border border-red-200'
    : resolvedStatus === 'approved'
      ? 'bg-green-50 text-green-700 border border-green-200'
      : resolvedStatus === 'rejected'
        ? 'bg-red-50 text-red-700 border border-red-200'
        : !doc
          ? 'bg-gray-50 text-gray-500 border border-gray-200'
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
              {doc.expiry_date     && (
                <span className={showExpired ? 'font-semibold text-red-600' : undefined}>
                  {showExpired ? 'Expired' : 'Expires'}: {doc.expiry_date}
                </span>
              )}
              {doc.uploaded_at     && <span>Uploaded: {formatDateFromISO(doc.uploaded_at)}</span>}
            </div>
          )}

          {resolvedStatus === 'rejected' && doc?.review_notes?.trim() && (
            <div className="mt-2 max-w-2xl rounded-lg border border-red-100 bg-red-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-600">Rejection message</p>
              <p className="mt-0.5 text-xs leading-relaxed text-red-800">{doc.review_notes}</p>
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
                      disabled={viewLoadingIndex === fileIndex || !!actionPending}
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

            <div className="flex items-center gap-1.5 min-w-[180px] justify-end">
              {showExpired ? (
                <span className="inline-flex items-center gap-1 text-xs text-red-600 font-semibold bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                  <XCircle className="w-3 h-3" /> Expired
                </span>
              ) : decisionRecorded ? (
                <>
                  {currentStatus === 'approved' ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600 font-semibold bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                      <CheckCircle2 className="w-3 h-3" /> Approved
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-red-500 font-semibold bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                      <XCircle className="w-3 h-3" /> Rejected
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDocAction('uploaded')}
                    disabled={!!actionPending}
                    className="text-xs px-3 py-1.5 rounded-lg bg-white text-[#152d5a] border border-gray-200 font-semibold hover:bg-gray-50 transition-colors disabled:opacity-40 whitespace-nowrap"
                  >
                    {actionPending === 'uploaded' ? 'Undoing…' : 'Undo'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleDocAction('approved')}
                    disabled={!!actionPending}
                    className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 border border-green-200 font-semibold hover:bg-green-100 transition-colors disabled:opacity-40 whitespace-nowrap"
                  >
                    {actionPending === 'approved' ? 'Approving…' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRejectionMessage(''); setRejectDialogOpen(true) }}
                    disabled={!!actionPending}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 font-semibold hover:bg-red-100 transition-colors disabled:opacity-40 whitespace-nowrap"
                  >
                    {actionPending === 'rejected' ? 'Rejecting…' : 'Reject'}
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

      <ConfirmModal
        open={rejectDialogOpen}
        title={`Reject ${label}?`}
        description="The customer will see this message on their document and use it to correct the upload."
        confirmLabel={actionPending === 'rejected' ? 'Rejecting…' : 'Reject document'}
        variant="danger"
        isPending={actionPending === 'rejected'}
        onCancel={() => { if (!actionPending) setRejectDialogOpen(false) }}
        onConfirm={() => {
          const message = rejectionMessage.trim()
          if (!message) {
            setActionError('A rejection message is required.')
            return
          }
          void handleDocAction('rejected', message)
        }}
      >
        <div className="px-6 pt-4">
          <label htmlFor={`rejection-message-${doc?.id}`} className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Rejection message <span className="text-rose-600">*</span>
          </label>
          <textarea
            id={`rejection-message-${doc?.id}`}
            value={rejectionMessage}
            onChange={(event) => { setRejectionMessage(event.target.value); setActionError(null) }}
            rows={4}
            maxLength={1000}
            placeholder="Tell the customer what needs to be corrected…"
            className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
            disabled={actionPending === 'rejected'}
          />
          <p className="mt-1 text-[11px] text-slate-500">This message is customer-visible.</p>
          {actionError && <p className="mt-2 text-xs font-medium text-rose-600">{actionError}</p>}
        </div>
      </ConfirmModal>
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
  customerNotes, lastFlightDate, redCardExpiryMonth, redCardExpiryYear, customerId, customerName, customerEmail, customerPhone, pilotArn,
  hasNightVfrRating = false,
  clearanceLabel, clearanceColor, clearanceBg, clearanceBorder,
  documents, messages,
  pendingRescheduleReview = false,
  pendingProposal = null,
}: Props) {
  const router = useRouter()

  // ── Time edit state ──────────────────────────────────────────────────────────
  const [proposeModalOpen, setProposeModalOpen] = useState(false)
  const [viewProposalModalOpen, setViewProposalModalOpen] = useState(false)
  const [alreadyAgreedWithCustomer, setAlreadyAgreedWithCustomer] = useState(false)
  const [newDate, setNewDate]         = useState(toSydDate(scheduledStart))
  const [newStartTime, setNewStartTime] = useState(toSydTime(scheduledStart))
  const newEndTime  = addCheckoutDuration(newStartTime)
  const newEndDT    = newDate && newEndTime   ? `${newDate}T${newEndTime}`   : ''
  const newEndUTC   = newEndDT ? sydneyInputToUTC(newEndDT) : null
  const newStartDT  = newDate && newStartTime ? `${newDate}T${newStartTime}` : ''
  const newStartUTC = newStartDT ? sydneyInputToUTC(newStartDT) : null

  const [timeUpdateStatus, setTimeUpdateStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [timeError, setTimeError]               = useState<string | null>(null)
  const [withdrawing, setWithdrawing]           = useState(false)

  const [confirmPending, startConfirmTransition] = useTransition()
  const [confirmCheckoutOpen, setConfirmCheckoutOpen] = useState(false)
  const [overrideUnapprovedDocs, setOverrideUnapprovedDocs] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelPending, startCancelTransition] = useTransition()
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [bulkAction, setBulkAction] = useState<'approved' | 'rejected' | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkMessage, setBulkMessage] = useState<{
    status: 'approved' | 'rejected'
    updatedCount: number
    skippedCount: number
    requiredCount: number
  } | null>(null)
  const [bulkError, setBulkError] = useState('')
  const [bulkRejectionMessage, setBulkRejectionMessage] = useState('')
  const [forceAllApproved, setForceAllApproved] = useState(false)

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

  useEffect(() => {
    const handleOpenProposal = () => setViewProposalModalOpen(true)
    window.addEventListener('open-admin-proposal-modal', handleOpenProposal)
    return () => window.removeEventListener('open-admin-proposal-modal', handleOpenProposal)
  }, [])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleProposeDifferentTime() {
    setTimeError(null)
    setTimeUpdateStatus('idle')
    setAlreadyAgreedWithCustomer(false)
    setNewDate(toSydDate(scheduledStart))
    setNewStartTime(toSydTime(scheduledStart))
    setProposeModalOpen(true)
  }

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
      if (alreadyAgreedWithCustomer) {
        await adminDirectlyUpdateCheckoutTime(bookingId, newStartUTC, newDate, newStartTime)
      } else {
        await adminProposeCheckoutTime(bookingId, newStartUTC, newDate, newStartTime)
      }
      setTimeUpdateStatus('saved')
      setAlreadyAgreedWithCustomer(false)
      setProposeModalOpen(false)
      router.refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update time.'
      if (msg.includes('INVALID_SCHEDULE_BLOCK_TIME_ORDER')) {
        setTimeError('Could not set checkout time because the schedule block was invalid. Please try another time.')
      } else {
        setTimeError(msg.replace(/^VALIDATION: |^AVAILABILITY: /, ''))
      }
      setTimeUpdateStatus('error')
    }
  }

  async function handleWithdrawProposal() {
    setWithdrawing(true)
    setTimeError(null)
    try {
      await adminWithdrawProposedCheckoutTime(bookingId)
      setViewProposalModalOpen(false)
      router.refresh()
    } catch (e) {
      setTimeError(e instanceof Error ? e.message : 'Failed to withdraw proposal.')
    } finally {
      setWithdrawing(false)
    }
  }

  function handleConfirm() {
    if (!canConfirmCheckout) {
      setActionError('All required documents must be approved (and not expired) before confirming checkout, or acknowledge document status to proceed.')
      return
    }
    setActionError(null)
    setConfirmCheckoutOpen(true)
  }

  function handleConfirmCheckout() {
    setConfirmCheckoutOpen(false)
    setActionError(null)
    startConfirmTransition(async () => {
      try {
        await confirmCheckoutBooking(bookingId, { overrideUnapprovedDocs })
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

  function openBulkConfirm(status: 'approved' | 'rejected') {
    if (status === 'approved' && allRequiredApproved) return
    setBulkError('')
    setBulkMessage(null)
    setBulkRejectionMessage('')
    setBulkAction(status)
  }

  async function handleBulkUpdate() {
    if (!bulkAction) return
    if (bulkAction === 'rejected' && !bulkRejectionMessage.trim()) {
      setBulkError('A rejection message is required.')
      return
    }
    setBulkLoading(true)
    setBulkError('')
    try {
      const result = await bulkUpdateDocumentStatus({
        userId: customerId,
        status: bulkAction,
        reviewNotes: bulkAction === 'rejected' ? bulkRejectionMessage.trim() : undefined,
      })

      if (!result.success) {
        setBulkError(result.error)
        return
      }

      setBulkMessage({
        status: bulkAction,
        updatedCount: result.updatedCount,
        skippedCount: result.skippedCount,
        requiredCount: result.requiredCount,
      })
      if (bulkAction === 'approved') {
        setForceAllApproved(true)
      } else {
        setForceAllApproved(false)
      }
      router.refresh()
    } finally {
      setBulkLoading(false)
      setBulkAction(null)
    }
  }

  // ── Derived doc lookups ───────────────────────────────────────────────────────
  const licenceDoc        = documents.find(d => d.document_type === 'pilot_licence')
  const medicalDoc        = documents.find(d => d.document_type === 'medical_certificate')
  const photoIdDoc        = documents.find(d => d.document_type === 'photo_id')
  const nightVfrEvidenceDoc = documents.find(d => d.document_type === 'night_vfr_evidence')

  const hasNightVfr = Boolean(hasNightVfrRating || nightVfrEvidenceDoc)
  const activeDocumentTypes = [
    'pilot_licence',
    'medical_certificate',
    'photo_id',
    ...(hasNightVfr ? ['night_vfr_evidence'] : []),
  ]

  const requiredDocEntries = activeDocumentTypes.map((type) => ({
    type,
    doc: type === 'pilot_licence' ? licenceDoc
      : type === 'medical_certificate' ? medicalDoc
      : type === 'photo_id' ? photoIdDoc
      : nightVfrEvidenceDoc,
  }))

  const todayIso = new Date().toISOString().split('T')[0]!
  function isCheckoutDocReady(type: string, doc: DocSummary | undefined): boolean {
    if (!doc || doc.status !== 'approved') return false
    // Match customer readiness: pilot licence expiry is not a blocker.
    if (type !== 'pilot_licence' && doc.expiry_date && doc.expiry_date < todayIso) return false
    return true
  }
  // After bulk-approve, props may lag one refresh; treat core docs as approved.
  function effectiveDocStatus(type: string, doc: DocSummary): string {
    return forceAllApproved ? 'approved' : doc.status
  }
  const incompleteRequiredDocs = requiredDocEntries.filter(({ type, doc }) => {
    if (!doc) return true
    return !isCheckoutDocReady(type, { ...doc, status: effectiveDocStatus(type, doc) })
  })
  const hasRejectedDocs = requiredDocEntries.some(({ doc }) => doc?.status === 'rejected')
  const allDocsOk = incompleteRequiredDocs.length === 0
  const canConfirmCheckout = allDocsOk || overrideUnapprovedDocs
  const hasPendingAdminProposal = Boolean(pendingProposal && pendingProposal.admin_note === 'admin_proposed')
  const confirmBlockedByReschedule = pendingRescheduleReview || hasPendingAdminProposal
  const confirmCheckoutDisabledReason = hasPendingAdminProposal
    ? 'Confirm Checkout is disabled while a time proposal is awaiting customer response. Wait for customer or withdraw proposal.'
    : pendingRescheduleReview
      ? 'Confirm Checkout is disabled until you approve or reject the requested new time.'
      : canConfirmCheckout
        ? null
        : 'Confirm Checkout is disabled until all required documents are approved, or acknowledge document status below to proceed.'
  const allRequiredApproved = allDocsOk

  const endTimeLabel = ALL_TIME_OPTIONS.find(o => o.value === newEndTime)?.label ?? newEndTime
  const requestedTimeLabel = formatRequestedTimeLabel(scheduledStart)
  const now = new Date()
  const sydToday = now.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
  const sydNowHm = `${now.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', hour12: false }).slice(-2)}:${now.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', minute: '2-digit' }).padStart(2, '0')}`
  const timeOptions = newDate === sydToday
    ? ALL_TIME_OPTIONS.filter((o) => o.value >= sydNowHm)
    : ALL_TIME_OPTIONS
  const confirmEnabled = canConfirmCheckout && !confirmBlockedByReschedule

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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Name</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Link href={`/admin/users/${customerId}`} className="text-sm font-medium text-[#152d5a] underline decoration-[#152d5a]/20 underline-offset-2 hover:text-blue-400">
                {customerName || 'Unknown'}
              </Link>
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Email</p>
            <p className="mt-1 break-all text-sm font-medium text-[#152d5a]">{customerEmail || '—'}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Phone</p>
            <p className="mt-1 text-sm font-medium text-[#152d5a]">{customerPhone || '—'}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">ARN</p>
            <p className="mt-1 text-sm font-medium text-[#152d5a]">{pilotArn || '—'}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Last flight date</p>
            <p className="mt-1 text-sm font-medium text-[#152d5a]">{lastFlightDate ? formatDateFromISO(lastFlightDate) : '—'}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Red Card expiry</p>
            <p className="mt-1 text-sm font-medium text-[#152d5a]">
              {redCardExpiryMonth && redCardExpiryYear
                ? `${String(redCardExpiryMonth).padStart(2, '0')}/${redCardExpiryYear}`
                : '—'}
            </p>
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

        <div className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 mb-4 border ${
          allDocsOk
            ? 'text-green-700 bg-green-50 border-green-200'
            : 'text-amber-800 bg-amber-50 border-amber-200'
        }`}>
          {allDocsOk ? (
            <CheckCircle2 className="w-3.5 h-3.5" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5" />
          )}
          {allDocsOk ? 'All required documents approved' : 'Required documents awaiting approval'}
        </div>

        <div className="space-y-0">
          <DocRow label="Pilot Licence" doc={licenceDoc} docType="pilot_licence" customerId={customerId} onOpenDocumentViewer={openDocumentViewer} />
          <DocRow label="Medical Certificate" doc={medicalDoc} docType="medical_certificate" customerId={customerId} onOpenDocumentViewer={openDocumentViewer} />
          <DocRow label="Photo ID" doc={photoIdDoc} docType="photo_id" customerId={customerId} onOpenDocumentViewer={openDocumentViewer} />
          {hasNightVfr && (
            <DocRow
              label="Night VFR"
              doc={nightVfrEvidenceDoc}
              docType="night_vfr_evidence"
              customerId={customerId}
              onOpenDocumentViewer={openDocumentViewer}
            />
          )}
        </div>

        {bulkMessage && (
          <div className={`mt-4 rounded-2xl border px-4 py-3 ${bulkMessage.status === 'rejected' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className={`text-sm font-semibold ${bulkMessage.status === 'rejected' ? 'text-amber-900' : 'text-emerald-900'}`}>
                  {bulkMessage.status === 'rejected' ? 'Documents rejected.' : 'Documents approved.'}
                </p>
                <p className={`text-xs ${bulkMessage.status === 'rejected' ? 'text-amber-800' : 'text-emerald-800'}`}>
                  {bulkMessage.updatedCount} of {bulkMessage.requiredCount} required documents updated{bulkMessage.skippedCount > 0 ? ` · ${bulkMessage.skippedCount} missing document${bulkMessage.skippedCount === 1 ? '' : 's'} skipped` : ''}.
                  {bulkMessage.status === 'rejected' ? ' Message the customer about this?' : ' The customer can now proceed with booking review.'}
                </p>
              </div>
              {bulkMessage.status === 'rejected' && (
                <Link
                  href={`/admin/messages?userId=${customerId}`}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#1a4fd6] px-4 py-2 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-[#1540a8]"
                >
                  Message Customer
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </Link>
              )}
            </div>
          </div>
        )}

        {bulkError && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {bulkError}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => openBulkConfirm('approved')}
            disabled={bulkLoading || allRequiredApproved}
            title={allRequiredApproved ? 'All required documents are already approved' : undefined}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">verified_user</span>
            {allRequiredApproved ? 'All Required Documents Approved' : 'Approve All Required Documents'}
          </button>
          <button
            type="button"
            onClick={() => openBulkConfirm('rejected')}
            disabled={bulkLoading}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-rose-600 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">person_off</span>
            Reject All Documents
          </button>
        </div>
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
            <p className="text-sm font-semibold text-[#152d5a]">${CHECKOUT_RATE_PER_HOUR} / hour</p>
          </div>
        </div>

        {pendingProposal && pendingProposal.admin_note === 'admin_proposed' && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-600 text-base">schedule_send</span>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                  New Time Proposed to Customer
                </span>
              </div>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                Awaiting Customer Response
              </span>
            </div>
            <p className="text-sm font-semibold text-[#152d5a]">
              {formatRequestedTimeLabel(pendingProposal.requested_scheduled_start)}
            </p>
            <p className="text-xs text-amber-700 mt-1">
              The checkout time will update once the customer accepts. If declined, the original requested time remains active.
            </p>
            <div className="flex flex-wrap items-center gap-2.5 mt-3 pt-3 border-t border-amber-200/60">
              <button
                type="button"
                onClick={handleProposeDifferentTime}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1a4fd6]/30 bg-white text-xs font-semibold text-[#1a4fd6] hover:bg-blue-50 transition-colors shadow-2xs cursor-pointer"
              >
                <CalendarDays className="w-3.5 h-3.5" />
                Propose Different Time
              </button>
              <button
                type="button"
                onClick={handleWithdrawProposal}
                disabled={withdrawing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-300 bg-white text-xs font-semibold text-rose-700 hover:bg-rose-50 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
              >
                {withdrawing ? 'Withdrawing…' : 'Withdraw Proposal'}
              </button>
            </div>
          </div>
        )}

        {!hasPendingAdminProposal && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleProposeDifferentTime}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#152d5a] text-[#152d5a] text-sm font-medium hover:bg-[#152d5a] hover:text-white transition-colors"
            >
              <CalendarDays className="w-4 h-4" />
              Propose New Time
            </button>
          </div>
        )}

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

      <section className="bg-white border-t border-r border-b border-gray-100 border-l-4 border-l-[#8b5cf6] rounded-xl p-4 sm:p-6 mb-4 shadow-sm">
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
                  const isDecline = !isAdmin && (
                    ev.body?.toLowerCase().includes('unable to make the proposed') ||
                    ev.title?.toLowerCase().includes('declined') ||
                    ev.event_type === 'rejected'
                  )
                  const isAccept = !isAdmin && (
                    ev.body?.toLowerCase().includes('accepted the proposed') ||
                    ev.title?.toLowerCase().includes('accepted')
                  )

                  return (
                    <div
                      key={ev.id}
                      className={`rounded-lg p-3 border mb-2 text-sm ${
                        isDecline
                          ? 'bg-rose-50/90 border-rose-200 text-rose-950'
                          : isAccept
                            ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
                            : 'bg-gray-50 border-gray-100 text-[#152d5a]'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3 mb-1.5">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                          <span className={`text-xs font-semibold uppercase tracking-wide truncate max-w-[160px] sm:max-w-none ${
                            isDecline
                              ? 'text-rose-700 font-bold'
                              : isAccept
                                ? 'text-emerald-700 font-bold'
                                : 'text-[#1a4fd6]'
                          }`}>
                            {isAdmin ? 'Admin' : (customerName || 'Customer')}
                          </span>
                          {isDecline && (
                            <span className="inline-flex items-center gap-1 text-[9.5px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-300 whitespace-nowrap flex-shrink-0">
                              <span className="material-symbols-outlined text-[13px]">event_busy</span>
                              Declined Proposed Time
                            </span>
                          )}
                          {isAccept && (
                            <span className="inline-flex items-center gap-1 text-[9.5px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap flex-shrink-0">
                              <span className="material-symbols-outlined text-[13px]">check_circle</span>
                              Accepted Proposed Time
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-gray-400 font-mono whitespace-nowrap flex-shrink-0 self-start sm:self-auto sm:ml-auto">
                          {formatDateTime(ev.created_at)}
                        </span>
                      </div>
                      <div className={`text-sm whitespace-pre-wrap ${
                        isDecline
                          ? 'text-rose-900 font-medium'
                          : isAccept
                            ? 'text-emerald-900 font-medium'
                            : 'text-[#152d5a]'
                      }`}>
                        {ev.body ? (
                          isDecline && ev.body.includes('Note:') ? (
                            <div>
                              <p>{ev.body.split(/\.\s*Note:/i)[0]}.</p>
                              {(() => {
                                const match = ev.body.match(/Note:\s*("?[^"]*"?)\.\s*(.*)/i) || ev.body.match(/Note:\s*(.*)/i)
                                const noteContent = match ? match[1] : ''
                                const followUp = match && match[2] ? match[2] : ''
                                return (
                                  <>
                                    {noteContent && (
                                      <div className="my-2 p-2.5 rounded-lg bg-rose-100 border border-rose-300 text-rose-900 font-bold text-xs flex items-center gap-2 shadow-2xs">
                                        <span className="material-symbols-outlined text-base text-rose-600 flex-shrink-0">comment</span>
                                        <span>Customer Note: {noteContent}</span>
                                      </div>
                                    )}
                                    {followUp && <p className="text-xs text-rose-800 mt-1">{followUp}</p>}
                                  </>
                                )
                              })()}
                            </div>
                          ) : (
                            ev.body.replace(/\.\s*(Please accept or decline.*)/i, '.\n$1')
                          )
                        ) : ''}
                      </div>
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

      <div className="@container fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] md:px-6 md:py-4 lg:left-72">
        <div className="mx-auto flex max-w-7xl flex-col gap-2.5">
          {hasPendingAdminProposal && pendingProposal ? (
            <div className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between shadow-sm">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="material-symbols-outlined flex-shrink-0 text-amber-600 text-[18px] leading-none">
                  schedule_send
                </span>
                <span className="text-xs sm:text-sm leading-snug">
                  Proposed new time (<strong className="font-semibold text-amber-950">{formatRequestedTimeLabel(pendingProposal.requested_scheduled_start)}</strong>) is awaiting customer response. Confirm Checkout is disabled until customer accepts or proposal is withdrawn.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setViewProposalModalOpen(true)}
                className="inline-flex flex-shrink-0 items-center justify-center gap-1.5 self-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 sm:self-auto"
              >
                View proposed time
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>
          ) : pendingRescheduleReview ? (
            <RescheduleReviewFooterWarning />
          ) : !allDocsOk ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/95 p-3 sm:p-3.5 text-amber-900 shadow-sm transition-all">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" aria-hidden="true" />
                <div className="flex-1 space-y-1.5 min-w-0">
                  <p className="text-xs font-semibold text-amber-950">
                    {hasRejectedDocs
                      ? 'One or more documents have been rejected.'
                      : 'One or more required documents are awaiting approval or have expired.'}
                  </p>
                  <p className="text-[11.5px] leading-relaxed text-amber-800">
                    You can still confirm this checkout if needed. The customer will need to re-upload any rejected documents and have them approved before flight dispatch.
                  </p>
                  <label className="mt-1 flex items-center gap-2 pt-0.5 text-xs font-medium text-amber-950 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={overrideUnapprovedDocs}
                      onChange={(e) => {
                        setOverrideUnapprovedDocs(e.target.checked)
                        setActionError(null)
                      }}
                      className="h-4 w-4 rounded border-amber-300 text-[#1a4fd6] focus:ring-[#1a4fd6] accent-[#1a4fd6] cursor-pointer"
                    />
                    <span className="font-semibold text-amber-900">
                      Acknowledge document status and proceed with checkout confirmation
                    </span>
                  </label>
                </div>
              </div>
            </div>
          ) : null}
          {actionError && <p className="text-xs text-rose-500 text-center">{actionError}</p>}
          {/* Mobile: 2x2 grid. sm+: original single-row footer actions */}
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-full sm:flex-shrink-0 sm:flex-wrap sm:items-center sm:justify-center sm:gap-2">
            <button
              type="button"
              onClick={() => {
                setIsCancelling(true)
                timeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              disabled={confirmPending || cancelPending}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 px-2.5 py-2 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 sm:w-auto sm:gap-2 sm:px-4 sm:py-2.5 sm:text-xs sm:justify-start"
            >
              <XCircle className="h-4 w-4 flex-shrink-0" />
              Cancel Request
            </button>
            <button
              type="button"
              onClick={handleRequestDocuments}
              disabled={msgLoading}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-[11px] font-medium text-[#152d5a] shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50 sm:w-auto sm:gap-2 sm:px-4 sm:py-2.5 sm:text-xs sm:justify-start"
            >
              <FileText className="h-4 w-4 flex-shrink-0" />
              Request Documents
            </button>
            <button
              type="button"
              onClick={handleProposeDifferentTime}
              disabled={timeUpdateStatus === 'saving' || pendingRescheduleReview}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-[11px] font-medium text-[#152d5a] shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50 sm:w-auto sm:gap-2 sm:px-4 sm:py-2.5 sm:text-xs sm:justify-start"
            >
              <CalendarDays className="h-4 w-4 flex-shrink-0" />
              {hasPendingAdminProposal ? 'Propose Different Time' : 'Propose New Time'}
            </button>
            <div className="relative group w-full sm:w-auto">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirmPending || !confirmEnabled}
                aria-describedby={!confirmEnabled && !confirmPending ? 'confirm-checkout-disabled-tooltip' : undefined}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#152d5a] px-2.5 py-2 text-[11px] font-semibold text-white shadow-md transition-colors hover:bg-[#1a4fd6] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:gap-2 sm:px-5 sm:py-2.5 sm:text-xs sm:justify-start"
              >
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                {confirmPending ? 'Confirming…' : 'Confirm Checkout'}
              </button>
              {confirmCheckoutDisabledReason && !confirmPending ? (
                <div
                  id="confirm-checkout-disabled-tooltip"
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-[11px] font-medium leading-snug text-slate-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  {confirmCheckoutDisabledReason}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmCheckoutOpen}
        title="Confirm checkout request?"
        description={
          overrideUnapprovedDocs && !allDocsOk ? (
            <div className="space-y-2.5 text-left">
              <p className="text-sm text-slate-600">
                Confirm checkout request for {formatDateFromISO(newStartUTC ?? scheduledStart)} at {ALL_TIME_OPTIONS.find((o) => o.value === newStartTime)?.label ?? newStartTime} (Sydney time).
              </p>
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-800">
                <span className="font-bold text-red-700 uppercase tracking-wider block mb-0.5">Note</span>
                <span className="text-red-900 font-medium">
                  Document exceptions are acknowledged; customer must have valid approved documents prior to flight dispatch.
                </span>
              </div>
            </div>
          ) : (
            `Confirm checkout request for ${formatDateFromISO(newStartUTC ?? scheduledStart)} at ${ALL_TIME_OPTIONS.find((o) => o.value === newStartTime)?.label ?? newStartTime} (Sydney time).`
          )
        }
        confirmLabel={confirmPending ? 'Confirming…' : 'Confirm Checkout'}
        variant="primary"
        isPending={confirmPending}
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
        isPending={cancelPending}
        onCancel={() => setCancelConfirmOpen(false)}
        onConfirm={handleCancelCheckout}
      />

      <ConfirmModal
        open={bulkAction !== null}
        title={bulkAction === 'approved' ? 'Approve all required documents?' : 'Reject all required documents?'}
        description={
          bulkAction === 'approved'
            ? 'This will mark every required document as approved for this customer.'
            : 'This will reject every required document for this customer and create a rejection event for each one.'
        }
        confirmLabel={bulkLoading ? (bulkAction === 'approved' ? 'Approving…' : 'Rejecting…') : bulkAction === 'approved' ? 'Approve All' : 'Reject All'}
        variant={bulkAction === 'approved' ? 'primary' : 'danger'}
        isPending={bulkLoading}
        onCancel={() => {
          if (bulkLoading) return
          setBulkAction(null)
          setBulkRejectionMessage('')
        }}
        onConfirm={handleBulkUpdate}
      >
        {bulkAction === 'rejected' && (
          <div className="px-6 pt-4">
            <label htmlFor="bulk-rejection-message" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Rejection message <span className="text-rose-600">*</span>
            </label>
            <textarea
              id="bulk-rejection-message"
              value={bulkRejectionMessage}
              onChange={(event) => { setBulkRejectionMessage(event.target.value); setBulkError('') }}
              rows={4}
              maxLength={1000}
              placeholder="Tell the customer what needs to be corrected…"
              className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
              disabled={bulkLoading}
            />
            <p className="mt-1 text-[11px] text-slate-500">This message is customer-visible on each rejected document.</p>
            {bulkError && <p className="mt-2 text-xs font-medium text-rose-600">{bulkError}</p>}
          </div>
        )}
      </ConfirmModal>

      <DocumentViewerModal
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        files={viewerFiles}
        initialIndex={viewerInitialIndex}
        title={viewerTitle}
      />

      {/* Propose / Direct Update Time Modal */}
      {proposeModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-6 shadow-2xl border border-gray-100 space-y-4 my-auto animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 sm:pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#1a4fd6]">
                    <CalendarDays className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-[#152d5a]">
                      {hasPendingAdminProposal ? 'Propose Different Checkout Time' : 'Propose or Update Checkout Time'}
                    </h3>
                    <p className="text-[11px] sm:text-xs text-gray-500">
                      Duration is fixed at 2 hours (Sydney local time).
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setProposeModalOpen(false); setTimeError(null) }}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              <div className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block">Date</label>
                    <CalendarDateField
                      value={newDate}
                      onChange={(next) => { setNewDate(next); setTimeError(null) }}
                      minYear={new Date().getFullYear() - 20}
                      maxYear={new Date().getFullYear() + 20}
                      minDate={sydToday}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-xs text-[#152d5a] focus:outline-none focus:border-[#1a4fd6] text-left flex items-center justify-between"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block">Departure Time</label>
                    <TimeDropdown
                      value={newStartTime}
                      options={timeOptions}
                      onChange={(next) => { setNewStartTime(next); setTimeError(null) }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5">
                  <span className="text-xs text-gray-500 font-medium">Return Time (auto)</span>
                  <span className="text-xs font-semibold text-[#152d5a]">
                    {endTimeLabel} <span className="text-gray-400 font-normal">(fixed 2 hrs)</span>
                  </span>
                </div>

                {/* Agreement Checkbox */}
                <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-3 sm:p-3.5 space-y-1">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={alreadyAgreedWithCustomer}
                      onChange={(e) => {
                        setAlreadyAgreedWithCustomer(e.target.checked)
                        setTimeError(null)
                      }}
                      className="mt-0.5 h-4 w-4 rounded border-blue-300 text-[#1a4fd6] focus:ring-[#1a4fd6] accent-[#1a4fd6] cursor-pointer flex-shrink-0"
                    />
                    <div className="text-xs text-[#152d5a]">
                      <span className="font-bold block text-blue-950">
                        I have already spoken with the customer and agreed on this time
                      </span>
                      <span className="text-blue-800 text-[11px] leading-relaxed block mt-0.5">
                        {alreadyAgreedWithCustomer
                          ? 'Checking this will immediately update the flight time in both customer and admin systems without requiring customer approval.'
                          : 'Check this if you directly confirmed the new time with the pilot. Otherwise, leave unchecked to send a formal proposal for their approval.'}
                      </span>
                    </div>
                  </label>
                </div>

                {timeError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600 font-medium">
                    {timeError}
                  </div>
                )}
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => { setProposeModalOpen(false); setAlreadyAgreedWithCustomer(false); setTimeError(null) }}
                  className="inline-flex items-center justify-center px-4 py-2.5 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-xl shadow-xs transition-colors w-full sm:w-auto text-center"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveTime}
                  disabled={timeUpdateStatus === 'saving'}
                  className={`inline-flex items-center justify-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-white rounded-xl shadow-sm transition-colors disabled:opacity-50 w-full sm:w-auto text-center ${
                    alreadyAgreedWithCustomer
                      ? 'bg-[#152d5a] hover:bg-[#1a4fd6]'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {timeUpdateStatus === 'saving' ? (
                    <>
                      <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                      {alreadyAgreedWithCustomer ? 'Updating…' : 'Sending…'}
                    </>
                  ) : alreadyAgreedWithCustomer ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Update Flight Time Directly
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">schedule_send</span>
                      Send Proposal to Customer
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* View Proposed Time Modal */}
      {viewProposalModalOpen && pendingProposal && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-6 shadow-2xl border border-gray-100 space-y-4 my-auto animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 sm:pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                    <span className="material-symbols-outlined text-xl">schedule_send</span>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#152d5a]">
                      Proposed Checkout Flight Time
                    </h3>
                    <p className="text-xs text-amber-800">
                      Awaiting Customer Response
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewProposalModalOpen(false)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Current Scheduled Time (Held)
                  </p>
                  <p className="text-sm font-semibold text-[#152d5a]">
                    {requestedTimeLabel}
                  </p>
                </div>

                <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 mb-1">
                    Proposed Alternative Time
                  </p>
                  <p className="text-sm font-bold text-amber-950">
                    {formatRequestedTimeLabel(pendingProposal.requested_scheduled_start)}
                  </p>
                  <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                    The checkout time will update once the customer accepts. If declined, the original time remains active.
                  </p>
                </div>

                {timeError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600 font-medium">
                    {timeError}
                  </div>
                )}
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleWithdrawProposal}
                  disabled={withdrawing}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-xl shadow-xs transition-colors disabled:opacity-50 w-full sm:w-auto text-center"
                >
                  {withdrawing ? 'Withdrawing…' : 'Withdraw Proposal'}
                </button>

                <div className="flex flex-col-reverse sm:flex-row items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setViewProposalModalOpen(false)}
                    className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-xl shadow-xs transition-colors w-full sm:w-auto text-center"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setViewProposalModalOpen(false)
                      setAlreadyAgreedWithCustomer(false)
                      setTimeError(null)
                      setProposeModalOpen(true)
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#1a4fd6] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl shadow-xs transition-colors w-full sm:w-auto text-center"
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                    Propose Different Time
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}
