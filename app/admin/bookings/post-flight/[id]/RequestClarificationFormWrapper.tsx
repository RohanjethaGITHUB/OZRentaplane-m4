'use client'

import { useState } from 'react'
import RequestClarificationForm from './RequestClarificationForm'

type Props = {
  flightRecordId: string
  bookingId:      string
  customerId:     string
}

export default function RequestClarificationFormWrapper({ flightRecordId, bookingId, customerId }: Props) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors shadow-sm"
      >
        <span className="material-symbols-outlined text-[15px]">help</span>
        Request Clarification
      </button>
    )
  }

  return (
    <RequestClarificationForm
      flightRecordId={flightRecordId}
      bookingId={bookingId}
      customerId={customerId}
      onCancel={() => setOpen(false)}
    />
  )
}
