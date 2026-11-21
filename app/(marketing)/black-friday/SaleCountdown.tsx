'use client'

import { useEffect, useState } from 'react'

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  }
}

/** Live countdown to `target`. Renders nothing until mounted to avoid a hydration mismatch. */
export default function SaleCountdown({ target, label }: { target: string; label: string }) {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const remaining = now == null ? null : new Date(target).getTime() - now
  if (remaining != null && remaining <= 0) return null
  const p = remaining == null ? null : parts(remaining)

  const cells: { value: number | null; unit: string }[] = [
    { value: p?.days ?? null, unit: 'Days' },
    { value: p?.hours ?? null, unit: 'Hrs' },
    { value: p?.minutes ?? null, unit: 'Min' },
    { value: p?.seconds ?? null, unit: 'Sec' },
  ]

  return (
    <div aria-live="off">
      <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.22em] text-white/85">{label}</p>
      <div className="grid grid-cols-4 gap-2">
        {cells.map((c) => (
          <div key={c.unit} className="min-w-0 rounded-xl border border-white/15 bg-[#0a1a33]/50 px-1 py-2.5 text-center backdrop-blur-sm sm:px-2">
            <span className="block font-sans text-[22px] font-bold tabular-nums text-white sm:text-2xl md:text-[28px]">
              {c.value == null ? '--' : String(c.value).padStart(2, '0')}
            </span>
            <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#ffcf5c] sm:tracking-[0.18em]">{c.unit}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
