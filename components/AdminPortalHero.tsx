import Link from 'next/link'
import type { ReactNode } from 'react'

type Props = {
  eyebrow: string
  title: string
  subtitle?: string
  actions?: ReactNode
  variant?: 'default' | 'command-board'
  breadcrumbs?: {
    parentLabel: string
    parentHref: string
    currentLabel: string
  }
}

export default function AdminPortalHero({
  eyebrow,
  title,
  subtitle,
  actions,
  variant = 'default',
  breadcrumbs,
}: Props) {
  const isCommandBoard = variant === 'command-board'

  return (
    <section
      className={`relative overflow-hidden border-b border-[var(--admin-divider)] ${
        isCommandBoard
          ? 'bg-[linear-gradient(180deg,rgba(231,239,247,0.98),rgba(242,246,251,0.94))]'
          : 'bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(240,246,252,0.98))]'
      }`}
    >

      {/* Subtle directional glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isCommandBoard
            ? 'radial-gradient(ellipse at 0% 100%, rgba(26,79,214,0.07) 0%, transparent 62%)'
            : 'radial-gradient(ellipse at 0% 100%, rgba(26,79,214,0.10) 0%, transparent 60%)',
        }}
      />

      {/* Runway lines — very faint, horizontal */}
      <div
        className={`absolute inset-0 pointer-events-none ${isCommandBoard ? 'opacity-[0.025]' : 'opacity-[0.04]'}`}
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, transparent, transparent 60px, rgba(12,35,64,0.05) 60px, rgba(12,35,64,0.05) 61px)',
        }}
      />

      <div
        className={`relative z-10 mx-auto flex max-w-[1400px] flex-col gap-4 px-4 sm:px-6 md:px-10 ${
          isCommandBoard
            ? 'gap-3 py-4 md:py-[18px] lg:flex-row lg:items-end lg:justify-between'
            : 'py-6 md:py-11 lg:flex-row lg:items-end lg:justify-between'
        }`}
      >

        <div className={`min-w-0 ${isCommandBoard ? 'pl-[calc(4.7rem+env(safe-area-inset-left))] sm:pl-0' : ''}`}>
          {breadcrumbs ? (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs sm:text-[12.5px] text-[var(--admin-text-muted)]">
              <Link href={breadcrumbs.parentHref} className="inline-flex items-center gap-1 hover:text-[var(--admin-text)] transition-colors">
                <span className="material-symbols-outlined text-[13px]">arrow_back</span>
                <span>{breadcrumbs.parentLabel}</span>
              </Link>
              <span>/</span>
              <span>{breadcrumbs.currentLabel}</span>
            </div>
          ) : null}
          <p className={`mb-2 text-[var(--admin-text-muted)] ${isCommandBoard ? 'text-[11px] font-bold uppercase leading-[1.2] tracking-[0.18em]' : 'text-[11.5px] font-bold uppercase tracking-[0.28em]'}`}>
            {eyebrow}
          </p>
          <h1
            className={`text-[var(--admin-text)] tracking-[var(--admin-tracking-heading)] leading-[var(--admin-leading-heading)] ${
              isCommandBoard
                ? 'font-sans text-[24px] font-bold leading-[1.2] sm:text-[24px] md:text-[26px]'
                : 'font-serif text-[var(--admin-text-page-title)] md:text-[var(--admin-text-page-title)] font-semibold'
            }`}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className={`mt-3 max-w-4xl text-[var(--admin-text-muted)] leading-[var(--admin-leading-body)] ${
                isCommandBoard
                  ? 'mt-2 text-[14px] font-medium leading-[1.45]'
                  : 'text-[var(--admin-text-sm)] sm:text-[var(--admin-text-md)]'
              }`}
            >
              {subtitle}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-start flex-shrink-0">
            {actions}
          </div>
        )}

      </div>
    </section>
  )
}
