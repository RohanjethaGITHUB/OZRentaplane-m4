import Image from 'next/image'
import Link from 'next/link'
import { formatPromotionDate, type PromotionRow, type PromotionStatus } from '@/lib/promotions'
import SaleCountdown from './SaleCountdown'

export type BlackFridayTier = {
  id: string
  name: string
  hours: number
  rate_per_hour: number
  bonus: number
  freeCheckout: boolean
  totalHours: number
  price: number
  effectiveRate: number
  slug: string
}

function aud(n: number, digits = 0) {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: digits, minimumFractionDigits: digits })
}

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`} aria-hidden="true">{name}</span>
}

// Site palette: navy (header/footer) + brand gold.
const GOLD = '#ffcf5c'

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.22em] text-[#ffcf5c]">
      <span className="h-px w-6 bg-[#ffcf5c]/70" aria-hidden="true" />
      {children}
    </p>
  )
}

/** Presentational Black Friday sale page (data is loaded by page.tsx). */
export default function BlackFridayView({
  promo,
  status,
  tiers,
  isLoggedIn,
}: {
  promo: PromotionRow | null
  status: PromotionStatus
  tiers: BlackFridayTier[]
  isLoggedIn: boolean
}) {
  const isLive = status === 'live'
  const maxBonus = tiers.reduce((m, t) => Math.max(m, t.bonus), 0)
  const headlineMain = promo?.headline?.split(' with ')[0] || 'Free checkout flight'
  const headlineRest = promo?.headline?.includes(' with ')
    ? `with ${promo.headline.split(' with ').slice(1).join(' with ')}`
    : 'with every flight block'

  const buyHref = (slug?: string) => {
    const target = slug ? `/dashboard/pricing?package=${slug}` : '/dashboard/pricing'
    return isLoggedIn ? target : `/login?next=${encodeURIComponent(target)}`
  }

  const closedLabel = status === 'scheduled' ? 'Opens soon' : status === 'ended' ? 'Sale ended' : 'Not on sale'

  return (
    <main className="bg-[#0a1a33] text-white">
      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden pt-[84px]">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(110%_80%_at_80%_20%,#2a5a96_0%,#163a6b_35%,#0f2547_65%,#0a1a33_100%)]" />
        <Image src="/CloudLayerA.webp" alt="" fill className="-z-10 object-cover object-bottom opacity-[0.18] mix-blend-screen" sizes="100vw" />
        <div className="pointer-events-none absolute -right-32 top-10 -z-10 h-[460px] w-[460px] rounded-full bg-[#ffcf5c]/[0.12] blur-[130px]" />
        <div className="pointer-events-none absolute -left-40 bottom-0 -z-10 h-[380px] w-[380px] rounded-full bg-[#5b9bff]/[0.12] blur-[120px]" />

        <div className="mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-10 px-4 pb-16 pt-10 sm:px-6 md:px-10 lg:grid-cols-[1.05fr_1fr] lg:gap-6 lg:pb-24 lg:pt-14">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#ffcf5c]/40 bg-[#ffcf5c]/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#ffcf5c]">
              {isLive ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ffcf5c]" aria-hidden="true" /> : null}
              {isLive ? 'Sale on now' : status === 'scheduled' ? 'Coming soon' : 'OZ Rent A Plane'}
            </span>

            <h1 className="mt-5 font-sans font-black italic leading-[0.88] tracking-[-0.02em]">
              <span className="block text-[clamp(52px,14vw,124px)] text-white lg:text-[clamp(64px,8.5vw,124px)]">BLACK</span>
              <span className="block bg-gradient-to-r from-[#ffe08f] via-[#ffcf5c] to-[#f2a93b] bg-clip-text text-[clamp(52px,14vw,124px)] text-transparent lg:text-[clamp(64px,8.5vw,124px)]">
                FRIDAY
              </span>
            </h1>

            <p className="mt-6 text-[clamp(22px,3vw,34px)] font-extrabold uppercase leading-tight">{headlineMain}</p>
            <p className="mt-1 text-[clamp(13px,1.5vw,17px)] font-bold uppercase tracking-[0.12em] text-[#ffcf5c]">{headlineRest}</p>
            <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-white/80">
              No discount gimmicks. You pay the normal block time price and get more flying: every package includes your
              checkout flight{maxBonus > 0 ? `, and bigger blocks earn up to ${maxBonus} bonus flight hours` : ''}.
            </p>

            {(isLive || status === 'scheduled') && promo ? (
              <div className="mt-7 w-full max-w-sm rounded-2xl border border-white/15 bg-white/[0.06] p-4 backdrop-blur-md">
                <SaleCountdown target={isLive ? promo.ends_at : promo.starts_at} label={isLive ? 'Sale ends in' : 'Sale starts in'} />
              </div>
            ) : null}

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {isLive ? (
                <Link
                  href={buyHref()}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#ffcf5c] px-7 py-4 text-[13px] font-extrabold uppercase tracking-[0.14em] text-[#0f2547] shadow-[0_14px_40px_rgba(255,207,92,0.35)] transition-all hover:-translate-y-0.5 hover:bg-[#ffd978]"
                >
                  Claim your flight block
                  <Icon name="arrow_forward" className="text-[18px]" />
                </Link>
              ) : (
                <Link
                  href="/pricing"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-4 text-[13px] font-extrabold uppercase tracking-[0.14em] text-[#0f2547] transition-colors hover:bg-[#ffcf5c]"
                >
                  View current pricing
                  <Icon name="arrow_forward" className="text-[18px]" />
                </Link>
              )}
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/30 bg-white/[0.04] px-7 py-4 text-[13px] font-bold uppercase tracking-[0.14em] text-white transition-colors hover:border-white/60 hover:bg-white/10"
              >
                How it works
              </a>
            </div>

            {status === 'ended' || status === 'disabled' ? (
              <p className="mt-6 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-[15px] text-white/85">
                {status === 'ended'
                  ? 'The Black Friday sale has ended. Thanks to everyone who flew with us — our regular block time packages are still available.'
                  : 'There’s no sale running right now — our regular block time packages are always available.'}
              </p>
            ) : null}
          </div>

          {/* aircraft */}
          <div className="relative mx-auto w-full max-w-[660px] pt-12 sm:pt-8 lg:max-w-none lg:pt-0">
            <div className="absolute inset-x-[12%] bottom-[6%] h-10 rounded-[50%] bg-[#020a18]/60 blur-2xl" />
            <Image
              src="/CessnaImageTrans-1.png"
              alt="Cessna 172N VH-KZG in flight"
              width={1536}
              height={1024}
              priority
              className="relative w-full drop-shadow-[0_30px_60px_rgba(2,10,24,0.55)] motion-safe:animate-[planeIdle_6s_ease-in-out_infinite]"
              sizes="(min-width: 1024px) 50vw, 90vw"
            />
            <div className="absolute left-0 top-0 -rotate-6 rounded-2xl border border-[#ffcf5c]/60 bg-[#0f2547]/85 px-4 py-2.5 text-center shadow-[0_12px_30px_rgba(2,10,24,0.4)] backdrop-blur sm:left-4 sm:px-5 sm:py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/80">Included</p>
              <p className="text-base font-black uppercase leading-tight text-[#ffcf5c] sm:text-xl">
                Free
                <br />
                checkout
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── HIGHLIGHTS STRIP ──────────────────────────────────────────────── */}
      <section className="relative z-10 -mt-6 px-4 sm:px-6 md:px-10">
        <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-3 rounded-3xl border border-white/15 bg-[#132e57]/90 p-3 shadow-[0_24px_60px_rgba(2,10,24,0.35)] backdrop-blur-md sm:grid-cols-3 sm:p-4">
          {[
            { icon: 'redeem', title: 'Free checkout flight', body: 'Included with every package' },
            { icon: 'add_circle', title: maxBonus > 0 ? `Up to +${maxBonus} bonus hours` : 'More flying', body: 'Added the moment you pay' },
            { icon: 'local_gas_station', title: 'Wet hire', body: 'Fuel and GST included' },
          ].map((item) => (
            <div key={item.title} className="flex items-center gap-3.5 rounded-2xl bg-white/[0.05] px-4 py-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ffcf5c]/15 text-[#ffcf5c]">
                <Icon name={item.icon} className="text-[22px]" />
              </span>
              <div>
                <p className="text-[15px] font-bold text-white">{item.title}</p>
                <p className="text-[13px] text-white/75">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── TIERS ─────────────────────────────────────────────────────────── */}
      <section className="relative px-4 py-16 sm:px-6 sm:py-20 md:px-10">
        <div className="mx-auto max-w-[1240px]">
          <div className="mb-10 flex flex-col gap-4 md:mb-12 md:flex-row md:items-end md:justify-between">
            <div>
              <Eyebrow>Pick your block</Eyebrow>
              <h2 className="mt-3 text-[30px] font-extrabold leading-tight tracking-tight sm:text-4xl md:text-5xl">More hours. Same price.</h2>
            </div>
            <p className="max-w-md text-[15px] leading-relaxed text-white/80">
              Wet hire in the Cessna 172N VH-KZG from Bankstown. Fuel and GST included; landing fees are charged per flight as usual.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {tiers.map((t) => {
              const top = t.bonus > 0 && t.bonus === maxBonus
              return (
                <article
                  key={t.id}
                  className={`relative flex flex-col rounded-3xl border p-6 transition-all duration-300 hover:-translate-y-1 sm:p-7 ${
                    top
                      ? 'border-[#ffcf5c] bg-gradient-to-b from-[#1d3f73] to-[#132e57] shadow-[0_24px_70px_rgba(255,207,92,0.18)]'
                      : 'border-white/15 bg-gradient-to-b from-[#16365f] to-[#102a4d] shadow-[0_18px_50px_rgba(2,10,24,0.3)] hover:border-white/30'
                  }`}
                >
                  {top ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#ffcf5c] px-3.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#0f2547] shadow-md">
                      Best value
                    </span>
                  ) : null}

                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-white/80">{t.name}</p>
                    {t.bonus > 0 ? (
                      <span className="rounded-full bg-[#ffcf5c]/15 px-2.5 py-1 text-[11px] font-extrabold text-[#ffcf5c]">+{t.bonus} hr</span>
                    ) : null}
                  </div>
                  <p className="mt-3 font-sans text-[56px] font-black leading-none tracking-tight">
                    {t.hours}
                    <span className="ml-1.5 text-xl font-extrabold text-white/75">HR</span>
                  </p>

                  <ul className="mt-6 space-y-3 text-[15px]">
                    <li className="flex items-start gap-2.5">
                      <Icon name={t.freeCheckout ? 'check_circle' : 'cancel'} className={`mt-0.5 text-[20px] ${t.freeCheckout ? 'text-[#ffcf5c]' : 'text-white/40'}`} />
                      <span className={t.freeCheckout ? 'font-semibold text-white' : 'text-white/60'}>Free checkout flight</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Icon name={t.bonus > 0 ? 'add_circle' : 'remove'} className={`mt-0.5 text-[20px] ${t.bonus > 0 ? 'text-[#ffcf5c]' : 'text-white/40'}`} />
                      <span className={t.bonus > 0 ? 'font-semibold text-white' : 'text-white/60'}>
                        {t.bonus > 0 ? `+${t.bonus} bonus flight ${t.bonus === 1 ? 'hour' : 'hours'}` : 'No bonus hours'}
                      </span>
                    </li>
                  </ul>

                  <div className="mt-6 rounded-2xl bg-[#0a1a33]/60 p-4">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/75">You fly</span>
                      <span className="text-xl font-extrabold text-white">{t.totalHours} hrs</span>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/75">You pay</span>
                      <span className="text-xl font-extrabold text-white">{aud(t.price)}</span>
                    </div>
                    <p className="mt-2 border-t border-white/10 pt-2 text-right text-[13px] text-white/75">
                      {t.bonus > 0 ? (
                        <>
                          <span className="font-semibold text-[#ffcf5c]">{aud(t.effectiveRate, 2)}/hr</span>
                          <span className="text-white/60 line-through decoration-white/40"> {aud(Number(t.rate_per_hour))}/hr</span>
                        </>
                      ) : (
                        `${aud(Number(t.rate_per_hour))}/hr`
                      )}
                    </p>
                  </div>

                  <div className="flex-1" />

                  {isLive ? (
                    <Link
                      href={buyHref(t.slug)}
                      className={`mt-6 flex items-center justify-center gap-1.5 rounded-xl px-4 py-3.5 text-[12px] font-extrabold uppercase tracking-[0.14em] transition-colors ${
                        top ? 'bg-[#ffcf5c] text-[#0f2547] hover:bg-[#ffd978]' : 'bg-white text-[#0f2547] hover:bg-[#ffcf5c]'
                      }`}
                    >
                      Get {t.totalHours} hours
                      <Icon name="arrow_forward" className="text-[16px]" />
                    </Link>
                  ) : (
                    <span className="mt-6 block rounded-xl border border-white/20 px-4 py-3.5 text-center text-[12px] font-bold uppercase tracking-[0.14em] text-white/70">
                      {closedLabel}
                    </span>
                  )}
                </article>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────────── */}
      <section id="how-it-works" className="scroll-mt-32 bg-[#0f2547] px-4 py-16 sm:px-6 sm:py-20 md:px-10">
        <div className="mx-auto max-w-[1240px]">
          <div className="max-w-2xl">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-3 text-[28px] font-extrabold leading-tight tracking-tight sm:text-4xl">From checkout to solo hire in three steps</h2>
          </div>

          <ol className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
            {[
              { icon: 'shopping_bag', title: 'Choose your block', body: 'Pick 10, 25, 50 or 100 hours and pay securely by card. New to OZ Rent A Plane? You can buy before your checkout during the sale.' },
              { icon: 'flight_takeoff', title: 'Fly your free checkout', body: 'Upload your licence, medical and photo ID, then book your checkout flight with our instructor. It’s included — you won’t be charged for it.' },
              { icon: 'schedule', title: 'Fly your hours', body: 'Once you’re cleared, book VH-KZG any time. Your hours — including any bonus — come off your package automatically.' },
            ].map((step, i) => (
              <li key={step.title} className="relative rounded-3xl border border-white/15 bg-white/[0.05] p-6 sm:p-7">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ffcf5c] text-lg font-black text-[#0f2547]">{i + 1}</span>
                  <Icon name={step.icon} className="text-[24px] text-[#ffcf5c]" />
                </div>
                <h3 className="mt-5 text-lg font-bold text-white">{step.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-white/80">{step.body}</p>
              </li>
            ))}
          </ol>

          {/* Why more hours */}
          <div className="relative mt-8 overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-[#1d3f73] to-[#132e57] p-6 sm:p-10">
            <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-[#ffcf5c]/15 blur-3xl" />
            <div className="relative grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-white/80">Why more hours, not a discount?</p>
                <p className="mt-3 text-2xl font-extrabold leading-snug sm:text-3xl">
                  Every dollar still buys flying. You just get <span style={{ color: GOLD }}>more of it</span>.
                </p>
              </div>
              <ul className="grid grid-cols-1 gap-3 text-[15px] text-white/90 sm:grid-cols-2">
                {[
                  { icon: 'verified', text: 'Checkout flight included with every package' },
                  { icon: 'lock', text: 'Same locked-in rate for every hour you fly' },
                  { icon: 'add_circle', text: 'Bonus hours added the moment you pay' },
                  { icon: 'local_gas_station', text: 'Wet hire — fuel and GST included' },
                ].map((item) => (
                  <li key={item.text} className="flex items-start gap-3 rounded-2xl bg-[#0a1a33]/45 px-4 py-3">
                    <Icon name={item.icon} className="mt-0.5 shrink-0 text-[20px] text-[#ffcf5c]" />
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── CLOSING CTA ───────────────────────────────────────────────────── */}
      {isLive ? (
        <section className="px-4 py-14 sm:px-6 md:px-10">
          <div className="mx-auto flex max-w-[1240px] flex-col items-start gap-6 rounded-3xl bg-gradient-to-r from-[#ffd978] via-[#ffcf5c] to-[#f2a93b] p-7 text-[#0f2547] shadow-[0_24px_60px_rgba(255,207,92,0.25)] sm:p-10 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[12px] font-extrabold uppercase tracking-[0.2em] text-[#0f2547]/80">Limited time</p>
              <p className="mt-1 text-2xl font-black leading-tight sm:text-3xl">Lock in your block before the sale ends.</p>
              {promo ? <p className="mt-1.5 text-[15px] font-semibold text-[#0f2547]/85">Ends {formatPromotionDate(promo.ends_at)} (Sydney time)</p> : null}
            </div>
            <Link
              href={buyHref()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0f2547] px-7 py-4 text-[13px] font-extrabold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#163a6b] md:w-auto"
            >
              Claim your flight block
              <Icon name="arrow_forward" className="text-[18px]" />
            </Link>
          </div>
        </section>
      ) : null}

      {/* ── OFFER TERMS ───────────────────────────────────────────────────── */}
      <section className="px-4 pb-16 pt-2 sm:px-6 sm:pb-20 md:px-10">
        <div className="mx-auto max-w-[1240px] rounded-3xl border border-white/15 bg-white/[0.04] p-6 sm:p-8">
          <div className="flex items-center gap-2.5">
            <Icon name="description" className="text-[22px] text-[#ffcf5c]" />
            <h2 className="text-[15px] font-bold uppercase tracking-[0.16em] text-white">Offer terms</h2>
          </div>
          <ul className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 text-[14px] leading-relaxed text-white/80 md:grid-cols-2">
            {promo ? (
              <li className="flex gap-2.5">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ffcf5c]" aria-hidden="true" />
                <span>
                  Offer runs <strong className="font-semibold text-white">{formatPromotionDate(promo.starts_at)}</strong> to{' '}
                  <strong className="font-semibold text-white">{formatPromotionDate(promo.ends_at)}</strong> (Sydney time).
                </span>
              </li>
            ) : null}
            {[
              'Applies to block time packages bought online during the sale.',
              'One free checkout flight per package.',
              'Bonus hours are added at purchase and used under the same package terms.',
              'Normal checkout requirements (licence, medical, photo ID and flight review) still apply.',
              'Landing fees on block time flights are charged per flight as usual.',
            ].map((term) => (
              <li key={term} className="flex gap-2.5">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ffcf5c]" aria-hidden="true" />
                <span>{term}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 border-t border-white/10 pt-5 text-[14px] text-white/80">
            See our{' '}
            <Link href="/terms-and-conditions" className="font-semibold text-[#ffcf5c] underline-offset-4 hover:underline">
              terms and conditions
            </Link>{' '}
            or{' '}
            <Link href="/contact-us" className="font-semibold text-[#ffcf5c] underline-offset-4 hover:underline">
              contact us
            </Link>{' '}
            with any questions.
          </p>
        </div>
      </section>
    </main>
  )
}
