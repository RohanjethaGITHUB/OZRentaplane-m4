import Link from 'next/link'

export type TimeRangeValue = 'today' | '7d' | '30d' | '6m' | 'max'

export const TIME_RANGE_OPTIONS: Array<{ label: string; value: TimeRangeValue }> = [
  { label: 'Today', value: 'today' },
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '6 months', value: '6m' },
  { label: 'Max', value: 'max' },
]

export function TimeRangeControl({
  active,
  basePath,
}: {
  active: TimeRangeValue
  basePath: string
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {TIME_RANGE_OPTIONS.map((opt) => {
        const isActive = active === opt.value
        return (
          <Link
            key={opt.value}
            href={`${basePath}?range=${opt.value}`}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              isActive
                ? 'bg-white border-[rgba(255,255,255,0.10)] text-[var(--admin-text)] shadow-[var(--admin-shadow-panel)]'
                : 'bg-white border-[rgba(255,255,255,0.10)] text-[var(--admin-text-muted)] shadow-[var(--admin-shadow-panel)] hover:text-[var(--admin-text)] hover:bg-white/90'
            }`}
          >
            {opt.label}
          </Link>
        )
      })}
    </div>
  )
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-2xl text-[var(--admin-text)] font-semibold">{title}</h2>
      {subtitle ? <p className="text-sm text-[var(--admin-text-muted)] mt-1">{subtitle}</p> : null}
    </div>
  )
}

export function StatCard({
  title,
  value,
  helper,
  href,
  warn,
}: {
  title: string
  value: number
  helper: string
  href: string
  warn?: boolean
}) {
  return (
    <Link
      href={href}
      className={`rounded-[var(--admin-radius-xl)] border p-5 transition-colors min-h-[140px] flex flex-col justify-between shadow-[var(--admin-shadow-panel)] backdrop-blur-sm ${
        warn
          ? 'bg-white border-[var(--admin-border)] hover:bg-white/90'
          : 'bg-[var(--admin-card-bg)] border-[var(--admin-border)] hover:bg-white/90'
      }`}
    >
      <p className="text-base text-[var(--admin-text-muted)] font-medium">{title}</p>
      <div>
        <p className={`text-4xl font-semibold ${warn ? 'text-[var(--admin-warning)]' : 'text-[var(--admin-text)]'}`}>{value}</p>
        <p className="text-sm text-[var(--admin-text-muted)] mt-1">{helper}</p>
      </div>
    </Link>
  )
}

export function StatusPill({ label, tone = 'slate' }: { label: string; tone?: 'blue' | 'green' | 'amber' | 'rose' | 'slate' }) {
  const toneClass =
    tone === 'blue'
      ? 'bg-blue-500/15 text-[#1a4fd6] border-blue-400/30'
      : tone === 'green'
      ? 'bg-green-500/15 text-[#166534] border-green-400/30'
      : tone === 'amber'
      ? 'bg-amber-500/15 text-[#b45309] border-amber-400/30'
      : tone === 'rose'
      ? 'bg-rose-500/15 text-[#991b1b] border-rose-400/30'
      : 'bg-slate-500/20 text-[#4b6390] border-slate-400/30'

  return <span className={`px-2.5 py-1 rounded-full text-xs border ${toneClass}`}>{label}</span>
}

export function TabLink({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link
      href={href}
      className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
        active
          ? 'bg-[#1a4a7a] border-[#1a4a7a] text-white font-medium'
          : 'bg-white border-[rgba(12,35,64,0.18)] text-[#3d5a80] hover:text-[#0C2340] hover:bg-[#f6f9fc]'
      }`}
    >
      {label}
    </Link>
  )
}

export function ChartShell({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-5 shadow-[var(--admin-shadow-panel)] backdrop-blur-sm">
      {title ? <h3 className="text-base text-[var(--admin-text)] mb-4">{title}</h3> : null}
      {children}
    </div>
  )
}
