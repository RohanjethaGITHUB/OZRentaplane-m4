'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitBlockTimeBankTransferProof } from '@/app/actions/block-time-bank-transfer'

export default function BankTransferReceiptForm({
  purchaseId,
  isResubmission,
}: {
  purchaseId: string
  isResubmission: boolean
}) {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setUploading(true)
    try {
      const formData = new FormData(e.currentTarget)
      await submitBlockTimeBankTransferProof(purchaseId, formData)
      router.refresh()
    } catch (err: any) {
      setError(err?.message || 'Failed to submit your receipt.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#4b6390]">
          {isResubmission ? 'Upload a new transfer receipt' : 'Upload transfer receipt'}
        </label>
        <input
          type="file"
          name="receipt"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          required
          className="w-full text-sm text-[#4b6390] file:mr-4 file:rounded-full file:border-0 file:bg-[#f0f6ff] file:px-4 file:py-2 file:text-xs file:font-semibold file:text-[#1a4fd6] hover:file:bg-[#e8f0fe]"
        />
        <p className="mt-1.5 text-[11px] text-[#4b6390]/80">
          A screenshot or PDF from your banking app. It must clearly show the amount, date and payment reference. JPEG, PNG, WebP or PDF, max 5MB.
        </p>
      </div>

      {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={uploading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {uploading ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            Uploading...
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-[18px]">upload</span>
            Submit receipt
          </>
        )}
      </button>
    </form>
  )
}
