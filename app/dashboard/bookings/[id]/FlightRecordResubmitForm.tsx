'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { resubmitFlightRecord, uploadFlightRecordEvidence } from '@/app/actions/booking'
import type { FlightRecord } from '@/lib/supabase/booking-types'

type UploadedFile = { file: File; preview: string }
type RejectedFile = { name: string; reason: string }

const MAX_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES  = new Set(['image/jpeg', 'image/png'])

type Props = {
  flightRecord: FlightRecord
  bookingId:    string
  onSuccess?:   () => void
}

const METER_INPUT =
  'w-full bg-[#0c1830] border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-white text-right ' +
  'placeholder:text-slate-700 focus:outline-none focus:border-oz-blue/60 focus:ring-1 focus:ring-oz-blue/20 ' +
  'hover:border-white/20 transition-colors'

const OP_INPUT =
  'w-full bg-[#050c17] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white ' +
  'placeholder:text-slate-700 focus:outline-none focus:border-oz-blue/50 focus:ring-1 ' +
  'focus:ring-oz-blue/20 hover:border-white/15 transition-colors'

function n(v: number | null | undefined): string {
  return v != null ? String(v) : ''
}

export default function FlightRecordResubmitForm({ flightRecord, bookingId, onSuccess }: Props) {
  const router = useRouter()
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [done,          setDone]          = useState(false)
  const [declaration,   setDeclaration]   = useState(false)
  const [dragOver,      setDragOver]      = useState(false)
  const [newFiles,      setNewFiles]      = useState<UploadedFile[]>([])
  const [fileErrors,    setFileErrors]    = useState<RejectedFile[]>([])
  const [uploadResults, setUploadResults] = useState<Array<{ name: string; success: boolean; error?: string }>>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  function addFiles(incoming: File[]) {
    const accepted: UploadedFile[] = []
    const rejected: RejectedFile[] = []
    for (const f of incoming) {
      if (!ALLOWED_TYPES.has(f.type)) {
        const ext = f.name.split('.').pop()?.toUpperCase() ?? '?'
        rejected.push({ name: f.name, reason: f.type.startsWith('image/') ? `${ext} not supported — use JPEG or PNG` : 'Not a recognised image file' })
      } else if (f.size > MAX_FILE_BYTES) {
        rejected.push({ name: f.name, reason: `Too large (${(f.size / 1024 / 1024).toFixed(1)} MB) — max 10 MB` })
      } else {
        accepted.push({ file: f, preview: URL.createObjectURL(f) })
      }
    }
    if (accepted.length > 0) setNewFiles(prev => [...prev, ...accepted])
    setFileErrors(rejected)
  }

  function removeNewFile(idx: number) {
    setNewFiles(prev => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  // Pre-fill from existing flight record
  const [tachoStart,     setTachoStart]     = useState(n(flightRecord.tacho_start))
  const [tachoStop,      setTachoStop]      = useState(n(flightRecord.tacho_stop))
  const [vdoStart,       setVdoStart]       = useState(n(flightRecord.vdo_start))
  const [vdoStop,        setVdoStop]        = useState(n(flightRecord.vdo_stop))
  const [airStart,       setAirStart]       = useState(n(flightRecord.air_switch_start))
  const [airStop,        setAirStop]        = useState(n(flightRecord.air_switch_stop))
  const [addToMR,        setAddToMR]        = useState(n(flightRecord.add_to_mr))
  const [oilAdded,       setOilAdded]       = useState(n(flightRecord.oil_added))
  const [fuelAdded,      setFuelAdded]      = useState(n(flightRecord.fuel_added))
  const [landings,       setLandings]       = useState(n(flightRecord.landings))
  const [notes,          setNotes]          = useState(flightRecord.customer_notes ?? '')

  function p(s: string): number | null {
    const v = parseFloat(s)
    return isNaN(v) ? null : v
  }

  function calcTotal(start: string, stop: string): string {
    const s = parseFloat(start)
    const e = parseFloat(stop)
    if (isNaN(s) || isNaN(e)) return '—'
    const d = e - s
    return d < 0 ? `${d.toFixed(1)} ⚠` : d.toFixed(1)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!declaration) {
      setError('You must accept the declaration before resubmitting.')
      return
    }

    // Basic meter validation
    for (const [label, start, stop] of [
      ['Tacho',      tachoStart, tachoStop],
      ['VDO',        vdoStart,   vdoStop],
      ['Air Switch', airStart,   airStop],
    ] as [string, string, string][]) {
      if (start && stop) {
        const sv = parseFloat(start), ev = parseFloat(stop)
        if (!isNaN(sv) && !isNaN(ev) && ev < sv) {
          setError(`${label}: Stop reading must be ≥ Start reading.`)
          return
        }
      }
    }

    const landingsNum = landings ? Number(landings) : null
    if (landingsNum !== null && (!Number.isInteger(landingsNum) || landingsNum < 0)) {
      setError('Landings must be a non-negative whole number.')
      return
    }

    try {
      setLoading(true)
      await resubmitFlightRecord({
        flight_record_id:  flightRecord.id,
        booking_id:        bookingId,
        tacho_start:       p(tachoStart),
        tacho_stop:        p(tachoStop),
        vdo_start:         p(vdoStart),
        vdo_stop:          p(vdoStop),
        air_switch_start:  p(airStart),
        air_switch_stop:   p(airStop),
        add_to_mr:         p(addToMR),
        oil_added:         p(oilAdded),
        fuel_added:        p(fuelAdded),
        landings:          landingsNum,
        customer_notes:    notes || null,
      })

      // Upload any new evidence files selected during this resubmission cycle.
      // The flight_record_id is already known, so uploads can proceed immediately.
      if (newFiles.length > 0) {
        const results: Array<{ name: string; success: boolean; error?: string }> = []
        for (const f of newFiles) {
          const uploadFd = new FormData()
          uploadFd.set('file',            f.file)
          uploadFd.set('flightRecordId',  flightRecord.id)
          uploadFd.set('bookingId',       bookingId)
          try {
            await uploadFlightRecordEvidence(uploadFd)
            results.push({ name: f.file.name, success: true })
          } catch (uploadErr) {
            results.push({
              name:    f.file.name,
              success: false,
              error:   uploadErr instanceof Error
                ? uploadErr.message.replace(/^VALIDATION: /, '')
                : 'Upload failed',
            })
          }
        }
        setUploadResults(results)
      }

      setDone(true)
      router.refresh()
      onSuccess?.()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message.replace(/^VALIDATION: /, '') : 'Resubmission failed.')
      setLoading(false)
    }
  }

  if (done) {
    const failedUploads    = uploadResults.filter(r => !r.success)
    const succeededUploads = uploadResults.filter(r => r.success)
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-[1.25rem] p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span
            className="material-symbols-outlined text-emerald-400 text-2xl flex-shrink-0"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            check_circle
          </span>
          <div>
            <p className="text-sm font-medium text-emerald-300">Resubmitted for review</p>
            <p className="text-xs text-emerald-400/60 mt-0.5">
              The operations team will review your updated record shortly.
            </p>
          </div>
        </div>
        {uploadResults.length > 0 && (
          <div className="border-t border-emerald-500/15 pt-3 space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-400/50 mb-2">Evidence Photos</p>
            {succeededUploads.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-emerald-400/70">
                <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>cloud_done</span>
                <span className="truncate">{r.name}</span>
              </div>
            ))}
            {failedUploads.map((r, i) => (
              <div key={i} className="text-xs text-red-400/70 flex items-start gap-2">
                <span className="material-symbols-outlined text-[13px] flex-shrink-0 mt-0.5">cloud_off</span>
                <span>{r.name} — {r.error}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-[#0c121e] border border-white/[0.07] rounded-[1.5rem] overflow-hidden"
    >
      <div className="px-7 pt-7 pb-5 border-b border-white/[0.05]">
        <h3 className="text-lg font-serif text-white mb-1">Update Flight Record</h3>
        <p className="text-xs text-oz-muted">
          Correct the fields flagged by operations, then resubmit for review.
        </p>
      </div>

      <div className="px-7 py-6 space-y-8">

        {/* Meter readings */}
        <section>
          <p className="text-[11px] font-bold uppercase tracking-widest text-oz-blue mb-4">
            Meter Readings
          </p>
          <div className="bg-[#050c17] border border-white/[0.06] rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  {['TYPE', 'START', 'STOP', 'TOTAL'].map(col => (
                    <th key={col} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {[
                  { label: 'Tacho',      start: tachoStart, setStart: setTachoStart, stop: tachoStop, setStop: setTachoStop },
                  { label: 'VDO',        start: vdoStart,   setStart: setVdoStart,   stop: vdoStop,   setStop: setVdoStop   },
                  { label: 'Air Switch', start: airStart,   setStart: setAirStart,   stop: airStop,   setStop: setAirStop   },
                ].map(({ label, start, setStart, stop, setStop }) => (
                  <tr key={label}>
                    <td className="px-4 py-4 text-sm text-slate-300 font-medium whitespace-nowrap">{label}</td>
                    <td className="px-3 py-3">
                      <input type="number" step="0.01" min="0" value={start} onChange={e => setStart(e.target.value)} placeholder="—" className={METER_INPUT} />
                    </td>
                    <td className="px-3 py-3">
                      <input type="number" step="0.01" min="0" value={stop}  onChange={e => setStop(e.target.value)}  placeholder="—" className={METER_INPUT} />
                    </td>
                    <td className="px-4 py-4 text-sm tabular-nums font-mono text-slate-400">
                      {calcTotal(start, stop)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-4">
            <label className="text-[11px] uppercase tracking-widest text-slate-500 font-bold whitespace-nowrap">
              Add to MR (hrs)
            </label>
            <input type="number" step="0.01" min="0" value={addToMR} onChange={e => setAddToMR(e.target.value)} placeholder="0.0"
              className="w-28 bg-[#050c17] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white text-right placeholder:text-slate-700 focus:outline-none focus:border-oz-blue/50 focus:ring-1 focus:ring-oz-blue/20 hover:border-white/15 transition-colors"
            />
          </div>
        </section>

        {/* Operational Details */}
        <section>
          <p className="text-[11px] font-bold uppercase tracking-widest text-oz-blue mb-4">
            Operational Details
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-widest text-slate-500 font-bold mb-2">Oil Added (Quarts)</label>
              <input type="number" step="0.5" min="0" value={oilAdded} onChange={e => setOilAdded(e.target.value)} placeholder="e.g. 1" className={OP_INPUT} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-slate-500 font-bold mb-2">Fuel Added (Liters)</label>
              <input type="number" step="1" min="0" value={fuelAdded} onChange={e => setFuelAdded(e.target.value)} placeholder="e.g. 45" className={OP_INPUT} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-slate-500 font-bold mb-2">
                Landings <span className="text-amber-400/70 normal-case tracking-normal font-medium ml-1">required</span>
              </label>
              <input type="number" min="0" step="1" value={landings} onChange={e => setLandings(e.target.value)} placeholder="e.g. 1" className={OP_INPUT} />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-xs uppercase tracking-widest text-slate-500 font-bold mb-2">
              Update Notes (Optional)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Explain what you corrected or any additional context for operations…"
              className={`${OP_INPUT} resize-none`}
            />
          </div>
        </section>

        {/* Additional evidence upload */}
        <section>
          <p className="text-[11px] font-bold uppercase tracking-widest text-oz-blue mb-4">
            Additional Evidence Photos
          </p>
          <div
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-oz-blue/60 bg-oz-blue/[0.04]'
                : 'border-white/10 bg-[#050c17] hover:border-white/[0.18]'
            }`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(Array.from(e.dataTransfer.files)) }}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center">
              <span className="material-symbols-outlined text-white/40 text-xl">add_photo_alternate</span>
            </div>
            <div>
              <p className="text-sm text-white/60 font-medium">Add more evidence photos</p>
              <p className="text-xs text-slate-600 mt-1">JPEG or PNG · Max 10 MB per file · Saved on resubmit</p>
            </div>
            <button
              type="button"
              className="mt-1 px-4 py-1.5 border border-white/20 rounded text-xs font-bold uppercase tracking-wider text-white/60 hover:border-white/40 hover:text-white/80 transition-colors"
              onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}
            >
              Select Files
            </button>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" multiple className="hidden"
              onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }}
            />
          </div>

          {/* Rejection errors */}
          {fileErrors.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {fileErrors.map((r, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/[0.08] border border-red-500/20">
                  <span className="material-symbols-outlined text-red-400 text-[14px] mt-0.5 flex-shrink-0">error</span>
                  <div className="min-w-0">
                    <span className="text-xs text-red-300/90 font-medium truncate block">{r.name}</span>
                    <span className="text-[11px] text-red-400/70">{r.reason}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Staged file previews */}
          {newFiles.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3">
              {newFiles.map((entry, idx) => (
                <div key={idx} className="relative group w-18 h-18 w-[4.5rem] h-[4.5rem] rounded-lg overflow-hidden border border-white/10 bg-[#050c17] flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={entry.preview} alt={entry.file.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors" />
                  <button type="button" onClick={() => removeNewFile(idx)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="material-symbols-outlined text-white text-[12px]">close</span>
                  </button>
                  <p className="absolute bottom-0 inset-x-0 bg-black/60 text-[8px] text-white/60 px-1 py-0.5 truncate">{entry.file.name}</p>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>

      {/* Declaration + Submit */}
      <div className="px-7 py-5 border-t border-white/[0.05] flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
        <label className="flex items-start gap-3 cursor-pointer select-none flex-1">
          <input
            type="checkbox"
            checked={declaration}
            onChange={e => setDeclaration(e.target.checked)}
            className="mt-0.5 accent-oz-blue flex-shrink-0"
          />
          <span className="text-xs text-slate-400 leading-relaxed">
            I declare that the updated meter readings and information provided are accurate and correspond to the completed flight.
          </span>
        </label>
        <button
          type="submit"
          disabled={loading || !declaration}
          className="flex-shrink-0 px-6 py-2.5 bg-oz-blue hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-widest rounded-lg transition-colors"
        >
          {loading ? 'Submitting…' : 'Resubmit for Review'}
        </button>
      </div>

      {error && (
        <div className="mx-7 mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2 text-xs text-red-400 leading-relaxed">
          <span className="material-symbols-outlined text-[14px] mt-0.5 flex-shrink-0">error</span>
          {error}
        </div>
      )}
    </form>
  )
}
