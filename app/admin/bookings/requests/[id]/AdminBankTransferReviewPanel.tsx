"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { adminApproveBankTransfer, adminRejectBankTransfer } from "@/app/actions/payment"
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
  submission: Submission
}

export default function AdminBankTransferReviewPanel({ bookingId, submission }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null)
  const [rejectNote, setRejectNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerFiles, setViewerFiles] = useState<DocumentFile[]>([])
  const [viewerTitle, setViewerTitle] = useState('')

  const handleApprove = async () => {
    setError(null)
    setLoading("approve")
    try {
      await adminApproveBankTransfer(submission.id, bookingId)
      router.refresh()
    } catch (err: any) {
      setError(err?.message || "Failed to approve bank transfer.")
    } finally {
      setLoading(null)
    }
  }

  const handleReject = async () => {
    if (!rejectNote.trim()) {
      setError("A rejection note is required.")
      return
    }
    setError(null)
    setLoading("reject")
    try {
      await adminRejectBankTransfer(submission.id, bookingId, rejectNote.trim())
      router.refresh()
    } catch (err: any) {
      setError(err?.message || "Failed to reject bank transfer.")
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-5 mt-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-[16px] text-amber-500">receipt_long</span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-amber-600">
          Bank Transfer Receipt Submitted
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px] mb-4">
        <div>
          <p className="text-[#4b6390] text-[11px] uppercase tracking-wide mb-0.5">Reference</p>
          <p className="font-semibold text-[#152d5a]">{submission.reference ?? '—'}</p>
        </div>
        <div>
          <p className="text-[#4b6390] text-[11px] uppercase tracking-wide mb-0.5">Submitted</p>
          <p className="font-semibold text-[#152d5a]">
            {submission.submitted_at
              ? new Date(submission.submitted_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
              : '—'}
          </p>
        </div>
      </div>

      {submission.signedReceiptUrl && (
        <div className="mb-4">
          <p className="text-[#4b6390] text-[11px] uppercase tracking-wide mb-2">Receipt</p>
          <button
            type="button"
            onClick={() => {
              setViewerFiles([{ url: submission.signedReceiptUrl!, name: 'Bank Transfer Receipt' }])
              setViewerTitle('Bank Transfer Receipt')
              setViewerOpen(true)
            }}
            className="inline-flex items-center gap-2 text-[#1a4fd6] text-[13px] font-semibold hover:underline"
          >
            <span className="material-symbols-outlined text-[15px]">open_in_new</span>
            View receipt
          </button>
        </div>
      )}

      {error && <p className="text-[12px] text-red-600 mb-3">{error}</p>}

      <div className="space-y-3">
        <textarea
          value={rejectNote}
          onChange={(e) => setRejectNote(e.target.value)}
          placeholder="Rejection note (required for rejection)"
          rows={3}
          className="w-full rounded-xl border border-[#152d5a]/10 px-3 py-2.5 text-[13px] text-[#152d5a] placeholder:text-[#4b6390]/60 focus:outline-none focus:border-[#1a4fd6]/30 resize-none"
        />

        <div className="flex flex-col sm:flex-row gap-3 pt-1 border-t border-[#152d5a]/[0.07]">
          <button
            type="button"
            onClick={handleApprove}
            disabled={loading !== null}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold text-[13px] py-2.5 rounded-xl transition-colors disabled:opacity-50"
          >
            {loading === 'approve' ? 'Confirming...' : 'Confirm Payment Received'}
          </button>
          <button
            type="button"
            onClick={handleReject}
            disabled={loading !== null}
            className="flex-1 border border-red-300 text-red-600 hover:bg-red-50 font-semibold text-[13px] py-2.5 rounded-xl transition-colors disabled:opacity-50"
          >
            {loading === 'reject' ? 'Rejecting...' : 'Reject Submission'}
          </button>
        </div>
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
