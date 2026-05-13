'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AdminActiveFilterChips, AdminFilterPanel } from '@/app/admin/components/AdminListView'

type StatusFilter = 'all' | 'new_requests' | 'upcoming' | 'in_progress' | 'awaiting_outcome' | 'payment_required' | 'completed' | 'cancelled'
type OutcomeFilter = 'all' | 'cleared_to_fly' | 'additional_checkout_required' | 'checkout_reschedule_required' | 'not_currently_eligible' | 'none'
type PaymentFilter = 'all' | 'payment_required' | 'manual_review' | 'pending' | 'paid' | 'waived' | 'refunded' | 'cancelled' | 'no_record' | 'no_needed'

const STATUS_CHIP_STYLE: Record<StatusFilter, string> = {
  all: 'border-[var(--admin-border)] text-[var(--admin-text)] bg-[rgba(15,23,42,0.65)]',
  new_requests: 'border-[rgba(96,165,250,0.32)] text-[#dbeafe] bg-[rgba(59,130,246,0.16)]',
  upcoming: 'border-[rgba(96,165,250,0.22)] text-[#cbd5e1] bg-[rgba(30,41,59,0.65)]',
  in_progress: 'border-[rgba(96,165,250,0.22)] text-[#d1dbe8] bg-[rgba(30,41,59,0.65)]',
  awaiting_outcome: 'border-[rgba(245,158,11,0.22)] text-[#f3d79a] bg-[rgba(180,120,30,0.13)]',
  payment_required: 'border-[rgba(251,146,60,0.22)] text-[#fdba74] bg-[rgba(194,65,12,0.13)]',
  completed: 'border-[rgba(74,222,128,0.18)] text-[#b6e6c5] bg-[rgba(22,101,52,0.16)]',
  cancelled: 'border-[rgba(248,113,113,0.18)] text-[#f8b4b9] bg-[rgba(127,29,29,0.16)]',
}

const OUTCOME_LABEL: Record<OutcomeFilter, string> = {
  all: 'All outcomes',
  cleared_to_fly: 'Cleared to Fly',
  additional_checkout_required: 'Additional Checkout Required',
  checkout_reschedule_required: 'Checkout Reschedule Required',
  not_currently_eligible: 'Not Currently Eligible',
  none: 'No Outcome Yet',
}

const PAYMENT_LABEL: Record<PaymentFilter, string> = {
  all: 'All payment states',
  payment_required: 'Payment Required',
  manual_review: 'Manual Review',
  pending: 'Pending',
  paid: 'Paid',
  waived: 'Waived',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
  no_record: 'No Payment Record',
  no_needed: 'No Payment Needed',
}

export default function CheckoutFilters({
  status,
  outcome,
  payment,
  tabs,
  statusCounts,
}: {
  status: StatusFilter
  outcome: OutcomeFilter
  payment: PaymentFilter
  tabs: Array<{ key: StatusFilter; label: string }>
  statusCounts: Record<StatusFilter, number>
}) {
  const router = useRouter()
  const search = useSearchParams()
  const [open, setOpen] = useState(false)

  const activeFilters = useMemo(() => {
    const chips: Array<{ key: 'status' | 'outcome' | 'payment'; label: string }> = []
    if (status !== 'all') chips.push({ key: 'status', label: `Status: ${tabs.find((t) => t.key === status)?.label ?? status}` })
    if (outcome !== 'all') chips.push({ key: 'outcome', label: `Outcome: ${OUTCOME_LABEL[outcome]}` })
    if (payment !== 'all') chips.push({ key: 'payment', label: `Payment: ${PAYMENT_LABEL[payment]}` })
    return chips
  }, [status, outcome, payment, tabs])

  const apply = (next: Partial<{ status: StatusFilter; outcome: OutcomeFilter; payment: PaymentFilter }>) => {
    const p = new URLSearchParams(search?.toString() ?? '')
    const s = next.status ?? status
    const o = next.outcome ?? outcome
    const pay = next.payment ?? payment
    if (s === 'all') p.delete('status')
    else p.set('status', s)
    if (o === 'all') p.delete('outcome')
    else p.set('outcome', o)
    if (pay === 'all') p.delete('payment')
    else p.set('payment', pay)
    router.push(`/admin/checkouts/all?${p.toString()}`)
  }

  const clearAll = () => router.push('/admin/checkouts/all')

  return (
    <AdminFilterPanel
      title="Filter checkout requests"
      subtitle={`${activeFilters.length} active filter${activeFilters.length === 1 ? '' : 's'}`}
      open={open}
      onToggle={() => setOpen((v) => !v)}
    >
      <div className="pt-5 space-y-5">
          <div className="space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--admin-text-muted)]">Status</p>
            <div className="flex flex-wrap gap-2">
              {tabs.map((t) => {
                const active = status === t.key
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => apply({ status: t.key })}
                    className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${active ? STATUS_CHIP_STYLE[t.key] : 'border-[var(--admin-border)] bg-[rgba(15,23,42,0.65)] text-[var(--admin-text-muted)] hover:border-[var(--admin-accent-soft)] hover:text-[var(--admin-text)]'}`}
                  >
                    <span>{t.label}</span>
                    <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[11px] tabular-nums">{statusCounts[t.key]}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] text-[var(--admin-text-muted)] mb-1.5">Outcome</label>
              <div className="relative">
                <select
                  value={outcome}
                  onChange={(e) => apply({ outcome: e.target.value as OutcomeFilter })}
                  className="appearance-none w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-3 py-2.5 pr-9 text-base text-[var(--admin-text)] transition-colors focus:outline-none focus:border-[var(--admin-accent-soft)]"
                >
                  <option value="all">All outcomes</option>
                  <option value="cleared_to_fly">Cleared to Fly</option>
                  <option value="additional_checkout_required">Additional Checkout Required</option>
                  <option value="checkout_reschedule_required">Checkout Reschedule Required</option>
                  <option value="not_currently_eligible">Not Currently Eligible</option>
                  <option value="none">No Outcome Yet</option>
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--admin-text-muted)] material-symbols-outlined text-[18px]">expand_more</span>
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] text-[var(--admin-text-muted)] mb-1.5">Payment</label>
              <div className="relative">
                <select
                  value={payment}
                  onChange={(e) => apply({ payment: e.target.value as PaymentFilter })}
                  className="appearance-none w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input-bg)] px-3 py-2.5 pr-9 text-base text-[var(--admin-text)] transition-colors focus:outline-none focus:border-[var(--admin-accent-soft)]"
                >
                  <option value="all">All payment states</option>
                  <option value="payment_required">Payment Required</option>
                  <option value="manual_review">Manual Review</option>
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="waived">Waived</option>
                  <option value="refunded">Refunded</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="no_record">No Payment Record</option>
                  <option value="no_needed">No Payment Needed</option>
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--admin-text-muted)] material-symbols-outlined text-[18px]">expand_more</span>
              </div>
            </div>
          </div>
      </div>
      <div className="mt-5 border-t border-[var(--admin-divider)] pt-4">
        <AdminActiveFilterChips
          chips={activeFilters}
          onRemove={(key) => apply({ [key]: 'all' } as Partial<{ status: StatusFilter; outcome: OutcomeFilter; payment: PaymentFilter }>)}
          onClearAll={clearAll}
        />
      </div>
    </AdminFilterPanel>
  )
}
