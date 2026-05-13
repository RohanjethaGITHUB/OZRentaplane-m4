'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, Cell, LabelList, Legend, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { ChartShell, type TimeRangeValue } from '@/app/admin/components/AdminUi'
import { ChartRangeControl, EmptyChartState, isInRange, ReadableTooltip } from '@/app/admin/components/ChartPrimitives'

type CheckoutBooking = {
  id: string
  status: string
  scheduled_start: string | null
  created_at: string
  updated_at: string
}

type CheckoutInvoice = {
  id: string
  booking_id: string | null
  status: string
  checkout_outcome: string | null
  stripe_amount_due_cents: number | null
  total_paid_cents: number | null
  created_at: string | null
  updated_at: string | null
  paid_at: string | null
}

type CheckoutOutcomeEvent = {
  id: string
  booking_id: string | null
  created_at: string
  event_type: string
  new_value: Record<string, unknown> | null
}

const COLORS = ['#60A5FA', '#2DD4BF', '#F59E0B', '#FB7185', '#A78BFA', '#F97316']

function dayKey(value: string | null | undefined): string | null {
  if (!value) return null
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function monthKey(value: string | null | undefined): string | null {
  if (!value) return null
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return null
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function ChartCard({ title, subtitle, value, onChange, children }: { title: string; subtitle: string; value: TimeRangeValue; onChange: (v: TimeRangeValue) => void; children: React.ReactNode }) {
  return (
    <ChartShell title={title}>
      <div className="-mt-2 mb-3 flex items-start justify-between gap-3 flex-wrap">
        <p className="text-xs text-slate-400">{subtitle}</p>
        <ChartRangeControl value={value} onChange={onChange} />
      </div>
      {children}
    </ChartShell>
  )
}

export default function CheckoutOverviewCharts({
  bookings,
  invoices,
  outcomeEvents,
  manualPendingCount,
}: {
  bookings: CheckoutBooking[]
  invoices: CheckoutInvoice[]
  outcomeEvents: CheckoutOutcomeEvent[]
  manualPendingCount: number
}) {
  const [requestsRange, setRequestsRange] = useState<TimeRangeValue>('30d')
  const [statusRange, setStatusRange] = useState<TimeRangeValue>('30d')
  const [outcomeRange, setOutcomeRange] = useState<TimeRangeValue>('30d')
  const [paymentRange, setPaymentRange] = useState<TimeRangeValue>('30d')

  const requestsOverTime = useMemo(() => {
    const hourly = requestsRange === 'today'
    const monthly = requestsRange === '6m' || requestsRange === 'max'
    const map = new Map<string, number>()

    for (const b of bookings) {
      if (!isInRange(b.created_at, requestsRange)) continue

      let key: string | null = null
      if (hourly) {
        const d = new Date(b.created_at)
        if (Number.isFinite(d.getTime())) key = String(d.getHours())
      } else if (monthly) {
        key = monthKey(b.created_at)
      } else {
        key = dayKey(b.created_at)
      }

      if (!key) continue
      map.set(key, (map.get(key) ?? 0) + 1)
    }

    if (hourly) {
      return Array.from({ length: 24 }, (_, h) => ({
        label: `${((h + 11) % 12) + 1}${h < 12 ? ' AM' : ' PM'}`,
        count: map.get(String(h)) ?? 0,
      })).filter((row) => row.count > 0)
    }

    if (monthly) {
      return Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([m, count]) => {
          const [yy, mm] = m.split('-').map(Number)
          return {
            label: new Date(Date.UTC(yy, mm - 1, 1)).toLocaleDateString('en-AU', { month: 'short' }),
            count,
          }
        }).filter((row) => row.count > 0)
    }

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([d, count]) => {
        const [yy, mm, dd] = d.split('-').map(Number)
        return {
          label: new Date(Date.UTC(yy, mm - 1, dd)).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
          count,
        }
      }).filter((row) => row.count > 0)
  }, [bookings, requestsRange])

  const statusMix = useMemo(() => {
    const map = new Map<string, number>()
    const labels: Record<string, string> = {
      checkout_requested: 'Requested',
      checkout_confirmed: 'Confirmed',
      checkout_completed_under_review: 'Awaiting Outcome',
      checkout_payment_required: 'Payment Required',
      completed: 'Completed',
      cancelled: 'Cancelled',
    }

    for (const b of bookings) {
      if (!isInRange(b.scheduled_start ?? b.created_at, statusRange)) continue
      const label = labels[b.status]
      if (!label) continue
      map.set(label, (map.get(label) ?? 0) + 1)
    }

    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [bookings, statusRange])

  const outcomes = useMemo(() => {
    const labelMap: Record<string, string> = {
      cleared_to_fly: 'Cleared to Fly',
      additional_checkout_required: 'Additional Checkout Required',
      checkout_reschedule_required: 'Checkout Reschedule Required',
      not_currently_eligible: 'Not Currently Eligible',
    }

    const map = new Map<string, number>()
    for (const event of outcomeEvents) {
      if (!isInRange(event.created_at, outcomeRange)) continue
      const outcomeRaw = typeof event.new_value?.outcome === 'string' ? event.new_value.outcome : null
      if (!outcomeRaw) continue
      const label = labelMap[outcomeRaw]
      if (!label) continue
      map.set(label, (map.get(label) ?? 0) + 1)
    }

    const cancelled = bookings.filter((b) => b.status === 'cancelled' && isInRange(b.updated_at, outcomeRange)).length
    if (cancelled > 0) map.set('Cancelled', cancelled)

    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [bookings, outcomeEvents, outcomeRange])

  const paymentSummary = useMemo(() => {
    // Timestamp precedence by metric:
    // - paid -> paid_at
    // - operational states -> updated_at then created_at
    const required = invoices.filter((i) => i.status === 'payment_required' && isInRange(i.updated_at ?? i.created_at, paymentRange)).length
    const pending = invoices.filter((i) => i.status === 'pending' && isInRange(i.updated_at ?? i.created_at, paymentRange)).length
    const paid = invoices.filter((i) => i.status === 'paid' && isInRange(i.paid_at ?? i.updated_at ?? i.created_at, paymentRange)).length
    const waived = invoices.filter((i) => i.status === 'waived' && isInRange(i.updated_at ?? i.created_at, paymentRange)).length
    const refunded = invoices.filter((i) => ['refunded', 'void', 'failed', 'cancelled'].includes(i.status) && isInRange(i.updated_at ?? i.created_at, paymentRange)).length

    const totalCollected = invoices
      .filter((i) => i.status === 'paid' && isInRange(i.paid_at ?? i.updated_at ?? i.created_at, paymentRange))
      .reduce((sum, i) => sum + (i.total_paid_cents ?? 0), 0)

    const outstanding = invoices
      .filter((i) => ['payment_required', 'pending'].includes(i.status) && isInRange(i.updated_at ?? i.created_at, paymentRange))
      .reduce((sum, i) => sum + (i.stripe_amount_due_cents ?? 0), 0)

    return {
      chart: [
        { name: 'Manual Review', value: manualPendingCount },
        { name: 'Payment Required', value: required },
        { name: 'Pending', value: pending },
        { name: 'Paid', value: paid },
        { name: 'Waived', value: waived },
        { name: 'Refunded / Cancelled', value: refunded },
      ].filter((x) => x.value > 0),
      totalCollected,
      outstanding,
    }
  }, [invoices, manualPendingCount, paymentRange])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="Checkout Requests Over Time" subtitle="New checkout requests submitted during the selected period." value={requestsRange} onChange={setRequestsRange}>
        {requestsOverTime.length === 0 ? <EmptyChartState message="No checkout requests submitted in this period." /> : (
          <div className="h-[240px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={requestsOverTime} margin={{ top: 22, right: 10, left: 0, bottom: 8 }}><XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} /><YAxis allowDecimals={false} domain={[0, (max: number) => max + 1]} tick={{ fill: '#94a3b8', fontSize: 11 }} /><ReadableTooltip labelFormatter={(label) => `Date/Time: ${label}`} formatter={(value) => [`${value}`, 'Checkout requests']} /><Bar dataKey="count" fill="#60A5FA" radius={[6, 6, 0, 0]}><LabelList dataKey="count" position="top" fill="#e2e8f0" fontSize={11} /></Bar></BarChart></ResponsiveContainer></div>
        )}
      </ChartCard>

      <ChartCard title="Checkout Status Breakdown" subtitle="Current checkout status mix in the selected period." value={statusRange} onChange={setStatusRange}>
        {statusMix.length === 0 ? <EmptyChartState /> : (
          <div className="h-[240px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={statusMix} margin={{ top: 22, right: 10, left: 0, bottom: 8 }}><XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} angle={-12} textAnchor="end" height={48} interval={0} /><YAxis allowDecimals={false} domain={[0, (max: number) => max + 2]} tick={{ fill: '#94a3b8', fontSize: 11 }} /><ReadableTooltip /><Bar dataKey="value" radius={[6, 6, 0, 0]}>{statusMix.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}<LabelList dataKey="value" position="top" fill="#e2e8f0" fontSize={11} /></Bar></BarChart></ResponsiveContainer></div>
        )}
      </ChartCard>

      <ChartCard title="Checkout Outcomes" subtitle="Assessment outcomes recorded for checkout flights." value={outcomeRange} onChange={setOutcomeRange}>
        {outcomes.length === 0 ? <EmptyChartState message="No checkout outcomes recorded in this period." /> : (
          <div className="h-[240px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={outcomes} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>{outcomes.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><ReadableTooltip formatter={(value: number, name: string, item: any) => {
            const total = outcomes.reduce((s, row) => s + row.value, 0)
            const pct = total > 0 ? Math.round((item?.payload?.value / total) * 100) : 0
            return [`${value} (${pct}%)`, name]
          }} /><Legend formatter={(value, entry) => `${value} (${entry?.payload?.value ?? 0})`} wrapperStyle={{ fontSize: '12px' }} /></PieChart></ResponsiveContainer></div>
        )}
      </ChartCard>

      <ChartCard title="Checkout Payment Summary" subtitle="Checkout payment states for the selected period." value={paymentRange} onChange={setPaymentRange}>
        {paymentSummary.chart.length === 0 ? <EmptyChartState message="No checkout payment activity in this period." /> : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">Total collected: <span className="text-emerald-300">${(paymentSummary.totalCollected / 100).toFixed(2)}</span></div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">Outstanding: <span className="text-amber-300">${(paymentSummary.outstanding / 100).toFixed(2)}</span></div>
            </div>
            <div className="h-[205px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={paymentSummary.chart} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>{paymentSummary.chart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><ReadableTooltip /><Legend formatter={(value, entry) => `${value} (${entry?.payload?.value ?? 0})`} wrapperStyle={{ fontSize: '12px' }} /></PieChart></ResponsiveContainer></div>
          </div>
        )}
      </ChartCard>
    </div>
  )
}
