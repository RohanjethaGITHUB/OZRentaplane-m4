'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { approveCustomer, rejectCustomer, placeCustomerOnHold } from '@/app/actions/admin'
import type { RequestKind } from '@/lib/supabase/types'

type DecisionAction = 'approve' | 'hold' | 'reject'

type RequestKindConfig = { label: string; sublabel: string; icon: string }
const REQUEST_KIND_CONFIG: Record<RequestKind, RequestKindConfig> = {
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

  const formattedReviewedAt = reviewedAt
    ? new Date(reviewedAt).toLocaleString('en-AU', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null

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
        <div className={`backdrop-blur-xl border px-10 py-8 rounded-3xl ${
          isOnHold ? 'bg-[#1e1f1a]/60 border-amber-500/15' : 'bg-[#1e2023]/60 border-blue-300/10'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div className="space-y-1">
              <h3 className="font-serif text-2xl tracking-tight text-[#e2e2e6]">Verification Verdict</h3>
              {formattedReviewedAt && (
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                  Decision recorded{' '}
                  <span className="text-slate-400 font-semibold">{formattedReviewedAt}</span>
                </p>
              )}
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <div className={`px-6 py-3 rounded-full text-xs font-bold uppercase tracking-[0.2em] ${
                isVerified ? 'bg-green-500/10 text-green-400 border border-green-400/20'
                : isOnHold ? 'bg-amber-500/10 text-amber-400 border border-amber-400/20'
                :            'bg-red-500/10   text-red-400   border border-red-400/20'
              }`}>
                {isVerified ? '✓ Approved' : isOnHold ? '⏸ On Hold' : '✕ Rejected'}
              </div>

              <button
                onClick={enterEditMode}
                className="flex items-center gap-2 px-5 py-3 border border-blue-300/20 text-blue-200 hover:bg-blue-300/10 hover:text-white font-bold rounded-full text-xs uppercase tracking-[0.2em] transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'wght' 300" }}>
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
    : 'border border-white/15 text-[#e2e2e6] hover:bg-white/5'

  return (
    <section className="relative">
      {/* Ambient glow shifts colour with the selected action */}
      <div className={`absolute inset-0 rounded-3xl blur-3xl -z-10 transition-colors duration-500 ${cfg.tabBg}`} />

      <div className={`backdrop-blur-xl border p-10 rounded-3xl transition-colors duration-300 ${
        isHold ? 'bg-[#1e1f1a]/60 border-amber-500/15' : 'bg-[#1e2023]/60 border-blue-300/10'
      }`}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="mb-8">
          <h3 className="font-serif text-2xl tracking-tight text-[#e2e2e6]">
            {isEditing ? 'Edit Decision' : 'Verification Verdict'}
          </h3>
          {isEditing && (
            <p className="text-xs text-slate-500 italic leading-relaxed mt-2">
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
                    : 'border-white/10 text-white/30 hover:border-white/20 hover:text-white/55'
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
              <label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block">
                Internal Review Notes{' '}
                <span className="normal-case font-normal text-slate-600">(not shown to customer)</span>
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                disabled={!!loading}
                className="w-full bg-[#1a1c1f] border border-white/5 focus:border-blue-300/30 focus:ring-0 focus:outline-none text-sm text-[#e2e2e6] rounded-xl p-4 transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-slate-600"
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
                          : 'border-white/8 text-white/30 hover:border-white/20 hover:text-white/50'
                      }`}
                    >
                      <span
                        className="material-symbols-outlined text-base flex-shrink-0 mt-0.5"
                        style={{ fontVariationSettings: "'wght' 300" }}
                      >{cfg.icon}</span>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest">{cfg.label}</p>
                        <p className="text-[9px] font-normal normal-case tracking-normal opacity-70 leading-snug mt-0.5">{cfg.sublabel}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Info banner */}
              <div className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/12 rounded-xl px-4 py-3">
                <span
                  className="material-symbols-outlined text-amber-400/70 text-sm flex-shrink-0 mt-0.5"
                  style={{ fontVariationSettings: "'wght' 300" }}
                >info</span>
                <p className="text-xs text-amber-200/60 leading-relaxed">
                  This message will be emailed to the customer and shown on their dashboard.
                  Write clearly — they see exactly what you type. Do not include internal notes.
                </p>
              </div>

              {/* Message textarea */}
              <div className="space-y-2">
                <label className="text-[10px] text-amber-400/70 uppercase tracking-widest font-bold block">
                  Message to Customer <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={customerMsg}
                  onChange={e => setCustomerMsg(e.target.value)}
                  disabled={!!loading}
                  className="w-full bg-[#1a1c1f] border border-amber-500/20 focus:border-amber-400/40 focus:ring-0 focus:outline-none text-sm text-[#e2e2e6] rounded-xl p-4 transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-slate-600"
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
            <span className="material-symbols-outlined text-red-400 text-sm flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'wght' 300" }}>error</span>
            <p className="text-xs text-red-300 leading-relaxed">{error}</p>
          </div>
        )}

        {/* ── Warning (non-fatal advisory) ─────────────────────────────────── */}
        {warning && !error && (
          <div className="flex items-start gap-2 mt-5 bg-amber-500/5 border border-amber-400/15 rounded-xl px-4 py-3">
            <span className="material-symbols-outlined text-amber-400/80 text-sm flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'wght' 300" }}>warning</span>
            <p className="text-xs text-amber-200/70 leading-relaxed">{warning}</p>
          </div>
        )}

        {/* ── Footer: Cancel (left) · Confirm (right) ──────────────────────── */}
        <div className="flex items-center justify-between gap-4 pt-7 mt-7 border-t border-white/5">

          {/* Left slot: Cancel when editing, hint text when fresh decision */}
          {isEditing ? (
            <button
              onClick={cancelEdit}
              disabled={!!loading}
              className="px-6 py-3 border border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20 font-bold rounded-full text-xs uppercase tracking-[0.15em] transition-all disabled:opacity-40"
            >
              Cancel
            </button>
          ) : (
            <p className="text-[10px] text-slate-500 italic leading-relaxed max-w-xs">
              Customer will be notified immediately via email and dashboard.
            </p>
          )}

          {/* Right slot: primary confirm action */}
          <button
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className={`flex items-center gap-2 px-8 py-3.5 rounded-full text-xs font-bold uppercase tracking-[0.15em] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 ${confirmButtonClass}`}
          >
            {loading && (
              <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
            )}
            {confirmLabel}
          </button>
        </div>

      </div>
    </section>
  )
}
