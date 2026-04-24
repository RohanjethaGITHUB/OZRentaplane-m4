import Link from 'next/link'

type StatusPillColor = 'green' | 'blue' | 'amber' | 'red' | 'slate'

type StatusPill = {
  label: string
  color: StatusPillColor
  pulse?: boolean
}

type CtaButton = {
  label: string
  href: string
  icon?: string
}

type Props = {
  eyebrow: string
  title: string
  subtitle?: string
  statusPill?: StatusPill
  cta?: CtaButton
}

const PILL_CLASSES: Record<StatusPillColor, string> = {
  green: 'bg-green-500/15 border-green-500/30 text-green-400',
  blue:  'bg-blue-500/15  border-blue-500/30  text-blue-400',
  amber: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
  red:   'bg-red-500/15   border-red-500/30   text-red-400',
  slate: 'bg-white/[0.06] border-white/10     text-slate-400',
}

const DOT_CLASSES: Record<StatusPillColor, string> = {
  green: 'bg-green-400',
  blue:  'bg-blue-400',
  amber: 'bg-amber-400',
  red:   'bg-red-400',
  slate: 'bg-slate-500',
}

export default function PortalPageHero({ eyebrow, title, subtitle, statusPill, cta }: Props) {
  return (
    <section className="relative py-16 overflow-hidden">

      {/* Deep navy gradient — darker base for more atmosphere */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#071428] via-[#060e1c] to-[#060d18]" />

      {/* Runway lines texture */}
      <div
        className="absolute inset-0 opacity-[0.10]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, transparent, transparent 60px, rgba(255,255,255,0.035) 60px, rgba(255,255,255,0.035) 61px)',
        }}
      />

      {/* Primary radial glow — centred and deep */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 80%, rgba(59,130,246,0.15) 0%, transparent 60%)' }}
      />

      {/* Secondary glow — subtle upper warmth */}
      <div
        className="absolute inset-0 opacity-50"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.06) 0%, transparent 55%)' }}
      />

      {/* Aircraft silhouette — right edge, very faint */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-[0.035] pointer-events-none select-none hidden lg:block pr-8">
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '220px', fontVariationSettings: "'wght' 100, 'FILL' 0" }}
        >
          flight_takeoff
        </span>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-[#060d18] to-transparent" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-2xl mx-auto">

        <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-blue-400/60 mb-4">
          {eyebrow}
        </p>

        <h1 className="text-4xl md:text-5xl font-serif tracking-tight text-white mb-4 leading-tight">
          {title}
        </h1>

        {subtitle && (
          <p className="text-slate-400/90 text-[15px] leading-relaxed mb-5 max-w-lg">
            {subtitle}
          </p>
        )}

        {statusPill && (
          <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-widest ${PILL_CLASSES[statusPill.color]}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT_CLASSES[statusPill.color]} ${statusPill.pulse ? 'animate-pulse' : ''}`} />
            {statusPill.label}
          </div>
        )}

        {cta && (
          <Link
            href={cta.href}
            className="mt-5 inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-[11px] font-bold uppercase tracking-widest transition-colors shadow-[0_0_24px_rgba(37,99,235,0.35)]"
          >
            {cta.icon && (
              <span className="material-symbols-outlined text-sm">{cta.icon}</span>
            )}
            {cta.label}
          </Link>
        )}

      </div>
    </section>
  )
}
