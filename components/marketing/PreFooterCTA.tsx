interface PreFooterCTAProps {
  heading: string
  subtext: string
  ctaLabel: string
  ctaHref: string
}

export default function PreFooterCTA({
  heading,
  subtext,
  ctaLabel,
  ctaHref,
}: PreFooterCTAProps) {
  const imageSrc = '/PreFooter.png'

  return (
    <section className="relative min-h-[320px] overflow-hidden px-6 py-24 md:px-12 lg:px-20 flex items-center justify-center">
      <img
        src={imageSrc}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0" style={{ background: 'rgba(13, 27, 62, 0.52)' }} />
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{
          height: '180px',
          background: 'linear-gradient(to bottom, transparent 0%, rgba(10, 20, 38, 0.7) 50%, rgba(10, 20, 38, 1.0) 100%)',
        }}
      />

      <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center text-center">
        <h2 className="font-serif text-4xl font-medium text-white md:text-6xl">{heading}</h2>
        <p className="mx-auto mt-4 max-w-[520px] font-sans text-base leading-relaxed text-white/75 md:text-lg">{subtext}</p>
        <a
          href={ctaHref}
          className="mx-auto mt-8 inline-block rounded-md bg-runway-amber px-8 py-3 font-sans text-sm font-bold uppercase tracking-[0.12em] text-deep-ink transition-colors hover:bg-runway-amber-hot"
        >
          {ctaLabel}
        </a>
      </div>
    </section>
  )
}
