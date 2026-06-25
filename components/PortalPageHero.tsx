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

type MetaCard = {
  label: string
  value: string
}

type Props = {
  eyebrow: string
  title: string
  subtitle?: string
  note?: string
  backgroundImage?: string
  backgroundPosition?: string
  statusPill?: StatusPill
  backHref?: string
  backLabel?: string
  cta?: CtaButton
  secondaryCta?: { label: string; href: string }
  metaCards?: MetaCard[]
  variant?: 'dark' | 'light'
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

export default function PortalPageHero({ eyebrow, title, subtitle, note, backgroundImage, backgroundPosition, statusPill, backHref, backLabel, cta, secondaryCta, metaCards, variant = 'dark' }: Props) {
  const isLight = variant === 'light'
  const hasPhotoBackground = Boolean(backgroundImage)
  const useLightText = isLight && !hasPhotoBackground
  return (
    <section
      className="relative overflow-hidden -mt-6"
      style={{
        minHeight: hasPhotoBackground ? '460px' : isLight ? '360px' : '460px',
        marginLeft: 'calc(-50vw + 50%)',
        marginRight: 'calc(-50vw + 50%)',
        width: '100vw',
        ...(backgroundImage
          ? {
              backgroundImage: `url(${backgroundImage})`,
              backgroundSize: 'cover',
              backgroundPosition: backgroundPosition ?? 'center bottom',
            }
          : isLight
            ? { background: 'linear-gradient(180deg, #dde8f5 0%, #f0f4fa 100%)' }
            : { background: 'linear-gradient(135deg, #0d1b3e 0%, #1a3a6b 50%, #0f2654 100%)' }),
      }}
    >

      {/* Runway lines texture */}
      {!hasPhotoBackground && (
        <div
          className={`absolute inset-0 ${isLight ? 'opacity-[0.04]' : 'opacity-[0.10]'}`}
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, transparent, transparent 60px, rgba(255,255,255,0.035) 60px, rgba(255,255,255,0.035) 61px)',
          }}
        />
      )}

      {/* Primary radial glow — centred and deep */}
      {!hasPhotoBackground && !isLight && (
        <>
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse at 50% 80%, rgba(59,130,246,0.15) 0%, transparent 60%)' }}
          />
          <div
            className="absolute inset-0 opacity-50"
            style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.06) 0%, transparent 55%)' }}
          />
        </>
      )}

      {/* Aircraft silhouette — right edge, very faint */}
      {!hasPhotoBackground && (
        <div className={`absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none select-none hidden lg:block pr-8 ${isLight ? 'opacity-[0.05]' : 'opacity-[0.035]'}`}>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '220px', fontVariationSettings: "'wght' 100, 'FILL' 0" }}
          >
            flight_takeoff
          </span>
        </div>
      )}

      {/* Bottom fade */}
      {!hasPhotoBackground && (
        <div className={`absolute bottom-0 inset-x-0 h-12 ${isLight ? 'bg-gradient-to-t from-[#f0f4fa] to-transparent' : 'bg-gradient-to-t from-[#060d18] to-transparent'}`} />
      )}

      {/* Content */}
      {!backgroundImage && (
        /* Heavy overlay for gradient-only fallback - no photo underneath */
        <div className="absolute inset-0" style={{ background: isLight ? 'linear-gradient(180deg, rgba(221,232,245,0.35) 0%, rgba(240,244,250,0.08) 100%)' : 'linear-gradient(90deg, rgba(8,20,50,0.88) 0%, rgba(8,20,50,0.70) 50%, rgba(8,20,50,0.25) 100%)' }} />
      )}

      <div className={`relative z-10 max-w-[1440px] mx-auto px-4 md:px-5 lg:px-6 ${isLight ? 'py-12 md:py-16' : 'py-16 md:py-20'}`}>
        {backHref && (
          <Link
            href={backHref}
            className={useLightText ? 'inline-flex items-center gap-1.5 text-[#6b7280] hover:text-[#152d5a] text-[13px] font-medium mb-4 transition-colors' : 'inline-flex items-center gap-1.5 text-white/70 hover:text-white text-[13px] font-medium mb-4 transition-colors'}
          >
            <span className="material-symbols-outlined text-[15px]">arrow_back</span>
            {backLabel ?? 'Back'}
          </Link>
        )}
        {eyebrow && (
          <div className={`text-[11px] font-semibold tracking-[0.2em] uppercase mb-4 font-sans ${useLightText ? 'text-[#1a4fd6]' : 'text-white/70'}`}>
            {eyebrow}
          </div>
        )}
        <h1
          className={`text-4xl md:text-5xl lg:text-6xl font-normal leading-tight mb-4 max-w-2xl ${useLightText ? 'text-[#152d5a]' : 'text-white font-bold'}`}
          style={{ fontFamily: 'Newsreader, Georgia, serif' }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className={`text-[15px] max-w-lg leading-relaxed ${useLightText ? 'text-[#4a5568]' : 'text-white/80'}`}>
            {subtitle}
          </p>
        )}
        {note && <p className={`mt-3 text-xs ${useLightText ? 'text-[#64748b]' : 'text-white/60'}`}>{note}</p>}

        {metaCards && metaCards.length > 0 && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 max-w-2xl">
            {metaCards.map((card) => (
              <div
                key={card.label}
                className={useLightText
                  ? 'rounded-2xl border border-[#dbe7f4] bg-white/85 px-4 py-3 shadow-[0_8px_24px_rgba(21,45,90,0.06)]'
                  : 'rounded-2xl border border-white/15 bg-white/10 backdrop-blur-sm px-4 py-3 shadow-[0_8px_24px_rgba(8,20,50,0.18)]'
                }
              >
                <p className={useLightText ? 'text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4b6390] mb-1' : 'text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60 mb-1'}>
                  {card.label}
                </p>
                <p className={useLightText ? 'text-sm font-medium text-[#152d5a] font-mono break-all' : 'text-sm font-medium text-white break-all'}>
                  {card.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {statusPill && (
          <div className={`mt-5 inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-widest ${PILL_CLASSES[statusPill.color]}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT_CLASSES[statusPill.color]} ${statusPill.pulse ? 'animate-pulse' : ''}`} />
            {statusPill.label}
          </div>
        )}

        {(cta || secondaryCta) && (
          <div className="mt-5 flex flex-row gap-3 flex-wrap">
            {cta && (
              <Link
                href={cta.href}
                className="inline-flex items-center gap-2 bg-[#f59e0b] hover:bg-[#d97706] text-[#0d1b3e] font-bold text-[14px] px-6 py-3 rounded-xl transition-colors"
              >
                {cta.icon && (
                  <span className="material-symbols-outlined text-sm">{cta.icon}</span>
                )}
                {cta.label}
              </Link>
            )}
            {secondaryCta && (
              <Link
                href={secondaryCta.href}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-white/40 text-white text-[14px] font-semibold hover:bg-white/10 transition-colors"
              >
                {secondaryCta.label}
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
