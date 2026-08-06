'use client'

import RescheduleActionButtons from '@/app/admin/checkouts/cancel-reschedule/RescheduleActionButtons'

type Props = {
  changeRequestId: string
  currentStart: string
  currentEnd: string
  requestedStart: string
  requestedEnd: string
  customerNote?: string | null
  customerName?: string | null
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
  customerName,
}: Props) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-white shadow-lg overflow-hidden">
      <div className="border-b border-amber-200/80 bg-amber-50/90 px-5 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 border border-amber-200 flex-shrink-0">
            <span className="material-symbols-outlined text-amber-600 text-xl">event_repeat</span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-bold uppercase tracking-widest text-amber-800">
              Reschedule Request — Review Required
            </h3>
            <p className="text-[13px] text-[#334155] mt-1 leading-relaxed">
              Customer proposed a new checkout time. The current slot stays held until you decide.
            </p>
            {customerName?.trim() ? (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-[#152d5a]">
                <span className="material-symbols-outlined text-[14px] text-amber-600">person</span>
                {customerName.trim()}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="px-5 py-5 sm:px-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-[#152d5a]/10 bg-[#f8fbff] p-4">
            <p className="text-[9px] uppercase tracking-widest text-[#4b6390] mb-2">Current time (held)</p>
            <p className="text-sm font-semibold text-[#152d5a]">{formatSydney(currentStart)}</p>
            <p className="text-xs text-[#4b6390] mt-1">to {formatSydney(currentEnd)}</p>
          </div>
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="text-[9px] uppercase tracking-widest text-amber-700/80 mb-2">Requested new time</p>
            <p className="text-sm font-semibold text-amber-950">{formatSydney(requestedStart)}</p>
            <p className="text-xs text-amber-800/80 mt-1">to {formatSydney(requestedEnd)}</p>
          </div>
        </div>

        {customerNote?.trim() && (
          <div className="rounded-lg border border-[#152d5a]/10 bg-[#f8fbff] p-4">
            <p className="text-[9px] uppercase tracking-widest text-[#4b6390] mb-2">Customer note</p>
            <p className="text-sm text-[#334155] leading-relaxed">{customerNote.trim()}</p>
          </div>
        )}

        <p className="text-[12px] text-[#4b6390] leading-relaxed">
          Approve to move the checkout to the requested slot (if still available), or reject to keep the current time.
        </p>
      </div>

      <div className="border-t border-amber-200/80 bg-amber-50/50 px-5 py-4 sm:px-6">
        <RescheduleActionButtons
          changeRequestId={changeRequestId}
          tone="light"
          layout="footer"
          currentStart={currentStart}
          currentEnd={currentEnd}
          requestedStart={requestedStart}
          requestedEnd={requestedEnd}
        />
      </div>
    </div>
  )
}
