'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateAircraftMaintenanceSettings,
  markOilChangeDone,
  mark100HrMaintenanceDone,
} from '@/app/actions/aircraft-maintenance'
import type { MaintenanceInfo, MaintenanceStatus } from '@/app/actions/aircraft-maintenance'

type Props = {
  aircraftId: string
  aircraftRegistration: string
  info: MaintenanceInfo
}

function statusBadge(status: MaintenanceStatus) {
  if (status === 'overdue') return <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold bg-red-500/15 border border-red-500/30 text-red-300">Overdue</span>
  if (status === 'due_soon') return <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300">Due soon</span>
  return <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">OK</span>
}

function statusMessage(reg: string, type: 'oil' | '100hr', status: MaintenanceStatus, hoursRemaining: number | null): string | null {
  if (status === 'ok') return null
  const abs = hoursRemaining != null ? Math.abs(hoursRemaining).toFixed(1) : '?'
  if (type === 'oil') {
    if (status === 'due_soon') return `${reg} is ${abs} MR hours away from the next oil change.`
    return `${reg} has passed the oil change due MR by ${abs} hours.`
  }
  if (status === 'due_soon') return `${reg} is ${abs} MR hours away from the next 100-hour maintenance.`
  return `${reg} has passed the 100-hour maintenance due MR by ${abs} hours.`
}

function fmt1(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toFixed(1)
}

function numInput(val: string | number | null | undefined): string {
  if (val == null) return ''
  return String(val)
}

