'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { approveCustomer, rejectCustomer, placeCustomerOnHold } from '@/app/actions/admin'
import { updateDocumentStatus } from '@/app/actions/verification'
import { formatDateTime } from '@/lib/formatDateTime'
import type { RequestKind, UserDocument } from '@/lib/supabase/types'

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

export function DocumentReviewPanel({
  customerId,
  documents,
}: {
  customerId: string
  documents: UserDocument[]
}) {
  const router = useRouter()
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null)
  const [rejectingDocId, setRejectingDocId] = useState<string | null>(null)
  const [noteByDocId, setNoteByDocId] = useState<Record<string, string>>({})
  const [errorByDocId, setErrorByDocId] = useState<Record<string, string>>({})

  async function handleApprove(docId: string) {
    setLoadingDocId(docId)
    setErrorByDocId((prev) => ({ ...prev, [docId]: '' }))
    try {
      const result = await updateDocumentStatus({
        documentId: docId,
        userId: customerId,
        status: 'approved',
      })
      if (!result.success) {
        setErrorByDocId((prev) => ({ ...prev, [docId]: result.error }))
        return
      }
      router.refresh()
    } finally {
      setLoadingDocId(null)
    }
  }

  async function handleReject(docId: string) {
    const note = (noteByDocId[docId] ?? '').trim()
    if (!note) {
      setErrorByDocId((prev) => ({ ...prev, [docId]: 'Review note is required for rejection.' }))
      return
    }

    setLoadingDocId(docId)
    setErrorByDocId((prev) => ({ ...prev, [docId]: '' }))
    try {
      const result = await updateDocumentStatus({
        documentId: docId,
        userId: customerId,
        status: 'rejected',
        reviewNotes: note,
      })
      if (!result.success) {
        setErrorByDocId((prev) => ({ ...prev, [docId]: result.error }))
        return
      }
      setRejectingDocId(null)
      setNoteByDocId((prev) => ({ ...prev, [docId]: '' }))
      router.refresh()
    } finally {
      setLoadingDocId(null)
    }
  }

  const getBadge = (status: string) => {
    if (status === 'approved') return 'bg-green-500/10 border-green-400/30 text-green-300'
    if (status === 'rejected') return 'bg-red-500/10 border-red-400/30 text-red-300'
    return 'bg-slate-500/10 border-slate-400/30 text-[#4b6390]'
  }

  return (
    <section className=" border border-blue-300/10 bg-white p-7 rounded-3xl">
      <h3 className="font-serif text-2xl tracking-tight text-[#152d5a]">Document Review</h3>
      <p className="text-[13px] text-[#4b6390] mt-2">Approve documents that are valid, or reject with a required note.</p>

      <div className="mt-6 space-y-3">
        {documents.length === 0 ? (
          <div className="rounded-xl border border-[#152d5a]/10 bg-[#152d5a]/[0.02] px-4 py-5 text-[14px] text-[#4b6390]">
            No documents uploaded yet.
          </div>
        ) : (
          documents.map((doc) => {
            const isLoading = loadingDocId === doc.id
            const showRejectBox = rejectingDocId === doc.id
            const note = noteByDocId[doc.id] ?? ''
            const error = errorByDocId[doc.id] ?? ''
            const label = doc.document_type.replace(/_/g, ' ')

            return (
              <div key={doc.id} className="rounded-xl border border-[#152d5a]/10 bg-[#152d5a]/[0.02] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-[14px] font-semibold text-[#152d5a]">{label}</p>
                    <p className="text-[13px] text-[#4b6390] mt-1">
                      Uploaded {doc.uploaded_at ? formatDateTime(doc.uploaded_at) : '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[13px] font-medium ${getBadge(doc.status)}`}>
                      {doc.status === 'approved' ? 'Approved' : doc.status === 'rejected' ? 'Rejected' : 'Uploaded'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleApprove(doc.id)}
                      disabled={isLoading}
                      className="rounded-lg border border-green-400/30 bg-green-500/10 px-3 py-1.5 text-[13px] font-semibold uppercase tracking-wide text-green-300 hover:bg-green-500/20 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectingDocId(showRejectBox ? null : doc.id)
                        setErrorByDocId((prev) => ({ ...prev, [doc.id]: '' }))
                      }}
                      disabled={isLoading}
                      className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-[13px] font-semibold uppercase tracking-wide text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>

                {showRejectBox ? (
                  <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-start">
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNoteByDocId((prev) => ({ ...prev, [doc.id]: e.target.value }))}
                      placeholder="Required rejection note"
                      className="h-10 flex-1 rounded-lg border border-red-400/20 bg-[#f8f9fb] px-3 text-[14px] text-[#152d5a] placeholder:text-[#4b6390] focus:outline-none focus:border-red-400/40"
                    />
                    <button
                      type="button"
                      onClick={() => handleReject(doc.id)}
                      disabled={isLoading}
                      className="h-10 rounded-lg border border-red-400/40 bg-red-500/10 px-3.5 text-[13px] font-semibold uppercase tracking-wide text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                    >
                      Confirm reject
                    </button>
                  </div>
                ) : null}

                {error ? <p className="mt-2 text-[13px] text-red-300">{error}</p> : null}
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
