'use client'

import type { UserDocument } from '@/lib/supabase/types'
import DocumentUploadPanel from '@/app/dashboard/components/DocumentUploadPanel'

export type CheckoutDocumentGateState = {
  documents: UserDocument[]
  termsAcceptedAt: string | null
  termsVersion: string | null
  lastFlightDate: string | null
  hasNightVfrRating: boolean | null
  pilotLicenceDoc: UserDocument | null
}

export default function CheckoutDocumentsStep({
  checkoutGate,
  checkoutGateLoading,
  checkoutGateError,
  onRefresh,
  onContinue,
  onBackToStep1,
  onNoteChange,
  initialFlightDate,
  initialRedCardMonth,
  initialRedCardYear,
}: {
  checkoutGate: CheckoutDocumentGateState | null
  checkoutGateLoading: boolean
  checkoutGateError: string | null
  onRefresh: () => void
  onContinue: () => void
  onBackToStep1: () => void
  onNoteChange: (note: string) => void
  initialFlightDate: string
  initialRedCardMonth: number | null
  initialRedCardYear: number | null
}) {
  if (checkoutGateLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-symbols-outlined text-[#1a4fd6] text-[28px] animate-spin">progress_activity</span>
      </div>
    )
  }

  if (checkoutGateError) {
    return (
      <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
        <span className="material-symbols-outlined text-red-500 text-[18px]">error</span>
        <p className="text-[13px] text-red-700">{checkoutGateError}</p>
      </div>
    )
  }

  const pilotDoc = checkoutGate?.pilotLicenceDoc ?? null

  return (
    <DocumentUploadPanel
      documents={checkoutGate?.documents ?? []}
      pilotLicenceDocument={pilotDoc}
      lastFlightDate={checkoutGate?.lastFlightDate ?? null}
      hasNightVfrRating={checkoutGate?.hasNightVfrRating ?? null}
      termsAcceptedAt={checkoutGate?.termsAcceptedAt ?? null}
      initialRedCardMonth={initialRedCardMonth ?? pilotDoc?.red_card_expiry_month ?? null}
      initialRedCardYear={initialRedCardYear ?? pilotDoc?.red_card_expiry_year ?? null}
      onSuccess={onRefresh}
      onSubmit={(note) => { onNoteChange(note); onContinue() }}
      onBackToStep1={onBackToStep1}
    />
  )
}
