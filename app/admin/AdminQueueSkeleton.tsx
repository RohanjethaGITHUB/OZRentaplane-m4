// Shared skeleton for queue list pages (pending / verified / rejected)
export function QueuePageSkeleton() {
  return (
    <div className="p-10 max-w-7xl animate-pulse">
      {/* Page header */}
      <div className="mb-12 space-y-3">
        <div className="h-9 w-72 bg-white/5 rounded-xl" />
        <div className="h-4 w-96 bg-white/[0.03] rounded-lg" />
        <div className="h-0.5 w-10 bg-white/10 mt-6" />
      </div>

      {/* Table skeleton */}
      <div className="bg-[#1e2023]/60 border border-white/5 rounded-2xl overflow-hidden">
        {/* thead */}
        <div className="flex gap-6 px-8 py-5 bg-white/[0.01] border-b border-white/5">
          {[180, 100, 80, 100, 90, 80].map((w, i) => (
            <div key={i} className="h-3 bg-white/[0.05] rounded" style={{ width: w }} />
          ))}
        </div>
        {/* rows */}
        <div className="divide-y divide-white/5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-6 px-8 py-5">
              <div className="w-8 h-8 rounded-full bg-white/10 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 bg-white/10 rounded" />
              </div>
              <div className="h-4 w-20 bg-white/[0.05] rounded" />
              <div className="h-4 w-16 bg-white/[0.05] rounded" />
              <div className="h-4 w-24 bg-white/[0.05] rounded" />
              <div className="h-7 w-20 bg-white/[0.05] rounded-full ml-auto" />
            </div>
          ))}
        </div>
        {/* footer */}
        <div className="px-8 py-5 border-t border-white/5">
          <div className="h-3 w-40 bg-white/[0.04] rounded" />
        </div>
      </div>
    </div>
  )
}
