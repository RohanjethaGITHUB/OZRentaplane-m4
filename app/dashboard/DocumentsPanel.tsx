'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import type { UserDocument, DocumentType, VerificationStatus, VerificationEvent, RequestKind } from '@/lib/supabase/types'
import { uploadVerificationDocument } from '@/app/actions/upload'
import { submitForReview, sendCustomerReply } from '@/app/actions/verification'
import { fmtTimestamp } from '@/lib/utils/format'

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const ALLOWED_EXT_LABEL = 'PDF, JPG, JPEG, PNG'

const DOC_TYPES: { type: DocumentType; label: string; icon: string; desc: string }[] = [
  { type: 'pilot_licence',       label: 'Pilot Licence',       icon: 'badge',              desc: 'Commercial or Private Pilot Licence' },
  { type: 'medical_certificate', label: 'Medical Certificate', icon: 'health_and_safety',  desc: 'Valid Class 1 or Class 2 Medical' },
  { type: 'photo_id',            label: 'Photo ID',            icon: 'id_card',            desc: 'Government issued passport or driver licence' },
]

// ─── Progress helpers ─────────────────────────────────────────────────────────

function progressText(uploaded: number, total: number): string {
  if (uploaded === total) return 'Ready for review'
  const remaining = total - uploaded
  if (uploaded === 0) return `${remaining} documents still required`
  if (remaining === 1) return '1 document still required'
  return `${uploaded} of ${total} documents uploaded`
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  user: User
  documents: UserDocument[]
  status: VerificationStatus
  events: VerificationEvent[]
}

// ─── Conversation thread (customer-visible events) ────────────────────────────

