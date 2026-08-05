'use client'

import RescheduleActionButtons from '@/app/admin/checkouts/cancel-reschedule/RescheduleActionButtons'

type Props = {
  changeRequestId: string
  currentStart: string
  currentEnd: string
  requestedStart: string
  requestedEnd: string
  customerNote?: string | null
}

function formatSydney(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function AdminRescheduleReviewCard({
  changeRequestId,
  currentStart,
  currentEnd,
  requestedStart,
  requestedEnd,
  customerNote,
}: Props) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-6 space-y-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 border border-amber-200 flex-shrink-0">
            <span className="material-symbols-outlined text-amber-600 text-xl">event_repeat</span>
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold uppercase tracking-widest text-amber-700">
              Reschedule Request — Review Required
            </h3>
            <p className="text-[12px] text-amber-700/70 mt-0.5">
              Customer proposed a new checkout time. The current slot stays held until you decide.
            </p>
          </div>
        </div>
        <RescheduleActionButtons
          changeRequestId={changeRequestId}
          tone="light"
          currentStart={currentStart}
          currentEnd={currentEnd}
          requestedStart={requestedStart}
          requestedEnd={requestedEnd}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-[#152d5a]/10 bg-white p-4">
          <p className="text-[9px] uppercase tracking-widest text-[#4b6390] mb-2">Current time (held)</p>
          <p className="text-sm font-semibold text-[#152d5a]">{formatSydney(currentStart)}</p>
          <p className="text-xs text-[#4b6390] mt-1">to {formatSydney(currentEnd)}</p>
        </div>
        <div className="rounded-xl border border-amber-300 bg-amber-100/60 p-4">
          <p className="text-[9px] uppercase tracking-widest text-amber-700/80 mb-2">Requested new time</p>
          <p className="text-sm font-semibold text-amber-900">{formatSydney(requestedStart)}</p>
          <p className="text-xs text-amber-800/70 mt-1">to {formatSydney(requestedEnd)}</p>
        </div>
      </div>

      {customerNote?.trim() && (
        <div className="rounded-lg border border-[#152d5a]/10 bg-white p-4">
          <p className="text-[9px] uppercase tracking-widest text-[#4b6390] mb-2">Customer note</p>
          <p className="text-sm text-[#334155] leading-relaxed">{customerNote.trim()}</p>
        </div>
      )}

      <p className="text-[12px] text-[#4b6390] leading-relaxed">
        Approve to move the checkout to the requested slot (if still available), or reject to keep the current time.
      </p>
    </div>
  )
}
