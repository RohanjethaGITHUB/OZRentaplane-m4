'use client'

import { useMemo, useState, useTransition, useEffect, useRef } from 'react'
import {
  createAircraftFlightLog,
  deleteAircraftFlightLog,
  updateAircraftFlightLog,
} from '@/app/actions/aircraft-flight-log'
import type { FlightLogSource } from '@/lib/aircraft-flight-log'
import { searchCustomers } from '@/app/actions/admin'
import CalendarDateField from '@/components/CalendarDateField'
import ConfirmModal from '@/components/ui/ConfirmModal'

// ─── Types ────────────────────────────────────────────────────────────────────

type LogRow = {
  id: string
  log_number: number
  flight_date: string
  pic_user_id: string | null
  pic_name: string
  pic_arn: string | null
  vdo_start: number | null
  vdo_stop: number | null
  vdo_total: number | null
  tacho_start: number | null
  tacho_stop: number | null
  tacho_total: number | null
  air_switch_start: number | null
  air_switch_stop: number | null
  air_switch_total: number | null
  mr_start: number | null
  mr_stop: number | null
  mr_total: number | null
  oil_added: number | null
  oil_total: number | null
  fuel_added: number | null
  fuel_returned: number | null
  landings: number | null
  notes: string | null
  source: string
  review_status: 'pending_admin_review' | 'admin_confirmed' | 'admin_adjusted'
  continuity_warning: boolean
  continuity_warning_details: string | null
  related_booking_id: string | null
}

type CreateContext = {
  nextLogNumber: number
  suggestedStarts: {
    vdo_start: number | null
    tacho_start: number | null
    air_switch_start: number | null
    mr_start: number | null
  }
  recentBookings: Array<{
    id: string
    booking_reference: string | null
    scheduled_start: string
    pic_name: string | null
    pic_arn?: string | null
    pic_user_id?: string | null
    booking_owner_user_id?: string | null
    status: string
  }>
}

type PicMode = 'search' | 'manual'

type Draft = Record<string, string>

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Coerce any value to a trimmed string. Never throws. */
function safeStr(v: unknown, fallback = ''): string {
  if (v == null) return fallback
  return String(v).trim()
}

/** Parse a draft string field to a number. Null-safe — undefined/null → null. */
function num(v: string | null | undefined): number | null {
  if (v == null) return null
  const trimmed = String(v).trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function fmt1(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toFixed(1)
}

function calc(start: number | null, stop: number | null): number | null {
  if (start == null || stop == null) return null
  return Math.round((stop - start) * 10) / 10
}

function normalizeSource(source: string | null | undefined): FlightLogSource {
  if (
    source === 'manual_admin_entry' ||
    source === 'checkout_completion' ||
    source === 'booking_customer_post_flight' ||
    source === 'legacy_checkout_clearance' ||
    source === 'opening_balance'
  ) return source as FlightLogSource
  return 'manual_admin_entry'
}

function normalizeReviewStatus(s: string | null | undefined): LogRow['review_status'] {
  if (s === 'pending_admin_review' || s === 'admin_confirmed' || s === 'admin_adjusted') return s
  return 'admin_confirmed'
}

function toCsv(rows: LogRow[]): string {
  const header = [
    'log_number', 'flight_date', 'pic_name', 'pic_arn', 'pic_user_id',
    'vdo_start', 'vdo_stop', 'vdo_total',
    'tacho_start', 'tacho_stop', 'tacho_total',
    'air_switch_start', 'air_switch_stop', 'air_switch_total',
    'mr_start', 'mr_stop', 'mr_total',
    'oil_added', 'oil_total', 'fuel_added', 'fuel_returned',
    'landings', 'source', 'review_status', 'continuity_warning', 'related_booking_id', 'notes',
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    const vals = [
      r.log_number, r.flight_date, r.pic_name, r.pic_arn ?? '', r.pic_user_id ?? '',
      r.vdo_start ?? '', r.vdo_stop ?? '', r.vdo_total ?? '',
      r.tacho_start ?? '', r.tacho_stop ?? '', r.tacho_total ?? '',
      r.air_switch_start ?? '', r.air_switch_stop ?? '', r.air_switch_total ?? '',
      r.mr_start ?? '', r.mr_stop ?? '', r.mr_total ?? '',
      r.oil_added ?? '', r.oil_total ?? '', r.fuel_added ?? '', r.fuel_returned ?? '',
      r.landings ?? '', safeStr(r.source), safeStr(r.review_status),
      r.continuity_warning ? 'true' : 'false',
      safeStr(r.related_booking_id), safeStr(r.notes),
    ].map(v => `"${String(v).replaceAll('"', '""')}"`)
    lines.push(vals.join(','))
  }
  return lines.join('\n')
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a1629]/80 px-6 py-5">
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">{label}</p>
      <p className="text-3xl font-mono font-medium text-white leading-none">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-2">{sub}</p>}
    </div>
  )
}

