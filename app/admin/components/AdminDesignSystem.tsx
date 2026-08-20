import Link from 'next/link'
import type { ReactNode } from 'react'
import AdminPortalHero from '@/components/AdminPortalHero'
import { TIME_RANGE_OPTIONS, type TimeRangeValue } from './time-range'

type LegacyBadgeTone = 'blue' | 'green' | 'amber' | 'orange' | 'emerald' | 'red' | 'rose' | 'slate' | 'indigo'
type AdminBadgeTone =
  | LegacyBadgeTone
  | 'primary'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral'
  | 'accent'

type BadgeToneClass = {
  label: string
  classes: string
}

const BADGE_CLASSES: Record<AdminBadgeTone, BadgeToneClass> = {
  primary: {
    label: 'Primary',
    classes: 'border-[rgba(96,165,250,0.26)] bg-[rgba(59,130,246,0.10)] text-[var(--admin-accent-blue)]',
  },
  indigo: {
    label: 'Indigo',
    classes: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-300',
  },
  info: {
    label: 'Info',
    classes: 'border-[rgba(96,165,250,0.24)] bg-[rgba(59,130,246,0.08)] text-[var(--admin-info)]',
  },
  success: {
    label: 'Success',
    classes: 'border-[rgba(74,222,128,0.22)] bg-[rgba(22,101,52,0.10)] text-[var(--admin-success)]',
  },
  warning: {
    label: 'Warning',
    classes: 'border-[rgba(245,158,11,0.24)] bg-[rgba(245,158,11,0.10)] text-[var(--admin-warning)]',
  },
  danger: {
    label: 'Danger',
    classes: 'border-[rgba(248,113,113,0.24)] bg-[rgba(185,28,28,0.10)] text-[var(--admin-danger)]',
  },
  neutral: {
    label: 'Neutral',
    classes: 'border-[rgba(148,163,184,0.24)] bg-[rgba(100,116,139,0.10)] text-[var(--admin-neutral)]',
  },
  accent: {
    label: 'Accent',
    classes: 'border-[rgba(96,165,250,0.28)] bg-[rgba(96,165,250,0.12)] text-[var(--admin-accent-blue)]',
  },
  blue: {
    label: 'Blue',
    classes: 'border-[rgba(96,165,250,0.24)] bg-[rgba(59,130,246,0.12)] text-[var(--admin-accent-blue)]',
  },
  green: {
    label: 'Green',
    classes: 'border-[rgba(74,222,128,0.22)] bg-[rgba(22,101,52,0.10)] text-[var(--admin-success)]',
  },
  amber: {
    label: 'Amber',
    classes: 'border-[rgba(245,158,11,0.24)] bg-[rgba(245,158,11,0.10)] text-[var(--admin-warning)]',
  },
  orange: {
    label: 'Orange',
    classes: 'border-[rgba(251,146,60,0.24)] bg-[rgba(194,65,12,0.10)] text-[rgb(194,65,12)]',
  },
  emerald: {
    label: 'Emerald',
    classes: 'border-[rgba(74,222,128,0.22)] bg-[rgba(22,101,52,0.10)] text-[var(--admin-success)]',
  },
  red: {
    label: 'Red',
    classes: 'border-[rgba(248,113,113,0.24)] bg-[rgba(185,28,28,0.10)] text-[var(--admin-danger)]',
  },
  rose: {
    label: 'Rose',
    classes: 'border-[rgba(248,113,113,0.24)] bg-[rgba(185,28,28,0.10)] text-[var(--admin-danger)]',
  },
  slate: {
    label: 'Slate',
    classes: 'border-[rgba(148,163,184,0.24)] bg-[rgba(100,116,139,0.10)] text-[var(--admin-neutral)]',
  },
}

function badgeToneClasses(tone: AdminBadgeTone) {
  return BADGE_CLASSES[tone] ?? BADGE_CLASSES.neutral
}

function stripFrameClasses(kind: 'action' | 'flight') {
  return kind === 'action'
    ? 'border-[rgba(96,165,250,0.20)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(243,247,253,0.98))]'
    : 'border-[rgba(96,165,250,0.18)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(240,246,255,0.96))]'
}

export function AdminPageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  breadcrumbs,
}: {
  eyebrow: string
  title: string
  subtitle?: string
  actions?: ReactNode
  breadcrumbs?: {
    parentLabel: string
    parentHref: string
    currentLabel: string
  }
}) {
  return <AdminPortalHero eyebrow={eyebrow} title={title} subtitle={subtitle} actions={actions} breadcrumbs={breadcrumbs} />
}

