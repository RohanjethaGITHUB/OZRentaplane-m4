// Skeleton for /admin/users/[id] detail page
export default function UserDetailLoading() {
  return (
    <div className="pt-8 pr-10 pb-20 pl-10 animate-pulse">
      {/* Back button */}
      <div className="mb-10 h-4 w-28 bg-white/[0.05] rounded" />

      <div className="max-w-6xl mx-auto space-y-12">
        {/* Header */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-end">
          <div className="md:col-span-2 space-y-5">
            <div className="h-6 w-28 bg-white/[0.05] rounded-full" />
            <div className="h-12 w-80 bg-white/10 rounded-xl" />
            <div className="flex gap-10">
              {[100, 120, 100].map((w, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3 bg-white/[0.04] rounded" style={{ width: w * 0.6 }} />
                  <div className="h-4 bg-white/10 rounded" style={{ width: w }} />
                </div>
              ))}
            </div>
          </div>
          <div className="bg-[#1e2023]/60 border border-blue-300/10 rounded-xl p-6 h-36 flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 rounded-full bg-white/10" />
            <div className="h-3 w-24 bg-white/[0.05] rounded" />
          </div>
        </div>

        <div className="h-0.5 w-10 bg-white/10" />

        {/* Document cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-[#1e2023]/60 border border-white/5 p-6 rounded-xl h-52 flex flex-col justify-between">
              <div className="w-8 h-8 bg-white/10 rounded" />
              <div className="space-y-2">
                <div className="h-4 w-40 bg-white/10 rounded" />
                <div className="h-3 w-32 bg-white/[0.05] rounded" />
              </div>
              <div className="flex justify-between items-end">
                <div className="h-3 w-24 bg-white/[0.04] rounded" />
                <div className="h-7 w-20 bg-white/[0.06] rounded-full" />
              </div>
            </div>
          ))}
        </div>

        {/* Verdict panel */}
        <div className="bg-[#1e2023]/60 border border-blue-300/10 rounded-3xl p-10 h-56" />
      </div>
    </div>
  )
}
