'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import CalendarDateField from '@/components/CalendarDateField'
import { manuallyCompleteCheckout } from '@/app/actions/admin-booking'

type AircraftLog = {
  id: string
  flight_date: string
  pic_name: string | null
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
  source: string | null
  review_status: string | null
}

export type Props = {
  bookingId: string
  isVisible: boolean
  aircraftLogs: AircraftLog[]
}

type LogMode = 'skip' | 'existing' | 'create_new'

type ReadingsForm = {
  pic_name: string
  pic_arn: string
  vdo_start: string
  vdo_stop: string
  tacho_start: string
  tacho_stop: string
  air_switch_start: string
  air_switch_stop: string
  mr_start: string
  mr_stop: string
  oil_added: string
  oil_total: string
  fuel_added: string
  fuel_returned: string
  notes: string
}

function asNum(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function fmt(n: number | null | undefined): string {
  return n == null ? '—' : n.toFixed(1)
}

export default function AdminManualCheckoutCompletion({ bookingId, isVisible, aircraftLogs }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [completionDate, setCompletionDate] = useState(new Date().toISOString().slice(0, 10))
  const [logMode, setLogMode] = useState<LogMode>('skip')
  const [existingLogId, setExistingLogId] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [form, setForm] = useState<ReadingsForm>({
    pic_name: '',
    pic_arn: '',
    vdo_start: '',
    vdo_stop: '',
    tacho_start: '',
    tacho_stop: '',
    air_switch_start: '',
    air_switch_stop: '',
    mr_start: '',
    mr_stop: '',
    oil_added: '',
    oil_total: '',
    fuel_added: '',
    fuel_returned: '',
    notes: '',
  })

  const selectedLog = useMemo(
    () => aircraftLogs.find((log) => log.id === existingLogId) ?? null,
    [aircraftLogs, existingLogId],
  )

  if (!isVisible) return null

  function setField<K extends keyof ReadingsForm>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function submit() {
    setError(null)

    if (!completionDate) {
      setError('Manual completion date is required.')
      return
    }
    if (logMode === 'existing' && !existingLogId) {
      setError('Select an existing aircraft log.')
      return
    }
    if (logMode === 'create_new') {
      if (!form.pic_name.trim()) {
        setError('PIC name is required.')
        return
      }
      const required: Array<[string, string, string]> = [
        ['VDO', form.vdo_start, form.vdo_stop],
        ['Tacho', form.tacho_start, form.tacho_stop],
        ['Airswitch', form.air_switch_start, form.air_switch_stop],
        ['MR', form.mr_start, form.mr_stop],
      ]
      for (const [label, start, stop] of required) {
        const startNum = asNum(start)
        const stopNum = asNum(stop)
        if (startNum == null || stopNum == null) {
          setError(`${label} start and stop are required.`)
          return
        }
        if (stopNum < startNum) {
          setError(`${label} stop cannot be less than start.`)
          return
        }
      }
    }

    const confirmed = window.confirm(
      'Manually complete this checkout now? This will immediately set the customer to Clear to Fly and skip invoice/payment creation.',
    )
    if (!confirmed) return

    startTransition(async () => {
      try {
        await manuallyCompleteCheckout({
          bookingId,
          completionDate,
          outcome: 'cleared_to_fly',
          logMode,
          existingLogId: logMode === 'existing' ? existingLogId : undefined,
          newLog: logMode === 'create_new'
            ? {
                picName: form.pic_name.trim(),
                picArn: form.pic_arn.trim() || null,
                readings: {
                  vdo_start: asNum(form.vdo_start),
                  vdo_stop: asNum(form.vdo_stop),
                  tacho_start: asNum(form.tacho_start),
                  tacho_stop: asNum(form.tacho_stop),
                  air_switch_start: asNum(form.air_switch_start),
                  air_switch_stop: asNum(form.air_switch_stop),
                  mr_start: asNum(form.mr_start),
                  mr_stop: asNum(form.mr_stop),
                  oil_added: asNum(form.oil_added),
                  oil_total: asNum(form.oil_total),
                  fuel_added: asNum(form.fuel_added),
                  fuel_returned: asNum(form.fuel_returned),
                  notes: form.notes.trim() || null,
                  landings: null,
                },
                notes: form.notes.trim() || null,
              }
            : undefined,
          adminNote: adminNote.trim() || null,
        })
        setOpen(false)
        router.refresh()
      } catch (submitError) {
        const message = submitError instanceof Error ? submitError.message : 'Failed to manually complete checkout.'
        setError(message.replace(/^VALIDATION: /, ''))
      }
    })
  }

  return (
    <div className="mt-2 w-full max-w-sm">
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setError(null) }}
        className="w-full px-4 py-3 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-200 text-sm font-semibold hover:bg-amber-500/30 transition-colors"
      >
        Manually complete this checkout
      </button>

      {open && (
        <div className="mt-3 rounded-2xl border border-amber-400/30 bg-[#101a2e] p-4 space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-amber-300/80">Manual Completion</p>
            <p className="text-xs text-slate-300 mt-1">Outcome is fixed to Clear to Fly. Invoice/payment will be skipped.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-400 block mb-1">Completion Date</label>
              <CalendarDateField
                value={completionDate}
                onChange={setCompletionDate}
                minYear={new Date().getFullYear() - 20}
                maxYear={new Date().getFullYear() + 20}
                className="w-full bg-[#0d1c33] border border-white/10 rounded-lg px-3 py-2 text-xs text-white text-left flex items-center justify-between"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-400 block mb-1">Outcome</label>
              <input
                value="Clear to fly"
                disabled
                className="w-full bg-[#0d1c33] border border-white/10 rounded-lg px-3 py-2 text-xs text-emerald-300"
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-400">Aircraft Log Handling</p>
            <label className="flex items-center gap-2 text-xs text-slate-200"><input type="radio" checked={logMode === 'skip'} onChange={() => setLogMode('skip')} /> Skip, do not create any aircraft log</label>
            <label className="flex items-center gap-2 text-xs text-slate-200"><input type="radio" checked={logMode === 'existing'} onChange={() => setLogMode('existing')} /> Choose existing aircraft log to associate with this checkout</label>
            <label className="flex items-center gap-2 text-xs text-slate-200"><input type="radio" checked={logMode === 'create_new'} onChange={() => setLogMode('create_new')} /> Create a new aircraft log for this checkout</label>
          </div>

          {logMode === 'existing' && (
            <div className="space-y-2">
              <select
                value={existingLogId}
                onChange={(e) => setExistingLogId(e.target.value)}
                className="w-full bg-[#0d1c33] border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
              >
                <option value="">Select a log</option>
                {aircraftLogs.map((log) => (
                  <option key={log.id} value={log.id}>
                    {log.flight_date} · {log.pic_name ?? 'PIC'} · VDO {fmt(log.vdo_total)}
                  </option>
                ))}
              </select>
              {selectedLog && (
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-300 grid grid-cols-2 gap-2">
                  <p>Date: {selectedLog.flight_date}</p>
                  <p>PIC: {selectedLog.pic_name ?? '—'}</p>
                  <p>PIC ARN: {selectedLog.pic_arn ?? '—'}</p>
                  <p>Source: {selectedLog.source ?? '—'}</p>
                  <p>VDO: {fmt(selectedLog.vdo_start)} / {fmt(selectedLog.vdo_stop)} / {fmt(selectedLog.vdo_total)}</p>
                  <p>Tacho: {fmt(selectedLog.tacho_start)} / {fmt(selectedLog.tacho_stop)} / {fmt(selectedLog.tacho_total)}</p>
                  <p>Airswitch: {fmt(selectedLog.air_switch_start)} / {fmt(selectedLog.air_switch_stop)} / {fmt(selectedLog.air_switch_total)}</p>
                  <p>MR: {fmt(selectedLog.mr_start)} / {fmt(selectedLog.mr_stop)} / {fmt(selectedLog.mr_total)}</p>
                  <p>Oil: {fmt(selectedLog.oil_added)} / {fmt(selectedLog.oil_total)}</p>
                  <p>Fuel: {fmt(selectedLog.fuel_added)} / {fmt(selectedLog.fuel_returned)}</p>
                </div>
              )}
            </div>
          )}

          {logMode === 'create_new' && (
            <div className="space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input value={form.pic_name} onChange={(e) => setField('pic_name', e.target.value)} placeholder="PIC name" className="bg-[#0d1c33] border border-white/10 rounded-lg px-3 py-2 text-xs text-white" />
                <input value={form.pic_arn} onChange={(e) => setField('pic_arn', e.target.value)} placeholder="PIC ARN" className="bg-[#0d1c33] border border-white/10 rounded-lg px-3 py-2 text-xs text-white" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <input value={form.vdo_start} onChange={(e) => setField('vdo_start', e.target.value)} placeholder="VDO start" className="bg-[#0d1c33] border border-white/10 rounded-lg px-3 py-2 text-xs text-white" />
                <input value={form.vdo_stop} onChange={(e) => setField('vdo_stop', e.target.value)} placeholder="VDO stop" className="bg-[#0d1c33] border border-white/10 rounded-lg px-3 py-2 text-xs text-white" />
                <input value={form.tacho_start} onChange={(e) => setField('tacho_start', e.target.value)} placeholder="Tacho start" className="bg-[#0d1c33] border border-white/10 rounded-lg px-3 py-2 text-xs text-white" />
                <input value={form.tacho_stop} onChange={(e) => setField('tacho_stop', e.target.value)} placeholder="Tacho stop" className="bg-[#0d1c33] border border-white/10 rounded-lg px-3 py-2 text-xs text-white" />
                <input value={form.air_switch_start} onChange={(e) => setField('air_switch_start', e.target.value)} placeholder="Airswitch start" className="bg-[#0d1c33] border border-white/10 rounded-lg px-3 py-2 text-xs text-white" />
                <input value={form.air_switch_stop} onChange={(e) => setField('air_switch_stop', e.target.value)} placeholder="Airswitch stop" className="bg-[#0d1c33] border border-white/10 rounded-lg px-3 py-2 text-xs text-white" />
                <input value={form.mr_start} onChange={(e) => setField('mr_start', e.target.value)} placeholder="MR start" className="bg-[#0d1c33] border border-white/10 rounded-lg px-3 py-2 text-xs text-white" />
                <input value={form.mr_stop} onChange={(e) => setField('mr_stop', e.target.value)} placeholder="MR stop" className="bg-[#0d1c33] border border-white/10 rounded-lg px-3 py-2 text-xs text-white" />
                <input value={form.oil_added} onChange={(e) => setField('oil_added', e.target.value)} placeholder="Oil added" className="bg-[#0d1c33] border border-white/10 rounded-lg px-3 py-2 text-xs text-white" />
                <input value={form.oil_total} onChange={(e) => setField('oil_total', e.target.value)} placeholder="Oil total" className="bg-[#0d1c33] border border-white/10 rounded-lg px-3 py-2 text-xs text-white" />
                <input value={form.fuel_added} onChange={(e) => setField('fuel_added', e.target.value)} placeholder="Fuel added" className="bg-[#0d1c33] border border-white/10 rounded-lg px-3 py-2 text-xs text-white" />
                <input value={form.fuel_returned} onChange={(e) => setField('fuel_returned', e.target.value)} placeholder="Fuel returned" className="bg-[#0d1c33] border border-white/10 rounded-lg px-3 py-2 text-xs text-white" />
              </div>
              <textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={2} placeholder="Notes" className="w-full bg-[#0d1c33] border border-white/10 rounded-lg px-3 py-2 text-xs text-white" />
            </div>
          )}

          <textarea
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            rows={2}
            placeholder="Admin note (optional)"
            className="w-full bg-[#0d1c33] border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
          />

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="flex-1 px-3 py-2 rounded-lg text-xs bg-white/5 text-slate-300">Close</button>
            <button type="button" onClick={submit} disabled={pending} className="flex-1 px-3 py-2 rounded-lg text-xs bg-amber-500 text-slate-900 font-semibold disabled:opacity-50">
              {pending ? 'Completing…' : 'Complete checkout manually'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