function VerificationThread({ events }: { events: VerificationEvent[] }) {
  // Show the full thread — all events, persisted and ordered newest-first to oldest-last
  if (events.length === 0) return null

  return (
    <section className="space-y-3">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-oz-blue">
        Verification Thread
      </h3>
      <div className="space-y-2">
        {events.map(ev => {
          const isCustomerMsg = ev.actor_role === 'customer'
          const isSysMsg      = ev.actor_role === 'system'
          const when = fmtTimestamp(ev.created_at)

          const iconColor = isCustomerMsg
            ? 'text-blue-300/50'
            : ev.event_type === 'on_hold'   ? 'text-amber-400'
            : ev.event_type === 'approved'  ? 'text-green-400'
            : ev.event_type === 'rejected'  ? 'text-red-400'
            : 'text-slate-500'

          const icon = isCustomerMsg ? 'person'
            : ev.event_type === 'on_hold'    ? 'pause_circle'
            : ev.event_type === 'approved'   ? 'verified_user'
            : ev.event_type === 'rejected'   ? 'person_off'
            : ev.event_type === 'submitted'  ? 'upload_file'
            : ev.event_type === 'resubmitted'? 'upload_file'
            : 'chat'

          return (
            <div
              key={ev.id}
              className={`flex gap-3 px-4 py-3 rounded-xl border transition-colors ${
                isCustomerMsg
                  ? 'bg-blue-500/5 border-blue-300/10 flex-row-reverse'
                  : isSysMsg
                  ? 'bg-white/[0.02] border-white/5'
                  : ev.event_type === 'on_hold'
                  ? 'bg-amber-500/5 border-amber-500/15'
                  : 'bg-[#0c121e]/60 border-white/5'
              }`}
            >
              <span
                className={`material-symbols-outlined text-base flex-shrink-0 mt-0.5 ${iconColor}`}
                style={{ fontVariationSettings: "'wght' 300" }}
              >{icon}</span>
              <div className={`flex-1 min-w-0 ${isCustomerMsg ? 'text-right' : ''}`}>
                <div className={`flex items-center gap-2 flex-wrap ${isCustomerMsg ? 'justify-end' : ''}`}>
                  <p className="text-xs font-semibold text-white/80">{ev.title}</p>
                  <span className="text-[9px] text-oz-subtle font-mono">{when}</span>
                </div>
                {ev.body && (
                  <p className="text-xs text-oz-muted leading-relaxed mt-0.5">{ev.body}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Customer reply panel ─────────────────────────────────────────────────────

function CustomerReplyPanel() {
  const router = useRouter()
  const [reply, setReply]     = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError]     = useState('')
  const [sent, setSent]       = useState(false)

  async function handleSend() {
    if (!reply.trim()) { setError('Please write a reply before sending.'); return }
    setSending(true)
    setError('')
    try {
      await sendCustomerReply(reply.trim())
      setSent(true)
      setReply('')
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send reply.'
      setError(msg.startsWith('VALIDATION:') ? msg.replace('VALIDATION:', '').trim() : msg)
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-blue-500/5 border border-blue-300/15 rounded-xl">
        <span className="material-symbols-outlined text-blue-300 text-sm" style={{ fontVariationSettings: "'wght' 300" }}>check_circle</span>
        <p className="text-xs text-blue-200/80">Reply sent. Our team will review and get back to you.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <label className="text-[10px] text-oz-blue uppercase tracking-widest font-bold block">
        Your Reply
      </label>
      <textarea
        value={reply}
        onChange={e => setReply(e.target.value)}
        disabled={sending}
        rows={4}
        className="w-full bg-[#0c121e]/80 border border-white/8 focus:border-oz-blue/40 focus:ring-0 focus:outline-none text-sm text-[#e2e2e6] rounded-xl p-4 resize-none transition-all disabled:opacity-50 placeholder:text-oz-subtle"
        placeholder="Write your reply or provide the requested information…"
      />
      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm">error</span>
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <button
          onClick={handleSend}
          disabled={sending || !reply.trim()}
          className="flex items-center gap-2 px-6 py-2.5 bg-oz-blue/20 border border-oz-blue/30 text-oz-blue hover:bg-oz-blue hover:text-oz-deep rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {sending && <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>}
          Send Reply
        </button>
      </div>
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DocumentsPanel({ user, documents, status, events }: Props) {
  const [uploading, setUploading]     = useState<DocumentType | null>(null)
  const [submitting, setSubmitting]   = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [inlineErrors, setInlineErrors] = useState<Partial<Record<DocumentType, string>>>({})
  const router = useRouter()

  const isVerified = status === 'verified'
  const isPending  = status === 'pending_review'
  const isOnHold   = status === 'on_hold'
  const isLocked   = isPending || isVerified

  const hasLicence = documents.some(d => d.document_type === 'pilot_licence')
  const hasMedical = documents.some(d => d.document_type === 'medical_certificate')
  const hasId      = documents.some(d => d.document_type === 'photo_id')
  const uploadedCount = [hasLicence, hasMedical, hasId].filter(Boolean).length

  // Determine the latest on_hold request kind
  const latestHoldEvent = events.find(e => e.event_type === 'on_hold')
  const requestKind: RequestKind = latestHoldEvent?.request_kind ?? 'document_request'
  const isDocRequest  = requestKind === 'document_request'

  // canSubmit: need all docs for initial submit / doc requests.
  // For clarification/confirmation, allow resubmit even if docs count unchanged.
  const canSubmitWithDocs = uploadedCount === 3 && (status === 'not_started' || status === 'rejected' || status === 'on_hold')
  const canSubmitClarify  = isOnHold && !isDocRequest
  const canSubmit         = canSubmitWithDocs || canSubmitClarify

  // ─── Upload handler ──────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>, docType: DocumentType) {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]

    setInlineErrors(prev => ({ ...prev, [docType]: undefined }))

    if (!ALLOWED_TYPES.includes(file.type)) {
      setInlineErrors(prev => ({ ...prev, [docType]: 'Only PDF, JPG, JPEG, and PNG files are allowed.' }))
      e.target.value = ''
      return
    }
    if (file.size > MAX_SIZE) {
      setInlineErrors(prev => ({ ...prev, [docType]: 'File must be 10 MB or smaller.' }))
      e.target.value = ''
      return
    }

    setUploading(docType)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('docType', docType)
      await uploadVerificationDocument(formData)
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed. Please try again.'
      setInlineErrors(prev => ({ ...prev, [docType]: msg }))
    } finally {
      setUploading(null)
      e.target.value = ''
    }
  }

  // ─── Submit handler ──────────────────────────────────────────────────────

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError('')
    try {
      // Skip doc check for clarification resubmits
      await submitForReview(canSubmitClarify && !canSubmitWithDocs)
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Submission failed. Please try again.'
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-10 animate-fade-in flex-1 max-w-4xl">

      {/* ── Page header ── */}
      <section className="flex flex-col gap-4">
        <div>
          <span className="text-[10px] uppercase tracking-[0.3em] text-oz-blue/70 font-semibold">
            Pilot Verification
          </span>
          <h2 className="text-3xl md:text-4xl font-serif italic tracking-tight text-white mt-1">
            Verification Documents
          </h2>
          <p className="text-oz-muted font-sans font-light mt-2">
            Upload and manage your required credentials to unlock fleet access.
          </p>
        </div>

        {/* ── Upload requirements info banner ── */}
        <div className="flex items-start gap-4 bg-oz-blue/5 border border-oz-blue/15 rounded-xl px-5 py-4 mt-2">
          <span
            className="material-symbols-outlined text-oz-blue/60 text-xl flex-shrink-0 mt-0.5"
            style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
          >
            info
          </span>
          <div className="flex flex-col sm:flex-row sm:items-center sm:divide-x sm:divide-white/10 gap-2 sm:gap-0">
            <p className="text-sm text-oz-muted font-light sm:pr-5">
              <span className="text-white/70 font-medium">Accepted formats:</span>{' '}
              {ALLOWED_EXT_LABEL}
            </p>
            <p className="text-sm text-oz-muted font-light sm:pl-5">
              <span className="text-white/70 font-medium">Max size:</span>{' '}
              10 MB per file
            </p>
          </div>
        </div>
      </section>

      {/* ── On-Hold: admin request block (shown ONCE above the docs, not per card) ── */}
      {isOnHold && latestHoldEvent && (
        <section className={`border rounded-[1.25rem] p-6 space-y-5 ${
          isDocRequest
            ? 'bg-amber-500/5 border-amber-500/20'
            : 'bg-blue-500/5 border-blue-300/15'
        }`}>
          {/* Header */}
          <div className="flex items-center gap-3">
            <span
              className={`material-symbols-outlined text-xl ${isDocRequest ? 'text-amber-400' : 'text-blue-300'}`}
              style={{ fontVariationSettings: "'wght' 300" }}
            >
              {isDocRequest ? 'upload_file' : 'chat'}
            </span>
            <div>
              <p className={`text-[10px] font-bold uppercase tracking-widest ${isDocRequest ? 'text-amber-400' : 'text-blue-300'}`}>
                {isDocRequest ? 'Documents Required' : 'Response Requested'}
              </p>
              <p className="text-[9px] text-oz-subtle">{fmtTimestamp(latestHoldEvent.created_at)}</p>
            </div>
          </div>

          {/* Message body */}
          {latestHoldEvent.body && (
            <p className="text-sm text-[#e2e2e6] leading-relaxed">{latestHoldEvent.body}</p>
          )}

          {/* Action CTAs */}
          {isDocRequest ? (
            <p className="text-xs text-oz-muted leading-relaxed">
              Please upload or replace the required documents below, then click{' '}
              <span className="text-white/70 font-medium">Resubmit for Review</span> when ready.
            </p>
          ) : (
            <div className="space-y-4 pt-1">
              <p className="text-xs text-oz-muted leading-relaxed">
                Reply below with your response. Once you are ready for us to continue your review,
                click <span className="text-white/70 font-medium">Resubmit for Review</span>.
              </p>
              <CustomerReplyPanel />
            </div>
          )}
        </section>
      )}

      {/* ── Submission / resubmit panel ─ placed ABOVE the doc cards ── */}
      {!isVerified && !isPending && (
        <section className="bg-[#0c121e]/60 backdrop-blur-2xl border border-white/5 rounded-[1.25rem] p-6 shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">

            {/* Progress summary */}
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-1.5">
                  {DOC_TYPES.map(def => {
                    const uploaded = documents.some(d => d.document_type === def.type)
                    return (
                      <div
                        key={def.type}
                        className={`w-2 h-2 rounded-full transition-all ${uploaded ? 'bg-oz-blue' : 'bg-white/15'}`}
                      />
                    )
                  })}
                </div>
                <span className={`text-xs font-semibold uppercase tracking-widest ${canSubmit ? 'text-oz-blue' : 'text-white/40'}`}>
                  {canSubmitClarify && !canSubmitWithDocs
                    ? 'Reply sent — ready to resubmit'
                    : progressText(uploadedCount, 3)}
                </span>
              </div>

              <p className="text-sm text-oz-muted font-light leading-relaxed max-w-sm">
                {isOnHold && !isDocRequest
                  ? 'Reply to the admin request above, then resubmit when you are ready for re-review.'
                  : isOnHold && canSubmit
                  ? 'Documents updated. Resubmit below for re-review.'
                  : canSubmit
                  ? 'All documents are in place. Submit below to begin the official review.'
                  : 'Upload all three required documents to unlock submission.'}
              </p>

              {submitError && (
                <p className="text-xs text-red-400 flex items-center gap-1.5 mt-2">
                  <span className="material-symbols-outlined text-sm">error</span>
                  {submitError}
                </p>
              )}
            </div>

            {/* Submit / Resubmit button */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className={`flex-shrink-0 px-8 py-4 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all flex items-center gap-3 shadow-md
                ${canSubmit && !submitting
                  ? 'bg-oz-blue text-oz-deep hover:bg-white hover:scale-[1.02] hover:shadow-xl'
                  : 'bg-white/5 text-white/25 cursor-not-allowed border border-white/5'}`}
            >
              {submitting && (
                <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
              )}
              {isOnHold ? 'Resubmit for Review' : 'Submit for Review'}
            </button>
          </div>
        </section>
      )}

      {/* Locked state banner for pending/verified */}
      {(isPending || isVerified) && (
        <section className="bg-[#0c121e]/60 border border-white/5 rounded-[1.25rem] px-6 py-5 flex items-center gap-4">
          <span
            className={`material-symbols-outlined text-2xl ${isVerified ? 'text-green-400' : 'text-oz-blue'}`}
            style={{ fontVariationSettings: "'wght' 300" }}
          >
            {isVerified ? 'verified_user' : 'pending_actions'}
          </span>
          <p className="text-sm text-oz-muted font-light leading-relaxed">
            {isPending
              ? "Your documents are under review. We'll notify you once a decision has been made."
              : 'Your credentials have been verified. You are cleared for fleet access.'}
          </p>
        </section>
      )}

      {/* ── Document cards ── */}
      <section className="grid gap-5">
        {DOC_TYPES.map((def, idx) => {
          const doc        = documents.find(d => d.document_type === def.type)
          const isUploaded = !!doc
          const isRejected = doc?.status === 'rejected'
          const isApproved = doc?.status === 'approved'
          const cardError  = inlineErrors[def.type]
          const isUploadingThis = uploading === def.type

          return (
            <div
              key={def.type}
              className={`relative bg-[#0c121e]/60 backdrop-blur-2xl border rounded-[1.25rem] p-6 shadow-[0_8px_24px_rgba(0,0,0,0.3)] transition-all
                ${isApproved ? 'border-green-500/15' : isRejected ? 'border-red-500/15' : isUploaded ? 'border-oz-blue/15' : 'border-white/5 hover:bg-[#0c121e]/80'}`}
            >
              {/* Step number */}
              <span className="absolute top-6 right-6 text-[10px] font-bold uppercase tracking-widest text-white/15">
                {String(idx + 1).padStart(2, '0')}
              </span>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                {/* ── Left: icon + info ── */}
                <div className="flex items-center gap-5">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 border
                    ${isApproved ? 'bg-green-500/10 border-green-500/20 text-green-400' :
                      isRejected ? 'bg-red-500/10  border-red-500/20  text-red-400'   :
                      isUploaded  ? 'bg-oz-blue/10  border-oz-blue/20  text-oz-blue'   :
                                    'bg-white/5     border-white/10     text-white/40'}`}>
                    <span className="material-symbols-outlined text-xl">{def.icon}</span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="text-base text-white font-semibold">{def.label}</h3>
                      {isApproved && (
                        <span className="text-[9px] font-bold text-green-400 uppercase px-2 py-0.5 bg-green-500/10 rounded-full tracking-widest">Verified</span>
                      )}
                      {isRejected && (
                        <span className="text-[9px] font-bold text-red-400 uppercase px-2 py-0.5 bg-red-500/10 rounded-full tracking-widest">Action Required</span>
                      )}
                      {isUploaded && !isApproved && !isRejected && (
                        <span className="text-[9px] font-bold text-oz-blue uppercase px-2 py-0.5 bg-oz-blue/10 rounded-full tracking-widest">Uploaded</span>
                      )}
                      {!isUploaded && (
                        <span className="text-[9px] font-bold text-white/30 uppercase px-2 py-0.5 border border-white/10 rounded-full tracking-widest">Required</span>
                      )}
                    </div>

                    <p className="text-sm text-oz-muted font-light">{def.desc}</p>

                    {/* Uploaded filename */}
                    {isUploaded && !isRejected && (
                      <p className="text-xs text-white/25 mt-1.5 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>draft</span>
                        {doc.file_name}
                      </p>
                    )}

                    {/* Rejection reason (per-document — not the on_hold admin message) */}
                    {isRejected && doc?.review_notes && (
                      <p className="text-xs text-red-400/80 mt-2 bg-red-500/8 border border-red-500/15 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">warning</span>
                        {doc.review_notes}
                      </p>
                    )}

                    {/* Inline upload error */}
                    {cardError && (
                      <p className="text-xs text-red-400 mt-2 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">error</span>
                        {cardError}
                      </p>
                    )}
                  </div>
                </div>

                {/* ── Right: upload action ── */}
                <div className="flex items-center gap-4 flex-shrink-0">
                  {isUploadingThis ? (
                    <div className="flex items-center gap-2 text-oz-blue px-6 py-3">
                      <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
                      <span className="text-[10px] uppercase tracking-widest font-bold">Uploading…</span>
                    </div>
                  ) : (
                    <label className={`relative cursor-pointer transition-all ${isLocked || isApproved ? 'opacity-40 pointer-events-none' : 'hover:scale-[1.03]'}`}>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        className="hidden"
                        onChange={(e) => handleFileChange(e, def.type)}
                        disabled={isLocked || isApproved}
                      />
                      <div className={`border text-[10px] font-bold uppercase tracking-[0.15em] transition-all flex items-center gap-2 px-5 py-2.5 rounded-full
                        ${isUploaded
                          ? 'border-white/15 hover:border-white/30 hover:bg-white/5 text-white/70 hover:text-white'
                          : 'border-oz-blue/40 hover:border-oz-blue text-oz-blue hover:bg-oz-blue/5'}`}>
                        <span className="material-symbols-outlined text-sm">{isUploaded ? 'cloud_sync' : 'cloud_upload'}</span>
                        {isUploaded ? 'Replace' : 'Upload'}
                      </div>
                    </label>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </section>

      {/* ── Verification thread (full conversation history) ── */}
      {events.length > 0 && (
        <VerificationThread events={events} />
      )}

    </div>
  )
}
