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
  phone?: string | null
  lifecycleStatus: CustomerLifecycleStatus
  needsAttention: boolean
  attentionReason: string | null
}

const FILTERS: Array<{ key: CustomerFilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'checkout_not_requested', label: 'Checkout Not Requested' },
  { key: 'payment_required', label: 'Payment Required' },
  { key: 'in_checkout', label: 'In Checkout' },
  { key: 'cleared_to_fly', label: 'Cleared to Fly' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'needs_attention', label: 'Needs Review' },
]



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

  const formatPhone = (phone?: string | null) => {
    const raw = phone ?? ''
    // Strip duplicated AU country-code prefixes before rendering in the list.
    const cleaned = raw.replace(/^\+\+61\s?/, '').replace(/^\+61\s?/, '').trim()
    return cleaned || '—'
  }

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (
        activeFilter === 'needs_attention' &&
        !['additional_checkout_required', 'checkout_reschedule_required', 'not_currently_eligible'].includes(r.lifecycleStatus)
      ) return false
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
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between shadow-sm">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none]">
          {FILTERS.map((filter) => {
            const active = activeFilter === filter.key
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => updateFilter(filter.key)}
                className={`px-3.5 py-1.5 rounded-full text-xs whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'font-semibold bg-[#152d5a] text-white'
                    : 'font-medium bg-white border border-[#152d5a]/15 text-[#4b6390] hover:border-[#152d5a]/30 hover:text-[#152d5a]'
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
          className="w-full md:w-[320px] h-9 px-3.5 rounded-xl text-sm bg-white border border-[#152d5a]/15 text-[#152d5a] placeholder:text-[#4b6390]/60 focus:outline-none focus:border-[#152d5a]/40 focus:ring-2 focus:ring-[#152d5a]/8 transition-colors"
        />
      </div>

      <div className="hidden md:block">
        <AdminDataTable columns={activeFilter === 'needs_attention' ? ['Customer', 'Status', 'Attention Needed', 'PHONE'] : ['Customer', 'Status', 'PHONE']}>
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
                  className={`cursor-pointer border-t border-[var(--admin-divider)] hover:bg-[var(--admin-row-hover)] transition-colors ${r.needsAttention ? 'border-l-2 border-l-amber-400' : ''}`}
                >
                  <td className="px-5 py-[16px]">
                    <div className="flex items-center gap-2">
                      <p className="text-lg leading-tight font-semibold text-[var(--admin-text)]">
                        {r.needsAttention ? (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-2 mb-[1px] align-middle shrink-0" />
                        ) : null}
                        {r.fullName}
                      </p>
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
                  <td className="px-5 py-[16px] text-right font-mono text-[13px] text-[#152d5a]">{formatPhone(r.phone)}</td>
                </tr>
              )
            })
          )}
        </AdminDataTable>
      </div>

      <div className="md:hidden space-y-2.5">
        {filteredRows.map((r) => {
          const status = getCustomerDerivedStatusMeta(r.lifecycleStatus)
          return (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/admin/users/${r.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  router.push(`/admin/users/${r.id}`)
                }
              }}
              className="bg-white rounded-2xl border border-[#152d5a]/10 overflow-hidden cursor-pointer active:bg-[#152d5a]/[0.02] transition-colors"
            >
              {r.needsAttention && (
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-[11px] font-medium text-amber-700 leading-snug">
                    {r.attentionReason ?? 'Needs attention — review record'}
                  </span>
                </div>
              )}

              <div className="px-4 pt-3.5 pb-3">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <span className="text-[15px] font-semibold text-[#152d5a] leading-snug">
                    {r.fullName}
                  </span>
                  <span
                    className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
                    style={{
                      color: status.tone === 'emerald'
                        ? '#166534'
                        : status.tone === 'blue'
                          ? '#1a4fd6'
                          : status.tone === 'amber'
                            ? '#b45309'
                            : status.tone === 'red'
                              ? '#991b1b'
                              : '#374151',
                      background: status.tone === 'emerald'
                        ? '#dcfce7'
                        : status.tone === 'blue'
                          ? '#dbeafe'
                          : status.tone === 'amber'
                            ? '#fef3c7'
                            : status.tone === 'red'
                              ? '#fee2e2'
                              : '#f3f4f6',
                    }}
                  >
                    {status.label}
                  </span>
                </div>

                <div className="text-[12px] text-[#4b6390] mb-3">
                  {r.email}
                </div>

                <div className="flex items-center justify-between border-t border-[#152d5a]/8 pt-2.5">
                  <span className="text-[11px] text-[#4b6390]/70">
                    {formatPhone(r.phone)}
                  </span>
                  <span className="text-[11px] font-medium text-[#1a4fd6] flex items-center gap-0.5">
                    View profile →
                  </span>
                </div>
              </div>
            </div>
          )
        })}

        {filteredRows.length === 0 && (
          <div className="text-center py-12 text-sm text-[#4b6390]">
            No customers match this filter.
          </div>
        )}
      </div>

      <p className="text-sm text-slate-400">Showing {filteredRows.length} of {rows.length} customers.</p>
    </div>
  )
}
