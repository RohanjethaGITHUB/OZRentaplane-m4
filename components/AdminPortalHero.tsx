import type { ReactNode } from 'react'

type Props = {
  eyebrow: string
  title: string
  subtitle?: string
  actions?: ReactNode
}

export default function AdminPortalHero({ eyebrow, title, subtitle, actions }: Props) {
  return (
    <section className="relative border-b border-white/[0.05] overflow-hidden">

      {/* Subtle directional glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 0% 100%, rgba(59,130,246,0.06) 0%, transparent 60%)' }}
      />

      {/* Runway lines — very faint, horizontal */}
      <div
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, transparent, transparent 60px, rgba(255,255,255,0.04) 60px, rgba(255,255,255,0.04) 61px)',
        }}
      />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 md:px-10 py-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">

        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.35em] text-[#a7c8ff]/40 mb-2">
            {eyebrow}
          </p>
          <h1 className="font-serif text-3xl font-light text-[#e2e2e6] tracking-tight leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[#8a9ab5] text-sm mt-2 max-w-xl leading-relaxed">
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
