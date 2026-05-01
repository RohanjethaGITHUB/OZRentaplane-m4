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
        className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-amber-500/25 hover:border-amber-500/50 bg-amber-500/5 hover:bg-amber-500/10 text-amber-400 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors"
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
