"use client"

import { useState } from "react"
import { adminApproveBankTransfer, adminRejectBankTransfer } from "@/app/actions/payment"

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

export default function AdminBankTransferPanel({ bookingId, submissions }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState("")
  const [error, setError] = useState<string | null>(null)

  const pendingSubmission = submissions.find(s => s.status === "pending_review")
  const latestSubmission = submissions[0]

  if (!latestSubmission) return null

  const handleApprove = async (submissionId: string) => {
    setError(null)
    setLoading(submissionId)
    try {
      await adminApproveBankTransfer(submissionId, bookingId)
    } catch (err: any) {
      setError(err.message || "Failed to approve transfer")
      setLoading(null)
    }
  }

  const handleReject = async (submissionId: string) => {
    if (!rejectNote.trim()) {
      setError("A rejection note is required.")
      return
    }
    setError(null)
    setLoading(submissionId)
    try {
      await adminRejectBankTransfer(submissionId, bookingId, rejectNote)
      setRejectingId(null)
      setRejectNote("")
    } catch (err: any) {
      setError(err.message || "Failed to reject transfer")
      setLoading(null)
    }
  }

  return (
    <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <span
          className="material-symbols-outlined text-amber-400 text-[18px]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          account_balance
        </span>
        <h2 className="text-[9px] uppercase tracking-widest font-bold text-amber-400/70">
          Bank Transfer Proof
        </h2>
        {pendingSubmission && (
          <span className="ml-auto px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
            Pending Review
          </span>
        )}
      </div>

      {submissions.map((sub, idx) => (
        <div
          key={sub.id}
          className={`rounded-xl p-4 border space-y-3 ${
            sub.status === "pending_review"
              ? "bg-amber-500/5 border-amber-500/15"
              : sub.status === "approved"
              ? "bg-green-500/5 border-green-500/15"
              : "bg-red-500/5 border-red-500/15 opacity-60"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] uppercase tracking-widest text-slate-500">
              Submission {submissions.length - idx}
            </p>
            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
              sub.status === "pending_review" ? "text-amber-400 bg-amber-500/10 border-amber-500/20" :
              sub.status === "approved"       ? "text-green-400 bg-green-500/10 border-green-500/20" :
                                               "text-red-400 bg-red-500/10 border-red-500/20"
            }`}>
              {sub.status === "pending_review" ? "Pending Review" : sub.status === "approved" ? "Approved" : "Rejected"}
            </span>
          </div>

          {/* Reference & Date */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Reference Used</p>
              <p className="font-mono text-slate-300">{sub.reference || "—"}</p>
            </div>
            <div>
              <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Submitted</p>
              <p className="text-slate-300 tabular-nums">
                {new Date(sub.submitted_at).toLocaleDateString("en-AU", {
                  timeZone: "Australia/Sydney",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>

          {/* Receipt Preview */}
          {sub.signedReceiptUrl ? (
            <div className="space-y-2">
              <p className="text-[9px] text-slate-600 uppercase tracking-widest">Receipt</p>
              {sub.signedReceiptUrl.includes(".pdf") ? (
                <a
                  href={sub.signedReceiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-[#a7c8ff] hover:underline"
                >
                  <span className="material-symbols-outlined text-[14px]">picture_as_pdf</span>
                  View PDF Receipt
                </a>
              ) : (
                <div className="relative rounded-lg overflow-hidden border border-white/10 bg-[#050c17] max-h-48">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={sub.signedReceiptUrl}
                    alt="Bank transfer receipt"
                    className="w-full object-contain max-h-48"
                  />
                  <a
                    href={sub.signedReceiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded bg-black/60 text-[10px] text-white hover:bg-black/80 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                    Full size
                  </a>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-600">Receipt URL unavailable</p>
          )}

          {/* Admin rejection note (if rejected) */}
          {sub.status === "rejected" && sub.admin_note && (
            <div className="pt-2 border-t border-red-500/15">
              <p className="text-[9px] text-red-400/60 uppercase tracking-widest mb-1">Rejection Note</p>
              <p className="text-xs text-red-300/80 leading-relaxed">{sub.admin_note}</p>
            </div>
          )}

          {/* Actions — only for pending review */}
          {sub.status === "pending_review" && (
            <div className="pt-3 border-t border-amber-500/15 space-y-3">
              {error && (
                <p className="text-xs text-red-400">{error}</p>
              )}

              {rejectingId === sub.id ? (
                <div className="space-y-2">
                  <textarea
                    value={rejectNote}
                    onChange={e => setRejectNote(e.target.value)}
                    placeholder="Rejection reason (required)..."
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-white/20 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReject(sub.id)}
                      disabled={!!loading}
                      className="flex-1 px-3 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
                    >
                      {loading === sub.id ? "Rejecting..." : "Confirm Reject"}
                    </button>
                    <button
                      onClick={() => { setRejectingId(null); setRejectNote(""); setError(null) }}
                      className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 text-[10px] font-bold uppercase tracking-widest transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(sub.id)}
                    disabled={!!loading}
                    className="flex-1 px-3 py-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 border border-green-500/20 text-green-400 text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                    {loading === sub.id ? "Approving..." : "Approve"}
                  </button>
                  <button
                    onClick={() => { setRejectingId(sub.id); setError(null) }}
                    disabled={!!loading}
                    className="flex-1 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
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
  )
}
