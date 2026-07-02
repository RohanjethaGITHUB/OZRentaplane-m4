import type { ReactNode } from 'react'

// Accepts both the static marketing shape (pre-formatted strings, see
// app/(marketing)/pricing/page.tsx BLOCK_TIME_PACKAGES) and live rows from
// block_time_packages (numeric hours / rate_per_hour / total_price /
// validity_days).
export type PackageCardPackage = {
  id?: string
  name: string
  hours: number | string
  ratePerHour: number | string
  totalPrice: number | string
  validityDays?: number | null
  validityLabel?: string | null
  description?: string | null
  badge?: string | null
  featured?: boolean
}

type Props = {
  id?: string
  pkg: PackageCardPackage
  variant?: 'dark' | 'light'
  /** PAYF comparison rate used for the savings line when ratePerHour is numeric. */
  payfRatePerHour?: number
  /** CTA slot — the consuming page decides what buying means (link, form, button). */
  action?: ReactNode
  className?: string
}

function formatAud(value: number, maximumFractionDigits = 0): string {
  return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits })
}

function hoursNumber(hours: number | string): string {
  if (typeof hours === 'number') return String(hours)
  return hours.split(' ')[0]
}

function rateLabel(rate: number | string): string {
  if (typeof rate === 'number') return `${formatAud(rate)}/hr`
  return rate
}

function totalLabel(total: number | string): string {
  if (typeof total === 'number') return formatAud(total)
  return total
}

function validityLabel(pkg: PackageCardPackage): string | null {
  if (pkg.validityLabel) return pkg.validityLabel
  if (pkg.validityDays == null) return null
  const months = Math.round(pkg.validityDays / 30)
  return months >= 1 ? `Valid for ${months} ${months === 1 ? 'month' : 'months'}` : `Valid for ${pkg.validityDays} days`
}

export default function PackageCard({
  id,
  pkg,
  variant = 'light',
  payfRatePerHour = 330,
  action,
  className = '',
}: Props) {
  const dark = variant === 'dark'
  const featured = pkg.featured === true
  const savings = typeof pkg.ratePerHour === 'number' ? payfRatePerHour - pkg.ratePerHour : null
  const validity = validityLabel(pkg)

  const cardBorder = featured
    ? 'border-2 border-[#f59e0b]'
    : dark
      ? 'border border-white/20'
      : 'border border-[#152d5a]/10'
  const cardBg = dark
    ? featured
      ? 'bg-white/[0.08]'
      : 'bg-white/[0.05]'
    : 'bg-white shadow-[0_4px_24px_rgba(2,10,22,0.05)]'
  const headingColor = dark ? 'text-white' : 'text-[#152d5a]'
  const mutedColor = dark ? 'text-white/50' : 'text-[#4b6390]'
  const faintColor = dark ? 'text-white/40' : 'text-[#4b6390]/70'
  const divider = dark ? 'border-white/15' : 'border-[#152d5a]/10'
  const rateColor = featured ? 'text-[#f59e0b]' : dark ? 'text-white' : 'text-[#1a4fd6]'

  return (
    <article id={id} className={`relative flex h-full flex-col rounded-2xl p-6 ${cardBorder} ${cardBg} ${className}`}>
      {pkg.badge ? (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span
            className={`whitespace-nowrap rounded-full px-4 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${
              featured
                ? 'bg-[#f59e0b] text-[#00132f]'
                : dark
                  ? 'bg-white/15 text-white'
                  : 'bg-[#f0f6ff] text-[#1a4fd6] border border-[#1a4fd6]/15'
            }`}
          >
            {pkg.badge}
          </span>
        </div>
      ) : null}

      <h3 className={`mt-2 text-center font-serif text-xl font-normal ${headingColor}`}>{pkg.name}</h3>

      <div className="my-3 text-center">
        <span className={`font-serif text-6xl font-normal leading-none ${headingColor}`}>{hoursNumber(pkg.hours)}</span>
        <p className={`mt-1 text-sm ${mutedColor}`}>hours</p>
      </div>

      <div className={`my-3 border-t ${divider}`} />

      <div className="my-2 text-center">
        <p className={`mb-1 text-sm line-through ${faintColor}`}>${payfRatePerHour}/hr</p>
        <p className={`font-serif text-3xl font-normal ${rateColor}`}>{rateLabel(pkg.ratePerHour)}</p>
        {savings !== null && savings > 0 ? (
          <p className={`mt-1 text-xs font-semibold ${mutedColor}`}>Save {formatAud(savings)}/hr vs Pay As You Fly</p>
        ) : null}
      </div>

      <div className={`my-3 border-t ${divider}`} />

      <div className="text-center">
        <p className={`mb-1 text-[11px] font-bold uppercase tracking-[0.12em] ${faintColor}`}>Total</p>
        <p className={`text-xl font-semibold ${headingColor}`}>{totalLabel(pkg.totalPrice)}</p>
        {validity ? <p className={`mt-1 text-xs ${mutedColor}`}>{validity}</p> : null}
      </div>

      {pkg.description ? (
        <p className={`mt-3 text-center text-xs leading-relaxed ${mutedColor}`}>{pkg.description}</p>
      ) : null}

      <div className="flex-1" />

      {action ? <div className="mt-5">{action}</div> : null}
    </article>
  )
}
