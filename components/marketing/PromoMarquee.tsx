import Link from 'next/link'

export const PROMO_MARQUEE_HEIGHT = 40

/**
 * Full-width sale strip. Text scrolls right → left; hovering pauses it, and
 * reduced-motion users get a static line.
 *
 *   placement="fixed"  — public site: pinned above the navbar (layout offsets content).
 *   placement="inline" — customer portal: sits in the page flow directly under the
 *                        fixed portal navbar, so no sticky/fixed offsets change.
 *
 * Colours follow the site navbar (navy #16305c) with the brand gold accent, so the
 * strip reads as part of the header rather than a separate black bar.
 */
export default function PromoMarquee({
  text,
  href = '/black-friday',
  ctaLabel = 'Shop the sale',
  placement = 'fixed',
}: {
  text: string
  href?: string
  ctaLabel?: string
  placement?: 'fixed' | 'inline'
}) {
  // Admin text is "item · item · item". A leading "Black Friday Sale —" is
  // dropped because every loop already starts with the styled label.
  const items = text
    .replace(/^\s*black\s+friday(\s+sale)?\s*[—:–-]?\s*/i, '')
    .split('·')
    .map((t) => t.trim())
    .filter(Boolean)

  // One "run"; rendered twice so the -50% translate loops seamlessly.
  const run = (key: string, hidden = false) => (
    <div key={key} className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {Array.from({ length: 3 }).map((_, rep) => (
        <span key={`${key}-${rep}`} className="flex items-center">
          <span className="whitespace-nowrap rounded-full bg-[#ffcf5c] px-3 py-[3px] text-[11.5px] font-extrabold uppercase tracking-[0.16em] text-[#0f2547] shadow-[0_1px_0_rgba(255,255,255,0.35)_inset]">
            Black <span className="italic">Friday</span> Sale
          </span>
          {items.map((item, i) => (
            <span key={i} className="flex items-center">
              <span className="whitespace-nowrap px-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/90">{item}</span>
              <span className="text-[10px] text-[#ffcf5c]/80" aria-hidden="true">✦</span>
            </span>
          ))}
          <span className="w-6" />
        </span>
      ))}
    </div>
  )

  const positionClass = placement === 'fixed' ? 'fixed inset-x-0 top-0 z-[60]' : 'relative z-30 w-full'

  return (
    <Link
      href={href}
      aria-label={`${text} — view the Black Friday offer`}
      className={`oz-marquee group flex items-center overflow-hidden text-white ${positionClass}`}
      style={{
        height: PROMO_MARQUEE_HEIGHT,
        background: 'linear-gradient(90deg, #0f2547 0%, #1a3a70 50%, #0f2547 100%)',
        borderBottom: '1px solid rgba(255, 207, 92, 0.35)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
      }}
    >
      {/* edge fades */}
      <span className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#0f2547] to-transparent" />
      <span className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[#0f2547] via-[#0f2547]/80 to-transparent" />

      <div className="oz-marquee-track flex w-max">
        {run('a')}
        {run('b', true)}
      </div>

      <span className="absolute right-3 z-20 hidden items-center gap-1 rounded-full bg-[#ffcf5c] px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#0f2547] transition-colors group-hover:bg-white sm:flex">
        {ctaLabel}
        <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
      </span>
    </Link>
  )
}
