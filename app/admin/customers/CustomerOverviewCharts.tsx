'use client'

import Link from 'next/link'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import type { TimeRangeValue } from '@/app/admin/components/AdminUi'

type ChartSlice = { key: string; name: string; value: number; color: string; href: string }
type SignupPoint = { label: string; count: number }

const RANGE_OPTS: Array<{ label: string; value: TimeRangeValue }> = [
  { label: 'Today', value: 'today' },
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '6 months', value: '6m' },
  { label: 'Max', value: 'max' },
]

export default function CustomerOverviewCharts({
  lifecycle,
  checkoutPipeline,
  bookingPipeline,
  signups,
  activeRange,
}: {
  lifecycle: ChartSlice[]
  checkoutPipeline: ChartSlice[]
  bookingPipeline: ChartSlice[]
  signups: SignupPoint[]
  activeRange: TimeRangeValue
}) {
  const renderPieCard = ({
    title,
    description,
    rows,
    filled,
  }: {
    title: string
    description: string
    rows: ChartSlice[]
    filled?: boolean
  }) => {
    const total = rows.reduce((sum, item) => sum + item.value, 0)
    const rowsWithPct = rows.map((item) => ({
      ...item,
      pct: total > 0 ? Math.round((item.value / total) * 100) : 0,
    }))
    return (
      <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-5">
        <h3 className="text-[1.55rem] leading-tight font-semibold text-[var(--admin-text)]">{title}</h3>
        <p className="text-sm text-[var(--admin-text-muted)] mt-1.5">{description}</p>
        <div className="h-[250px] mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={rowsWithPct} dataKey="value" nameKey="name" innerRadius={filled ? 0 : 55} outerRadius={90} paddingAngle={3}>
                {rowsWithPct.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<DonutTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 space-y-1.5">
          {rowsWithPct.map((item) => {
            const pct = item.pct
            return (
              <Link key={item.key} href={item.href} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.01] px-3 py-2 hover:bg-white/[0.04] transition-colors">
                <span className="inline-flex items-center gap-2 text-sm text-[var(--admin-text)]">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.name}
                </span>
                <span className="text-xs text-[var(--admin-text-muted)] tabular-nums">{item.value} ({pct}%)</span>
              </Link>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {renderPieCard({
          title: 'Customer Lifecycle Distribution',
          description: 'Checkout Not Requested, In Checkout, Cleared to Fly, and Blocked customers.',
          rows: lifecycle,
          filled: false,
        })}

        <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[1.55rem] leading-tight font-semibold text-[var(--admin-text)]">Customer Signups Over Time</h3>
              <p className="text-sm text-[var(--admin-text-muted)] mt-1">New customer accounts in the selected period.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {RANGE_OPTS.map((opt) => {
                const active = activeRange === opt.value
                return (
                  <Link
                    key={opt.value}
                    href={`/admin/customers?range=${opt.value}`}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      active ? 'bg-blue-400/15 border-blue-300/40 text-blue-200' : 'border-white/10 text-slate-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {opt.label}
                  </Link>
                )
              })}
            </div>
          </div>

          {signups.length === 0 ? (
            <div className="h-[280px] mt-4 flex items-center justify-center text-[var(--admin-text-muted)]">No signups in this period.</div>
          ) : (
            <div className="h-[280px] mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={signups}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                  <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#0f1625', border: '1px solid rgba(148,163,184,0.24)', borderRadius: 10, color: '#e5e7eb', padding: '8px 10px' }} formatter={(value: number) => [`${value} customer${value === 1 ? '' : 's'}`, 'Signups']} />
                  <Bar dataKey="count" fill="#60a5fa" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {renderPieCard({
          title: 'Checkout Pipeline',
          description: 'A visual breakdown of where customers currently sit in the checkout journey.',
          rows: checkoutPipeline,
          filled: true,
        })}
        {renderPieCard({
          title: 'Booking Pipeline',
          description: 'A visual breakdown of booking activity and status across customers.',
          rows: bookingPipeline,
          filled: true,
        })}
      </div>
    </section>
  )
}

function DonutTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0]?.payload
  const value = Number(row?.value ?? 0)
  const pct = Number(row?.pct ?? 0)
  return (
    <div className="rounded-lg border border-white/15 bg-[#0f1625] px-3 py-2 shadow-xl">
      <p className="text-[12px] font-semibold text-white">{row?.name ?? 'Status'}</p>
      <p className="text-[12px] text-slate-200">{value} customer{value === 1 ? '' : 's'} · {pct}%</p>
    </div>
  )
}
