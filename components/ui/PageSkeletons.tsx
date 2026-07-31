/**
 * Shared page skeletons — one file, selected by pathname.
 * Used by dashboard/admin route suspense while navigating.
 */

import type { ReactNode } from 'react'

function FullBleedHero({
  height = 460,
  compact = false,
}: {
  height?: number
  compact?: boolean
}) {
  const minHeight = compact ? 200 : height
  return (
    <section
      className="relative overflow-hidden -mt-6 bg-[#0d1b3e]"
      style={{
        minHeight,
        marginLeft: 'calc(-50vw + 50%)',
        marginRight: 'calc(-50vw + 50%)',
        width: '100vw',
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, rgba(8,20,50,0.88) 0%, rgba(8,20,50,0.55) 55%, rgba(8,20,50,0.25) 100%)',
        }}
      />
      <div
        className={`relative z-10 mx-auto flex max-w-[1440px] flex-col justify-end px-4 text-white md:px-5 lg:px-6 ${
          compact ? 'min-h-[200px] py-8 md:py-10' : 'pb-16 md:pb-20'
        }`}
        style={compact ? undefined : { minHeight }}
      >
        <div className="mb-3 h-3 w-28 rounded-full bg-white/20" />
        <div className={`rounded-xl bg-white/25 ${compact ? 'h-8 w-48' : 'h-10 w-56 sm:h-12 sm:w-72'}`} />
        {!compact && (
          <>
            <div className="mt-4 h-4 w-full max-w-lg rounded-lg bg-white/15" />
            <div className="mt-2 h-4 w-2/3 max-w-md rounded-lg bg-white/10" />
          </>
        )}
      </div>
    </section>
  )
}