export function AdminSectionCard({
  title,
  subtitle,
  children,
  right,
  className,
}: {
  title?: string
  subtitle?: string
  children: ReactNode
  right?: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-[var(--admin-radius-2xl)] border border-[var(--admin-card-border)] bg-[var(--admin-panel-bg)] shadow-[var(--admin-soft-shadow)] ${className ?? ''}`}>
      {(title || subtitle || right) && (
        <div className="flex flex-col gap-4 px-5 pt-5 pb-4 md:px-8 md:pt-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            {title ? <h2 className="font-serif text-[1.35rem] md:text-[1.65rem] leading-[var(--admin-leading-heading)] font-semibold tracking-[var(--admin-tracking-heading)] text-[var(--admin-text)]">{title}</h2> : null}
            {subtitle ? <p className="mt-2 text-[var(--admin-text-sm)] md:text-[var(--admin-text-base)] leading-[var(--admin-leading-body)] text-[var(--admin-text-muted)]">{subtitle}</p> : null}
          </div>
          {right ? <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">{right}</div> : null}
        </div>
      )}
      <div className="px-6 md:px-8 pb-6 md:pb-8">{children}</div>
    </section>
  )
}

export function AdminSectionPanel(props: {
  title?: string
  subtitle?: string
  children: ReactNode
  right?: ReactNode
  className?: string
}) {
  return <AdminSectionCard {...props} />
}

export function AdminMetricGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 min-[390px]:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">{children}</div>
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
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--admin-card-border)] bg-[var(--admin-panel-bg-soft)] px-3.5 py-1.5 text-[var(--admin-text-sm)] text-[var(--admin-text)] transition-colors hover:border-[var(--admin-accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(96,165,250,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        >
          <span>{chip.label}</span>
          <span className="material-symbols-outlined text-[15px]">close</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="ml-0 min-h-11 sm:ml-auto rounded-lg border border-[var(--admin-card-border)] px-3.5 py-2 text-[var(--admin-text-sm)] text-[var(--admin-text-muted)] transition-colors hover:text-[var(--admin-text)] hover:border-[var(--admin-accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(96,165,250,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
      >
        Clear all
      </button>
    </div>
  )
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-serif text-[1.35rem] md:text-[1.55rem] leading-[var(--admin-leading-heading)] font-semibold tracking-[var(--admin-tracking-heading)] text-[var(--admin-text)]">{title}</h2>
      {subtitle ? <p className="text-[var(--admin-text-sm)] leading-[var(--admin-leading-body)] text-[var(--admin-text-muted)] mt-1">{subtitle}</p> : null}
    </div>
  )
}

export function TimeRangeControl({
  active,
  basePath,
}: {
  active: TimeRangeValue
  basePath: string
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto [-webkit-overflow-scrolling:touch] pb-1 flex-nowrap">
      {TIME_RANGE_OPTIONS.map((opt) => {
        const isActive = active === opt.value
        return (
          <Link
            key={opt.value}
            href={`${basePath}?range=${opt.value}`}
            className={`inline-flex min-h-11 shrink-0 items-center justify-center px-3.5 py-[0.45rem] rounded-lg text-[var(--admin-text-sm)] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(96,165,250,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${
              isActive
                ? 'bg-white border-[rgba(255,255,255,0.10)] text-[var(--admin-text)] shadow-[var(--admin-soft-shadow)]'
                : 'bg-white border-[rgba(255,255,255,0.10)] text-[var(--admin-text-muted)] shadow-[var(--admin-soft-shadow)] hover:text-[var(--admin-text)] hover:bg-white/90'
            }`}
          >
            {opt.label}
          </Link>
        )
      })}
    </div>
  )
}

export function AdminMetricCard({
  label,
  value,
  tone = 'neutral',
  helper,
  href,
  className,
}: {
  label: string
  value: number | string
  tone?: AdminBadgeTone
  helper?: string
  href?: string
  className?: string
}) {
  const toneClass =
    tone === 'warning'
      ? 'border-[rgba(245,158,11,0.20)] bg-[var(--admin-muted-surface)]'
      : tone === 'danger'
      ? 'border-[rgba(248,113,113,0.20)] bg-[var(--admin-muted-surface)]'
      : tone === 'success'
      ? 'border-[rgba(74,222,128,0.18)] bg-[var(--admin-panel-bg)]'
      : tone === 'primary' || tone === 'accent' || tone === 'info' || tone === 'blue'
      ? 'border-[var(--admin-accent-soft)] bg-[var(--admin-panel-bg)]'
      : 'border-[var(--admin-card-border)] bg-[var(--admin-card-bg)]'
  const valueClass =
    tone === 'warning'
      ? 'text-[var(--admin-warning)]'
      : tone === 'danger'
      ? 'text-[var(--admin-danger)]'
      : tone === 'success'
      ? 'text-[var(--admin-success)]'
      : tone === 'primary' || tone === 'accent' || tone === 'info' || tone === 'blue'
      ? 'text-[var(--admin-accent-blue)]'
      : 'text-[var(--admin-text)]'

  const card = (
    <div className={`rounded-[var(--admin-radius-xl)] border p-5 md:p-6 shadow-[var(--admin-soft-shadow)] transition-colors ${toneClass} ${href ? 'hover:border-[rgba(96,165,250,0.30)] hover:bg-[var(--admin-muted-surface)]' : ''} ${className ?? ''}`}>
      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--admin-text-muted)] font-semibold">{label}</p>
      <p className={`mt-4 text-[2.55rem] leading-[0.95] font-semibold ${valueClass}`}>{value}</p>
      {helper ? <p className="mt-2 text-[var(--admin-text-sm)] leading-[var(--admin-leading-body)] text-[var(--admin-text-muted)]">{helper}</p> : null}
      {href ? (
        <p className={`mt-4 text-[12px] font-medium ${valueClass}`}>
          View details
          <span className="material-symbols-outlined ml-1 align-[-2px] text-[14px]">arrow_forward</span>
        </p>
      ) : null}
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(96,165,250,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent rounded-[var(--admin-radius-xl)]">
        {card}
      </Link>
    )
  }

  return card
}

export function AdminFilterToolbar({
  title,
  subtitle,
  children,
  right,
  className,
}: {
  title?: string
  subtitle?: string
  children?: ReactNode
  right?: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-[var(--admin-radius-2xl)] border border-[var(--admin-card-border)] bg-[var(--admin-panel-bg)] shadow-[var(--admin-soft-shadow)] ${className ?? ''}`}>
      {(title || subtitle || right) && (
        <div className="flex flex-col gap-4 px-5 py-5 md:px-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            {title ? <h3 className="font-serif text-[1.15rem] md:text-[1.35rem] leading-[var(--admin-leading-heading)] font-semibold tracking-[var(--admin-tracking-heading)] text-[var(--admin-text)]">{title}</h3> : null}
            {subtitle ? <p className="mt-1 text-[var(--admin-text-sm)] leading-[var(--admin-leading-body)] text-[var(--admin-text-muted)]">{subtitle}</p> : null}
          </div>
          {right ? <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">{right}</div> : null}
        </div>
      )}
      {children ? <div className="border-t border-[var(--admin-divider)] px-5 md:px-7 py-5">{children}</div> : null}
    </section>
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
    <section className={`rounded-[var(--admin-radius-2xl)] border border-[var(--admin-card-border)] bg-[var(--admin-panel-bg)] shadow-[var(--admin-soft-shadow)] ${className ?? ''}`}>
      <button type="button" onClick={onToggle} className={`w-full min-h-11 px-5 py-5 flex items-start justify-between text-left md:px-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(96,165,250,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${headerClassName ?? ''}`}>
        <div className="min-w-0">
          <h2 className={`font-serif text-[1.3rem] md:text-[1.6rem] leading-[var(--admin-leading-heading)] font-semibold tracking-[var(--admin-tracking-heading)] text-[var(--admin-text)] ${titleClassName ?? ''}`}>{title}</h2>
          {subtitle ? <p className={`text-[var(--admin-text-sm)] md:text-[var(--admin-text-base)] leading-[var(--admin-leading-body)] text-[var(--admin-text-muted)] mt-2 ${subtitleClassName ?? ''}`}>{subtitle}</p> : null}
        </div>
        <span className={`material-symbols-outlined text-[var(--admin-text-muted)] transition-transform mt-1 ${open ? 'rotate-180' : ''}`}>expand_more</span>
      </button>
      {open ? <div className="px-6 md:px-8 pb-6 md:pb-7 border-t border-[var(--admin-divider)]">{children}</div> : null}
    </section>
  )
}

export function AdminSegmentedTabs({
  tabs,
  className,
}: {
  tabs: Array<{
    label: string
    href: string
    active?: boolean
    badge?: number | string
  }>
  className?: string
}) {
  return (
    <div className={`flex flex-nowrap items-stretch gap-2 overflow-x-auto [-webkit-overflow-scrolling:touch] pb-1 ${className ?? ''}`}>
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-[var(--admin-text-sm)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(96,165,250,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${
            tab.active
              ? 'border-[rgba(59,130,246,0.22)] bg-[rgba(59,130,246,0.10)] text-[var(--admin-accent-blue)] font-medium'
              : 'border-[var(--admin-card-border)] bg-white text-[var(--admin-text-muted)] hover:text-[var(--admin-text)] hover:border-[rgba(96,165,250,0.24)]'
          }`}
        >
          <span>{tab.label}</span>
          {tab.badge !== undefined ? (
            <span className="rounded-full bg-[rgba(100,116,139,0.10)] px-2 py-0.5 text-[11px] font-semibold text-[var(--admin-neutral)]">
              {tab.badge}
            </span>
          ) : null}
        </Link>
      ))}
    </div>
  )
}

export function AdminStatusBadge({
  label,
  tone = 'neutral',
}: {
  label: string
  tone?: AdminBadgeTone
}) {
  const toneClass = badgeToneClasses(tone).classes
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[12.5px] font-medium tracking-[0.03em] ${toneClass}`}>
      {label}
    </span>
  )
}

export function AdminActionButton({
  href,
  label,
  onClick,
  tone = 'primary',
  disabled,
  className,
  type = 'button',
}: {
  href?: string
  label: string
  onClick?: () => void
  tone?: 'primary' | 'secondary' | 'ghost'
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit'
}) {
  const baseClass = `inline-flex min-h-11 items-center rounded-lg border px-4 py-2.5 text-[var(--admin-text-sm)] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(96,165,250,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${className ?? ''}`
  const toneClass =
    tone === 'secondary'
      ? 'border-[var(--admin-card-border)] bg-white text-[var(--admin-text)] hover:bg-[var(--admin-muted-surface)]'
      : tone === 'ghost'
      ? 'border-transparent bg-transparent text-[var(--admin-accent-blue)] hover:bg-[rgba(59,130,246,0.08)]'
      : 'border-[rgba(96,165,250,0.24)] bg-[var(--admin-button-bg)] text-[var(--admin-accent-blue)] hover:bg-[rgba(37,99,235,0.16)]'

  if (href) {
    return (
      <Link href={href} className={`${baseClass} ${toneClass} ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
        {label}
      </Link>
    )
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${baseClass} ${toneClass} disabled:cursor-not-allowed disabled:opacity-60`}>
      {label}
    </button>
  )
}

export function AdminRowActionButton({ href, label }: { href: string; label: string }) {
  return <AdminActionButton href={href} label={label} />
}

export function AdminAlertCallout({
  title,
  children,
  tone = 'info',
  action,
  className,
}: {
  title?: string
  children: ReactNode
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral'
  action?: ReactNode
  className?: string
}) {
  const toneClass =
    tone === 'success'
      ? 'border-[rgba(74,222,128,0.20)] bg-[rgba(22,101,52,0.06)]'
      : tone === 'warning'
      ? 'border-[rgba(245,158,11,0.24)] bg-[rgba(245,158,11,0.08)]'
      : tone === 'danger'
      ? 'border-[rgba(248,113,113,0.24)] bg-[rgba(185,28,28,0.08)]'
      : tone === 'neutral'
      ? 'border-[rgba(148,163,184,0.20)] bg-[var(--admin-muted-surface)]'
      : 'border-[rgba(96,165,250,0.22)] bg-[rgba(59,130,246,0.06)]'

  return (
    <div className={`rounded-[var(--admin-radius-xl)] border p-4 md:p-5 ${toneClass} ${className ?? ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {title ? <p className="font-serif text-[var(--admin-text-base)] md:text-[var(--admin-text-md)] leading-[var(--admin-leading-heading)] font-semibold tracking-[var(--admin-tracking-heading)] text-[var(--admin-text)]">{title}</p> : null}
          <div className="mt-1 text-[var(--admin-text-sm)] md:text-[var(--admin-text-base)] leading-[var(--admin-leading-body)] text-[var(--admin-text-muted)]">{children}</div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  )
}

export function AdminStickyFooter({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`sticky bottom-0 z-20 border-t border-[var(--admin-divider)] bg-[rgba(247,251,255,0.96)] backdrop-blur-md ${className ?? ''}`}>
      <div className="mx-auto w-full px-4 sm:px-5 md:px-8 pt-3 pb-[calc(0.9rem+env(safe-area-inset-bottom))] text-[var(--admin-text-sm)] leading-[var(--admin-leading-body)]">{children}</div>
    </div>
  )
}

function StripSection({
  kind,
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  kind: 'action' | 'flight'
  title: string
  subtitle?: string
  actions?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-[var(--admin-radius-2xl)] border shadow-[var(--admin-soft-shadow)] ${stripFrameClasses(kind)} ${className ?? ''}`}>
      <div className="flex flex-col gap-4 px-5 py-5 md:px-7 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-[var(--admin-text-muted)]">
            {kind === 'action' ? 'Action Strip' : 'Flight Strip'}
          </p>
          <h3 className="mt-2 font-serif text-[1.35rem] md:text-[1.75rem] font-semibold tracking-[var(--admin-tracking-heading)] leading-[var(--admin-leading-heading)] text-[var(--admin-text)]">{title}</h3>
          {subtitle ? <p className="mt-2 text-[var(--admin-text-sm)] md:text-[var(--admin-text-base)] leading-[var(--admin-leading-body)] text-[var(--admin-text-muted)]">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">{actions}</div> : null}
      </div>
      {children ? <div className="border-t border-[var(--admin-divider)] px-5 md:px-7 py-5">{children}</div> : null}
    </section>
  )
}

export function ActionStrip(props: {
  title: string
  subtitle?: string
  actions?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return <StripSection kind="action" {...props} />
}

export function FlightStrip(props: {
  title: string
  subtitle?: string
  actions?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return <StripSection kind="flight" {...props} />
}

export function AdminDataTable({
  columns,
  children,
  className,
}: {
  columns: ReactNode[]
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`max-w-full overflow-x-auto overflow-y-visible rounded-[var(--admin-radius-xl)] border border-[var(--admin-card-border)] bg-[var(--admin-panel-bg)] shadow-[var(--admin-soft-shadow)] [-webkit-overflow-scrolling:touch] [&_td]:text-[var(--admin-text-base)] [&_td]:leading-[var(--admin-leading-body)] [&_td]:align-middle [&_td]:py-[0.95rem] [&_th]:align-middle ${className ?? ''}`}>
      <table className="w-full">
        <thead className="bg-[var(--admin-primary-navy)] text-white">
          <tr>
            {columns.map((column, idx) => (
              <th key={`col-${idx}`} className={`px-5 py-4 text-[12.5px] tracking-[0.11em] uppercase font-semibold text-left ${idx === columns.length - 1 ? 'text-right' : ''}`}>
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
      className={`rounded-[var(--admin-radius-xl)] border p-5 transition-colors min-h-[140px] flex flex-col justify-between shadow-[var(--admin-soft-shadow)] ${
        warn
          ? 'bg-[var(--admin-muted-surface)] border-[var(--admin-card-border)] hover:bg-white'
          : 'bg-[var(--admin-card-bg)] border-[var(--admin-card-border)] hover:bg-[var(--admin-muted-surface)]'
      }`}
    >
      <p className="text-[var(--admin-text-base)] md:text-[var(--admin-text-md)] leading-[var(--admin-leading-body)] text-[var(--admin-text-muted)] font-medium">{title}</p>
      <div>
        <p className={`text-[2.5rem] md:text-[2.65rem] leading-[0.95] font-semibold ${warn ? 'text-[var(--admin-warning)]' : 'text-[var(--admin-text)]'}`}>{value}</p>
        <p className="text-[var(--admin-text-sm)] leading-[var(--admin-leading-body)] text-[var(--admin-text-muted)] mt-1">{helper}</p>
      </div>
    </Link>
  )
}

export function StatusPill({
  label,
  tone = 'slate',
}: {
  label: string
  tone?: 'blue' | 'green' | 'amber' | 'rose' | 'slate'
}) {
  const toneClass = badgeToneClasses(tone).classes
  return <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[12.5px] font-medium tracking-[0.03em] ${toneClass}`}>{label}</span>
}

export function TabLink({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center justify-center px-4 py-2.5 rounded-lg text-[var(--admin-text-sm)] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(96,165,250,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${
        active
          ? 'bg-[var(--admin-primary-navy)] border-[var(--admin-primary-navy)] text-white font-medium'
          : 'bg-white border-[var(--admin-card-border)] text-[var(--admin-text-muted)] hover:text-[var(--admin-text)] hover:bg-[var(--admin-muted-surface)]'
      }`}
    >
      {label}
    </Link>
  )
}

export function ChartShell({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--admin-card-border)] bg-[var(--admin-card-bg)] p-4 sm:p-5 shadow-[var(--admin-soft-shadow)]">
      {(title || actions) ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          {title ? <h3 className="font-serif text-[var(--admin-text-base)] md:text-[var(--admin-text-md)] leading-[var(--admin-leading-heading)] tracking-[var(--admin-tracking-heading)] text-[var(--admin-text)]">{title}</h3> : <span />}
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  )
}