function MeterCell({ start, stop, total, isOpeningBalance }: { start: number | null; stop: number | null; total: number | null; isOpeningBalance?: boolean }) {
  return (
    <div className="space-y-1 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[var(--admin-text-muted)] text-xs">Start</span>
        <span className="font-mono text-[var(--admin-text)]">{fmt1(start)}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[var(--admin-text-muted)] text-xs">Stop</span>
        <span className="font-mono text-[var(--admin-text)]">{fmt1(stop)}</span>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-[var(--admin-divider)] pt-1">
        <span className="text-[var(--admin-text-muted)] text-xs font-medium">Total</span>
        <span className="font-mono font-semibold text-white">{fmt1(total)}</span>
      </div>
    </div>
  )
}

function ConsumableCell({ added, total, isFuel, isOpeningBalance }: { added: number | null | undefined; total: number | null | undefined; isFuel?: boolean; isOpeningBalance?: boolean }) {
  return (
    <div className="space-y-1 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[var(--admin-text-muted)] text-xs">Added</span>
        <span className="font-mono text-[var(--admin-text)]">{added != null ? fmt1(added) : '—'}</span>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-[var(--admin-divider)] pt-1">
        <span className="text-[var(--admin-text-muted)] text-xs font-medium">{isFuel ? 'Returned' : 'Total'}</span>
        <span className="font-mono font-semibold text-white">{total != null ? fmt1(total) : '—'}</span>
      </div>
    </div>
  )
}

