'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { approveCustomer, rejectCustomer, placeCustomerOnHold } from '@/app/actions/admin'
import { updateDocumentStatus } from '@/app/actions/verification'
import { formatDateTime } from '@/lib/formatDateTime'
import type { RequestKind, UserDocument } from '@/lib/supabase/types'
import OpenFileButton from './OpenFileButton'

type DecisionAction = 'approve' | 'hold' | 'reject'

type RequestKindConfig = { label: string; sublabel: string; icon: string }
const REQUEST_KIND_CONFIG: Partial<Record<RequestKind, RequestKindConfig>> = {
  document_request:      { label: 'Docs Required',  sublabel: 'Customer must upload/replace documents', icon: 'upload_file' },
  clarification_request: { label: 'Clarification',  sublabel: 'Customer should reply with information', icon: 'chat' },
  confirmation_request:  { label: 'Confirmation',   sublabel: 'Customer should confirm something',      icon: 'task_alt' },
  general_update:        { label: 'General Update', sublabel: 'Informational — no specific action',     icon: 'info' },
}

type Props = {
  customerId: string
  currentStatus: string
  existingNote?: string | null
  reviewedAt?: string | null
}

// Maps each action to its icon and active-state colour tokens
const ACTION_CONFIG: Record<
  DecisionAction,
  { label: string; icon: string; activeClass: string; tabBg: string }
> = {
  approve: {
    label:      'Approve',
    icon:       'verified_user',
    activeClass: 'border-green-400/35 text-green-400 bg-green-500/10',
    tabBg:       'bg-green-300/5',
  },
  hold: {
    label:      'On Hold',
    icon:       'pause_circle',
    activeClass: 'border-amber-400/35 text-amber-300 bg-amber-500/10',
    tabBg:       'bg-amber-300/5',
  },
  reject: {
    label:      'Reject',
    icon:       'person_off',
    activeClass: 'border-red-400/35 text-red-400 bg-red-500/10',
    tabBg:       'bg-red-300/5',
  },
}

function defaultAction(status: string): DecisionAction {
  if (status === 'verified') return 'approve'
  if (status === 'rejected') return 'reject'
  if (status === 'on_hold')  return 'hold'
  return 'approve'
}

