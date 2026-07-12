"use client"

import { useState } from "react"
import { adminConfirmStandardBankTransfer, adminRejectStandardBankTransfer } from "@/app/actions/admin-booking"
import DocumentViewerModal from "@/components/ui/DocumentViewerModal"
import type { DocumentFile } from "@/components/ui/DocumentViewerModal"

type Submission = {
  id: string
  status: string
  reference: string | null
  receipt_storage_path: string
  admin_note: string | null
  submitted_at: string
  reviewed_at: string | null
  signedReceiptUrl: string | null
}

type Props = {
  bookingId: string
  submissions: Submission[]
}

export default function AdminStandardBankTransferPanel({ bookingId, submissions }: Props) {
  const [loading, setLoading]       = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState("")
  const [error, setError]           = useState<string | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerFiles, setViewerFiles] = useState<DocumentFile[]>([])
  const [viewerTitle, setViewerTitle] = useState('')

  const latestSubmission = submissions[0]
  if (!latestSubmission) return null

  const handleApprove = async (submissionId: string) => {
    setError(null)
    setLoading(submissionId)
    try {
      await adminConfirmStandardBankTransfer(submissionId, bookingId)
    } catch (err: any) {
      setError(err.message || "Failed to confirm payment")
      setLoading(null)
    }
  }

  const handleReject = async (submissionId: string) => {
    if (!rejectNote.trim()) { setError("A rejection note is required."); return }
    setError(null)
    setLoading(submissionId)
    try {
      await adminRejectStandardBankTransfer(submissionId, bookingId, rejectNote)
      setRejectingId(null)
      setRejectNote("")
    } catch (err: any) {
      setError(err.message || "Failed to reject payment")
      setLoading(null)
    }
  }

  return (
    <div
      id="standard-bank-transfer-review"
      className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-[0_12px_28px_rgba(15,30,52,0.06)] sm:p-6"
    >
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#f5e6b3] bg-[#fffaf0] px-4 py-3">
        <span
          className="material-symbols-outlined text-[18px] text-[#d97706]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          account_balance
        </span>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#0f2747]">
          Bank Transfer Proof
        </h2>
        {submissions.some(s => s.status === "pending_review") && (
          <span className="ml-auto rounded-full border border-[#f0b429] bg-[#fff7db] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7a4100]">
            Pending Review
          </span>
        )}
      </div>

      <div className="space-y-4 border-l-4 border-[#d97706] pl-4 sm:pl-5">
      {submissions.map((sub, idx) => (
        <div
          key={sub.id}
          className={`space-y-4 rounded-xl border bg-white p-4 shadow-[0_10px_24px_rgba(15,30,52,0.05)] sm:p-5 ${
            sub.status === "pending_review"
              ? "border-[#f0b429]"
              : sub.status === "approved"
              ? "border-[#86d39d]"
              : "border-[#f1b5b0]"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#64748b]">
              Submission {submissions.length - idx}
            </p>
            <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${
              sub.status === "pending_review" ? "border-[#f0b429] bg-[#fff7db] text-[#7a4100]" :
              sub.status === "approved"       ? "border-[#86d39d] bg-[#ecfdf3] text-[#166534]" :
                                               "border-[#e28b85] bg-[#fef2f2] text-[#912018]"
            }`}>
              {sub.status === "pending_review" ? "Pending Review" : sub.status === "approved" ? "Approved" : "Rejected"}
            </span>
          </div>

          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#64748b]">Reference Used</p>
              <p className="break-all font-mono text-[13px] font-semibold text-[#0f2747]">{sub.reference || "—"}</p>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#64748b]">Submitted</p>
              <p className="tabular-nums text-[13px] font-medium text-[#0f2747]">
                {new Date(sub.submitted_at).toLocaleDateString("en-AU", {
                  timeZone: "Australia/Sydney",
                  day: "numeric", month: "short", year: "numeric",
                })}
              </p>
            </div>
          </div>

          {sub.signedReceiptUrl ? (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#64748b]">Receipt</p>
              <button
                type="button"
                onClick={() => {
                  setViewerFiles([{ url: sub.signedReceiptUrl!, name: "Bank Transfer Receipt" }])
                  setViewerTitle("Bank Transfer Receipt")
                  setViewerOpen(true)
                }}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#bfdbfe] bg-[#f8fbff] px-3.5 py-2 text-sm font-semibold text-[#1d4ed8] transition-colors hover:border-[#93c5fd] hover:bg-[#eff6ff] hover:text-[#1e40af] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
              >
                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                View Receipt
              </button>
            </div>
          ) : (
            <p className="text-sm text-[#475569]">Receipt URL unavailable</p>
          )}

          {sub.status === "rejected" && sub.admin_note && (
            <div className="border-t border-[#fecaca] pt-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#912018]">Rejection Note</p>
              <p className="text-sm leading-relaxed text-[#7f1d1d]">{sub.admin_note}</p>
            </div>
          )}

      {sub.status === "pending_review" && (
            <div className="space-y-3 border-t border-[#e2e8f0] pt-4">
              {error && <p className="text-sm font-medium text-[#b42318]">{error}</p>}

              {rejectingId === sub.id ? (
                <div className="space-y-2">
                  <textarea
                    value={rejectNote}
                    onChange={e => setRejectNote(e.target.value)}
                    placeholder="Rejection reason (required)..."
                    rows={3}
                    className="w-full resize-none rounded-lg border border-[#cbd5e1] bg-white px-3 py-2.5 text-sm text-[#0f2747] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#1a4fd6]/20 focus:ring-offset-2 focus:ring-offset-white"
                  />
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      onClick={() => handleReject(sub.id)}
                      disabled={!!loading}
                      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-[#b42318] bg-[#b42318] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#912018] hover:border-[#912018] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b42318]/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:border-[#d6a6a2] disabled:bg-[#d6a6a2] disabled:text-white/85"
                    >
                      {loading === sub.id ? "Rejecting..." : "Confirm Reject"}
                    </button>
                    <button
                      onClick={() => { setRejectingId(null); setRejectNote(""); setError(null) }}
                      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#cbd5e1] bg-white px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#475569] transition-colors hover:bg-[#f8fafc] hover:text-[#0f2747] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fd6]/20 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={() => handleApprove(sub.id)}
                    disabled={!!loading}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#15803d] bg-[#15803d] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#166534] hover:border-[#166534] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15803d]/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:border-[#8fcca4] disabled:bg-[#8fcca4] disabled:text-white/85"
                  >
                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                    {loading === sub.id ? "Confirming..." : "Confirm Payment"}
                  </button>
                  <button
                    onClick={() => { setRejectingId(sub.id); setError(null) }}
                    disabled={!!loading}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#b42318] bg-[#b42318] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#912018] hover:border-[#912018] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b42318]/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:border-[#d6a6a2] disabled:bg-[#d6a6a2] disabled:text-white/85"
                  >
                    <span className="material-symbols-outlined text-[14px]">cancel</span>
                    Reject
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      </div>

      <DocumentViewerModal
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        files={viewerFiles}
        title={viewerTitle}
      />
    </div>
  )
}
