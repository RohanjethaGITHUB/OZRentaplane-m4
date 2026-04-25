type Props = {
  bookingRef?: string
  aircraftReg?: string
  title?: string
  statusLabel?: string
  subtitle?: string
}

export default function PostFlightHero({
  bookingRef   = 'OZ-2604-10D24337',
  aircraftReg  = 'VH-KZG',
  title        = 'Post-Flight Record',
  statusLabel  = 'AWAITING FLIGHT RECORD',
  subtitle     = 'Your flight is complete. Submit your post-flight record and meter evidence for operations review.',
}: Props) {
  return (
    <section
      className="relative w-full overflow-hidden"
      style={{
        backgroundImage: 'url(/Customer/AwaitingHero.png)',
        backgroundSize: 'cover',
        backgroundPosition: '50% 100%',
      }}
    >
      {/* Base tint */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(4, 11, 26, 0.36)' }}
      />

      {/* Cinematic vignette — matching dashboard treatment */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#060d18]/40 via-transparent to-[#060d18]" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#060d18]/50 via-transparent to-[#060d18]/50" />

      {/* Bottom fade — blends into content section */}
      <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-[#060d18] to-transparent" />

      {/* Content — centred, padding-driven height like dashboard */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 py-24 md:py-28 gap-4 max-w-2xl mx-auto">

        {/* Metadata eyebrow */}
        <p
          className="text-[9px] font-bold uppercase text-white/45"
          style={{ letterSpacing: '0.30em' }}
        >
          Booking Ref:&nbsp;<span className="text-white/60">{bookingRef}</span>
          &nbsp;&nbsp;·&nbsp;&nbsp;
          Aircraft:&nbsp;<span className="text-white/60">{aircraftReg}</span>
        </p>

        {/* Serif title */}
        <h1
          className="font-serif font-light tracking-tight text-white leading-tight"
          style={{ fontSize: 'clamp(2.1rem, 4vw, 3.1rem)' }}
        >
          {title}
        </h1>

        {/* Amber status pill */}
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-amber-400/25 bg-amber-500/10 text-amber-300/80"
          style={{ boxShadow: '0 0 24px rgba(245,158,11,0.10)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80 flex-shrink-0" />
          <span
            className="text-[9px] font-bold uppercase"
            style={{ letterSpacing: '0.23em' }}
          >
            {statusLabel}
          </span>
        </div>

        {/* Supporting text */}
        <p className="text-white/55 text-[13px] leading-relaxed max-w-md mt-1">
          {subtitle}
        </p>

      </div>
    </section>
  )
}
