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

  const buyHref = (slug?: string) => {
    const target = slug ? `/dashboard/pricing?package=${slug}` : '/dashboard/pricing'
    return isLoggedIn ? target : `/login?next=${encodeURIComponent(target)}`
  }

  return (
    <main className="bg-[#05070d] text-white">
      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden pt-[84px]">
        {/* sky */}
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(120%_90%_at_78%_35%,#1d4f7c_0%,#0f2a47_38%,#070d18_72%,#05070d_100%)]" />
        <Image src="/CloudLayerA.webp" alt="" fill priority={false} className="-z-10 object-cover opacity-[0.12] mix-blend-screen" sizes="100vw" />
        <div className="absolute inset-y-0 left-0 -z-10 w-full bg-gradient-to-r from-[#05070d] via-[#05070d]/85 to-transparent md:w-[62%]" />
        <div className="pointer-events-none absolute -right-24 top-24 -z-10 h-[420px] w-[420px] rounded-full bg-[#ffcf5c]/10 blur-[120px]" />

        <div className="mx-auto grid max-w-[1320px] grid-cols-1 items-center gap-8 px-4 pb-14 pt-8 sm:gap-10 sm:px-6 sm:pb-16 sm:pt-10 md:px-10 lg:grid-cols-[1.05fr_1fr] lg:pb-20 lg:pt-12">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-white/80 sm:text-[13px] sm:tracking-[0.28em]">OZ Rent A Plane</p>
            <h1 className="mt-5 font-sans font-black italic leading-[0.86] tracking-[-0.02em]">
              <span className="block text-[clamp(52px,15vw,132px)] text-[#f7f4ec] lg:text-[clamp(60px,9.5vw,132px)]">BLACK</span>
              <span className="block text-[clamp(52px,15vw,132px)] text-[#ffcf5c] lg:text-[clamp(60px,9.5vw,132px)] [text-shadow:0_8px_40px_rgba(255,207,92,0.25)]">FRIDAY</span>
            </h1>

            <div className="mt-6 max-w-xl">
              <p className="text-[clamp(24px,3vw,38px)] font-extrabold uppercase leading-tight tracking-[0.02em]">
                {promo?.headline?.split(' with ')[0] || 'Free checkout flight'}
              </p>
              <p className="mt-1 text-[clamp(13px,1.6vw,19px)] font-bold uppercase tracking-[0.1em] sm:tracking-[0.14em] text-[#ffcf5c]">
                {promo?.headline?.includes(' with ') ? `with ${promo.headline.split(' with ').slice(1).join(' with ')}` : 'with every flight block'}
              </p>
              <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-white/65">
                No discount gimmicks — you pay the normal block time price and get more flying.
                Every package includes your checkout flight free{maxBonus > 0 ? `, and bigger blocks earn up to ${maxBonus} bonus flight hours` : ''}.
              </p>
            </div>

            <div className="mt-6 w-full max-w-sm">
              {isLive && promo ? (
                <SaleCountdown target={promo.ends_at} label="Sale ends in" />
              ) : status === 'scheduled' && promo ? (
                <SaleCountdown target={promo.starts_at} label="Sale starts in" />
              ) : null}
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {isLive ? (
                <Link href={buyHref()} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#ffcf5c] px-6 py-4 text-[12px] font-extrabold uppercase tracking-[0.12em] text-[#05070d] shadow-[0_12px_40px_rgba(255,207,92,0.35)] sm:px-7 sm:text-[13px] sm:tracking-[0.16em] transition-transform hover:-translate-y-0.5 hover:bg-white">
                  Claim your flight block
                  <Icon name="arrow_forward" className="text-[18px]" />
                </Link>
              ) : (
                <Link href="/pricing" className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-4 text-[12px] font-extrabold uppercase tracking-[0.12em] text-[#05070d] hover:bg-[#ffcf5c] sm:px-7 sm:text-[13px] sm:tracking-[0.16em]">
                  View current pricing
                  <Icon name="arrow_forward" className="text-[18px]" />
                </Link>
              )}
              <a href="#how-it-works" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 px-6 py-4 text-[12px] font-bold uppercase tracking-[0.12em] text-white/85 sm:px-7 sm:text-[13px] sm:tracking-[0.16em] hover:border-white/50 hover:text-white">
                How it works
              </a>
            </div>

            {status === 'ended' ? (
              <p className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/70">
                The Black Friday sale has ended. Thanks to everyone who flew with us — our regular block time packages are still available.
              </p>
            ) : status === 'disabled' ? (
              <p className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/70">
                There&apos;s no sale running right now — our regular block time packages are always available.
              </p>
            ) : null}
          </div>

          {/* aircraft */}
          <div className="relative mx-auto w-full max-w-[680px] pt-12 sm:pt-6 lg:max-w-none lg:pt-0">
            <div className="absolute inset-x-[10%] bottom-[8%] h-10 rounded-[50%] bg-black/60 blur-2xl" />
            <Image
              src="/CessnaImageTrans-1.png"
              alt="Cessna 172N VH-KZG in flight"
              width={1536}
              height={1024}
              priority
              className="relative w-full drop-shadow-[0_30px_60px_rgba(0,0,0,0.55)] motion-safe:animate-[planeIdle_6s_ease-in-out_infinite]"
              sizes="(min-width: 1024px) 50vw, 90vw"
            />
            <div className="absolute left-0 top-0 -rotate-6 rounded-xl border border-[#ffcf5c]/50 bg-[#05070d]/80 px-3 py-2 text-center backdrop-blur sm:left-2 sm:rounded-2xl sm:px-4 sm:py-3 md:left-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">Included</p>
              <p className="text-sm font-black uppercase leading-tight text-[#ffcf5c] sm:text-lg">Free<br />checkout</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── TIERS ─────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-white/[0.06] bg-[#070b14] px-4 py-14 sm:px-6 sm:py-20 md:px-10">
        <div className="mx-auto max-w-[1320px]">
          <div className="mb-12 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#ffcf5c]">Pick your block</p>
              <h2 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight sm:text-3xl md:text-5xl">More hours. Same price.</h2>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-white/55">
              Wet hire in the Cessna 172N VH-KZG from Bankstown. Fuel and GST included; landing fees charged per flight as usual.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {tiers.map((t) => {
              const top = t.bonus > 0 && t.bonus === maxBonus
              return (
                <article
                  key={t.id}
                  className={`group relative flex flex-col overflow-hidden rounded-3xl border p-6 transition-all sm:p-7 duration-300 hover:-translate-y-1 ${
                    top
                      ? 'border-[#ffcf5c] bg-gradient-to-b from-[#ffcf5c]/[0.14] to-white/[0.02] shadow-[0_24px_70px_rgba(255,207,92,0.15)]'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                  }`}
                >
                  {top ? (
                    <span className="absolute right-5 top-5 rounded-full bg-[#ffcf5c] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#05070d]">Most bonus</span>
                  ) : null}

                  <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-white/50">{t.name}</p>
                  <p className="mt-3 font-sans text-6xl font-black tracking-tight">
                    {t.hours}
                    <span className="ml-1 text-2xl font-extrabold text-white/60">HR</span>
                  </p>

                  <ul className="mt-6 space-y-3 text-[15px]">
                    <li className="flex items-start gap-2.5">
                      <Icon name={t.freeCheckout ? 'check_circle' : 'cancel'} className={`mt-0.5 text-[20px] ${t.freeCheckout ? 'text-[#ffcf5c]' : 'text-white/25'}`} />
                      <span className={t.freeCheckout ? 'font-semibold' : 'text-white/40'}>Free checkout flight</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Icon name={t.bonus > 0 ? 'add_circle' : 'remove'} className={`mt-0.5 text-[20px] ${t.bonus > 0 ? 'text-[#ffcf5c]' : 'text-white/25'}`} />
                      <span className={t.bonus > 0 ? 'font-semibold text-[#ffcf5c]' : 'text-white/40'}>
                        {t.bonus > 0 ? `+${t.bonus} bonus flight ${t.bonus === 1 ? 'hour' : 'hours'}` : 'No bonus hours'}
                      </span>
                    </li>
                  </ul>

                  <div className="my-6 h-px bg-white/10" />

                  <div className="flex items-baseline justify-between">
                    <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/45">You fly</span>
                    <span className="text-xl font-extrabold">{t.totalHours} hrs</span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/45">You pay</span>
                    <span className="text-xl font-extrabold">{aud(t.price)}</span>
                  </div>
                  {t.bonus > 0 ? (
                    <p className="mt-2 text-right text-[12px] text-white/50">
                      Works out at <span className="font-semibold text-white">{aud(t.effectiveRate, 2)}/hr</span>
                      <span className="text-white/35"> (was {aud(Number(t.rate_per_hour))}/hr)</span>
                    </p>
                  ) : (
                    <p className="mt-2 text-right text-[12px] text-white/50">{aud(Number(t.rate_per_hour))}/hr</p>
                  )}

                  <div className="flex-1" />

                  {isLive ? (
                    <Link
                      href={buyHref(t.slug)}
                      className={`mt-7 block rounded-xl px-4 py-3.5 text-center text-[12px] font-extrabold uppercase tracking-[0.16em] transition-colors ${
                        top ? 'bg-[#ffcf5c] text-[#05070d] hover:bg-white' : 'bg-white/[0.08] text-white hover:bg-[#ffcf5c] hover:text-[#05070d]'
                      }`}
                    >
                      Get {t.totalHours} hours
                    </Link>
                  ) : (
                    <span className="mt-7 block rounded-xl border border-white/10 px-4 py-3.5 text-center text-[12px] font-bold uppercase tracking-[0.16em] text-white/40">
                      {status === 'scheduled' ? 'Opens soon' : status === 'ended' ? 'Sale ended' : 'Not on sale'}
                    </span>
                  )}
                </article>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── WHY + HOW ─────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="scroll-mt-32 bg-[#05070d] px-4 py-14 sm:px-6 sm:py-20 md:px-10">
        <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-10 sm:gap-14 lg:grid-cols-2">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#ffcf5c]">How it works</p>
            <h2 className="mt-2 text-[26px] font-extrabold leading-tight tracking-tight sm:text-3xl md:text-4xl">From checkout to solo hire in three steps</h2>
            <ol className="mt-10 space-y-8">
              {[
                { icon: 'shopping_bag', title: 'Choose your block', body: 'Pick 10, 25, 50 or 100 hours and pay securely by card. New to OZ Rent A Plane? You can buy before your checkout during the sale.' },
                { icon: 'flight_takeoff', title: 'Fly your free checkout', body: 'Upload your licence, medical and photo ID, then book your checkout flight with our instructor. It’s included — you won’t be charged for it.' },
                { icon: 'schedule', title: 'Fly your hours', body: 'Once you’re cleared, book VH-KZG any time. Your hours — including any bonus — come off your package automatically.' },
              ].map((step, i) => (
                <li key={step.title} className="flex gap-4 sm:gap-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12 sm:rounded-2xl border border-[#ffcf5c]/40 bg-[#ffcf5c]/10 text-lg font-black text-[#ffcf5c]">{i + 1}</span>
                  <div>
                    <h3 className="flex items-center gap-2 text-lg font-bold">
                      <Icon name={step.icon} className="text-[20px] text-white/50" />
                      {step.title}
                    </h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-white/60">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0f2a47] to-[#070d18] p-6 sm:p-8 md:p-10">
            <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-[#ffcf5c]/10 blur-3xl" />
            <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-white/50">Why more hours, not a discount?</p>
            <p className="mt-4 text-xl font-extrabold leading-snug sm:text-2xl md:text-3xl">
              Every dollar still buys flying. You just get <span className="text-[#ffcf5c]">more of it</span>.
            </p>
            <ul className="mt-8 space-y-4 text-[15px] text-white/70">
              <li className="flex gap-3"><Icon name="verified" className="shrink-0 text-[20px] text-[#ffcf5c]" />Your checkout flight is included with every package</li>
              <li className="flex gap-3"><Icon name="lock" className="shrink-0 text-[20px] text-[#ffcf5c]" />Same locked-in block time rate for every hour you fly</li>
              <li className="flex gap-3"><Icon name="add_circle" className="shrink-0 text-[20px] text-[#ffcf5c]" />Bonus hours are added the moment your payment clears</li>
              <li className="flex gap-3"><Icon name="local_gas_station" className="shrink-0 text-[20px] text-[#ffcf5c]" />Wet hire — fuel and GST included</li>
            </ul>
            {isLive ? (
              <Link href={buyHref()} className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-[#ffcf5c] px-5 py-3.5 text-center text-[12px] font-extrabold uppercase tracking-[0.1em] text-[#05070d] hover:bg-white sm:mt-10 sm:inline-flex sm:w-auto sm:px-6 sm:tracking-[0.16em]">
                Book at ozrentaplane.com
                <Icon name="arrow_forward" className="text-[18px]" />
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── FINE PRINT ────────────────────────────────────────────────────── */}
      <section className="border-t border-white/[0.06] bg-[#05070d] px-4 pb-16 pt-10 sm:px-6 sm:pb-20 md:px-10">
        <div className="mx-auto max-w-[1320px] text-[12px] leading-relaxed text-white/40">
          <p className="font-semibold uppercase tracking-[0.16em] text-white/55">Offer terms</p>
          <p className="mt-2 max-w-4xl">
            {promo ? `Offer runs ${formatPromotionDate(promo.starts_at)} to ${formatPromotionDate(promo.ends_at)} (Sydney time). ` : ''}
            Applies to block time packages bought online during the sale. One free checkout flight per package. Bonus hours are added to the
            package at purchase and are used under the same package terms. Normal checkout requirements (licence, medical, photo ID and flight
            review) still apply. Landing fees on block time flights are charged per flight as usual. See our{' '}
            <Link href="/terms-and-conditions" className="underline hover:text-white/70">terms and conditions</Link> or{' '}
            <Link href="/contact-us" className="underline hover:text-white/70">contact us</Link> with any questions.
          </p>
        </div>
      </section>
    </main>
  )
}
