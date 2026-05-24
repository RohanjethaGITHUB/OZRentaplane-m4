'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, Cell, LabelList, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { ChartShell, type TimeRangeValue } from '@/app/admin/components/AdminUi'
import { ChartRangeControl, EmptyChartState, isInRange, ReadableTooltip } from '@/app/admin/components/ChartPrimitives'
import { deriveBookingStatusForFlightRecord, isAwaitingFlightRecordDue } from '@/lib/booking/flight-record-status'

type BookingRow = {
  id: string
  status: string
  scheduled_start: string | null
  scheduled_end: string | null
  created_at: string
  updated_at: string
  payment_status: string | null
  flight_records?: { status: string | null; submitted_at: string | null }[] | null
}

type CancellationRow = {
  id: string
  created_at: string
}

const COLORS = ['#38BDF8', '#34D399', '#F59E0B', '#FB7185', '#A78BFA']

function dayKey(value: string | null | undefined): string | null {
  if (!value) return null
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return null
  return d.toISOString().slice(0, 10)
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

export default function BookingOverviewCharts({ bookings, cancellations, manualPaymentReviewCount }: { bookings: BookingRow[]; cancellations: CancellationRow[]; manualPaymentReviewCount: number }) {
  const [bookingsRange, setBookingsRange] = useState<TimeRangeValue>('30d')
  const [statusRange, setStatusRange] = useState<TimeRangeValue>('30d')
  const [paymentRange, setPaymentRange] = useState<TimeRangeValue>('30d')
  const [reviewRange, setReviewRange] = useState<TimeRangeValue>('30d')
  const [cancelRange, setCancelRange] = useState<TimeRangeValue>('30d')

  const bookingsOverTime = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of bookings) {
      if (!isInRange(b.created_at, bookingsRange)) continue
      const key = dayKey(b.created_at)
      if (!key) continue
      m.set(key, (m.get(key) ?? 0) + 1)
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([day, count]) => {
      const [yy, mm, dd] = day.split('-').map(Number)
      return { label: new Date(Date.UTC(yy, mm - 1, dd)).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }), count }
    })
  }, [bookings, bookingsRange])

  const statusBreakdown = useMemo(() => {
    const labels: Record<string, string> = {
      pending_confirmation: 'Pending Confirmation',
      confirmed: 'Confirmed',
      ready_for_dispatch: 'Ready for Dispatch',
      awaiting_flight_record: 'Awaiting Flight Record',
      pending_post_flight_review: 'Post-flight Review',
      payment_pending: 'Payment Pending',
      completed: 'Completed',
      cancelled: 'Cancelled',
    }
    const counts = new Map<string, number>()
    for (const b of bookings) {
      if (!isInRange(b.scheduled_start ?? b.created_at, statusRange)) continue
      const label = labels[deriveBookingStatusForFlightRecord(b)]
      if (!label) continue
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    return Array.from(counts.entries()).map(([name, value]) => ({ name, value }))
  }, [bookings, statusRange])

  const paymentBreakdown = useMemo(() => {
    const required = bookings.filter((b) => b.status === 'payment_pending' && isInRange(b.updated_at, paymentRange)).length
    const paid = bookings.filter((b) => (b.payment_status === 'paid' || b.status === 'completed') && isInRange(b.updated_at, paymentRange)).length
    return [
      { name: 'Manual review', value: manualPaymentReviewCount },
      { name: 'Payment pending', value: required },
      { name: 'Paid / settled', value: paid },
    ].filter((x) => x.value > 0)
  }, [bookings, manualPaymentReviewCount, paymentRange])

  const reviewBreakdown = useMemo(() => {
    const awaitingRecord = bookings.filter((b) => isAwaitingFlightRecordDue(b) && isInRange(b.scheduled_end, reviewRange)).length
    const reviewRequired = bookings.filter((b) => b.status === 'pending_post_flight_review' && isInRange(b.updated_at, reviewRange)).length
    const needsClarification = bookings.filter((b) => b.status === 'needs_clarification' && isInRange(b.updated_at, reviewRange)).length
    return [
      { name: 'Awaiting Record', value: awaitingRecord },
      { name: 'Review Required', value: reviewRequired },
      { name: 'Needs Clarification', value: needsClarification },
    ].filter((x) => x.value > 0)
  }, [bookings, reviewRange])

  const cancellationTrend = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of cancellations) {
      if (!isInRange(c.created_at, cancelRange)) continue
      const key = dayKey(c.created_at)
      if (!key) continue
      m.set(key, (m.get(key) ?? 0) + 1)
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([day, count]) => {
      const [yy, mm, dd] = day.split('-').map(Number)
      return { label: new Date(Date.UTC(yy, mm - 1, dd)).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }), count }
    })
  }, [cancellations, cancelRange])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="Standard Bookings Over Time" subtitle="Standard bookings created during the selected period." value={bookingsRange} onChange={setBookingsRange}>
        {bookingsOverTime.length === 0 ? <EmptyChartState /> : (
          <div className="h-[240px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={bookingsOverTime}><XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} /><ReadableTooltip /><Line type="monotone" dataKey="count" stroke="#38BDF8" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></div>
        )}
      </ChartCard>

      <ChartCard title="Booking Status Breakdown" subtitle="Current standard booking status mix in the selected period." value={statusRange} onChange={setStatusRange}>
        {statusBreakdown.length === 0 ? <EmptyChartState /> : (
          <div className="h-[240px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={statusBreakdown}><XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} angle={-12} textAnchor="end" height={52} interval={0} /><YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} /><ReadableTooltip /><Bar dataKey="value" radius={[6, 6, 0, 0]}>{statusBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}<LabelList dataKey="value" position="top" fill="#e2e8f0" fontSize={11} /></Bar></BarChart></ResponsiveContainer></div>
        )}
      </ChartCard>

      <ChartCard title="Payment Status Breakdown" subtitle="Payment states for standard bookings in the selected period." value={paymentRange} onChange={setPaymentRange}>
        {paymentBreakdown.length === 0 ? <EmptyChartState /> : (
          <div className="h-[240px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={paymentBreakdown} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>{paymentBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><ReadableTooltip /><Legend formatter={(value, entry) => `${value} (${entry?.payload?.value ?? 0})`} wrapperStyle={{ fontSize: '12px' }} /></PieChart></ResponsiveContainer></div>
        )}
      </ChartCard>

      <ChartCard title="Post-flight Review Status" subtitle="Post-flight record and review workload status." value={reviewRange} onChange={setReviewRange}>
        {reviewBreakdown.length === 0 ? <EmptyChartState /> : (
          <div className="h-[240px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={reviewBreakdown}><XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} /><ReadableTooltip /><Bar dataKey="value" fill="#34D399" radius={[6, 6, 0, 0]}><LabelList dataKey="value" position="top" fill="#e2e8f0" fontSize={11} /></Bar></BarChart></ResponsiveContainer></div>
        )}
      </ChartCard>

      <div className="lg:col-span-2">
        <ChartCard title="Cancellation Trend" subtitle="New cancellation requests during the selected period." value={cancelRange} onChange={setCancelRange}>
          {cancellationTrend.length === 0 ? <EmptyChartState /> : (
            <div className="h-[240px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={cancellationTrend}><XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} /><ReadableTooltip /><Line type="monotone" dataKey="count" stroke="#FB7185" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
