'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  adminApproveBlockTimeBankTransfer,
  adminRejectBlockTimeBankTransfer,
  adminRequestNewBlockTimeReceipt,
} from '@/app/actions/block-time-bank-transfer'
import DocumentViewerModal from '@/components/ui/DocumentViewerModal'
import type { DocumentFile } from '@/components/ui/DocumentViewerModal'
import { LoadingButtonContent } from '@/components/ui/Spinner'

type Submission = {
  id: string
  status: string
  reference: string | null
  admin_note: string | null
  submitted_at: string
  reviewed_at: string | null
  signedReceiptUrl: string | null
  isPdf: boolean
}

const STATUS: Record<string, { label: string; pill: string; ring: string }> = {
  pending_review: { label: 'Needs review', pill: 'border-[#f0b429]/60 bg-[#fff7db] text-[#7a4100]', ring: 'border-[#f0b429]/70' },
  resubmission_requested: { label: 'New receipt requested', pill: 'border-[#93c5fd]/70 bg-[#eff6ff] text-[#1d4ed8]', ring: 'border-[#e2e8f0]' },
  rejected: { label: 'Rejected', pill: 'border-[#f1b5b0] bg-[#fef2f2] text-[#912018]', ring: 'border-[#e2e8f0]' },
  approved: { label: 'Approved', pill: 'border-[#86d39d]/70 bg-[#ecfdf3] text-[#166534]', ring: 'border-[#86d39d]/70' },
}

function sydney(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short' })
}

type Mode = 'idle' | 'request' | 'reject'

export default function BlockTimeBankTransferReviewPanel({ submissions }: { submissions: Submission[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('idle')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [viewer, setViewer] = useState<{ files: DocumentFile[]; title: string } | null>(null)

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setError(null)
    setBusy(key)
    try {
      await fn()
      setMode('idle')
      setNote('')
      router.refresh()
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      {submissions.map((sub, idx) => {
        const st = STATUS[sub.status] ?? STATUS.rejected
        const isPending = sub.status === 'pending_review'
        const open = () =>
          sub.signedReceiptUrl &&
          setViewer({ files: [{ url: sub.signedReceiptUrl, name: 'Bank Transfer Receipt' }], title: 'Bank Transfer Receipt' })

        return (
          <div key={sub.id} className={`overflow-hidden rounded-xl border bg-white ${st.ring}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eef2f7] bg-[#f8fafc] px-4 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#64748b]">
                Receipt {submissions.length - idx} · {sydney(sub.submitted_at)}
              </p>
              <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${st.pill}`}>
                {st.label}
              </span>
            </div>

            <div className="space-y-4 p-4">
              {/* Receipt preview */}
              {sub.signedReceiptUrl ? (
                <button
                  type="button"
                  onClick={open}
                  className="group relative block w-full overflow-hidden rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/40"
                  aria-label="Open receipt"
                >
                  {sub.isPdf ? (
                    <div className="flex h-36 flex-col items-center justify-center gap-1 text-[#475569]">
                      <span className="material-symbols-outlined text-[40px] text-[#b42318]">picture_as_pdf</span>
                      <span className="text-[13px] font-semibold">PDF receipt</span>
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sub.signedReceiptUrl} alt="Bank transfer receipt" className="mx-auto max-h-64 w-full object-contain" />
                  )}
                  <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-[#0f2747]/85 px-2.5 py-1 text-[11px] font-semibold text-white opacity-90 transition-opacity group-hover:opacity-100">
                    <span className="material-symbols-outlined text-[14px]">zoom_in</span>
                    View full size
                  </span>
                </button>
              ) : (
                <p className="rounded-lg border border-dashed border-[#cbd5e1] p-4 text-center text-sm text-[#64748b]">Receipt file unavailable</p>
              )}

              {sub.admin_note && !isPending ? (
                <div className="rounded-lg bg-[#f8fafc] p-3">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#64748b]">
                    Note sent to customer · {sydney(sub.reviewed_at)}
                  </p>
                  <p className="text-[13.5px] leading-relaxed text-[#334155]">{sub.admin_note}</p>
                </div>
              ) : null}

              {isPending ? (
                <div className="space-y-3">
                  {error ? (
                    <p className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] font-medium text-[#b42318]">{error}</p>
                  ) : null}

                  {mode === 'idle' ? (
                    <div className="space-y-2">
                      <button
                        onClick={() => run('approve', () => adminApproveBlockTimeBankTransfer(sub.id))}
                        disabled={!!busy}
                        aria-busy={busy === 'approve' || undefined}
                        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#15803d] px-4 py-3 text-[12px] font-bold uppercase tracking-[0.12em] text-white shadow-sm transition-colors hover:bg-[#166534] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <LoadingButtonContent loading={busy === 'approve'} loadingLabel="Activating...">
                          <span className="material-symbols-outlined text-[18px]">check_circle</span>
                          Approve &amp; activate package
                        </LoadingButtonContent>
                      </button>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <button
                          onClick={() => { setMode('request'); setError(null) }}
                          disabled={!!busy}
                          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[#1d4ed8]/40 bg-white px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#1d4ed8] transition-colors hover:bg-[#eff6ff] disabled:opacity-60"
                        >
                          <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                          Request new receipt
                        </button>
                        <button
                          onClick={() => { setMode('reject'); setError(null) }}
                          disabled={!!busy}
                          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[#b42318]/40 bg-white px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#b42318] transition-colors hover:bg-[#fef2f2] disabled:opacity-60"
                        >
                          <span className="material-symbols-outlined text-[16px]">cancel</span>
                          Reject
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3.5">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#475569]">
                        {mode === 'request' ? 'What do you need? (emailed to the customer)' : 'Reason for rejection (emailed to the customer)'}
                      </p>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={
                          mode === 'request'
                            ? 'e.g. The screenshot is blurry — please upload a clear image showing the amount and date.'
                            : 'e.g. We could not find a payment of this amount in our account.'
                        }
                        rows={3}
                        className="w-full resize-none rounded-lg border border-[#cbd5e1] bg-white px-3 py-2.5 text-sm text-[#0f2747] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#1a4fd6]/25"
                      />
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          onClick={() =>
                            run(mode, () =>
                              mode === 'request'
                                ? adminRequestNewBlockTimeReceipt(sub.id, note)
                                : adminRejectBlockTimeBankTransfer(sub.id, note),
                            )
                          }
                          disabled={!!busy || !note.trim()}
                          aria-busy={busy === mode || undefined}
                          className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-xl px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                            mode === 'request' ? 'bg-[#1d4ed8] hover:bg-[#1e40af]' : 'bg-[#b42318] hover:bg-[#912018]'
                          }`}
                        >
                          <LoadingButtonContent loading={busy === mode} loadingLabel="Sending...">
                            {mode === 'request' ? 'Send request' : 'Confirm reject'}
                          </LoadingButtonContent>
                        </button>
                        <button
                          onClick={() => { setMode('idle'); setNote(''); setError(null) }}
                          disabled={!!busy}
                          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#cbd5e1] bg-white px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#475569] hover:bg-white/70"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )
      })}

      <DocumentViewerModal
        isOpen={viewer !== null}
        onClose={() => setViewer(null)}
        files={viewer?.files ?? []}
        title={viewer?.title}
      />
    </div>
  )
}
