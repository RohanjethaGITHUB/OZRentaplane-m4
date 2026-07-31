'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import CalendarDateField from '@/components/CalendarDateField'
import ModalPortal from '@/components/ModalPortal'
import { manuallyCompleteCheckout } from '@/app/actions/admin-booking'
import { LoadingButtonContent } from '@/components/ui/Spinner'

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
  customerName?: string | null
  pilotArn?: string | null
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
  landings: string
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

function calcTotal(start: string, stop: string): number | null {
  const s = asNum(start)
  const e = asNum(stop)
  if (s == null || e == null) return null
  return Math.round((e - s) * 10) / 10
}

const INPUT_CLASS =
  'bg-[#0d1c33] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-oz-blue/40 placeholder:text-slate-500'

function TotalCell({ total }: { total: number | null }) {
  const isNeg = total != null && total < 0
  return (
    <div
      className={`bg-[#0d1c33] border border-white/[0.06] rounded-lg px-3 py-2.5 text-sm font-mono text-center select-none ${
        isNeg ? 'text-rose-400' : total != null ? 'text-emerald-300' : 'text-slate-600'
      }`}
    >
      {total != null ? total.toFixed(1) : '—'}
    </div>
  )
}

export default function AdminManualCheckoutCompletion({
  bookingId,
  isVisible,
  aircraftLogs,
  customerName,
  pilotArn,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [completionDate, setCompletionDate] = useState(new Date().toISOString().slice(0, 10))
  const [logMode, setLogMode] = useState<LogMode>('skip')
  const [existingLogId, setExistingLogId] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [form, setForm] = useState<ReadingsForm>({
    pic_name: customerName ?? '',
    pic_arn: pilotArn ?? '',
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
    landings: '1',
    notes: '',
  })

  // Auto-computed totals — derived from form, not stored in state
  const vdoTotal = calcTotal(form.vdo_start, form.vdo_stop)
  const tachoTotal = calcTotal(form.tacho_start, form.tacho_stop)
  const airSwitchTotal = calcTotal(form.air_switch_start, form.air_switch_stop)
  const mrTotal = calcTotal(form.mr_start, form.mr_stop)

  const selectedLog = useMemo(
    () => aircraftLogs.find((log) => log.id === existingLogId) ?? null,
    [aircraftLogs, existingLogId],
  )

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pending) {
        setOpen(false)
        setConfirming(false)
        setError(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, pending])

  if (!isVisible) return null

  function setField<K extends keyof ReadingsForm>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function openModal() {
    setOpen(true)
    setError(null)
    setConfirming(false)
  }

  function closeModal() {
    if (pending) return
    setOpen(false)
    setConfirming(false)
    setError(null)
  }

  function handleSubmitClick() {
    setError(null)
    setConfirming(false)

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
      const landingsNum = Number(form.landings.trim())
      if (!form.landings.trim() || !Number.isFinite(landingsNum) || !Number.isInteger(landingsNum) || landingsNum < 1) {
        setError('Number of landings must be a whole number, minimum 1.')
        return
      }
    }

    setConfirming(true)
  }

  function confirmSubmit() {
    startTransition(async () => {
      try {
        await manuallyCompleteCheckout({
          bookingId,
          completionDate,
          outcome: 'cleared_to_fly',
          logMode,
          existingLogId: logMode === 'existing' ? existingLogId : undefined,
          newLog:
            logMode === 'create_new'
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
                    landings: asNum(form.landings),
                  },
                  notes: form.notes.trim() || null,
                }
              : undefined,
          adminNote: adminNote.trim() || null,
        })
        setOpen(false)
        setConfirming(false)
        setSuccessMessage('Checkout manually completed. Customer is now cleared to fly.')
        router.refresh()
      } catch (submitError) {
        setConfirming(false)
        const message =
          submitError instanceof Error ? submitError.message : 'Failed to manually complete checkout.'
        setError(message.replace(/^VALIDATION: /, ''))
      }
    })
  }

  return (
    <>
      {successMessage && (
        <ModalPortal lockScroll={false}>
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-3 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold whitespace-nowrap">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            {successMessage}
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="ml-1 text-emerald-200 hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        </ModalPortal>
      )}

      <button
        type="button"
        onClick={openModal}
        className="w-full px-4 py-3 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-200 text-sm font-semibold hover:bg-amber-500/30 transition-colors"
      >
        Manually complete this checkout
      </button>

      {open && (
        <ModalPortal>
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6">
            <button
              type="button"
              aria-label="Close modal"
              onClick={closeModal}
              className="absolute inset-0 bg-[#03070f]/80 backdrop-blur-sm"
            />

            <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-amber-400/25 bg-[#0a1628] shadow-[0_24px_64px_rgba(0,0,0,0.7)] p-6 sm:p-8 space-y-6">

              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-400 text-[20px]">warning</span>
                    <h2 className="text-base font-bold text-white tracking-tight">Manually complete checkout</h2>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Use this only when the checkout has already been completed outside the normal online checkout
                    flow. This will immediately clear the customer to fly, skip checkout invoice creation, and skip
                    checkout payment collection.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={pending}
                  className="shrink-0 mt-0.5 text-slate-500 hover:text-slate-200 transition-colors disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-[22px]">close</span>
                </button>
              </div>

              <div className="border-t border-white/8" />

              {/* Completion date */}
              <div>
                <label className="text-[10px] uppercase tracking-widest text-slate-400 block mb-2">
                  Checkout Completion Date
                </label>
                <CalendarDateField
                  value={completionDate}
                  onChange={setCompletionDate}
                  minYear={new Date().getFullYear() - 20}
                  maxYear={new Date().getFullYear() + 20}
                  popoverZIndex={1400}
                />
              </div>

              {/* Aircraft log handling */}
              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-widest text-slate-400">Aircraft Log Handling</p>
                <div className="space-y-2.5">
                  <label className="flex items-center gap-3 text-sm text-slate-200 cursor-pointer">
                    <input
                      type="radio"
                      checked={logMode === 'skip'}
                      onChange={() => setLogMode('skip')}
                      className="accent-amber-400"
                    />
                    Skip — do not create any aircraft log
                  </label>
                  <label className="flex items-center gap-3 text-sm text-slate-200 cursor-pointer">
                    <input
                      type="radio"
                      checked={logMode === 'existing'}
                      onChange={() => setLogMode('existing')}
                      className="accent-amber-400"
                    />
                    Associate an existing aircraft log
                  </label>
                  <label className="flex items-center gap-3 text-sm text-slate-200 cursor-pointer">
                    <input
                      type="radio"
                      checked={logMode === 'create_new'}
                      onChange={() => setLogMode('create_new')}
                      className="accent-amber-400"
                    />
                    Create a new aircraft log for this checkout
                  </label>
                </div>
              </div>

              {/* Existing log selector */}
              {logMode === 'existing' && (
                <div className="space-y-3">
                  <select
                    value={existingLogId}
                    onChange={(e) => setExistingLogId(e.target.value)}
                    className={`w-full ${INPUT_CLASS}`}
                  >
                    <option value="">Select a log</option>
                    {aircraftLogs.map((log) => (
                      <option key={log.id} value={log.id}>
                        {log.flight_date} · {log.pic_name ?? 'PIC'} · VDO {fmt(log.vdo_total)}
                      </option>
                    ))}
                  </select>
                  {selectedLog && (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300 grid grid-cols-2 gap-2">
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

              {/* New log form */}
              {logMode === 'create_new' && (
                <div className="space-y-5">

                  {/* PIC info */}
                  <div className="space-y-3">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400">Pilot in Command</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] uppercase tracking-widest text-slate-500 block mb-1.5">PIC Name</label>
                        <input
                          value={form.pic_name}
                          onChange={(e) => setField('pic_name', e.target.value)}
                          placeholder="Full name"
                          className={`w-full ${INPUT_CLASS}`}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] uppercase tracking-widest text-slate-500 block mb-1.5">PIC ARN</label>
                        <input
                          value={form.pic_arn}
                          onChange={(e) => setField('pic_arn', e.target.value)}
                          placeholder="Licence / ARN"
                          className={`w-full ${INPUT_CLASS}`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Meter readings */}
                  <div className="space-y-3">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400">Meter Readings</p>

                    {/* Column headers */}
                    <div className="grid grid-cols-[5rem_1fr_1fr_1fr] gap-2">
                      <span />
                      <span className="text-[9px] uppercase tracking-widest text-slate-500 pl-1">Start</span>
                      <span className="text-[9px] uppercase tracking-widest text-slate-500 pl-1">Stop</span>
                      <span className="text-[9px] uppercase tracking-widest text-slate-500 pl-1">Total</span>
                    </div>

                    {/* VDO */}
                    <div className="grid grid-cols-[5rem_1fr_1fr_1fr] gap-2 items-center">
                      <span className="text-sm text-slate-300">VDO</span>
                      <input
                        value={form.vdo_start}
                        onChange={(e) => setField('vdo_start', e.target.value)}
                        placeholder="0.0"
                        inputMode="decimal"
                        className={INPUT_CLASS}
                      />
                      <input
                        value={form.vdo_stop}
                        onChange={(e) => setField('vdo_stop', e.target.value)}
                        placeholder="0.0"
                        inputMode="decimal"
                        className={INPUT_CLASS}
                      />
                      <TotalCell total={vdoTotal} />
                    </div>

                    {/* Tacho */}
                    <div className="grid grid-cols-[5rem_1fr_1fr_1fr] gap-2 items-center">
                      <span className="text-sm text-slate-300">Tacho</span>
                      <input
                        value={form.tacho_start}
                        onChange={(e) => setField('tacho_start', e.target.value)}
                        placeholder="0.0"
                        inputMode="decimal"
                        className={INPUT_CLASS}
                      />
                      <input
                        value={form.tacho_stop}
                        onChange={(e) => setField('tacho_stop', e.target.value)}
                        placeholder="0.0"
                        inputMode="decimal"
                        className={INPUT_CLASS}
                      />
                      <TotalCell total={tachoTotal} />
                    </div>

                    {/* Airswitch */}
                    <div className="grid grid-cols-[5rem_1fr_1fr_1fr] gap-2 items-center">
                      <span className="text-sm text-slate-300">Airswitch</span>
                      <input
                        value={form.air_switch_start}
                        onChange={(e) => setField('air_switch_start', e.target.value)}
                        placeholder="0.0"
                        inputMode="decimal"
                        className={INPUT_CLASS}
                      />
                      <input
                        value={form.air_switch_stop}
                        onChange={(e) => setField('air_switch_stop', e.target.value)}
                        placeholder="0.0"
                        inputMode="decimal"
                        className={INPUT_CLASS}
                      />
                      <TotalCell total={airSwitchTotal} />
                    </div>

                    {/* MR */}
                    <div className="grid grid-cols-[5rem_1fr_1fr_1fr] gap-2 items-center">
                      <span className="text-sm text-slate-300">MR</span>
                      <input
                        value={form.mr_start}
                        onChange={(e) => setField('mr_start', e.target.value)}
                        placeholder="0.0"
                        inputMode="decimal"
                        className={INPUT_CLASS}
                      />
                      <input
                        value={form.mr_stop}
                        onChange={(e) => setField('mr_stop', e.target.value)}
                        placeholder="0.0"
                        inputMode="decimal"
                        className={INPUT_CLASS}
                      />
                      <TotalCell total={mrTotal} />
                    </div>
                  </div>

                  {/* Oil and fuel */}
                  <div className="space-y-3">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400">Oil &amp; Fuel</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="text-[9px] uppercase tracking-widest text-slate-500 block mb-1.5">Oil added</label>
                        <input
                          value={form.oil_added}
                          onChange={(e) => setField('oil_added', e.target.value)}
                          placeholder="0.0"
                          inputMode="decimal"
                          className={`w-full ${INPUT_CLASS}`}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] uppercase tracking-widest text-slate-500 block mb-1.5">Oil total</label>
                        <input
                          value={form.oil_total}
                          onChange={(e) => setField('oil_total', e.target.value)}
                          placeholder="0.0"
                          inputMode="decimal"
                          className={`w-full ${INPUT_CLASS}`}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] uppercase tracking-widest text-slate-500 block mb-1.5">Fuel added</label>
                        <input
                          value={form.fuel_added}
                          onChange={(e) => setField('fuel_added', e.target.value)}
                          placeholder="0.0"
                          inputMode="decimal"
                          className={`w-full ${INPUT_CLASS}`}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] uppercase tracking-widest text-slate-500 block mb-1.5">Fuel returned</label>
                        <input
                          value={form.fuel_returned}
                          onChange={(e) => setField('fuel_returned', e.target.value)}
                          placeholder="0.0"
                          inputMode="decimal"
                          className={`w-full ${INPUT_CLASS}`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Landings */}
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-slate-400 block mb-2">
                      Number of Landings
                    </label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={form.landings}
                      onChange={(e) => setField('landings', e.target.value)}
                      className={`w-32 ${INPUT_CLASS}`}
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-slate-400 block mb-2">
                      Log Notes (optional)
                    </label>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setField('notes', e.target.value)}
                      rows={2}
                      placeholder="Any notes for this flight log entry"
                      className={`w-full ${INPUT_CLASS}`}
                    />
                  </div>

                </div>
              )}

              {/* Admin note */}
              <div>
                <label className="text-[10px] uppercase tracking-widest text-slate-400 block mb-2">
                  Admin Note (optional)
                </label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  rows={2}
                  placeholder="Internal note for this manual completion"
                  className={`w-full ${INPUT_CLASS}`}
                />
              </div>

              {error && (
                <p className="text-sm text-rose-400 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[15px]">error</span>
                  {error}
                </p>
              )}

              {/* Confirmation step */}
              {confirming && (
                <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-5 space-y-3">
                  <p className="text-sm font-semibold text-amber-200 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">warning</span>
                    Confirm override
                  </p>
                  <p className="text-sm text-amber-100/70 leading-relaxed">
                    This will immediately set the customer to{' '}
                    <strong className="text-amber-200">Clear to Fly</strong> and skip invoice and payment
                    creation. This action cannot be undone.
                  </p>
                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      disabled={pending}
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm bg-white/5 text-slate-300 hover:bg-white/10 transition-colors disabled:opacity-40"
                    >
                      Go back
                    </button>
                    <button
                      type="button"
                      onClick={confirmSubmit}
                      disabled={pending}
                      aria-busy={pending || undefined}
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm bg-amber-500 text-slate-900 font-bold hover:bg-amber-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <LoadingButtonContent loading={pending} loadingLabel="Completing…">
                        Yes, complete now
                      </LoadingButtonContent>
                    </button>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              {!confirming && (
                <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-white/8">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={pending}
                    className="sm:flex-1 px-4 py-3 rounded-xl text-sm bg-white/5 text-slate-300 hover:bg-white/10 transition-colors disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitClick}
                    disabled={pending}
                    className="sm:flex-[2] px-4 py-3 rounded-xl text-sm bg-amber-500 text-slate-900 font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
                  >
                    Complete checkout and clear to fly
                  </button>
                </div>
              )}
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  )
}
