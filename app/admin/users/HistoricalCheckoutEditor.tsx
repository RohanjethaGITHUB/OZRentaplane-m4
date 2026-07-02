'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import CalendarDateField from '@/components/CalendarDateField'
import { getHistoricalCheckoutLogBaseline, recordHistoricalCheckoutCompletion } from '@/app/actions/historical-checkout'

const SHOW_ADMIN_DIRECT_CHECKOUT_COMPLETE_ACTION = true

type Outcome = 'cleared_to_fly' | 'additional_checkout_required' | 'not_currently_eligible'
type LogMode = 'none' | 'link_existing' | 'create_new'
type MeterKey = 'vdo' | 'tacho' | 'air_switch' | 'mr'
type MeterRow = { start: string; stop: string; total: string }
type ResolvedMeter = { start: number; stop: number; total: number }

type AircraftOption = { id: string; registration: string; displayName: string }
type ExistingLogOption = {
  id: string
  aircraftId: string
  aircraftRegistration: string
  aircraftDisplayName: string | null
  flightDate: string
  picName: string
  picArn: string | null
  vdoStart: number | null
  vdoStop: number | null
  vdoTotal: number | null
  tachoStart: number | null
  tachoStop: number | null
  tachoTotal: number | null
  airSwitchStart: number | null
  airSwitchStop: number | null
  airSwitchTotal: number | null
  mrStart: number | null
  mrStop: number | null
  mrTotal: number | null
  oilAdded: number | null
  oilTotal: number | null
  fuelAdded: number | null
  fuelReturned: number | null
  landings: number | null
  source: string | null
  reviewStatus: string | null
}

type HistoricalRecordSummary = {
  id: string
  checkoutDate: string
  checkoutOutcome: Outcome
  adminNotes: string | null
  recordedAt: string
  recordedByName: string | null
  recordedByEmail: string | null
  linkedFlightLogId: string | null
  linkedFlightLogAircraftId: string | null
  linkedFlightLogAircraftRegistration: string | null
  linkedFlightLogDate: string | null
}

type Props = {
  customerId: string
  customerName: string
  clearanceStatus: string
  hasActiveCheckoutRequest: boolean
  defaultPicArn?: string | null
  aircraftOptions: AircraftOption[]
  existingLogs: ExistingLogOption[]
  historicalRecord: HistoricalRecordSummary | null
  renderMode?: 'card' | 'button_only' | 'summary_only'
}

