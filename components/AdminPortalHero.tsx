import Link from 'next/link'
import type { ReactNode } from 'react'

type Props = {
  eyebrow: string
  title: string
  subtitle?: string
  actions?: ReactNode
  breadcrumbs?: {
    parentLabel: string
    parentHref: string
    currentLabel: string
  }
}

export default function AdminPortalHero({ eyebrow, title, subtitle, actions, breadcrumbs }: Props) {
  return (
    <section className="relative overflow-hidden border-b border-[var(--admin-divider)] bg-[var(--admin-panel-bg)]">

      {/* Subtle directional glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 0% 100%, rgba(26,79,214,0.08) 0%, transparent 60%)' }}
      />

      {/* Runway lines — very faint, horizontal */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, transparent, transparent 60px, rgba(12,35,64,0.05) 60px, rgba(12,35,64,0.05) 61px)',
        }}
      />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 md:px-10 py-8 md:py-11 flex flex-col sm:flex-row sm:items-end justify-between gap-4">

        <div>
          {breadcrumbs ? (
            <div className="mb-2 flex items-center gap-2 text-xs text-[#3d5a80]">
              <Link href={breadcrumbs.parentHref} className="inline-flex items-center gap-1 hover:text-[#0C2340] transition-colors">
                <span className="material-symbols-outlined text-[13px]">arrow_back</span>
                <span>{breadcrumbs.parentLabel}</span>
              </Link>
              <span>/</span>
              <span>{breadcrumbs.currentLabel}</span>
            </div>
          ) : null}
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#4b6390] mb-2">
            {eyebrow}
          </p>
          <h1 className="font-serif text-3xl md:text-[3.25rem] font-semibold text-[var(--admin-text)] tracking-[-0.02em] leading-[1.04]">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[#4b6390] text-sm md:text-[1.05rem] mt-3 max-w-4xl leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex items-center gap-3 flex-shrink-0">
            {actions}
          </div>
        )}

      </div>
    </section>
  )
}
