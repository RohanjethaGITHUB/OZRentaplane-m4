import Link from 'next/link'
import type { ReactNode } from 'react'

export function AdminPageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <section className="border-b border-[var(--admin-divider)]">
      <div className="max-w-[1420px] mx-auto px-6 md:px-10 py-10 md:py-12 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-[0.24em] uppercase font-semibold text-[var(--admin-text-dim)]">{eyebrow}</p>
          <h1 className="mt-2 text-[2.75rem] md:text-[3.25rem] leading-[1.04] font-semibold tracking-[-0.02em] text-[var(--admin-text)]">{title}</h1>
          {subtitle ? <p className="mt-3 text-[1.05rem] md:text-[1.12rem] leading-relaxed font-medium text-[var(--admin-text-muted)] max-w-4xl">{subtitle}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </section>
  )
}

export function AdminSectionPanel({
  title,
  subtitle,
  children,
  right,
}: {
  title?: string
  subtitle?: string
  children: ReactNode
  right?: ReactNode
}) {
  return (
    <section className="rounded-[var(--admin-radius-2xl)] border border-[var(--admin-border)] bg-[var(--admin-panel-bg)] shadow-[var(--admin-shadow-panel)]">
      {(title || subtitle || right) && (
        <div className="px-7 md:px-8 pt-6 pb-2 flex items-start justify-between gap-4">
          <div>
            {title ? <h2 className="text-3xl leading-[1.03] font-semibold text-[var(--admin-text)]">{title}</h2> : null}
            {subtitle ? <p className="mt-2 text-base text-[var(--admin-text-muted)]">{subtitle}</p> : null}
          </div>
          {right}
        </div>
      )}
      <div className="px-7 md:px-8 pb-7">{children}</div>
    </section>
  )
}

export function AdminMetricGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">{children}</div>
}

export function AdminMetricCard({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number
  tone?: 'default' | 'accent' | 'warning'
}) {
  const toneClass =
    tone === 'warning'
      ? 'border-[#5b4a2c] bg-[#1a1715]'
      : tone === 'accent'
      ? 'border-[var(--admin-accent-soft)] bg-[var(--admin-card-bg)]'
      : 'border-[var(--admin-border)] bg-[var(--admin-card-bg)]'
  const valueClass =
    tone === 'warning'
      ? 'text-[var(--admin-warning)]'
      : tone === 'accent'
      ? 'text-[var(--admin-accent)]'
      : 'text-[var(--admin-text)]'

  return (
    <div className={`rounded-[var(--admin-radius-xl)] border p-6 md:p-7 ${toneClass}`}>
      <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--admin-text-muted)] font-semibold">{label}</p>
      <p className={`mt-5 text-[2.8rem] leading-none font-semibold ${valueClass}`}>{value}</p>
    </div>
  )
}

export function AdminFilterPanel({
  title,
  subtitle,
  open,
  onToggle,
  children,
  className,
  headerClassName,
  titleClassName,
  subtitleClassName,
}: {
  title: string
  subtitle?: string
  open: boolean
  onToggle: () => void
  children: ReactNode
  className?: string
  headerClassName?: string
  titleClassName?: string
  subtitleClassName?: string
}) {
  return (
    <section className={`rounded-[var(--admin-radius-2xl)] border border-[var(--admin-border)] bg-[var(--admin-panel-bg)] shadow-[var(--admin-shadow-panel)] ${className ?? ''}`}>
      <button type="button" onClick={onToggle} className={`w-full px-7 md:px-8 py-6 flex items-start justify-between text-left ${headerClassName ?? ''}`}>
        <div>
          <h2 className={`text-[2rem] md:text-[2.1rem] leading-[1.08] font-semibold text-[var(--admin-text)] ${titleClassName ?? ''}`}>{title}</h2>
          {subtitle ? <p className={`text-base text-[var(--admin-text-muted)] mt-2 ${subtitleClassName ?? ''}`}>{subtitle}</p> : null}
        </div>
        <span className={`material-symbols-outlined text-[var(--admin-text-muted)] transition-transform mt-2 ${open ? 'rotate-180' : ''}`}>expand_more</span>
      </button>
      {open ? <div className="px-7 md:px-8 pb-7 border-t border-[var(--admin-divider)]">{children}</div> : null}
    </section>
  )
}

export function AdminActiveFilterChips({
  chips,
  onRemove,
  onClearAll,
}: {
  chips: Array<{ key: string; label: string }>
  onRemove: (key: string) => void
  onClearAll: () => void
}) {
  if (chips.length === 0) return <p className="text-sm text-[var(--admin-text-dim)]">No active filters</p>

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onRemove(chip.key)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--admin-border)] bg-[var(--admin-panel-bg-soft)] px-3.5 py-1.5 text-sm text-[var(--admin-text)] hover:border-[var(--admin-accent-soft)]"
        >
          <span>{chip.label}</span>
          <span className="material-symbols-outlined text-[15px]">close</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="ml-auto rounded-lg border border-[var(--admin-border)] px-3 py-1.5 text-sm text-[var(--admin-text-muted)] hover:text-[var(--admin-text)] hover:border-[var(--admin-accent-soft)]"
      >
        Clear all
      </button>
    </div>
  )
}

type BadgeTone = 'blue' | 'amber' | 'orange' | 'emerald' | 'red' | 'slate'
const BADGE_TONE: Record<BadgeTone, string> = {
  blue: 'bg-[rgba(59,130,246,0.12)] border-[rgba(96,165,250,0.22)] text-[#93c5fd]',
  amber: 'bg-[rgba(180,120,30,0.13)] border-[rgba(245,158,11,0.22)] text-[#f4cd7a]',
  orange: 'bg-[rgba(194,65,12,0.13)] border-[rgba(251,146,60,0.22)] text-[#fdba74]',
  emerald: 'bg-[rgba(22,101,52,0.16)] border-[rgba(74,222,128,0.18)] text-[#86efac]',
  red: 'bg-[rgba(127,29,29,0.16)] border-[rgba(248,113,113,0.18)] text-[#fca5a5]',
  slate: 'bg-[rgba(100,116,139,0.14)] border-[rgba(148,163,184,0.16)] text-[#cbd5e1]',
}

export function AdminStatusBadge({ label, tone = 'slate' }: { label: string; tone?: BadgeTone }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[12px] font-medium tracking-[0.04em] ${BADGE_TONE[tone]}`}>
      {label}
    </span>
  )
}

export function AdminRowActionButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-lg border border-[rgba(96,165,250,0.24)] bg-[var(--admin-button-bg)] px-3.5 py-2 text-sm font-medium text-[#bfdbfe] hover:bg-[rgba(37,99,235,0.24)] transition-colors"
    >
      {label}
    </Link>
  )
}

export function AdminDataTable({
  columns,
  children,
}: {
  columns: string[]
  children: ReactNode
}) {
  return (
    <div className="overflow-x-auto overflow-y-hidden rounded-[var(--admin-radius-xl)] border border-[var(--admin-border)] bg-[var(--admin-card-bg)]">
      <table className="w-full">
        <thead className="bg-[#141b29] text-[var(--admin-text-muted)]">
          <tr>
            {columns.map((column, idx) => (
              <th key={column} className={`px-5 py-4 text-[12px] tracking-[0.12em] uppercase font-semibold text-left ${idx === columns.length - 1 ? 'text-right' : ''}`}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
