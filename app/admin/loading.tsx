// Skeleton for the /admin overview page
export default function AdminLoading() {
  return (
    <div className="admin-command-pilot min-h-full bg-[var(--admin-canvas)] animate-pulse">
      <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 sm:py-6 md:px-8 lg:px-10">
      {/* Page header skeleton */}
      <div className="mb-6 rounded-[var(--admin-radius-module)] border border-[var(--admin-border-default)] bg-[linear-gradient(180deg,rgba(231,239,247,0.98),rgba(242,246,251,0.94))] px-4 py-5 sm:px-6 md:px-8">
        <div className="space-y-3">
          <div className="h-3 w-24 rounded-full bg-[rgba(20,43,77,0.10)]" />
          <div className="h-8 w-52 rounded-xl bg-[rgba(20,43,77,0.12)]" />
          <div className="h-4 w-full max-w-[30rem] rounded-lg bg-[rgba(20,43,77,0.08)]" />
        </div>
      </div>

      <div className="mb-5 rounded-[var(--admin-radius-module)] border border-[var(--admin-border-default)] bg-[var(--admin-module)] p-3 shadow-[var(--admin-shadow-module)] sm:p-4">
        <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-[var(--admin-radius-card)] border border-[var(--admin-border-default)] bg-[var(--admin-inset)] px-4 py-3">
              <div className="h-3 w-20 rounded-full bg-[rgba(20,43,77,0.10)]" />
              <div className="mt-3 flex items-end justify-between gap-3">
                <div className="h-7 w-12 rounded-xl bg-[rgba(20,43,77,0.12)]" />
                <div className="h-4 w-24 rounded-lg bg-[rgba(20,43,77,0.08)]" />
              </div>
              <div className="mt-3 h-3 w-24 rounded-lg bg-[rgba(20,43,77,0.08)]" />
            </div>
        ))}
      </div>
      </div>

      <div className="overflow-hidden rounded-[var(--admin-radius-module)] border border-[var(--admin-border-default)] bg-[var(--admin-module)] shadow-[var(--admin-shadow-module)]">
        <div className="border-b border-[var(--admin-border-soft)] bg-[var(--admin-inset)] px-5 py-4">
          <div className="h-3 w-24 rounded-full bg-[rgba(20,43,77,0.08)]" />
          <div className="mt-2 h-6 w-40 rounded-xl bg-[rgba(20,43,77,0.12)]" />
        </div>
        <div className="divide-y divide-[var(--admin-border-soft)] px-3 py-2 sm:px-4 sm:py-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-1 py-4 sm:px-2">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-2">
                    <div className="h-7 w-24 rounded-full bg-[rgba(20,43,77,0.10)]" />
                    <div className="h-7 w-20 rounded-full bg-[rgba(20,43,77,0.08)]" />
                  </div>
                  <div className="mt-3 h-4 w-48 rounded-lg bg-[rgba(20,43,77,0.12)]" />
                  <div className="mt-2 h-3 w-full max-w-[32rem] rounded-lg bg-[rgba(20,43,77,0.08)]" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 lg:max-w-[42rem] lg:flex-1">
                  {Array.from({ length: 4 }).map((__, metaIdx) => (
                    <div key={metaIdx} className="space-y-2">
                      <div className="h-3 w-20 rounded-full bg-[rgba(20,43,77,0.08)]" />
                      <div className="h-3 w-full rounded-lg bg-[rgba(20,43,77,0.12)]" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  )
}