export default function VerdictPanel({
  customerId,
  currentStatus,
  existingNote,
  reviewedAt,
}: Props) {
  const isAlreadyDecided =
    currentStatus === 'verified' ||
    currentStatus === 'rejected' ||
    currentStatus === 'on_hold'

  const [isEditing, setIsEditing]     = useState(false)
  const [selected, setSelected]       = useState<DecisionAction>(() => defaultAction(currentStatus))
  const [notes, setNotes]             = useState('')
  const [customerMsg, setCustomerMsg] = useState('')
  const [requestKind, setRequestKind] = useState<RequestKind>('document_request')
  const [loading, setLoading]         = useState<DecisionAction | null>(null)
  const [error, setError]             = useState('')
  const [warning, setWarning]         = useState('')
  const router = useRouter()

  const formattedReviewedAt = reviewedAt ? formatDateTime(reviewedAt) : null

  // ── Transition helpers ────────────────────────────────────────────────────────

  function enterEditMode() {
    setNotes(existingNote ?? '')
    setCustomerMsg('')
    setSelected(defaultAction(currentStatus))
    setError('')
    setIsEditing(true)
  }

  function cancelEdit() {
    setIsEditing(false)
    setNotes('')
    setCustomerMsg('')
    setRequestKind('document_request')
    setError('')
    setWarning('')
  }

  function handleSelectAction(action: DecisionAction) {
    if (loading) return
    setSelected(action)
    setError('')
  }

  // ── Submit handler ────────────────────────────────────────────────────────────

  async function handleConfirm() {
    setError('')
    setWarning('')

    if (selected === 'approve') {
      setLoading('approve')
      try {
        await approveCustomer(customerId, notes)
        setIsEditing(false)
        router.refresh()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to approve. Please try again.')
      } finally {
        setLoading(null)
      }

    } else if (selected === 'reject') {
      setLoading('reject')
      try {
        await rejectCustomer(customerId, notes)
        setIsEditing(false)
        router.refresh()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to reject. Please try again.')
      } finally {
        setLoading(null)
      }

    } else if (selected === 'hold') {
      if (!customerMsg.trim()) {
        setError('A customer-facing message is required before placing on hold.')
        return
      }
      setLoading('hold')
      try {
        const result = await placeCustomerOnHold(customerId, customerMsg, requestKind)
        // Non-blocking advisory: status updated but event/email had an issue
        if (result?.warning) {
          setWarning(result.warning)
          router.refresh()
          setIsEditing(false)
        } else {
          setIsEditing(false)
          router.refresh()
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to place on hold. Please try again.'
        // Strip the VALIDATION: prefix for display — it's just a discriminator tag
        if (msg.startsWith('VALIDATION:')) {
          setError(msg.replace('VALIDATION:', '').trim())
        } else {
          setError(msg)
        }
      } finally {
        setLoading(null)
      }
    }
  }

  // ── Compact read-only banner (decided, not editing) ───────────────────────────

  if (isAlreadyDecided && !isEditing) {
    const isOnHold   = currentStatus === 'on_hold'
    const isVerified = currentStatus === 'verified'

    return (
      <section className="relative">
        <div className={`absolute inset-0 rounded-3xl blur-3xl -z-10 ${isOnHold ? 'bg-amber-300/5' : 'bg-blue-300/5'}`} />
        <div className={`border px-10 py-8 rounded-3xl ${
          isOnHold ? 'bg-white border-amber-500/15' : 'bg-white border-blue-300/10'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div className="space-y-1">
              <h3 className="font-serif text-2xl tracking-tight text-[#152d5a]">Verification Verdict</h3>
              {formattedReviewedAt && (
                <p className="text-[10px] text-[#4b6390] uppercase tracking-widest">
                  Decision recorded{' '}
                  <span className="text-[#4b6390] font-semibold">{formattedReviewedAt}</span>
                </p>
              )}
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <div className={`px-6 py-3 rounded-full text-[13px] font-bold uppercase tracking-[0.2em] ${
                isVerified ? 'bg-green-500/10 text-green-400 border border-green-400/20'
                : isOnHold ? 'bg-amber-500/10 text-amber-400 border border-amber-400/20'
                :            'bg-red-500/10   text-red-400   border border-red-400/20'
              }`}>
                {isVerified ? '✓ Approved' : isOnHold ? '⏸ On Hold' : '✕ Rejected'}
              </div>

              <button
                onClick={enterEditMode}
                className="flex items-center gap-2 px-5 py-3 border border-blue-300/20 text-[#1a4fd6] hover:bg-blue-300/10 hover:text-[#152d5a] font-bold rounded-full text-[13px] uppercase tracking-[0.2em] transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'wght' 300" }}>
                  edit
                </span>
                Edit Decision
              </button>
            </div>
          </div>
        </div>
      </section>
    )
  }

  // ── Decision Composer (pending + edit mode) ───────────────────────────────────

  const cfg = ACTION_CONFIG[selected]
  const isHold = selected === 'hold'
  const isConfirmDisabled = !!loading || (isHold && !customerMsg.trim())

  const confirmLabel = isEditing
    ? selected === 'approve' ? 'Re-Approve Customer'
    : selected === 'reject'  ? 'Re-Reject Customer'
    :                          'Confirm Hold'
    : selected === 'approve' ? 'Approve Customer'
    : selected === 'reject'  ? 'Reject Customer'
    :                          'Confirm Hold'

  const confirmButtonClass = isHold
    ? 'bg-amber-500/20 border border-amber-400/30 text-amber-300 hover:bg-amber-500/30'
    : selected === 'approve'
    ? 'bg-gradient-to-r from-blue-300 to-blue-400/80 text-[#213243] shadow-lg hover:shadow-blue-300/20'
    : 'border border-[#152d5a]/15 text-[#152d5a] hover:bg-white/5'

  return (
    <section className="relative">
      {/* Ambient glow shifts colour with the selected action */}
      <div className={`absolute inset-0 rounded-3xl blur-3xl -z-10 transition-colors duration-500 ${cfg.tabBg}`} />

      <div className={` border p-10 rounded-3xl transition-colors duration-300 ${
        isHold ? 'bg-white border-amber-500/15' : 'bg-white border-blue-300/10'
      }`}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="mb-8">
          <h3 className="font-serif text-2xl tracking-tight text-[#152d5a]">
            {isEditing ? 'Edit Decision' : 'Verification Verdict'}
          </h3>
          {isEditing && (
            <p className="text-[13px] text-[#4b6390] italic leading-relaxed mt-2">
              Select a new verdict below. The customer will be notified of the change immediately.
            </p>
          )}
        </div>

        {/* ── Action selector: segmented tabs ─────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {(['approve', 'hold', 'reject'] as const).map((action) => {
            const tabCfg  = ACTION_CONFIG[action]
            const isActive = selected === action
            return (
              <button
                key={action}
                onClick={() => handleSelectAction(action)}
                disabled={!!loading}
                className={`flex flex-col items-center gap-2 py-4 border rounded-xl text-[10px] font-bold uppercase tracking-[0.15em] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
                  isActive
                    ? tabCfg.activeClass
                    : 'border-[#152d5a]/10 text-[#152d5a]/30 hover:border-[#152d5a]/20 hover:text-[#152d5a]/55'
                }`}
              >
                <span
                  className="material-symbols-outlined text-lg"
                  style={{ fontVariationSettings: "'wght' 300, 'FILL' 0" }}
                >
                  {tabCfg.icon}
                </span>
                {tabCfg.label}
              </button>
            )
          })}
        </div>

        {/* ── Context-sensitive form area ──────────────────────────────────── */}
        <div className="space-y-4">

          {/* Approve / Reject: internal notes */}
          {(selected === 'approve' || selected === 'reject') && (
            <div className="space-y-2">
              <label className="text-[10px] text-[#4b6390] uppercase tracking-widest font-bold block">
                Internal Review Notes{' '}
                <span className="normal-case font-normal text-[#4b6390]">(not shown to customer)</span>
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                disabled={!!loading}
                className="w-full bg-[#f8f9fb] border border-[#152d5a]/8 focus:border-blue-300/30 focus:ring-0 focus:outline-none text-[14px] text-[#152d5a] rounded-xl p-4 transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-[#4b6390]"
                placeholder="Enter internal findings or notes for this profile…"
                rows={4}
              />
            </div>
          )}

          {/* On Hold: request kind + customer-facing message */}
          {selected === 'hold' && (
            <div className="space-y-5">

              {/* Request kind selector */}
              <div className="space-y-2">
                <label className="text-[10px] text-amber-400/70 uppercase tracking-widest font-bold block">
                  Request Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(REQUEST_KIND_CONFIG) as [RequestKind, RequestKindConfig][]).map(([kind, cfg]) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setRequestKind(kind)}
                      disabled={!!loading}
                      className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all disabled:opacity-40 ${
                        requestKind === kind
                          ? 'border-amber-400/40 bg-amber-500/10 text-amber-300'
                          : 'border-[#152d5a]/8 text-[#152d5a]/30 hover:border-[#152d5a]/20 hover:text-[#152d5a]/50'
                      }`}
                    >
                      <span
                        className="material-symbols-outlined text-[15px] flex-shrink-0 mt-0.5"
                        style={{ fontVariationSettings: "'wght' 300" }}
                      >{cfg.icon}</span>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest">{cfg.label}</p>
                        <p className="text-[11px] font-normal normal-case tracking-normal opacity-70 leading-snug mt-0.5">{cfg.sublabel}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Info banner */}
              <div className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/12 rounded-xl px-4 py-3">
                <span
                  className="material-symbols-outlined text-amber-400/70 text-[14px] flex-shrink-0 mt-0.5"
                  style={{ fontVariationSettings: "'wght' 300" }}
                >info</span>
                <p className="text-[14px] text-amber-200/60 leading-relaxed">
                  This message will be emailed to the customer and shown on their dashboard.
                  Write clearly — they see exactly what you type. Do not include internal notes.
                </p>
              </div>

              {/* Message textarea */}
              <div className="space-y-2">
                <label className="text-[11px] text-amber-400/70 uppercase tracking-widest font-bold block">
                  Message to Customer <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={customerMsg}
                  onChange={e => setCustomerMsg(e.target.value)}
                  disabled={!!loading}
                  className="w-full bg-[#f8f9fb] border border-amber-500/20 focus:border-amber-400/40 focus:ring-0 focus:outline-none text-[14px] text-[#152d5a] rounded-xl p-4 transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-[#4b6390]"
                  placeholder={
                    requestKind === 'document_request'
                      ? 'Describe which documents need to be uploaded or replaced…'
                      : requestKind === 'clarification_request'
                      ? 'Ask your clarifying question or describe what information is needed…'
                      : requestKind === 'confirmation_request'
                      ? 'Describe what the customer needs to confirm…'
                      : 'Write your message to the customer…'
                  }
                  rows={5}
                />
              </div>

            </div>
          )}

        </div>

        {/* ── Error (hard failure) ──────────────────────────────────────── */}
        {error && (
          <div className="flex items-start gap-2 mt-5 bg-red-500/5 border border-red-400/15 rounded-xl px-4 py-3">
            <span className="material-symbols-outlined text-red-400 text-[14px] flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'wght' 300" }}>error</span>
            <p className="text-[13px] text-red-300 leading-relaxed">{error}</p>
          </div>
        )}

        {/* ── Warning (non-fatal advisory) ─────────────────────────────────── */}
        {warning && !error && (
          <div className="flex items-start gap-2 mt-5 bg-amber-500/5 border border-amber-400/15 rounded-xl px-4 py-3">
            <span className="material-symbols-outlined text-amber-400/80 text-[14px] flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'wght' 300" }}>warning</span>
            <p className="text-[13px] text-amber-200/70 leading-relaxed">{warning}</p>
          </div>
        )}

        {/* ── Footer: Cancel (left) · Confirm (right) ──────────────────────── */}
        <div className="flex items-center justify-between gap-4 pt-7 mt-7 border-t border-[#152d5a]/8">

          {/* Left slot: Cancel when editing, hint text when fresh decision */}
          {isEditing ? (
            <button
              onClick={cancelEdit}
              disabled={!!loading}
              className="px-6 py-3 border border-[#152d5a]/10 text-[#4b6390] hover:text-[#152d5a] hover:border-[#152d5a]/20 font-bold rounded-full text-[13px] uppercase tracking-[0.15em] transition-all disabled:opacity-40"
            >
              Cancel
            </button>
          ) : (
            <p className="text-[10px] text-[#4b6390] italic leading-relaxed max-w-xs">
              Customer will be notified immediately via email and dashboard.
            </p>
          )}

          {/* Right slot: primary confirm action */}
          <button
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className={`flex items-center gap-2 px-8 py-3.5 rounded-full text-[13px] font-bold uppercase tracking-[0.15em] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 ${confirmButtonClass}`}
          >
            {loading && (
              <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
            )}
            {confirmLabel}
          </button>
        </div>

      </div>
    </section>
  )
}

