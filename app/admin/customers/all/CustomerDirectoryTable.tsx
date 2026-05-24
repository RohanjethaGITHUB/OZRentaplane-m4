'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminDataTable, AdminStatusBadge } from '@/app/admin/components/AdminListView'
import { getCustomerDerivedStatusMeta, getStatusFromQuery, type CustomerFilterKey, type CustomerLifecycleStatus } from '@/app/admin/customers/customer-status'
import AttentionBadge from '@/app/admin/customers/AttentionBadge'

type Row = {
  id: string
  fullName: string
  email: string
  updatedAt: string
  lifecycleStatus: CustomerLifecycleStatus
  needsAttention: boolean
  attentionReason: string | null
}

const FILTERS: Array<{ key: CustomerFilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'checkout_not_requested', label: 'Checkout Not Requested' },
  { key: 'in_checkout', label: 'In Checkout' },
  { key: 'cleared_to_fly', label: 'Cleared to Fly' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'needs_attention', label: 'Needs Attention' },
]

const DATE_FMT = new Intl.DateTimeFormat('en-AU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Australia/Sydney',
})

export default function CustomerDirectoryTable({
  rows,
  initialFilter,
}: {
  rows: Row[]
  initialFilter?: string
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<CustomerFilterKey>(getStatusFromQuery(initialFilter))

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (activeFilter === 'needs_attention' && !r.needsAttention) return false
      if (activeFilter !== 'all' && activeFilter !== 'needs_attention' && r.lifecycleStatus !== activeFilter) return false
      if (!q) return true
      return r.fullName.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)
    })
  }, [rows, query, activeFilter])

  const updateFilter = (next: CustomerFilterKey) => {
    setActiveFilter(next)
    router.replace(next === 'all' ? '/admin/customers/all' : `/admin/customers/all?status=${next}`)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-panel-bg)] p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => {
            const active = activeFilter === filter.key
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => updateFilter(filter.key)}
                className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                  active
                    ? 'bg-blue-500/15 border-blue-300/40 text-blue-200'
                    : 'bg-white/[0.02] border-white/10 text-slate-300 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                {filter.label}
              </button>
            )
          })}
        </div>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customers..."
          className="w-full md:w-[320px] rounded-lg border border-white/10 bg-[#0f1625] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-400/60"
        />
      </div>

      <AdminDataTable columns={activeFilter === 'needs_attention' ? ['Customer', 'Status', 'Attention Needed', 'Updated'] : ['Customer', 'Status', 'Updated']}>
        {filteredRows.length === 0 ? (
          <tr>
            <td colSpan={activeFilter === 'needs_attention' ? 4 : 3} className="px-5 py-12 text-center text-[var(--admin-text-muted)]">
              {query.trim() ? 'No customers match your search.' : 'No customers found for this filter.'}
            </td>
          </tr>
        ) : (
          filteredRows.map((r) => {
            const status = getCustomerDerivedStatusMeta(r.lifecycleStatus)
            return (
              <tr
                key={r.id}
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/admin/users/${r.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    router.push(`/admin/users/${r.id}`)
                  }
                }}
                className="cursor-pointer border-t border-[var(--admin-divider)] hover:bg-[var(--admin-row-hover)] transition-colors"
              >
                <td className="px-5 py-[16px]">
                  <div className="flex items-center gap-2">
                    <p className="text-lg leading-tight font-semibold text-[var(--admin-text)]">{r.fullName}</p>
                    {r.needsAttention && r.attentionReason ? (
                      <AttentionBadge reason={r.attentionReason} />
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{r.email}</p>
                </td>
                <td className="px-5 py-[16px]"><AdminStatusBadge label={status.label} tone={status.tone} /></td>
                {activeFilter === 'needs_attention' ? (
                  <td className="px-5 py-[16px] text-[14px] text-[var(--admin-text-muted)]">{r.attentionReason || 'Status inconsistency, review customer record'}</td>
                ) : null}
                <td className="px-5 py-[16px] text-[14px] text-[var(--admin-text)]">{DATE_FMT.format(new Date(r.updatedAt))}</td>
              </tr>
            )
          })
        )}
      </AdminDataTable>

      <p className="text-sm text-slate-400">Showing {filteredRows.length} of {rows.length} customers.</p>
    </div>
  )
}
