'use client'

import { useState } from 'react'

interface Props {
  title: string
  defaultOpen?: boolean
  /** Unread badge count — shown as a blue pill when > 0 */
  badge?: number
  children: React.ReactNode
}

/**
 * A smooth accordion section used on the admin customer detail page.
 * Server-rendered children are passed in; only the open/close state is client.
 */
export default function CollapsibleSection({
  title,
  defaultOpen = false,
  badge,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section>
      {/* ── Header / toggle ─────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between py-4 group text-left"
      >
        <div className="flex items-center gap-3">
          <h3 className="font-serif text-2xl tracking-tight text-[#e2e2e6] group-hover:text-blue-200 transition-colors duration-200">
            {title}
          </h3>

          {badge !== undefined && badge > 0 && (
            <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-blue-500/20 border border-blue-400/30 text-[10px] font-bold text-blue-300 tabular-nums">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </div>

        <span
          className={`material-symbols-outlined text-xl text-slate-500 group-hover:text-slate-300 transition-all duration-200 ${open ? 'rotate-180' : 'rotate-0'}`}
          style={{ fontVariationSettings: "'wght' 300" }}
        >
          expand_more
        </span>
      </button>

      {/* Hairline divider */}
      <div className="h-px bg-white/5 mb-6" />

      {/* ── Collapsible content — CSS grid trick for smooth height ── */}
      <div
        className="grid transition-all duration-300 ease-in-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="pb-2">
            {children}
          </div>
        </div>
      </div>
    </section>
  )
}