function prettyOutcome(outcome: string): string {
  return outcome.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function prettyValue(value: number | string | null | undefined): string {
  if (value == null || value === '') return 'Not recorded'
  return String(value)
}

function parseMaybeNumber(value: string): number | null {
  if (!value.trim()) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toFixed1(value: number): string {
  return String(Math.round(value * 10) / 10)
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function resolveMeterRow(label: string, row: MeterRow): ResolvedMeter {
  const start = parseMaybeNumber(row.start)
  const stopInput = parseMaybeNumber(row.stop)
  const totalInput = parseMaybeNumber(row.total)

  if (start == null) throw new Error(`VALIDATION: ${label} start is required.`)
  if (stopInput == null && totalInput == null) {
    throw new Error(`VALIDATION: ${label} requires stop or total.`)
  }

  let stop = stopInput
  let total = totalInput

  if (stop == null && total != null) stop = round1(start + total)
  if (total == null && stop != null) total = round1(stop - start)

  if (stop == null || total == null) throw new Error(`VALIDATION: Could not resolve ${label} stop/total.`)
  if (stop < start) throw new Error(`VALIDATION: ${label} stop cannot be less than start.`)
  if (total < 0) throw new Error(`VALIDATION: ${label} total cannot be negative.`)
  if (total === 0) throw new Error(`VALIDATION: ${label} total must be greater than 0 for historical checkout logs.`)
  if (stopInput != null && totalInput != null) {
    const expectedStop = round1(start + totalInput)
    if (Math.abs(expectedStop - stopInput) > 0.1) {
      throw new Error(`VALIDATION: ${label} stop and total conflict. Adjust one value.`)
    }
  }

  return { start, stop, total }
}

const EMPTY_METERS: Record<MeterKey, MeterRow> = {
  vdo: { start: '', stop: '', total: '' },
  tacho: { start: '', stop: '', total: '' },
  air_switch: { start: '', stop: '', total: '' },
  mr: { start: '', stop: '', total: '' },
}

export default function HistoricalCheckoutEditor({ renderMode = 'card', ...props }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [checkoutDate, setCheckoutDate] = useState('')
  const [checkoutOutcome, setCheckoutOutcome] = useState<Outcome>('cleared_to_fly')
  const [adminNotes, setAdminNotes] = useState('')
  const [acknowledgeActiveCheckout, setAcknowledgeActiveCheckout] = useState(false)

  const [logMode, setLogMode] = useState<LogMode>('none')
  const [linkedFlightLogId, setLinkedFlightLogId] = useState('')

  const [aircraftId, setAircraftId] = useState('')
  const [picName, setPicName] = useState(props.customerName)
  const [picArn, setPicArn] = useState(props.defaultPicArn ?? '')

  const [meters, setMeters] = useState<Record<MeterKey, MeterRow>>(EMPTY_METERS)
  const [meterError, setMeterError] = useState<string | null>(null)
  const [oilAdded, setOilAdded] = useState('')
  const [oilTotal, setOilTotal] = useState('')
  const [fuelAdded, setFuelAdded] = useState('')
  const [fuelReturned, setFuelReturned] = useState('')
  const [landings, setLandings] = useState('')
  const [logNotes, setLogNotes] = useState('')

  const disableAction = props.clearanceStatus === 'cleared_to_fly' || Boolean(props.historicalRecord)
  const selectedLog = useMemo(() => props.existingLogs.find((log) => log.id === linkedFlightLogId) ?? null, [linkedFlightLogId, props.existingLogs])
  const preferredAircraftId = useMemo(() => {
    if (!props.aircraftOptions.length) return ''
    const kzg = props.aircraftOptions.find((a) => a.registration === 'VH-KZG' || a.displayName.toLowerCase().includes('cessna 172'))
    return kzg?.id ?? props.aircraftOptions[0]!.id
  }, [props.aircraftOptions])

  const SELECT_CLASS =
    'w-full appearance-none rounded-lg border border-[#152d5a]/15 bg-white px-3 py-2 pr-9 text-[#152d5a] shadow-inner outline-none transition focus:border-oz-blue/50 focus:ring-1 focus:ring-oz-blue/40'

  useEffect(() => {
    if (logMode !== 'create_new') return
    if (!aircraftId && preferredAircraftId) setAircraftId(preferredAircraftId)
    if (!picArn && props.defaultPicArn) setPicArn(props.defaultPicArn)
  }, [logMode, aircraftId, preferredAircraftId, picArn, props.defaultPicArn])

  useEffect(() => {
    if (logMode !== 'create_new' || !aircraftId) return
    startTransition(async () => {
      try {
        const baseline = await getHistoricalCheckoutLogBaseline(aircraftId)
        setMeters({
          vdo: { start: prettyValue(baseline.vdo_start), stop: '', total: '' },
          tacho: { start: prettyValue(baseline.tacho_start), stop: '', total: '' },
          air_switch: { start: prettyValue(baseline.air_switch_start), stop: '', total: '' },
          mr: { start: prettyValue(baseline.mr_start), stop: '', total: '' },
        })
      } catch {
        // best-effort baseline load
      }
    })
  }, [aircraftId, logMode])

  function updateMeterFromTotal(key: MeterKey, totalRaw: string) {
    setMeters((prev) => {
      const row = prev[key]
      const start = parseMaybeNumber(row.start)
      const total = parseMaybeNumber(totalRaw)
      const stop = start != null && total != null ? start + total : parseMaybeNumber(row.stop)
      return {
        ...prev,
        [key]: {
          ...row,
          total: totalRaw,
          stop: stop != null ? toFixed1(stop) : row.stop,
        },
      }
    })
  }

  function updateMeterFromStop(key: MeterKey, stopRaw: string) {
    setMeters((prev) => {
      const row = prev[key]
      const start = parseMaybeNumber(row.start)
      const stop = parseMaybeNumber(stopRaw)
      const total = start != null && stop != null ? stop - start : parseMaybeNumber(row.total)
      return {
        ...prev,
        [key]: {
          ...row,
          stop: stopRaw,
          total: total != null ? toFixed1(total) : row.total,
        },
      }
    })
  }

  function updateMeterFromStart(key: MeterKey, startRaw: string) {
    setMeters((prev) => {
      const row = prev[key]
      const start = parseMaybeNumber(startRaw)
      const total = parseMaybeNumber(row.total)
      const stop = start != null && total != null ? start + total : parseMaybeNumber(row.stop)
      return {
        ...prev,
        [key]: {
          ...row,
          start: startRaw,
          stop: stop != null ? toFixed1(stop) : row.stop,
        },
      }
    })
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setMeterError(null)

    startTransition(async () => {
      try {
        if (logMode === 'link_existing') {
          await recordHistoricalCheckoutCompletion({
            customerId: props.customerId,
            checkoutDate,
            checkoutOutcome,
            adminNotes,
            acknowledgeActiveCheckout,
            logMode,
            linkedFlightLogId,
          })
        } else if (logMode === 'create_new') {
          const vdo = resolveMeterRow('VDO', meters.vdo)
          const tacho = resolveMeterRow('Tacho', meters.tacho)
          const airSwitch = resolveMeterRow('Airswitch', meters.air_switch)
          const mr = resolveMeterRow('MR', meters.mr)

          const readings = {
            vdo_start: vdo.start,
            vdo_stop: vdo.stop,
            tacho_start: tacho.start,
            tacho_stop: tacho.stop,
            air_switch_start: airSwitch.start,
            air_switch_stop: airSwitch.stop,
            mr_start: mr.start,
            mr_stop: mr.stop,
            oil_added: parseMaybeNumber(oilAdded),
            oil_total: parseMaybeNumber(oilTotal),
            fuel_added: parseMaybeNumber(fuelAdded),
            fuel_returned: parseMaybeNumber(fuelReturned),
            landings: parseMaybeNumber(landings) != null ? Math.round(parseMaybeNumber(landings)!) : null,
            notes: logNotes.trim() || null,
          }

          await recordHistoricalCheckoutCompletion({
            customerId: props.customerId,
            checkoutDate,
            checkoutOutcome,
            adminNotes,
            acknowledgeActiveCheckout,
            logMode,
            aircraftId,
            picName,
            picArn,
            readings,
          })
        } else {
          await recordHistoricalCheckoutCompletion({
            customerId: props.customerId,
            checkoutDate,
            checkoutOutcome,
            adminNotes,
            acknowledgeActiveCheckout,
            logMode,
          })
        }

        setOpen(false)
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to record historical checkout.'
        const cleaned = message.replace(/^VALIDATION:\s*/, '')
        if (cleaned.toLowerCase().includes('start') || cleaned.toLowerCase().includes('stop') || cleaned.toLowerCase().includes('total')) {
          setMeterError(cleaned)
        } else {
          setError(cleaned)
        }
      }
    })
  }

  const actionButton = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      disabled={disableAction}
      className="rounded-xl border border-blue-400/25 bg-blue-500/10 px-4 py-2 text-[13px] font-bold uppercase tracking-widest text-[#1a4fd6] transition-colors hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
    >
      Mark Checkout Completed
    </button>
  )

  return (
    <div className="space-y-4">
      {renderMode === 'card' ? (
        <div className="rounded-xl border border-[#152d5a]/10 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-widest text-[#4b6390]">Historical Checkout</p>
              <p className="mt-1 text-[14px] text-[#4b6390]">Record checkout completion without creating invoices, payments, or calendar bookings.</p>
            </div>
            {SHOW_ADMIN_DIRECT_CHECKOUT_COMPLETE_ACTION && actionButton}
          </div>
          {SHOW_ADMIN_DIRECT_CHECKOUT_COMPLETE_ACTION && disableAction ? (
            <p className="mt-2 text-[13px] text-amber-300/90">
              {props.historicalRecord ? 'A historical checkout record already exists for this customer.' : 'Customer is already cleared to fly.'}
            </p>
          ) : null}
        </div>
      ) : renderMode === 'button_only' && SHOW_ADMIN_DIRECT_CHECKOUT_COMPLETE_ACTION ? actionButton : null}

      {props.historicalRecord ? (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-[14px] text-emerald-100">
          <p className="text-[13px] font-bold uppercase tracking-widest text-emerald-300">Pre-portal checkout completed</p>
          <p className="mt-2">Date: {props.historicalRecord.checkoutDate}</p>
          <p>Outcome: {prettyOutcome(props.historicalRecord.checkoutOutcome)}</p>
          <p>Recorded by: {props.historicalRecord.recordedByName || 'Admin'}{props.historicalRecord.recordedByEmail ? ` (${props.historicalRecord.recordedByEmail})` : ''}</p>
          {props.historicalRecord.linkedFlightLogId ? <p>Linked flight log: {props.historicalRecord.linkedFlightLogAircraftRegistration || 'Aircraft'} ({props.historicalRecord.linkedFlightLogDate || 'No date'})</p> : null}
          {props.historicalRecord.adminNotes ? <p>Notes: {props.historicalRecord.adminNotes}</p> : null}
        </div>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-[#152d5a]/25 px-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-[#152d5a]/10 bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-[#152d5a]">Mark Checkout Completed</h3>
                <p className="mt-2 text-[14px] text-[#4b6390]">This records a checkout that was completed before or outside the portal. No invoice, payment ledger, or schedule block will be created.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-[#152d5a]/15 p-2 text-[#4b6390] hover:bg-white/10 hover:text-[#152d5a]" aria-label="Close dialog">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={onSubmit} className="mt-5 space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <span className="text-[14px] text-[#4b6390]">Checkout completion date</span>
                  <CalendarDateField
                    value={checkoutDate}
                    onChange={setCheckoutDate}
                    minYear={2010}
                    maxYear={new Date().getFullYear()}
                    maxDate={new Date().toISOString().slice(0, 10)}
                    required
                    className="w-full bg-white border border-[#152d5a]/15 focus:border-oz-blue/50 focus:outline-none text-[14px] text-[#152d5a] rounded-lg px-3 py-2 text-left flex items-center justify-between"
                  />
                </div>
                <label className="space-y-1 text-[14px] text-[#4b6390]">
                  <span>Checkout outcome</span>
                  <div className="relative">
                    <select value={checkoutOutcome} onChange={(e) => setCheckoutOutcome(e.target.value as Outcome)} className={SELECT_CLASS}>
                      <option value="cleared_to_fly">Cleared to fly</option>
                      <option value="additional_checkout_required">Additional checkout required</option>
                      <option value="not_currently_eligible">Not currently eligible</option>
                    </select>
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#4b6390] material-symbols-outlined text-[18px]">expand_more</span>
                  </div>
                </label>
              </div>

              <label className="block space-y-1 text-[14px] text-[#4b6390]">
                <span>Admin notes</span>
                <textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} rows={3} className="w-full rounded-lg border border-[#152d5a]/15 bg-white px-3 py-2 text-[#152d5a]" placeholder="Optional context about historical completion." />
              </label>

              {props.hasActiveCheckoutRequest ? (
                <label className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-[14px] text-amber-100">
                  <input type="checkbox" checked={acknowledgeActiveCheckout} onChange={(e) => setAcknowledgeActiveCheckout(e.target.checked)} className="mt-0.5" />
                  <span>Customer already has an active checkout request. Confirm you still want to record historical completion.</span>
                </label>
              ) : null}

              <div className="space-y-3 rounded-xl border border-[#152d5a]/10 p-4">
                <p className="text-[15px] font-semibold text-[#152d5a]">Aircraft log handling</p>
                <p className="text-[14px] text-[#4b6390]">Choose whether to link this checkout to an aircraft flight log.</p>
                <div className="space-y-2 text-[14px] text-[#4b6390]">
                  <label className="flex items-center gap-2"><input type="radio" name="logMode" checked={logMode === 'none'} onChange={() => setLogMode('none')} /> No aircraft log link</label>
                  <label className="flex items-center gap-2"><input type="radio" name="logMode" checked={logMode === 'link_existing'} onChange={() => setLogMode('link_existing')} /> Link existing aircraft flight log</label>
                  <label className="flex items-center gap-2"><input type="radio" name="logMode" checked={logMode === 'create_new'} onChange={() => setLogMode('create_new')} /> Create new aircraft flight log</label>
                </div>
              </div>

              {logMode === 'link_existing' ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[14px] text-[#4b6390]">Existing flight log</label>
                    <div className="relative">
                      <select value={linkedFlightLogId} onChange={(e) => setLinkedFlightLogId(e.target.value)} required className={SELECT_CLASS}>
                        <option value="">Select flight log...</option>
                        {props.existingLogs.map((log) => (
                          <option key={log.id} value={log.id}>{log.flightDate} · {log.aircraftRegistration} · {log.picName}</option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#4b6390] material-symbols-outlined text-[18px]">expand_more</span>
                    </div>
                  </div>
                  {selectedLog ? (
                    <div className="rounded-xl border border-[#152d5a]/10 bg-white p-4">
                      <p className="text-[14px] font-semibold text-[#152d5a]">Selected log preview</p>
                      <div className="mt-2 grid gap-2 text-[14px] text-[#4b6390] md:grid-cols-2">
                        <p>Aircraft: {selectedLog.aircraftRegistration} {selectedLog.aircraftDisplayName ? `(${selectedLog.aircraftDisplayName})` : ''}</p>
                        <p>Date: {selectedLog.flightDate}</p>
                        <p>PIC name: {prettyValue(selectedLog.picName)}</p>
                        <p>PIC ARN: {prettyValue(selectedLog.picArn)}</p>
                        <p>VDO: {prettyValue(selectedLog.vdoStart)} / {prettyValue(selectedLog.vdoStop)} / {prettyValue(selectedLog.vdoTotal)}</p>
                        <p>Tacho: {prettyValue(selectedLog.tachoStart)} / {prettyValue(selectedLog.tachoStop)} / {prettyValue(selectedLog.tachoTotal)}</p>
                        <p>Airswitch: {prettyValue(selectedLog.airSwitchStart)} / {prettyValue(selectedLog.airSwitchStop)} / {prettyValue(selectedLog.airSwitchTotal)}</p>
                        <p>MR: {prettyValue(selectedLog.mrStart)} / {prettyValue(selectedLog.mrStop)} / {prettyValue(selectedLog.mrTotal)}</p>
                        <p>Oil: added {prettyValue(selectedLog.oilAdded)} / total {prettyValue(selectedLog.oilTotal)}</p>
                        <p>Fuel: added {prettyValue(selectedLog.fuelAdded)} / returned {prettyValue(selectedLog.fuelReturned)}</p>
                        <p>Landings: {prettyValue(selectedLog.landings)}</p>
                        <p>Source/Status: {prettyValue(selectedLog.source)} / {prettyValue(selectedLog.reviewStatus)}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {logMode === 'create_new' ? (
                <div className="space-y-4 rounded-xl border border-[#152d5a]/10 p-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-1 text-[14px] text-[#4b6390]">
                      <span>Aircraft</span>
                      <div className="relative">
                        <select value={aircraftId} onChange={(e) => setAircraftId(e.target.value)} required className={SELECT_CLASS}>
                          <option value="">Select aircraft...</option>
                          {props.aircraftOptions.map((a) => <option key={a.id} value={a.id}>{a.registration} · {a.displayName}</option>)}
                        </select>
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#4b6390] material-symbols-outlined text-[18px]">expand_more</span>
                      </div>
                    </label>
                    <label className="space-y-1 text-[14px] text-[#4b6390]">
                      <span>PIC name</span>
                      <input value={picName} onChange={(e) => setPicName(e.target.value)} required className="w-full rounded-lg border border-[#152d5a]/15 bg-white px-3 py-2 text-[#152d5a]" />
                    </label>
                    <label className="space-y-1 text-[14px] text-[#4b6390] md:col-span-2">
                      <span>PIC ARN</span>
                      <input value={picArn} onChange={(e) => setPicArn(e.target.value)} className="w-full rounded-lg border border-[#152d5a]/15 bg-white px-3 py-2 text-[#152d5a]" />
                    </label>
                  </div>

                  <div className="space-y-3">
                    <div className="grid items-center gap-2 md:grid-cols-[120px_1fr_1fr_1fr]">
                      <p className="text-[14px] font-bold uppercase tracking-wide text-[#4b6390]">Reading</p>
                      <p className="text-[14px] font-bold uppercase tracking-wide text-[#4b6390]">Start</p>
                      <p className="text-[14px] font-bold uppercase tracking-wide text-[#4b6390]">Stop</p>
                      <p className="text-[14px] font-bold uppercase tracking-wide text-[#4b6390]">Total</p>
                    </div>
                    {([
                      ['vdo', 'VDO'],
                      ['tacho', 'Tacho'],
                      ['air_switch', 'Airswitch'],
                      ['mr', 'MR'],
                    ] as Array<[MeterKey, string]>).map(([key, label]) => (
                      <div key={key} className="grid items-center gap-2 md:grid-cols-[120px_1fr_1fr_1fr]">
                        <p className="text-[14px] font-semibold text-[#152d5a]">{label}</p>
                        <input value={meters[key].start} onChange={(e) => updateMeterFromStart(key, e.target.value)} placeholder="Start" className="rounded-lg border border-[#152d5a]/15 bg-white px-3 py-2 text-[#152d5a]" />
                        <input value={meters[key].stop} onChange={(e) => updateMeterFromStop(key, e.target.value)} placeholder="Stop" className="rounded-lg border border-[#152d5a]/15 bg-white px-3 py-2 text-[#152d5a]" />
                        <input value={meters[key].total} onChange={(e) => updateMeterFromTotal(key, e.target.value)} placeholder="Total" className="rounded-lg border border-[#152d5a]/15 bg-white px-3 py-2 text-[#152d5a]" />
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <input value={oilAdded} onChange={(e) => setOilAdded(e.target.value)} placeholder="Oil added" className="rounded-lg border border-[#152d5a]/15 bg-white px-3 py-2 text-[#152d5a]" />
                    <input value={oilTotal} onChange={(e) => setOilTotal(e.target.value)} placeholder="Oil total" className="rounded-lg border border-[#152d5a]/15 bg-white px-3 py-2 text-[#152d5a]" />
                    <input value={landings} onChange={(e) => setLandings(e.target.value)} placeholder="Landings" className="rounded-lg border border-[#152d5a]/15 bg-white px-3 py-2 text-[#152d5a]" />
                    <input value={fuelAdded} onChange={(e) => setFuelAdded(e.target.value)} placeholder="Fuel added" className="rounded-lg border border-[#152d5a]/15 bg-white px-3 py-2 text-[#152d5a]" />
                    <input value={fuelReturned} onChange={(e) => setFuelReturned(e.target.value)} placeholder="Fuel returned" className="rounded-lg border border-[#152d5a]/15 bg-white px-3 py-2 text-[#152d5a]" />
                  </div>
                  <textarea value={logNotes} onChange={(e) => setLogNotes(e.target.value)} rows={2} placeholder="Aircraft log notes" className="w-full rounded-lg border border-[#152d5a]/15 bg-white px-3 py-2 text-[#152d5a]" />
                  {meterError ? <p className="text-[14px] text-red-300">{meterError}</p> : null}
                </div>
              ) : null}

              {error ? <p className="text-[14px] text-red-300">{error}</p> : null}

              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setOpen(false)} disabled={isPending} className="rounded-xl border border-[#152d5a]/15 px-4 py-2 text-[14px] text-[#4b6390]">Cancel</button>
                <button type="submit" disabled={isPending} className="rounded-xl bg-blue-600 px-4 py-2 text-[14px] font-semibold text-white hover:bg-blue-500 disabled:opacity-60">
                  {isPending ? 'Recording...' : 'Mark Checkout Completed'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