export default function MaintenanceClient({ aircraftId, aircraftRegistration, info }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const s = info.settings

  const [form, setForm] = useState({
    last_oil_change_mr:            numInput(s?.last_oil_change_mr),
    next_oil_change_due_mr:        numInput(s?.next_oil_change_due_mr),
    oil_change_interval_mr:        numInput(s?.oil_change_interval_mr ?? 50),
    last_100hr_maintenance_mr:     numInput(s?.last_100hr_maintenance_mr),
    next_100hr_maintenance_due_mr: numInput(s?.next_100hr_maintenance_due_mr),
    maintenance_100hr_interval_mr: numInput(s?.maintenance_100hr_interval_mr ?? 100),
    notes:                         s?.notes ?? '',
  })

  function run(fn: () => Promise<void>, successMsg: string) {
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      try {
        await fn()
        setSuccess(successMsg)
        router.refresh()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Action failed.')
      }
    })
  }

  function parseNum(v: string): number | null {
    if (!v.trim()) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  function handleSave() {
    run(
      () => updateAircraftMaintenanceSettings(aircraftId, {
        last_oil_change_mr:            parseNum(form.last_oil_change_mr),
        next_oil_change_due_mr:        parseNum(form.next_oil_change_due_mr),
        oil_change_interval_mr:        parseNum(form.oil_change_interval_mr) ?? 50,
        last_100hr_maintenance_mr:     parseNum(form.last_100hr_maintenance_mr),
        next_100hr_maintenance_due_mr: parseNum(form.next_100hr_maintenance_due_mr),
        maintenance_100hr_interval_mr: parseNum(form.maintenance_100hr_interval_mr) ?? 100,
        notes:                         form.notes.trim() || null,
      }),
      'Maintenance settings saved.',
    )
    setEditing(false)
  }

  function handleMarkOilDone() {
    if (!window.confirm(`Mark oil change completed at current MR (${fmt1(info.current_mr)})? This will set the next oil change due to current MR + interval.`)) return
    run(() => markOilChangeDone(aircraftId), 'Oil change marked complete. Next due MR updated.')
  }

  function handleMark100HrDone() {
    if (!window.confirm(`Mark 100-hour maintenance completed at current MR (${fmt1(info.current_mr)})? This will set the next maintenance due to current MR + interval.`)) return
    run(() => mark100HrMaintenanceDone(aircraftId), '100-hour maintenance marked complete. Next due MR updated.')
  }

  const oilMsg         = statusMessage(aircraftRegistration, 'oil',   info.oil_change_status,        info.oil_change_hours_remaining)
  const maintenanceMsg = statusMessage(aircraftRegistration, '100hr', info.maintenance_100hr_status,  info.maintenance_100hr_hours_remaining)

  return (
    <div className="space-y-6">

      {/* Status Alerts */}
      {(info.oil_change_status !== 'ok' || info.maintenance_100hr_status !== 'ok') && (
        <div className="space-y-3">
          {oilMsg && (
            <div className={`rounded-xl border p-4 ${info.oil_change_status === 'overdue' ? 'border-red-500/30 bg-red-500/[0.06]' : 'border-amber-500/30 bg-amber-500/[0.06]'}`}>
              <div className="flex items-start gap-3">
                <span className={`material-symbols-outlined text-xl flex-shrink-0 mt-0.5 ${info.oil_change_status === 'overdue' ? 'text-red-400' : 'text-amber-400'}`}>oil_barrel</span>
                <div>
                  <p className={`text-sm font-semibold mb-0.5 ${info.oil_change_status === 'overdue' ? 'text-red-300' : 'text-amber-300'}`}>
                    Oil change {info.oil_change_status === 'overdue' ? 'overdue' : 'due soon'}
                  </p>
                  <p className="text-sm text-slate-300">{oilMsg}</p>
                </div>
              </div>
            </div>
          )}
          {maintenanceMsg && (
            <div className={`rounded-xl border p-4 ${info.maintenance_100hr_status === 'overdue' ? 'border-red-500/30 bg-red-500/[0.06]' : 'border-amber-500/30 bg-amber-500/[0.06]'}`}>
              <div className="flex items-start gap-3">
                <span className={`material-symbols-outlined text-xl flex-shrink-0 mt-0.5 ${info.maintenance_100hr_status === 'overdue' ? 'text-red-400' : 'text-amber-400'}`}>build</span>
                <div>
                  <p className={`text-sm font-semibold mb-0.5 ${info.maintenance_100hr_status === 'overdue' ? 'text-red-300' : 'text-amber-300'}`}>
                    100-hour maintenance {info.maintenance_100hr_status === 'overdue' ? 'overdue' : 'due soon'}
                  </p>
                  <p className="text-sm text-slate-300">{maintenanceMsg}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Current MR */}
      <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-5 shadow-[var(--admin-shadow-panel)]">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-3">Current MR Reading</p>
        <p className="text-4xl font-mono text-white">{fmt1(info.current_mr)}</p>
        <p className="text-xs text-slate-500 mt-1">From latest finalized aircraft flight log</p>
      </div>

      {/* Oil Change Panel */}
      <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-5 space-y-4 shadow-[var(--admin-shadow-panel)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">Oil Change</p>
            {statusBadge(info.oil_change_status)}
          </div>
          <button
            type="button"
            onClick={handleMarkOilDone}
            disabled={isPending}
            className="px-4 py-2 rounded-lg bg-emerald-700/40 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-300 text-sm font-medium transition-colors disabled:opacity-50"
          >
            Mark completed at current MR
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <ReadonlyField label="Current MR"            value={fmt1(info.current_mr)} />
          <ReadonlyField label="Last oil change MR"    value={fmt1(s?.last_oil_change_mr)} />
          <ReadonlyField label="Next oil change due MR" value={fmt1(s?.next_oil_change_due_mr)} />
          <ReadonlyField
            label="Hours remaining"
            value={info.oil_change_hours_remaining != null ? `${info.oil_change_hours_remaining.toFixed(1)} h` : '—'}
            highlight={info.oil_change_status}
          />
        </div>
      </div>

      {/* 100-hour Maintenance Panel */}
      <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-5 space-y-4 shadow-[var(--admin-shadow-panel)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">100-Hour Maintenance</p>
            {statusBadge(info.maintenance_100hr_status)}
          </div>
          <button
            type="button"
            onClick={handleMark100HrDone}
            disabled={isPending}
            className="px-4 py-2 rounded-lg bg-emerald-700/40 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-300 text-sm font-medium transition-colors disabled:opacity-50"
          >
            Mark completed at current MR
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <ReadonlyField label="Current MR"                   value={fmt1(info.current_mr)} />
          <ReadonlyField label="Last 100-hr maintenance MR"   value={fmt1(s?.last_100hr_maintenance_mr)} />
          <ReadonlyField label="Next 100-hr maintenance due MR" value={fmt1(s?.next_100hr_maintenance_due_mr)} />
          <ReadonlyField
            label="Hours remaining"
            value={info.maintenance_100hr_hours_remaining != null ? `${info.maintenance_100hr_hours_remaining.toFixed(1)} h` : '—'}
            highlight={info.maintenance_100hr_status}
          />
        </div>
      </div>

      {/* Edit Settings */}
      <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] p-5 space-y-4 shadow-[var(--admin-shadow-panel)]">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Edit Maintenance Settings</p>
          {!editing && (
            <button type="button" onClick={() => setEditing(true)} className="px-3 py-1.5 rounded-lg border border-white/15 text-slate-300 text-sm hover:bg-white/5 transition-colors">
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Last oil change MR" value={form.last_oil_change_mr}            onChange={v => setForm(p => ({ ...p, last_oil_change_mr: v }))}            placeholder="e.g. 19803.8" />
              <FormField label="Next oil change due MR" value={form.next_oil_change_due_mr}    onChange={v => setForm(p => ({ ...p, next_oil_change_due_mr: v }))}        placeholder="e.g. 19903.8" />
              <FormField label="Oil change interval (MR hours)" value={form.oil_change_interval_mr} onChange={v => setForm(p => ({ ...p, oil_change_interval_mr: v }))} placeholder="50" />
              <div /> {/* spacer */}
              <FormField label="Last 100-hr maintenance MR" value={form.last_100hr_maintenance_mr}       onChange={v => setForm(p => ({ ...p, last_100hr_maintenance_mr: v }))}       placeholder="e.g. 19803.8" />
              <FormField label="Next 100-hr maintenance due MR" value={form.next_100hr_maintenance_due_mr} onChange={v => setForm(p => ({ ...p, next_100hr_maintenance_due_mr: v }))} placeholder="e.g. 19903.8" />
              <FormField label="100-hr maintenance interval (MR hours)" value={form.maintenance_100hr_interval_mr} onChange={v => setForm(p => ({ ...p, maintenance_100hr_interval_mr: v }))} placeholder="100" />
              <div /> {/* spacer */}
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Notes</label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                className="w-full bg-[#0a0b0d] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setEditing(false)} className="px-4 py-2.5 rounded-lg border border-white/15 text-slate-300 text-sm hover:bg-white/5">Cancel</button>
              <button type="button" onClick={handleSave} disabled={isPending} className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                {isPending ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <ReadonlyField label="Last oil change MR"            value={fmt1(s?.last_oil_change_mr)} />
            <ReadonlyField label="Next oil change due MR"        value={fmt1(s?.next_oil_change_due_mr)} />
            <ReadonlyField label="Oil change interval"           value={`${fmt1(s?.oil_change_interval_mr ?? 50)} MR hours`} />
            <ReadonlyField label="Last 100-hr maintenance MR"    value={fmt1(s?.last_100hr_maintenance_mr)} />
            <ReadonlyField label="Next 100-hr maintenance due MR" value={fmt1(s?.next_100hr_maintenance_due_mr)} />
            <ReadonlyField label="100-hr maintenance interval"   value={`${fmt1(s?.maintenance_100hr_interval_mr ?? 100)} MR hours`} />
            {s?.notes && <div className="md:col-span-2"><ReadonlyField label="Notes" value={s.notes} /></div>}
          </div>
        )}
      </div>

      {error   && <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-4 text-sm text-red-300">{error}</div>}
      {success && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4 text-sm text-emerald-300">{success}</div>}
    </div>
  )
}

function ReadonlyField({ label, value, highlight }: { label: string; value: string; highlight?: MaintenanceStatus }) {
  const valueClass = highlight === 'overdue' ? 'text-red-300' : highlight === 'due_soon' ? 'text-amber-300' : 'text-white'
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.015] px-3 py-2.5">
      <p className="text-[10px] text-slate-500 mb-0.5">{label}</p>
      <p className={`text-sm font-mono font-medium ${valueClass}`}>{value}</p>
    </div>
  )
}

function FormField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-400 block mb-1">{label}</span>
      <input
        type="number"
        step="0.1"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#0a0b0d] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"
      />
    </label>
  )
}