function ReviewBadge({ status }: { status: string | null | undefined }) {
  const cfgMap: Record<string, string> = {
    pending_admin_review: 'bg-[rgba(180,120,30,0.13)] border-[rgba(245,158,11,0.22)] text-[#f4cd7a]',
    admin_confirmed:      'bg-[rgba(22,101,52,0.16)] border-[rgba(74,222,128,0.18)] text-[#86efac]',
    admin_adjusted:       'bg-[rgba(59,130,246,0.12)] border-[rgba(96,165,250,0.22)] text-[#93c5fd]',
  }
  const key   = safeStr(status)
  const cfg   = cfgMap[key] ?? 'bg-[rgba(100,116,139,0.14)] border-[rgba(148,163,184,0.16)] text-[#cbd5e1]'
  const label = key.replace(/_/g, ' ') || 'unknown'
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[12px] font-medium tracking-[0.04em] whitespace-nowrap ${cfg}`}>
      {label}
    </span>
  )
}

function SourceBadge({ source }: { source: string | null | undefined }) {
  const label = safeStr(source).replace(/_/g, ' ') || 'unknown'
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--admin-border)] bg-[rgba(100,116,139,0.10)] px-2.5 py-1 text-[11px] text-[var(--admin-text-muted)] whitespace-nowrap tracking-[0.03em]">
      {label}
    </span>
  )
}

function CustomerSearchDropdown({
  onSelect,
}: {
  onSelect: (c: { id: string; full_name: string | null; pilot_arn: string | null }) => void
}) {
  const [query, setQuery]   = useState('')
  const [results, setResults] = useState<any[]>([])
  const [open, setOpen]     = useState(false)
  const containerRef        = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(() => {
      searchCustomers(query).then(res => { setResults(res); setOpen(true) })
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        placeholder="Search by name, email, or ARN…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => { if (results.length > 0) setOpen(true) }}
        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-[#0c1220] border border-white/10 rounded-xl shadow-xl max-h-56 overflow-y-auto">
          {results.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onSelect(c); setOpen(false); setQuery('') }}
              className="w-full px-3 py-2.5 text-sm text-left text-slate-300 hover:bg-white/[0.06] hover:text-white border-b border-white/5 last:border-b-0"
            >
              <span className="font-medium">{c.full_name || 'Unnamed'}</span>
              {c.email && <span className="text-slate-500 ml-2 text-xs">{c.email}</span>}
              {c.pilot_arn && <span className="text-slate-500 ml-2 text-xs">ARN {c.pilot_arn}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Input helpers for the form ───────────────────────────────────────────────

const inputCls = 'w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 [color-scheme:dark]'
const labelCls = 'block text-xs text-slate-400 mb-1.5'

function FmInput({
  label,
  name,
  type = 'text',
  value,
  onChange,
  required,
  placeholder,
  step,
  min,
}: {
  label: string
  name?: string
  type?: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  placeholder?: string
  step?: string
  min?: string
}) {
  return (
    <label className="block">
      <span className={labelCls}>{label}{required && <span className="text-rose-400 ml-0.5">*</span>}</span>
      <input
        name={name}
        type={type}
        step={step}
        min={min}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
    </label>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FlightLogClient({
  aircraftId,
  aircraft,
  initialLogs,
  createContext,
}: {
  aircraftId: string
  aircraft: { registration: string; displayName: string }
  initialLogs: LogRow[]
  createContext: CreateContext
}) {
  const [rows, setRows]               = useState(initialLogs)
  const [order, setOrder]             = useState<'newest' | 'oldest'>('newest')
  const [logNumberOrder, setLogNumberOrder] = useState<'desc' | 'asc'>('desc')
  const [picFilter, setPicFilter]     = useState('')
  const [fromDate, setFromDate]       = useState('')
  const [toDate, setToDate]           = useState('')
  const [open, setOpen]               = useState(false)
  const [editing, setEditing]         = useState<LogRow | null>(null)
  const [error, setError]             = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId]     = useState<string | null>(null)
  // Initialize with all fields as strings so num(draft.x) never receives undefined.
  const [draft, setDraft]             = useState<Draft>(() => ({
    flight_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' }),
    pic_user_id: '', pic_name: '', pic_arn: '',
    vdo_start:        safeStr(createContext.suggestedStarts.vdo_start),
    vdo_stop:         '', tacho_start: safeStr(createContext.suggestedStarts.tacho_start),
    tacho_stop:       '', air_switch_start: safeStr(createContext.suggestedStarts.air_switch_start),
    air_switch_stop:  '', mr_start: safeStr(createContext.suggestedStarts.mr_start),
    mr_stop:          '', oil_added: '', oil_total: '', fuel_added: '', fuel_returned: '',
    landings: '', notes: '', related_booking_id: '',
    source: 'manual_admin_entry', review_status: 'admin_confirmed',
  }))
  const [picMode, setPicMode]         = useState<PicMode>('search')
  const [pending, startTransition]    = useTransition()

  const filtered = useMemo(() => {
    const out = [...rows].filter(r => {
      if (picFilter && !safeStr(r.pic_name).toLowerCase().includes(picFilter.toLowerCase())) return false
      if (fromDate && r.flight_date < fromDate) return false
      if (toDate && r.flight_date > toDate) return false
      return true
    })
    out.sort((a, b) => {
      const byLog = logNumberOrder === 'asc' ? a.log_number - b.log_number : b.log_number - a.log_number
      if (byLog !== 0) return byLog
      const dc = a.flight_date.localeCompare(b.flight_date)
      if (dc !== 0) return order === 'oldest' ? dc : -dc
      return 0
    })
    return out
  }, [rows, picFilter, fromDate, toDate, order, logNumberOrder])

  const latest = useMemo(() => {
    if (!rows.length) return null
    return [...rows].sort((a, b) => {
      const dc = b.flight_date.localeCompare(a.flight_date)
      if (dc !== 0) return dc
      return b.log_number - a.log_number
    })[0]
  }, [rows])

  const starts = createContext.suggestedStarts

  // ── Modal helpers ──────────────────────────────────────────────────────────

  function blankDraft(): Draft {
    return {
      flight_date:        new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' }),
      pic_user_id:        '',
      pic_name:           '',
      pic_arn:            '',
      vdo_start:          String(starts.vdo_start ?? ''),
      vdo_stop:           '',
      tacho_start:        String(starts.tacho_start ?? ''),
      tacho_stop:         '',
      air_switch_start:   String(starts.air_switch_start ?? ''),
      air_switch_stop:    '',
      mr_start:           String(starts.mr_start ?? ''),
      mr_stop:            '',
      oil_added:          '',
      oil_total:          '',
      fuel_added:         '',
      fuel_returned:      '',
      landings:           '',
      notes:              '',
      related_booking_id: '',
      source:             'manual_admin_entry',
      review_status:      'admin_confirmed',
    }
  }

  function rowToDraft(row: LogRow): Draft {
    // Every value must be a string — never undefined/null — so num() and
    // .trim() calls in the form are always safe.
    const n = (v: number | null | undefined) => (v == null ? '' : String(v))
    return {
      flight_date:        safeStr(row.flight_date),
      pic_user_id:        safeStr(row.pic_user_id),
      pic_name:           safeStr(row.pic_name),
      pic_arn:            safeStr(row.pic_arn),
      vdo_start:          n(row.vdo_start),
      vdo_stop:           n(row.vdo_stop),
      tacho_start:        n(row.tacho_start),
      tacho_stop:         n(row.tacho_stop),
      air_switch_start:   n(row.air_switch_start),
      air_switch_stop:    n(row.air_switch_stop),
      mr_start:           n(row.mr_start),
      mr_stop:            n(row.mr_stop),
      oil_added:          n(row.oil_added),
      oil_total:          n(row.oil_total),
      fuel_added:         n(row.fuel_added),
      fuel_returned:      n(row.fuel_returned),
      landings:           n(row.landings),
      notes:              safeStr(row.notes),
      related_booking_id: safeStr(row.related_booking_id),
      source:             safeStr(row.source, 'manual_admin_entry'),
      review_status:      safeStr(row.review_status, 'admin_confirmed'),
    }
  }

  function openForCreate() {
    setEditing(null)
    setError(null)
    setPicMode('search')
    setDraft(blankDraft())
    setOpen(true)
  }

  function openForEdit(row: LogRow) {
    setEditing(row)
    setError(null)
    setPicMode(row.pic_user_id ? 'search' : 'manual')
    setDraft(rowToDraft(row))
    setOpen(true)
  }

  function set(field: string, value: string) {
    setDraft(p => ({ ...p, [field]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const input = {
      aircraft_id:        aircraftId,
      flight_date:        safeStr(draft.flight_date),
      pic_name:           safeStr(draft.pic_name),
      pic_arn:            safeStr(draft.pic_arn) || null,
      pic_user_id:        picMode === 'search' ? (safeStr(draft.pic_user_id) || null) : null,
      vdo_start:          num(draft.vdo_start),
      vdo_stop:           num(draft.vdo_stop),
      tacho_start:        num(draft.tacho_start),
      tacho_stop:         num(draft.tacho_stop),
      air_switch_start:   num(draft.air_switch_start),
      air_switch_stop:    num(draft.air_switch_stop),
      mr_start:           num(draft.mr_start),
      mr_stop:            num(draft.mr_stop),
      oil_added:          num(draft.oil_added),
      oil_total:          num(draft.oil_total),
      fuel_added:         num(draft.fuel_added),
      fuel_returned:      num(draft.fuel_returned),
      landings:           num(draft.landings) != null ? Math.round(num(draft.landings)!) : null,
      notes:              safeStr(draft.notes) || null,
      related_booking_id: safeStr(draft.related_booking_id) || null,
      source:             normalizeSource(draft.source),
      review_status:      normalizeReviewStatus(draft.review_status),
    }

    startTransition(async () => {
      try {
        if (editing) {
          const updated = await updateAircraftFlightLog(editing.id, input)
          setRows(prev => prev.map(r => r.id === editing.id ? (updated as LogRow) : r))
        } else {
          const created = await createAircraftFlightLog(input)
          setRows(prev => [created.row as LogRow, ...prev])
        }
        setOpen(false)
      } catch (e: any) {
        setError(e?.message || 'Failed to save flight log record.')
      }
    })
  }

  function removeRow(id: string) {
    setPendingDeleteId(id)
    setDeleteConfirmOpen(true)
  }

  function confirmRemoveRow() {
    if (!pendingDeleteId) return
    const id = pendingDeleteId
    setDeleteConfirmOpen(false)
    setPendingDeleteId(null)
    setOpen(false)
    startTransition(async () => {
      try {
        await deleteAircraftFlightLog(id)
        setRows(prev => prev.filter(r => r.id !== id))
      } catch (e: any) {
        setError(e?.message || 'Failed to delete flight log record.')
      }
    })
  }

  function exportCsv() {
    const blob = new Blob([toCsv(filtered)], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `flight-log-${aircraft.registration}-${aircraftId.slice(0, 8)}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  // ── Live-calculated total in form ──────────────────────────────────────────
  const liveVdo  = calc(num(draft.vdo_start),        num(draft.vdo_stop))
  const liveTach = calc(num(draft.tacho_start),      num(draft.tacho_stop))
  const liveAs   = calc(num(draft.air_switch_start), num(draft.air_switch_stop))
  const liveMr   = calc(num(draft.mr_start),         num(draft.mr_stop))

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Aircraft identity ──────────────────────────────────────────────── */}
      <div className="mb-6">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">
          Aircraft
        </p>
        <div className="flex items-baseline gap-3">
          <h2 className="text-2xl font-semibold text-white">{aircraft.registration}</h2>
          <span className="text-base text-slate-400">{aircraft.displayName}</span>
        </div>
      </div>

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
        <SummaryCard label="Latest VDO"        value={fmt1(latest?.vdo_stop)}        sub="hours" />
        <SummaryCard label="Latest Tacho"      value={fmt1(latest?.tacho_stop)}      sub="hours" />
        <SummaryCard label="Latest Air Switch" value={fmt1(latest?.air_switch_stop)} sub="hours" />
        <SummaryCard label="Latest MR"         value={fmt1(latest?.mr_stop)}         sub="hours" />
        <SummaryCard label="Last Flight"       value={latest?.flight_date ?? '—'}    />
      </div>

      {/* ── Filters / actions bar ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] px-5 py-4 mb-5 shadow-[var(--admin-shadow-panel)]">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs text-slate-400 flex items-center gap-2">
            PIC
            <input
              value={picFilter}
              onChange={e => setPicFilter(e.target.value)}
              placeholder="Filter…"
              className="bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/40 w-36"
            />
          </label>
          <label className="text-xs text-slate-400 flex items-center gap-2">
            From
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-slate-200 [color-scheme:dark] focus:outline-none focus:border-blue-500/40" />
          </label>
          <label className="text-xs text-slate-400 flex items-center gap-2">
            To
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-slate-200 [color-scheme:dark] focus:outline-none focus:border-blue-500/40" />
          </label>
          <button
            onClick={() => setOrder(p => p === 'newest' ? 'oldest' : 'newest')}
            className="px-3 py-1.5 rounded-lg border border-white/10 text-sm text-slate-300 hover:bg-white/[0.04] transition-colors"
          >
            {order === 'newest' ? '↓ Newest first' : '↑ Oldest first'}
          </button>
          <button
            onClick={exportCsv}
            className="px-3 py-1.5 rounded-lg border border-white/10 text-sm text-slate-300 hover:bg-white/[0.04] transition-colors"
          >
            Export CSV
          </button>
          <button
            onClick={openForCreate}
            className="ml-auto px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
          >
            + Add Flight Record
          </button>
        </div>
      </div>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {error && (
        <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200 flex items-start gap-2">
          <span className="material-symbols-outlined text-[14px] mt-0.5 flex-shrink-0">error</span>
          {error}
        </div>
      )}

      {/* ── Log table ─────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-[var(--admin-radius-xl)] border border-[var(--admin-border)] bg-[var(--admin-card-bg)]">
        <table className="min-w-[1180px] w-full">
          <thead className="bg-[#141b29]">
            <tr>
              {[
                { label: '#',          cls: 'w-12'           },
                { label: 'Date',       cls: 'w-28'           },
                { label: 'PIC',        cls: 'min-w-[150px]'  },
                { label: 'ARN',        cls: 'w-28'           },
                { label: 'VDO',        cls: 'w-36'           },
                { label: 'Tacho',      cls: 'w-36'           },
                { label: 'Air Switch', cls: 'w-36'           },
                { label: 'MR',         cls: 'w-36'           },
                { label: 'Oil',        cls: 'w-28'           },
                { label: 'Fuel',       cls: 'w-28'           },
                { label: 'Ldgs',       cls: 'w-16'           },
                { label: 'Status',     cls: 'min-w-[180px]'  },
              ].map((h, index) => (
                <th
                  key={h.label}
                  className={`px-5 py-4 text-left text-[12px] tracking-[0.12em] uppercase font-semibold text-[var(--admin-text-muted)] whitespace-nowrap ${h.cls}`}
                >
                  {index === 0 ? (
                    <button
                      type="button"
                      onClick={() => setLogNumberOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))}
                      className="inline-flex items-center gap-1 hover:text-white transition-colors"
                      title="Sort by log number"
                    >
                      <span>{h.label}</span>
                      <span className="text-[11px]">{logNumberOrder === 'asc' ? '↑' : '↓'}</span>
                    </button>
                  ) : h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={12} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center">
                    <span className="material-symbols-outlined text-4xl mb-3 text-[var(--admin-text-dim)] opacity-50">flight_takeoff</span>
                    <p className="text-base font-semibold text-[var(--admin-text)]">No flight records yet</p>
                    <p className="text-sm text-[var(--admin-text-muted)] mt-1">Add the first flight record to start the digital log.</p>
                  </div>
                </td>
              </tr>
            )}
            {filtered.map(r => (
              (() => {
                const isBaselineRow =
                  r.source === 'opening_balance' ||
                  safeStr(r.pic_name).toLowerCase() === 'system baseline'
                return (
              <tr
                key={r.id}
                onClick={() => openForEdit(r)}
                className={`border-t border-[var(--admin-divider)] cursor-pointer transition-colors ${
                  isBaselineRow
                    ? 'bg-slate-900/35 hover:bg-slate-900/55'
                    : 'hover:bg-[var(--admin-row-hover)]'
                }`}
              >
                <td className="px-5 py-[16px] text-sm text-[var(--admin-text-dim)]">{r.log_number}</td>
                <td className="px-5 py-[16px] text-sm font-mono text-[var(--admin-text)] whitespace-nowrap">{r.flight_date}</td>
                <td className="px-5 py-[16px]">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-[var(--admin-text)]">{safeStr(r.pic_name) || '—'}</p>
                    {isBaselineRow ? (
                      <span className="inline-flex items-center rounded-full border border-slate-500/40 bg-slate-700/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-200">
                        Baseline
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-5 py-[16px] text-sm font-mono text-[var(--admin-text-muted)]">{safeStr(r.pic_arn) || '—'}</td>
                <td className="px-5 py-[16px]"><MeterCell start={r.vdo_start}        stop={r.vdo_stop}        total={r.vdo_total}        isOpeningBalance={r.source === 'opening_balance'} /></td>
                <td className="px-5 py-[16px]"><MeterCell start={r.tacho_start}      stop={r.tacho_stop}      total={r.tacho_total}      isOpeningBalance={r.source === 'opening_balance'} /></td>
                <td className="px-5 py-[16px]"><MeterCell start={r.air_switch_start} stop={r.air_switch_stop} total={r.air_switch_total} isOpeningBalance={r.source === 'opening_balance'} /></td>
                <td className="px-5 py-[16px]"><MeterCell start={r.mr_start}         stop={r.mr_stop}         total={r.mr_total}         isOpeningBalance={r.source === 'opening_balance'} /></td>
                <td className="px-5 py-[16px]"><ConsumableCell added={r.oil_added}  total={r.oil_total}     isOpeningBalance={r.source === 'opening_balance'} /></td>
                <td className="px-5 py-[16px]"><ConsumableCell added={r.fuel_added} total={r.fuel_returned} isOpeningBalance={r.source === 'opening_balance'} isFuel /></td>
                <td className="px-5 py-[16px] text-sm text-[var(--admin-text-muted)]">{r.landings ?? '—'}</td>
                <td className="px-5 py-[16px]">
                  <div className="flex flex-col gap-2">
                    <ReviewBadge status={r.review_status} />
                    <SourceBadge source={r.source} />
                    {isBaselineRow ? (
                      <span className="text-[11px] text-slate-400">Opening baseline row (not a flight movement).</span>
                    ) : null}
                    {r.continuity_warning && (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(245,158,11,0.22)] bg-[rgba(180,120,30,0.13)] px-2.5 py-1 text-[11px] font-medium text-[#f4cd7a] whitespace-nowrap"
                        title={r.continuity_warning_details ?? undefined}
                      >
                        ⚠ continuity warning
                      </span>
                    )}
                  </div>
                </td>
              </tr>
                )
              })()
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Add / Edit modal ──────────────────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-4xl rounded-2xl border border-white/10 bg-[#0f1217] shadow-2xl my-8"
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-7 pt-6 pb-5 border-b border-white/[0.07]">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  {editing ? 'Edit Flight Record' : 'Add Flight Record'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {aircraft.registration} · {aircraft.displayName}
                  {editing && ` · Log #${editing.log_number}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <span className="material-symbols-outlined text-[22px]">close</span>
              </button>
            </div>

            <div className="px-7 py-6 space-y-8">

              {/* Continuity / edit warnings */}
              {editing && rows.some(r => r.log_number > editing.log_number) && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-4 text-sm text-amber-200">
                  You are editing an older flight record. Changes to stop readings may affect continuity with later records.
                </div>
              )}
              {!editing && (
                <div className="space-y-2">
                  {starts.vdo_start != null && num(draft.vdo_start) != null && num(draft.vdo_start) !== starts.vdo_start && (
                    <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs text-amber-300">VDO start does not match the previous stop ({starts.vdo_start?.toFixed(1)}). Confirm this is intentional.</div>
                  )}
                  {starts.tacho_start != null && num(draft.tacho_start) != null && num(draft.tacho_start) !== starts.tacho_start && (
                    <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs text-amber-300">Tacho start does not match the previous stop ({starts.tacho_start?.toFixed(1)}). Confirm this is intentional.</div>
                  )}
                  {starts.air_switch_start != null && num(draft.air_switch_start) != null && num(draft.air_switch_start) !== starts.air_switch_start && (
                    <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs text-amber-300">Air Switch start does not match the previous stop ({starts.air_switch_start?.toFixed(1)}). Confirm this is intentional.</div>
                  )}
                  {starts.mr_start != null && num(draft.mr_start) != null && num(draft.mr_start) !== starts.mr_start && (
                    <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs text-amber-300">MR start does not match the previous stop ({starts.mr_start?.toFixed(1)}). Confirm this is intentional.</div>
                  )}
                </div>
              )}

              {/* 1. Flight details */}
              <section>
                <SectionHeading>1. Flight Details</SectionHeading>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className={labelCls}>Flight date<span className="text-rose-400 ml-0.5">*</span></span>
                    <input type="hidden" name="flight_date" value={draft.flight_date} />
                    <CalendarDateField
                      value={draft.flight_date}
                      onChange={v => set('flight_date', v)}
                      minYear={2000}
                      maxYear={new Date().getFullYear() + 1}
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-200 flex justify-between"
                    />
                  </div>
                  <div>
                    <span className={labelCls}>Related booking (optional)</span>
                    <select
                      value={draft.related_booking_id}
                      onChange={e => set('related_booking_id', e.target.value)}
                      className={inputCls}
                    >
                      <option value="">None</option>
                      {createContext.recentBookings.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.booking_reference ?? b.id.slice(0, 8)} · {new Date(b.scheduled_start).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: 'numeric' })} · {b.pic_name ?? 'PIC'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              {/* 2. PIC */}
              <section>
                <div className="flex items-center justify-between mb-4 border-b border-white/[0.06] pb-3">
                  <SectionHeading noLine>2. PIC</SectionHeading>
                  <div className="flex rounded-lg border border-white/10 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => { setPicMode('search') }}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${picMode === 'search' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-white/[0.04]'}`}
                    >
                      Search customer
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPicMode('manual'); set('pic_user_id', '') }}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-white/10 ${picMode === 'manual' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-white/[0.04]'}`}
                    >
                      Manual entry
                    </button>
                  </div>
                </div>

                {picMode === 'search' && (
                  <div className="mb-4">
                    <span className={labelCls}>Search registered customer</span>
                    <CustomerSearchDropdown
                      onSelect={c => setDraft(p => ({
                        ...p,
                        pic_user_id: c.id,
                        pic_name:    c.full_name ?? '',
                        pic_arn:     c.pilot_arn ?? '',
                      }))}
                    />
                    {draft.pic_user_id && (
                      <p className="text-[11px] text-emerald-400/70 mt-1">
                        Customer linked — name and ARN auto-filled below, editable if needed.
                      </p>
                    )}
                    {!draft.pic_user_id && (
                      <p className="text-[11px] text-slate-600 mt-1">
                        Search then click a result to link and auto-fill name and ARN.
                      </p>
                    )}
                  </div>
                )}

                {picMode === 'manual' && (
                  <div className="mb-4 rounded-lg border border-white/[0.06] bg-white/[0.01] px-4 py-3">
                    <p className="text-xs text-slate-500">
                      PIC will not be linked to a customer account. Name and ARN are stored as entered.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FmInput
                    label="PIC Name"
                    name="pic_name"
                    value={draft.pic_name}
                    onChange={v => set('pic_name', v)}
                    required
                    placeholder={picMode === 'manual' ? 'e.g. Jane Smith' : undefined}
                  />
                  <FmInput
                    label="PIC ARN"
                    name="pic_arn"
                    value={draft.pic_arn}
                    onChange={v => set('pic_arn', v)}
                    placeholder="e.g. 123456"
                  />
                </div>
              </section>

              {/* 3. Aircraft readings */}
              <section>
                <SectionHeading>3. Aircraft Readings</SectionHeading>
                <p className="text-xs text-slate-500 mb-4">
                  Admin manual entry — full start, stop, and total control. Total is calculated live.
                </p>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-black/20">
                      <tr>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 w-28">Reading</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">Start</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">Stop</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 w-24">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {[
                        { label: 'VDO',        start: 'vdo_start',        stop: 'vdo_stop',        live: liveVdo  },
                        { label: 'Tacho',      start: 'tacho_start',      stop: 'tacho_stop',      live: liveTach },
                        { label: 'Air Switch', start: 'air_switch_start', stop: 'air_switch_stop', live: liveAs   },
                        { label: 'MR',         start: 'mr_start',         stop: 'mr_stop',         live: liveMr   },
                      ].map(row => (
                        <tr key={row.label}>
                          <td className="px-4 py-3 text-slate-300 font-medium">{row.label}</td>
                          <td className="px-4 py-2">
                            <input
                              name={row.start}
                              type="number"
                              step="0.1"
                              value={draft[row.start] ?? ''}
                              onChange={e => set(row.start, e.target.value)}
                              required
                              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              name={row.stop}
                              type="number"
                              step="0.1"
                              value={draft[row.stop] ?? ''}
                              onChange={e => set(row.stop, e.target.value)}
                              required
                              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
                            />
                          </td>
                          <td className="px-4 py-3 font-mono text-sm font-semibold text-white">
                            {row.live != null ? row.live.toFixed(1) : <span className="text-slate-600">—</span>}
                            {row.live != null && <span className="text-[10px] text-slate-500 ml-1">h</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* 4. Oil and fuel */}
              <section>
                <SectionHeading>4. Oil &amp; Fuel</SectionHeading>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <FmInput label="Oil added"  name="oil_added"  type="number" step="0.1" min="0" value={draft.oil_added}  onChange={v => set('oil_added', v)}  placeholder="0.0" />
                  <FmInput label="Oil total"  name="oil_total"  type="number" step="0.1" min="0" value={draft.oil_total}  onChange={v => set('oil_total', v)}  placeholder="0.0" />
                  <FmInput label="Fuel added" name="fuel_added" type="number" step="0.1" min="0" value={draft.fuel_added} onChange={v => set('fuel_added', v)} placeholder="0.0" />
                  <FmInput label="Fuel returned" name="fuel_returned" type="number" step="0.1" min="0" value={draft.fuel_returned} onChange={v => set('fuel_returned', v)} placeholder="0.0" />
                </div>
              </section>

              {/* 5. Flight summary */}
              <section>
                <SectionHeading>5. Flight Summary</SectionHeading>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FmInput label="Landings" name="landings" type="number" min="0" step="1" value={draft.landings} onChange={v => set('landings', v)} placeholder="0" />
                  <div className="md:col-span-2">
                    <label className="block">
                      <span className={labelCls}>Notes</span>
                      <textarea
                        name="notes"
                        value={draft.notes}
                        onChange={e => set('notes', e.target.value)}
                        rows={3}
                        placeholder="Optional operational notes…"
                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 resize-none"
                      />
                    </label>
                  </div>
                </div>
              </section>

              {/* 6. Admin metadata */}
              <section>
                <SectionHeading>6. Record Metadata</SectionHeading>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="block">
                    <span className={labelCls}>Source</span>
                    <select
                      value={draft.source}
                      onChange={e => set('source', e.target.value)}
                      className={inputCls}
                    >
                      <option value="manual_admin_entry">Manual admin entry</option>
                      <option value="checkout_completion">Checkout completion</option>
                      <option value="booking_customer_post_flight">Customer post-flight</option>
                      <option value="opening_balance">Opening balance / baseline</option>
                      <option value="legacy_checkout_clearance">Legacy checkout clearance</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelCls}>Review status</span>
                    <select
                      value={draft.review_status}
                      onChange={e => set('review_status', e.target.value)}
                      className={inputCls}
                    >
                      <option value="admin_confirmed">Admin confirmed</option>
                      <option value="admin_adjusted">Admin adjusted</option>
                      <option value="pending_admin_review">Pending admin review</option>
                    </select>
                  </label>
                </div>
              </section>

            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between gap-3 px-7 py-5 border-t border-white/[0.07]">
              <div>
                {editing && (
                  <button
                    type="button"
                    onClick={() => removeRow(editing.id)}
                    disabled={pending}
                    className="px-4 py-2.5 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-sm font-medium transition-colors disabled:opacity-40"
                  >
                    Delete record
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-5 py-2.5 rounded-lg border border-white/15 text-slate-300 hover:bg-white/[0.04] text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {pending ? 'Saving…' : editing ? 'Save changes' : 'Add record'}
                </button>
              </div>
            </div>

            {/* Inline form error */}
            {error && (
              <div className="mx-7 mb-5 -mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200 flex items-start gap-2">
                <span className="material-symbols-outlined text-[14px] mt-0.5 flex-shrink-0">error</span>
                {error}
              </div>
            )}
          </form>
        </div>
      )}

      <ConfirmModal
        open={deleteConfirmOpen}
        title="Delete this flight log record?"
        description="This action cannot be undone."
        confirmLabel={pending ? 'Deleting…' : 'Yes, delete'}
        cancelLabel="Back"
        variant="danger"
        onCancel={() => {
          setDeleteConfirmOpen(false)
          setPendingDeleteId(null)
        }}
        onConfirm={confirmRemoveRow}
      />
    </>
  )
}

// ─── Small layout helpers ─────────────────────────────────────────────────────

function SectionHeading({ children, noLine }: { children: React.ReactNode; noLine?: boolean }) {
  return (
    <h4 className={`text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-4 ${noLine ? '' : 'border-b border-white/[0.05] pb-3'}`}>
      {children}
    </h4>
  )
}