function WhiteCard({ className = '', children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-[rgba(12,35,64,0.10)] bg-white shadow-[0_10px_26px_rgba(15,30,52,0.06)] ${className}`}>
      {children}
    </div>
  )
}

function SkeletonShell({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label={label}>
      {children}
    </div>
  )
}

// ── Customer portal ──────────────────────────────────────────────────────────

function DashboardHomeSkeleton() {
  return (
    <SkeletonShell label="Loading dashboard">
      <FullBleedHero height={380} />
      <div className="mt-6 space-y-4">
        <div className="h-14 rounded-2xl bg-[#d7e6f5]" />
        <div className="grid gap-4 md:grid-cols-2">
          <WhiteCard className="h-44 p-5 space-y-3">
            <div className="h-4 w-32 rounded bg-[#d8e3f0]" />
            <div className="h-6 w-48 rounded bg-[#d2deeb]" />
            <div className="h-3 w-full rounded bg-[#e2eaf3]" />
          </WhiteCard>
          <WhiteCard className="h-44 p-5 space-y-3">
            <div className="h-4 w-36 rounded bg-[#d8e3f0]" />
            <div className="h-6 w-40 rounded bg-[#d2deeb]" />
            <div className="h-3 w-3/4 rounded bg-[#e2eaf3]" />
          </WhiteCard>
        </div>
      </div>
    </SkeletonShell>
  )
}

function DocumentsSkeleton() {
  return (
    <SkeletonShell label="Loading documents">
      <FullBleedHero />
      <div className="py-8">
        <div className="overflow-hidden rounded-2xl border border-[#152d5a]/15 bg-[#152d5a] shadow-[0_16px_40px_rgba(12,35,64,0.18)]">
          <div className="flex flex-col gap-6 px-5 py-6 sm:flex-row sm:items-center sm:px-8 sm:py-7">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-[6px] border-white/15 bg-white/10" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="h-5 w-72 max-w-full rounded-lg bg-white/20" />
              <div className="h-4 w-56 max-w-full rounded-lg bg-white/10" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-white/10 px-5 py-5 sm:grid-cols-4 sm:px-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-7 w-7 shrink-0 rounded-full bg-white/15" />
                <div className="h-3 flex-1 rounded bg-white/10" />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 space-y-3 rounded-2xl bg-[#dce3ed] p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <WhiteCard key={i} className="h-16 px-4 flex items-center">
              <div className="h-4 w-40 rounded bg-[#d8e3f0]" />
            </WhiteCard>
          ))}
        </div>
      </div>
    </SkeletonShell>
  )
}

function BookingsListSkeleton() {
  return (
    <SkeletonShell label="Loading bookings">
      <FullBleedHero />
      <div className="relative z-10 -mt-16 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-[#152d5a] p-4">
            <div className="h-3 w-16 rounded bg-white/15" />
            <div className="mt-3 h-6 w-10 rounded bg-white/25" />
          </div>
        ))}
      </div>
      <div className="mt-6 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <WhiteCard key={i} className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 shrink-0 rounded-full bg-[#e2eaf3]" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 rounded bg-[#d2deeb]" />
              <div className="h-3 w-28 rounded bg-[#e2eaf3]" />
            </div>
            <div className="h-7 w-20 rounded-full bg-[#e2eaf3]" />
          </WhiteCard>
        ))}
      </div>
    </SkeletonShell>
  )
}

function BookingFormSkeleton() {
  return (
    <SkeletonShell label="Loading booking form">
      <FullBleedHero />
      <div className="mt-6 space-y-4 rounded-2xl bg-[#f5f7fb] p-4 sm:p-6">
        <WhiteCard className="h-28 p-5 space-y-3">
          <div className="h-4 w-36 rounded bg-[#d8e3f0]" />
          <div className="h-5 w-56 rounded bg-[#d2deeb]" />
        </WhiteCard>
        {Array.from({ length: 3 }).map((_, i) => (
          <WhiteCard key={i} className="space-y-3 p-5">
            <div className="h-4 w-28 rounded bg-[#d8e3f0]" />
            <div className="h-11 w-full rounded-xl bg-[#eef3f9]" />
          </WhiteCard>
        ))}
      </div>
    </SkeletonShell>
  )
}

function BookingDetailSkeleton() {
  return (
    <SkeletonShell label="Loading booking">
      <FullBleedHero />
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <WhiteCard key={i} className="min-h-[180px] space-y-3 p-5">
            <div className="h-4 w-28 rounded bg-[#d8e3f0]" />
            <div className="h-5 w-40 rounded bg-[#d2deeb]" />
            <div className="h-3 w-full rounded bg-[#e2eaf3]" />
            <div className="h-3 w-3/4 rounded bg-[#e2eaf3]" />
          </WhiteCard>
        ))}
      </div>
    </SkeletonShell>
  )
}

function PricingSkeleton() {
  return (
    <SkeletonShell label="Loading pricing">
      <FullBleedHero />
      <div className="mt-8 space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <WhiteCard className="h-40 p-5 space-y-3">
            <div className="h-4 w-24 rounded bg-[#d8e3f0]" />
            <div className="h-6 w-48 rounded bg-[#d2deeb]" />
            <div className="h-3 w-full rounded bg-[#e2eaf3]" />
          </WhiteCard>
          <WhiteCard className="h-40 p-5 space-y-3">
            <div className="h-4 w-24 rounded bg-[#d8e3f0]" />
            <div className="h-6 w-44 rounded bg-[#d2deeb]" />
            <div className="h-3 w-full rounded bg-[#e2eaf3]" />
          </WhiteCard>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <WhiteCard key={i} className="h-52 p-5 space-y-3">
              <div className="h-5 w-32 rounded bg-[#d2deeb]" />
              <div className="h-8 w-24 rounded bg-[#d8e3f0]" />
              <div className="h-3 w-full rounded bg-[#e2eaf3]" />
              <div className="mt-auto h-10 w-full rounded-xl bg-[#e8eef6]" />
            </WhiteCard>
          ))}
        </div>
      </div>
    </SkeletonShell>
  )
}

function PurchasesSkeleton() {
  return (
    <SkeletonShell label="Loading purchases">
      <FullBleedHero />
      <div className="mt-8 space-y-4">
        <WhiteCard className="h-36 p-5 space-y-3">
          <div className="h-4 w-28 rounded bg-[#d8e3f0]" />
          <div className="h-8 w-36 rounded bg-[#d2deeb]" />
          <div className="h-10 w-40 rounded-xl bg-[#e8eef6]" />
        </WhiteCard>
        {Array.from({ length: 3 }).map((_, i) => (
          <WhiteCard key={i} className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-xl bg-[#e2eaf3]" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-44 rounded bg-[#d2deeb]" />
              <div className="h-3 w-28 rounded bg-[#e2eaf3]" />
            </div>
          </WhiteCard>
        ))}
      </div>
    </SkeletonShell>
  )
}

function MessagesSkeleton() {
  return (
    <SkeletonShell label="Loading messages">
      <FullBleedHero compact />
      <div className="mt-4">
        <WhiteCard className="flex min-h-[420px] flex-col overflow-hidden">
          <div className="border-b border-[rgba(12,35,64,0.08)] px-5 py-4">
            <div className="h-4 w-40 rounded bg-[#d2deeb]" />
          </div>
          <div className="flex-1 space-y-4 p-5">
            <div className="ml-auto h-12 w-2/3 rounded-2xl bg-[#e8eef6]" />
            <div className="h-12 w-1/2 rounded-2xl bg-[#dce6f2]" />
            <div className="ml-auto h-10 w-1/2 rounded-2xl bg-[#e8eef6]" />
            <div className="h-14 w-3/5 rounded-2xl bg-[#dce6f2]" />
          </div>
          <div className="border-t border-[rgba(12,35,64,0.08)] p-4">
            <div className="h-11 w-full rounded-xl bg-[#eef3f9]" />
          </div>
        </WhiteCard>
      </div>
    </SkeletonShell>
  )
}

function CheckoutSkeleton() {
  return (
    <SkeletonShell label="Loading checkout">
      <FullBleedHero />
      <div className="mt-6 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <WhiteCard key={i} className="h-20 p-4 space-y-2">
              <div className="h-3 w-16 rounded bg-[#d8e3f0]" />
              <div className="h-5 w-20 rounded bg-[#d2deeb]" />
            </WhiteCard>
          ))}
        </div>
        <WhiteCard className="space-y-4 p-5">
          <div className="flex gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-[#e2eaf3]" />
                <div className="h-3 w-14 rounded bg-[#e2eaf3]" />
              </div>
            ))}
          </div>
          <div className="h-40 rounded-xl bg-[#eef3f9]" />
        </WhiteCard>
      </div>
    </SkeletonShell>
  )
}

function SettingsSkeleton() {
  return (
    <SkeletonShell label="Loading settings">
      <FullBleedHero />
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <WhiteCard className="min-h-[280px] space-y-4 p-5">
          <div className="h-5 w-36 rounded bg-[#d2deeb]" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-24 rounded bg-[#d8e3f0]" />
              <div className="h-11 w-full rounded-xl bg-[#eef3f9]" />
            </div>
          ))}
        </WhiteCard>
        <WhiteCard className="min-h-[280px] space-y-4 p-5">
          <div className="h-5 w-32 rounded bg-[#d2deeb]" />
          <div className="mx-auto h-36 w-36 rounded-full bg-[#e2eaf3]" />
          <div className="h-4 w-40 mx-auto rounded bg-[#e2eaf3]" />
        </WhiteCard>
      </div>
    </SkeletonShell>
  )
}

function DefaultPortalSkeleton() {
  return (
    <SkeletonShell label="Loading page">
      <FullBleedHero />
      <div className="mt-6 space-y-4">
        <WhiteCard className="h-40 p-5 space-y-3">
          <div className="h-4 w-32 rounded bg-[#d8e3f0]" />
          <div className="h-5 w-56 rounded bg-[#d2deeb]" />
          <div className="h-3 w-full rounded bg-[#e2eaf3]" />
        </WhiteCard>
        <WhiteCard className="h-28 p-5" />
      </div>
    </SkeletonShell>
  )
}

// ── Admin ────────────────────────────────────────────────────────────────────

export function AdminQueueTableSkeleton() {
  return (
    <div className="min-h-full bg-[#eef5fb] animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 md:px-8 lg:px-10">
        <div className="mb-6 rounded-2xl border border-[rgba(12,35,64,0.12)] bg-white px-5 py-5 shadow-[0_10px_26px_rgba(15,30,52,0.08)] sm:px-6">
          <div className="space-y-3">
            <div className="h-3 w-28 rounded-full bg-[#d8e3f0]" />
            <div className="h-8 w-60 rounded-xl bg-[#d2deeb]" />
            <div className="h-4 w-full max-w-[32rem] rounded-lg bg-[#e2eaf3]" />
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[rgba(12,35,64,0.12)] bg-white shadow-[0_10px_26px_rgba(15,30,52,0.08)]">
          <div className="flex gap-6 border-b border-[rgba(12,35,64,0.08)] bg-[#f2f6fb] px-5 py-4 sm:px-6">
            {[180, 100, 80, 100, 90, 80].map((w, i) => (
              <div key={i} className="h-3 rounded bg-[#d8e3f0]" style={{ width: w }} />
            ))}
          </div>
          <div className="divide-y divide-[rgba(12,35,64,0.08)]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-6 px-5 py-4 sm:px-6">
                <div className="h-8 w-8 flex-shrink-0 rounded-full bg-[#e2eaf3]" />
                <div className="flex-1">
                  <div className="h-4 w-40 rounded bg-[#d2deeb]" />
                </div>
                <div className="h-4 w-20 rounded bg-[#e2eaf3]" />
                <div className="ml-auto h-7 w-20 rounded-full bg-[#e2eaf3]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function AdminCommandBoardSkeleton() {
  return (
    <div className="min-h-full bg-[#e7eff7] animate-pulse" aria-busy="true" aria-label="Loading admin overview">
      <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 md:px-8 lg:px-10">
        <div className="mb-6 rounded-2xl border border-[rgba(20,43,77,0.12)] bg-white/90 px-4 py-5 sm:px-6">
          <div className="space-y-3">
            <div className="h-3 w-24 rounded-full bg-[rgba(20,43,77,0.10)]" />
            <div className="h-8 w-52 rounded-xl bg-[rgba(20,43,77,0.12)]" />
          </div>
        </div>
        <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-[rgba(20,43,77,0.10)] bg-white px-4 py-3">
              <div className="h-3 w-20 rounded-full bg-[rgba(20,43,77,0.10)]" />
              <div className="mt-3 h-7 w-12 rounded-xl bg-[rgba(20,43,77,0.12)]" />
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-2xl border border-[rgba(20,43,77,0.10)] bg-white">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="border-b border-[rgba(20,43,77,0.06)] px-5 py-4">
              <div className="h-4 w-48 rounded bg-[rgba(20,43,77,0.12)]" />
              <div className="mt-2 h-3 w-full max-w-md rounded bg-[rgba(20,43,77,0.08)]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AdminInboxSkeleton() {
  return (
    <div className="flex min-h-[calc(100dvh-2rem)] animate-pulse overflow-hidden rounded-2xl border border-[rgba(12,35,64,0.10)] bg-white" aria-busy="true" aria-label="Loading messages">
      <div className="hidden w-80 shrink-0 border-r border-[rgba(12,35,64,0.08)] bg-[#f6f9fc] md:block">
        <div className="border-b border-[rgba(12,35,64,0.08)] p-4">
          <div className="h-9 w-full rounded-xl bg-[#e2eaf3]" />
        </div>
        <div className="space-y-3 p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 rounded-xl bg-white p-3">
              <div className="h-9 w-9 rounded-full bg-[#e2eaf3]" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-28 rounded bg-[#d2deeb]" />
                <div className="h-3 w-full rounded bg-[#e2eaf3]" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-[rgba(12,35,64,0.08)] px-5 py-4">
          <div className="h-5 w-40 rounded bg-[#d2deeb]" />
        </div>
        <div className="flex-1 space-y-4 p-5">
          <div className="h-12 w-1/2 rounded-2xl bg-[#e8eef6]" />
          <div className="ml-auto h-12 w-2/5 rounded-2xl bg-[#dce6f2]" />
          <div className="h-10 w-1/3 rounded-2xl bg-[#e8eef6]" />
        </div>
        <div className="border-t border-[rgba(12,35,64,0.08)] p-4">
          <div className="h-11 w-full rounded-xl bg-[#eef3f9]" />
        </div>
      </div>
    </div>
  )
}

function AdminCalendarSkeleton() {
  return (
    <div className="min-h-full bg-[#eef5fb] animate-pulse" aria-busy="true" aria-label="Loading calendar">
      <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-6 sm:px-6 md:px-8">
        <div className="rounded-2xl border border-[rgba(12,35,64,0.12)] bg-white px-5 py-5">
          <div className="h-3 w-24 rounded-full bg-[#d8e3f0]" />
          <div className="mt-3 h-8 w-48 rounded-xl bg-[#d2deeb]" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 w-28 rounded-xl bg-white" />
          <div className="h-10 w-28 rounded-xl bg-white" />
          <div className="h-10 w-40 rounded-xl bg-white" />
        </div>
        <div className="grid grid-cols-7 gap-2 rounded-2xl border border-[rgba(12,35,64,0.12)] bg-white p-4">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-lg bg-[#eef3f9]" />
          ))}
        </div>
      </div>
    </div>
  )
}

function AdminDetailSkeleton() {
  return (
    <div className="min-h-full bg-[#eef5fb] animate-pulse" aria-busy="true" aria-label="Loading details">
      <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 md:px-8">
        <div className="h-4 w-28 rounded bg-[#d8e3f0]" />
        <div className="rounded-2xl bg-[#152d5a] px-6 py-8">
          <div className="h-3 w-24 rounded-full bg-white/20" />
          <div className="mt-3 h-8 w-64 rounded-xl bg-white/25" />
          <div className="mt-4 flex gap-6">
            <div className="h-4 w-28 rounded bg-white/15" />
            <div className="h-4 w-28 rounded bg-white/15" />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <WhiteCard key={i} className="min-h-[160px] p-5 space-y-3">
              <div className="h-4 w-28 rounded bg-[#d8e3f0]" />
              <div className="h-5 w-40 rounded bg-[#d2deeb]" />
              <div className="h-3 w-full rounded bg-[#e2eaf3]" />
            </WhiteCard>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Selectors ────────────────────────────────────────────────────────────────

export function getCustomerSkeleton(pathname: string) {
  if (pathname === '/dashboard') return <DashboardHomeSkeleton />
  if (pathname.startsWith('/dashboard/documents')) return <DocumentsSkeleton />
  if (pathname.startsWith('/dashboard/messages')) return <MessagesSkeleton />
  if (pathname.startsWith('/dashboard/pricing')) return <PricingSkeleton />
  if (pathname.startsWith('/dashboard/purchases')) return <PurchasesSkeleton />
  if (pathname.startsWith('/dashboard/checkout')) return <CheckoutSkeleton />
  if (pathname.startsWith('/dashboard/settings')) return <SettingsSkeleton />
  if (pathname === '/dashboard/bookings/new' || pathname.startsWith('/dashboard/bookings/new/')) {
    return <BookingFormSkeleton />
  }
  if (/^\/dashboard\/bookings\/[^/]+/.test(pathname)) return <BookingDetailSkeleton />
  if (pathname.startsWith('/dashboard/bookings')) return <BookingsListSkeleton />
  return <DefaultPortalSkeleton />
}

export function getAdminSkeleton(pathname: string) {
  if (pathname === '/admin') return <AdminCommandBoardSkeleton />
  if (pathname.startsWith('/admin/messages')) return <AdminInboxSkeleton />
  if (pathname.startsWith('/admin/calendar') || pathname.startsWith('/admin/bookings/calendar')) {
    return <AdminCalendarSkeleton />
  }
  if (
    pathname.startsWith('/admin/users/') ||
    /^\/admin\/bookings\/requests\/[^/]+/.test(pathname) ||
    /^\/admin\/bookings\/post-flight\/[^/]+/.test(pathname) ||
    /^\/admin\/aircraft\/[^/]+/.test(pathname)
  ) {
    return <AdminDetailSkeleton />
  }
  return <AdminQueueTableSkeleton />
}

/** @deprecated Use getCustomerSkeleton(pathname) */
export function PortalPageSkeleton() {
  return <DefaultPortalSkeleton />
}
