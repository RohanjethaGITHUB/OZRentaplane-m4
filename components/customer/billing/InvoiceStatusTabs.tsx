'use client'

import React, { useRef, useState, useEffect } from 'react'

export type TabKey =
  | 'all'
  | 'paid'
  | 'partial'
  | 'pending'
  | 'refunded'
  | 'waived'
  | 'settled'
  | 'failed'
  | 'packages'
  | 'usage'

export default function InvoiceStatusTabs({
  activeTab,
  onTabChange,
  counts,
}: {
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  counts: Record<TabKey, number>
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
      setCanScrollLeft(scrollLeft > 4)
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 4)
    }
  }

  useEffect(() => {
    checkScroll()
    const el = scrollRef.current
    if (el) {
      el.addEventListener('scroll', checkScroll)
    }
    window.addEventListener('resize', checkScroll)
    return () => {
      if (el) el.removeEventListener('scroll', checkScroll)
      window.removeEventListener('resize', checkScroll)
    }
  }, [counts])

  const scrollBy = (offset: number) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' })
    }
  }

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'paid', label: 'Paid', count: counts.paid },
    ...(counts.partial > 0 ? [{ key: 'partial' as TabKey, label: 'Partially Paid', count: counts.partial }] : []),
    { key: 'pending', label: 'Pending', count: counts.pending },
    { key: 'refunded', label: 'Refunded', count: counts.refunded },
    { key: 'waived', label: 'Waived', count: counts.waived },
    { key: 'settled', label: 'Settled', count: counts.settled },
    { key: 'failed', label: 'Failed', count: counts.failed },
    ...(counts.packages > 0 ? [{ key: 'packages' as TabKey, label: 'Packages', count: counts.packages }] : []),
    ...(counts.usage > 0 ? [{ key: 'usage' as TabKey, label: 'Flight Usage', count: counts.usage }] : []),
  ]

  return (
    <div className="relative group">
      {/* Left Scroll Fade & Button (Desktop) */}
      {canScrollLeft && (
        <div className="hidden sm:flex absolute left-0 inset-y-0 z-10 items-center pr-3 bg-gradient-to-r from-white via-white/90 to-transparent">
          <button
            type="button"
            onClick={() => scrollBy(-140)}
            aria-label="Scroll tabs left"
            className="w-6 h-6 rounded-full bg-white shadow-md border border-slate-200 flex items-center justify-center text-slate-600 hover:text-[#152d5a] transition-all"
          >
            <span className="material-symbols-outlined text-[14px]">chevron_left</span>
          </button>
        </div>
      )}

      {/* Tabs Container */}
      <div
        ref={scrollRef}
        className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scroll-smooth scrollbar-thin scrollbar-thumb-slate-200/80 scrollbar-track-transparent"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                isActive
                  ? 'bg-[#152d5a] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-[#152d5a]'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold tabular-nums ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Right Scroll Fade & Button (Desktop) */}
      {canScrollRight && (
        <div className="hidden sm:flex absolute right-0 inset-y-0 z-10 items-center pl-3 bg-gradient-to-l from-white via-white/90 to-transparent">
          <button
            type="button"
            onClick={() => scrollBy(140)}
            aria-label="Scroll tabs right"
            className="w-6 h-6 rounded-full bg-white shadow-md border border-slate-200 flex items-center justify-center text-slate-600 hover:text-[#152d5a] transition-all"
          >
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          </button>
        </div>
      )}
    </div>
  )
}
