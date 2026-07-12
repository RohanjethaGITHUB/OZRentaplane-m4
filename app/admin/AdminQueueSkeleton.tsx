// Shared skeleton for queue list pages (pending / verified / rejected)
export function QueuePageSkeleton() {
  return (
    <div className="min-h-full bg-[#eef5fb] animate-pulse">
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 md:px-8 lg:px-10">
      {/* Page header */}
      <div className="mb-6 rounded-2xl border border-[rgba(12,35,64,0.12)] bg-white px-5 py-5 shadow-[0_10px_26px_rgba(15,30,52,0.08)] sm:px-6">
        <div className="space-y-3">
          <div className="h-3 w-28 rounded-full bg-[#d8e3f0]" />
          <div className="h-8 w-60 rounded-xl bg-[#d2deeb]" />
          <div className="h-4 w-full max-w-[32rem] rounded-lg bg-[#e2eaf3]" />
        </div>
      </div>

      {/* Table skeleton */}
      <div className="overflow-hidden rounded-2xl border border-[rgba(12,35,64,0.12)] bg-white shadow-[0_10px_26px_rgba(15,30,52,0.08)]">
        {/* thead */}
        <div className="flex gap-6 border-b border-[rgba(12,35,64,0.08)] bg-[#f2f6fb] px-5 py-4 sm:px-6">
          {[180, 100, 80, 100, 90, 80].map((w, i) => (
            <div key={i} className="h-3 rounded bg-[#d8e3f0]" style={{ width: w }} />
          ))}
        </div>
        {/* rows */}
        <div className="divide-y divide-[rgba(12,35,64,0.08)]">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-6 px-5 py-4 sm:px-6">
              <div className="h-8 w-8 flex-shrink-0 rounded-full bg-[#e2eaf3]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 rounded bg-[#d2deeb]" />
              </div>
              <div className="h-4 w-20 rounded bg-[#e2eaf3]" />
              <div className="h-4 w-16 rounded bg-[#e2eaf3]" />
              <div className="h-4 w-24 rounded bg-[#d8e3f0]" />
              <div className="ml-auto h-7 w-20 rounded-full bg-[#e2eaf3]" />
            </div>
          ))}
        </div>
        {/* footer */}
        <div className="border-t border-[rgba(12,35,64,0.08)] px-5 py-4 sm:px-6">
          <div className="h-3 w-40 rounded bg-[#e2eaf3]" />
        </div>
      </div>
      </div>
    </div>
  )
}
