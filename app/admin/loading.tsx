// Skeleton for the /admin overview page
export default function AdminLoading() {
  return (
    <div className="p-10 max-w-7xl animate-pulse">
      {/* Page header skeleton */}
      <div className="mb-12 space-y-3">
        <div className="h-9 w-64 bg-white/5 rounded-xl" />
        <div className="h-4 w-80 bg-white/[0.03] rounded-lg" />
        <div className="h-0.5 w-10 bg-white/10 mt-6" />
      </div>

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-[#1e2023]/60 border border-white/5 p-6 rounded-xl h-36 flex flex-col justify-between">
            <div className="h-5 w-5 bg-white/10 rounded" />
            <div className="space-y-2">
              <div className="h-8 w-12 bg-white/10 rounded" />
              <div className="h-3 w-28 bg-white/[0.05] rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Queue table skeleton */}
      <div className="bg-[#1e2023]/60 border border-white/5 rounded-2xl overflow-hidden">
        <div className="p-8 border-b border-white/5">
          <div className="h-6 w-48 bg-white/10 rounded" />
        </div>
        <div className="divide-y divide-white/5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-6 px-8 py-5">
              <div className="w-8 h-8 rounded-full bg-white/10 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-36 bg-white/10 rounded" />
                <div className="h-3 w-24 bg-white/[0.05] rounded" />
              </div>
              <div className="h-4 w-20 bg-white/[0.05] rounded" />
              <div className="h-4 w-24 bg-white/[0.05] rounded" />
              <div className="h-7 w-20 bg-white/[0.05] rounded-full ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