type DocumentCardStatus = 'pending' | 'approved' | 'rejected'

type DocumentCardType = UserDocument['document_type']

const REQUIRED_DOC_TYPES: DocumentCardType[] = ['pilot_licence', 'medical_certificate', 'photo_id']
const OPTIONAL_DOC_TYPE: DocumentCardType = 'night_vfr_evidence'

const DOCUMENT_CARD_CONFIG: Record<DocumentCardType, { label: string; optionalReason: string }> = {
  pilot_licence: {
    label: 'Pilot Licence',
    optionalReason: '',
  },
  medical_certificate: {
    label: 'Medical Certificate',
    optionalReason: '',
  },
  photo_id: {
    label: 'Photo ID',
    optionalReason: '',
  },
  night_vfr_evidence: {
    label: 'Night VFR Evidence',
    optionalReason: 'Only required for customers who have opted into Night VFR flying.',
  },
}

function getLatestDocument(documents: UserDocument[], documentType: DocumentCardType) {
  return [...documents]
    .filter((doc) => doc.document_type === documentType)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null
}

function getDocumentStatus(doc: UserDocument | null): DocumentCardStatus {
  if (!doc) return 'pending'
  if (doc.status === 'approved') return 'approved'
  if (doc.status === 'rejected') return 'rejected'
  return 'pending'
}

function formatUploadedTimestamp(value: string | null): string {
  if (!value) return 'Awaiting upload'
  return formatDateTime(value)
}

function formatShortDate(value: string | null): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsed)
}

function getDocumentDetails(doc: UserDocument | null, documentType: DocumentCardType): string {
  if (!doc) return 'No document uploaded yet'

  if (documentType === 'pilot_licence') {
    const parts = [doc.licence_type ?? 'Licence type unavailable']
    if (doc.licence_number) parts.push(`Licence number ${doc.licence_number}`)
    else if ((doc as { pilot_arn?: string | null }).pilot_arn) parts.push(`ARN ${(doc as { pilot_arn?: string | null }).pilot_arn}`)
    return parts.join(' · ')
  }

  if (documentType === 'medical_certificate') {
    const parts = [doc.medical_class ?? 'Class unavailable']
    parts.push(doc.expiry_date ? `Expires ${formatShortDate(doc.expiry_date)}` : 'Expiry unavailable')
    return parts.join(' · ')
  }

  if (documentType === 'photo_id') {
    const parts = [doc.id_type ?? 'ID type unavailable']
    if (doc.document_number) parts.push(`Document number ${doc.document_number}`)
    return parts.join(' · ')
  }

  if (documentType === 'night_vfr_evidence') {
    return 'Night VFR evidence'
  }

  return 'Document details unavailable'
}

function getStatusPillClass(status: DocumentCardStatus): string {
  if (status === 'approved') return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
  if (status === 'rejected') return 'bg-red-500/10 text-red-700 border-red-500/20'
  return 'bg-amber-500/10 text-amber-700 border-amber-500/20'
}

function getStatusAccentClass(status: DocumentCardStatus): string {
  if (status === 'approved') return 'bg-emerald-500'
  if (status === 'rejected') return 'bg-red-500'
  return 'bg-amber-400'
}

function getStatusLabel(status: DocumentCardStatus): string {
  if (status === 'approved') return 'Approved'
  if (status === 'rejected') return 'Rejected'
  return 'Awaiting review'
}

function formatSummaryCounts(approved: number, rejected: number, pending: number, total: number): string {
  return `${approved} of ${total} approved · ${rejected} rejected · ${pending} pending`
}

export function DocumentReviewCards({
  customerId,
  documents,
  customerProfile,
  hasNightVfrRating = false,
  onHoldBookingCount = 0,
}: {
  customerId: string
  documents: UserDocument[]
  customerProfile?: { has_night_vfr_rating: boolean | null }
  hasNightVfrRating?: boolean | null
  onHoldBookingCount?: number
}) {
  const router = useRouter()
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null)
  const [errorByDocId, setErrorByDocId] = useState<Record<string, string>>({})

  const resolvedNightVfrRating = customerProfile?.has_night_vfr_rating ?? hasNightVfrRating ?? false
  const requiredDocTypes = resolvedNightVfrRating ? [...REQUIRED_DOC_TYPES, OPTIONAL_DOC_TYPE] : REQUIRED_DOC_TYPES
  const optionalDocTypes = resolvedNightVfrRating ? [] : [OPTIONAL_DOC_TYPE]
  const latestDocuments = requiredDocTypes.map((documentType) => ({
    documentType,
    doc: getLatestDocument(documents, documentType),
  }))
  const optionalDocuments = optionalDocTypes.map((documentType) => ({
    documentType,
    doc: getLatestDocument(documents, documentType),
  }))

  const docCounts = latestDocuments.reduce(
    (acc, item) => {
      const status = getDocumentStatus(item.doc)
      if (status === 'approved') acc.approved += 1
      else if (status === 'rejected') acc.rejected += 1
      else acc.pending += 1
      return acc
    },
    { approved: 0, rejected: 0, pending: 0 },
  )
  const totalRequired = latestDocuments.length
  const summaryMessage = docCounts.pending > 0
    ? `${docCounts.pending} document${docCounts.pending === 1 ? '' : 's'} awaiting your review`
    : 'All documents reviewed'
  const summaryTone = docCounts.pending > 0
    ? 'bg-amber-50 border-amber-200 text-amber-800'
    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
  const summaryIcon = docCounts.pending > 0 ? 'pending_actions' : 'verified'

  async function updateStatus(doc: UserDocument | null, status: 'approved' | 'rejected' | 'uploaded') {
    if (!doc) return
    setLoadingDocId(doc.id)
    setErrorByDocId((prev) => ({ ...prev, [doc.id]: '' }))
    try {
      const result = await updateDocumentStatus({
        documentId: doc.id,
        userId: customerId,
        status,
      })
      if (!result.success) {
        setErrorByDocId((prev) => ({ ...prev, [doc.id]: result.error }))
        return
      }
      router.refresh()
    } finally {
      setLoadingDocId(null)
    }
  }

  return (
    <section className="space-y-5">
      <div className={`flex flex-col gap-3 rounded-2xl border px-4 py-4 sm:flex-row sm:items-center sm:justify-between ${summaryTone}`}>
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-[20px] mt-0.5" style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>
            {summaryIcon}
          </span>
          <p className="text-[14px] font-medium leading-relaxed">{summaryMessage}</p>
        </div>
        <p className="text-[12px] font-semibold tracking-wide text-right">
          {formatSummaryCounts(docCounts.approved, docCounts.rejected, docCounts.pending, totalRequired)}
        </p>
      </div>

      {onHoldBookingCount > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[14px] text-amber-900">
          {onHoldBookingCount} booking{onHoldBookingCount === 1 ? '' : 's'} currently on hold pending document approval.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {latestDocuments.map(({ documentType, doc }) => {
          const config = DOCUMENT_CARD_CONFIG[documentType]
          const status = getDocumentStatus(doc)
          const isLoading = doc ? loadingDocId === doc.id : false
          const uploadDate = formatUploadedTimestamp(doc?.uploaded_at ?? null)

          return (
            <div
              key={documentType}
              className="flex overflow-hidden rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] shadow-[var(--admin-shadow-panel)]"
            >
              <div className={`w-1 self-stretch shrink-0 ${getStatusAccentClass(status)}`} />

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-3 px-4 pt-4">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-[var(--admin-text)]">{config.label}</p>
                    <p className="mt-2 text-[13px] leading-relaxed text-[var(--admin-text-muted)]">
                      {getDocumentDetails(doc, documentType)}
                    </p>
                    <div className="mt-2 flex items-center gap-1.5 text-[12px] text-[var(--admin-text-secondary)]">
                      <span
                        className="material-symbols-outlined text-[14px]"
                        style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
                      >
                        schedule
                      </span>
                      <span>{uploadDate}</span>
                    </div>
                  </div>

                  <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusPillClass(status)}`}>
                    {getStatusLabel(status)}
                  </span>
                </div>

                <div className="mt-4 border-t border-[var(--admin-divider)] px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      {doc ? (
                        <OpenFileButton storagePath={doc.storage_path} fileName={doc.file_name} />
                      ) : (
                        <p className="text-[13px] text-[var(--admin-text-secondary)]">No file available yet.</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      {status === 'pending' && doc ? (
                        <>
                          <button
                            type="button"
                            onClick={() => updateStatus(doc, 'rejected')}
                            disabled={isLoading}
                            className="inline-flex items-center rounded-full border border-red-200 bg-white px-4 py-2 text-[12px] font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => updateStatus(doc, 'approved')}
                            disabled={isLoading}
                            className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500 px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Approve
                          </button>
                        </>
                      ) : null}

                      {status === 'approved' || status === 'rejected' ? (
                        <>
                          <span className="text-[12px] font-medium text-[var(--admin-text-secondary)]">
                            Decision recorded
                          </span>
                          <button
                            type="button"
                            onClick={() => updateStatus(doc, 'uploaded')}
                            disabled={isLoading}
                            className="inline-flex items-center rounded-full border border-[var(--admin-border)] bg-white px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-text)] transition-colors hover:bg-[var(--admin-panel-bg-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Undo
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {errorByDocId[doc?.id ?? ''] ? (
                    <p className="mt-2 text-[12px] text-red-600">{errorByDocId[doc?.id ?? '']}</p>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {optionalDocuments.length > 0 ? (
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--admin-divider)]" />
            <span className="text-[11px] text-[var(--admin-text-muted)]">Not required</span>
            <div className="h-px flex-1 bg-[var(--admin-divider)]" />
          </div>

          <div className="grid grid-cols-1 gap-4">
            {optionalDocuments.map(({ documentType, doc }) => (
              <div
                key={documentType}
                className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-panel-bg-soft)] px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-[var(--admin-text)]">
                      {DOCUMENT_CARD_CONFIG[documentType].label}
                    </p>
                    <p className="mt-2 text-[13px] leading-relaxed text-[var(--admin-text-muted)]">
                      {DOCUMENT_CARD_CONFIG[documentType].optionalReason}
                    </p>
                    {doc ? (
                      <p className="mt-2 text-[12px] text-[var(--admin-text-secondary)]">
                        Uploaded {formatUploadedTimestamp(doc.uploaded_at)}
                      </p>
                    ) : null}
                  </div>

                  <span className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    Optional
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

export function DocumentReviewPanel({
  customerId,
  documents,
  customerProfile,
}: {
  customerId: string
  documents: UserDocument[]
  customerProfile?: { has_night_vfr_rating: boolean | null }
}) {
  return <DocumentReviewCards customerId={customerId} documents={documents} customerProfile={customerProfile} />
}
