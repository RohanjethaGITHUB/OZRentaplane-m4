'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { submitFlightRecord, uploadFlightRecordEvidence } from '@/app/actions/booking'

type MeterStarts = {
  tacho?:      number | null
  vdo?:        number | null
  air_switch?: number | null
}

type Props = {
  bookingId:    string
  picName?:     string | null
  picArn?:      string | null
  flightDate:   string
  meterStarts?: MeterStarts
}

type UploadedFile = { file: File; preview: string }
type RejectedFile = { name: string; reason: string }

const METERS = [
  { label: 'Tacho',      key: 'tacho'      as const },
  { label: 'VDO',        key: 'vdo'        as const },
  { label: 'Air Switch', key: 'air_switch' as const },
]

const MAX_FILE_BYTES = 10 * 1024 * 1024            // 10 MB
const ALLOWED_TYPES  = new Set(['image/jpeg', 'image/png'])

// Input class — swaps border colour when the row has a validation error
function meterInputCls(hasError: boolean) {
  return (
    'w-28 bg-[#0c1830] rounded-lg px-3 py-1.5 text-sm text-white text-right ' +
    'placeholder:text-slate-700 focus:outline-none focus:ring-1 transition-colors ' +
    (hasError
      ? 'border border-amber-400/50 focus:border-amber-400/70 focus:ring-amber-400/15'
      : 'border border-white/[0.12] focus:border-oz-blue/60 focus:ring-oz-blue/20 hover:border-white/20')
  )
}

// Shared class for Operational Details inputs
const OP_INPUT =
  'w-full bg-[#050c17] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white ' +
  'placeholder:text-slate-700 focus:outline-none focus:border-oz-blue/50 focus:ring-1 ' +
  'focus:ring-oz-blue/20 hover:border-white/15 transition-colors'

const OP_INPUT_ERR =
  'w-full bg-[#050c17] border border-amber-400/40 rounded-lg px-4 py-2.5 text-sm text-white ' +
  'placeholder:text-slate-700 focus:outline-none focus:border-amber-400/60 focus:ring-1 ' +
  'focus:ring-amber-400/15 transition-colors'

export default function FlightRecordForm({
  bookingId, picName, picArn, flightDate, meterStarts = {},
}: Props) {
  const router = useRouter()

  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [done,          setDone]          = useState(false)
  const [declaration,   setDeclaration]   = useState(false)
  const [dragOver,      setDragOver]      = useState(false)
  const [files,         setFiles]         = useState<UploadedFile[]>([])
  const [uploadErrors,  setUploadErrors]  = useState<RejectedFile[]>([])
  const [uploadResults, setUploadResults] = useState<Array<{ name: string; success: boolean; error?: string }>>([])
  const [landingsVal,   setLandingsVal]   = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Meter start / stop — controlled, pre-filled from last approved readings
  const [starts, setStarts] = useState<Record<string, string>>({
    tacho:      meterStarts.tacho      != null ? String(meterStarts.tacho)      : '',
    vdo:        meterStarts.vdo        != null ? String(meterStarts.vdo)        : '',
    air_switch: meterStarts.air_switch != null ? String(meterStarts.air_switch) : '',
  })
  const [stops, setStops] = useState<Record<string, string>>({
    tacho: '', vdo: '', air_switch: '',
  })

  // ── Derived calculations ──────────────────────────────────────────────────

  function calcTotal(key: string): { value: string; negative: boolean } {
    const start = parseFloat(starts[key])
    const stop  = parseFloat(stops[key])
    if (isNaN(start) || isNaN(stop)) return { value: '—', negative: false }
    const diff = stop - start
    return { value: diff.toFixed(1), negative: diff < 0 }
  }

  // Only fires when both start and stop are filled.
  function getMeterError(key: string): string | null {
    const s = starts[key]
    const e = stops[key]
    if (!s || !e) return null
    const sv = parseFloat(s)
    const ev = parseFloat(e)
    if (isNaN(sv) || sv < 0) return 'Start must be a valid number ≥ 0.'
    if (isNaN(ev) || ev < 0) return 'Stop must be a valid number ≥ 0.'
    if (ev < sv)             return 'Stop reading must be ≥ Start reading.'
    return null
  }

  // Landings inline — only validates once the user has typed something.
  function validateLandings(v: string): string | null {
    if (!v) return null
    const n = Number(v)
    if (isNaN(n) || n < 0)        return 'Must be 0 or more.'
    if (!Number.isInteger(n))     return 'Must be a whole number (no decimals).'
    return null
  }
  const landingsErr = validateLandings(landingsVal)

  // Gate the submit button.
  const hasMeterErrors  = METERS.some(({ key }) => getMeterError(key) !== null)
  const isSubmitBlocked = loading || !declaration || hasMeterErrors || landingsErr !== null

  // ── File upload ───────────────────────────────────────────────────────────

  function addFiles(incoming: File[]) {
    const accepted: UploadedFile[] = []
    const rejected: RejectedFile[] = []

    for (const f of incoming) {
      if (!ALLOWED_TYPES.has(f.type)) {
        const ext = f.name.split('.').pop()?.toUpperCase() ?? '?'
        rejected.push({
          name:   f.name,
          reason: f.type.startsWith('image/')
            ? `${ext} format not supported — use JPEG or PNG`
            : 'Not a recognised image file — JPEG or PNG only',
        })
      } else if (f.size > MAX_FILE_BYTES) {
        rejected.push({
          name:   f.name,
          reason: `Too large (${(f.size / 1024 / 1024).toFixed(1)} MB) — max ${MAX_FILE_BYTES / 1024 / 1024} MB per file`,
        })
      } else {
        accepted.push({ file: f, preview: URL.createObjectURL(f) })
      }
    }

    if (accepted.length > 0) setFiles(prev => [...prev, ...accepted])
    setUploadErrors(rejected)
  }

  function removeFile(idx: number) {
    setFiles(prev => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!declaration) {
      setError('You must accept the declaration before submitting.')
      return
    }

    // Re-check meter errors at submit time (defence in depth)
    if (METERS.some(({ key }) => getMeterError(key) !== null)) {
      setError('Correct the meter reading errors before submitting.')
      return
    }

    const fd     = new FormData(e.currentTarget)
    const get    = (k: string) => fd.get(k) as string | null
    const getNum = (k: string) => { const v = get(k); return v && v !== '' ? Number(v) : null }

    // Landings — required
    const landingsRaw = landingsVal.trim()
    if (!landingsRaw) {
      setError('Landings is required.')
      return
    }
    const landingsNum = Number(landingsRaw)
    if (isNaN(landingsNum) || landingsNum < 0) {
      setError('Landings must be 0 or more.')
      return
    }
    if (!Number.isInteger(landingsNum)) {
      setError('Landings must be a whole number.')
      return
    }

    // Optional numeric fields — must be non-negative if provided
    const optionals: [string, string][] = [
      ['add_to_mr', 'Add to MR'],
      ['oil_added',  'Oil Added'],
      ['fuel_added', 'Fuel Added'],
    ]
    for (const [name, label] of optionals) {
      const v = getNum(name)
      if (v !== null && (isNaN(v) || v < 0)) {
        setError(`${label} must be a valid non-negative number.`)
        return
      }
    }

    try {
      setLoading(true)
      const { flightRecordId } = await submitFlightRecord({
        booking_id:       bookingId,
        date:             flightDate,
        pic_name:         picName  || null,
        pic_arn:          picArn   || null,
        tacho_start:      getNum('tacho_start'),
        tacho_stop:       getNum('tacho_stop'),
        vdo_start:        getNum('vdo_start'),
        vdo_stop:         getNum('vdo_stop'),
        air_switch_start: getNum('air_switch_start'),
        air_switch_stop:  getNum('air_switch_stop'),
        add_to_mr:        getNum('add_to_mr'),
        oil_added:        getNum('oil_added'),
        oil_total:        null,
        fuel_added:       getNum('fuel_added'),
        fuel_actual:      null,
        landings:         Math.round(landingsNum),
        customer_notes:   get('customer_notes') || null,
        declaration_accepted: true,
        signature_type:   'typed',
        signature_value:  picName || null,
      })

      // Upload evidence files after the record is created so we have the flight_record_id.
      // Each file is uploaded independently; partial failure is surfaced per file.
      if (files.length > 0) {
        const results: Array<{ name: string; success: boolean; error?: string }> = []
        for (const f of files) {
          const uploadFd = new FormData()
          uploadFd.set('file',            f.file)
          uploadFd.set('flightRecordId',  flightRecordId)
          uploadFd.set('bookingId',       bookingId)
          try {
            await uploadFlightRecordEvidence(uploadFd)
            results.push({ name: f.file.name, success: true })
          } catch (uploadErr) {
            results.push({
              name:  f.file.name,
              success: false,
              error: uploadErr instanceof Error
                ? uploadErr.message.replace(/^VALIDATION: /, '')
                : 'Upload failed',
            })
          }
        }
        setUploadResults(results)
      }

      setDone(true)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message.replace(/^VALIDATION: /, '') : 'Submission failed.')
      setLoading(false)
    }
  }

  // ── Success state ─────────────────────────────────────────────────────────

  if (done) {
    const failedUploads = uploadResults.filter(r => !r.success)
    const succeededUploads = uploadResults.filter(r => r.success)
    return (
      <div className="bg-[#0c121e] border border-white/[0.07] rounded-[1.5rem] p-10 space-y-6">
        <div className="flex flex-col items-center text-center gap-4">
          <span
            className="material-symbols-outlined text-5xl text-emerald-400"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            check_circle
          </span>
          <h3 className="text-2xl font-serif text-white">Record Submitted</h3>
          <p className="text-sm text-oz-muted max-w-sm leading-relaxed">
            Your meter readings have been sent to operations for review.
            You will be notified once the review is complete.
          </p>
        </div>

        {/* Per-file upload results */}
        {uploadResults.length > 0 && (
          <div className="border-t border-white/[0.05] pt-5 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-3">
              Evidence Photos
            </p>
            {succeededUploads.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-emerald-400/80">
                <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>cloud_done</span>
                <span className="truncate">{r.name}</span>
                <span className="text-emerald-400/40 ml-auto flex-shrink-0">saved</span>
              </div>
            ))}
            {failedUploads.map((r, i) => (
              <div key={i} className="p-2.5 rounded-lg bg-red-500/[0.08] border border-red-500/20 flex items-start gap-2 text-xs text-red-400/80">
                <span className="material-symbols-outlined text-[14px] flex-shrink-0 mt-0.5">cloud_off</span>
                <div>
                  <span className="font-medium block truncate">{r.name}</span>
                  <span className="text-red-400/60">{r.error}</span>
                </div>
              </div>
            ))}
            {failedUploads.length > 0 && (
              <p className="text-[11px] text-slate-600 pt-1">
                Failed uploads can be shared via Messages or described in your flight notes.
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="bg-[#0c121e] border border-white/[0.07] rounded-[1.5rem] overflow-hidden">

      {/* Card header */}
      <div className="px-8 pt-8 pb-6 border-b border-white/[0.05]">
        <h2 className="text-2xl font-serif text-white mb-1.5">Submit Flight Record</h2>
        <p className="text-sm text-oz-muted">Please enter final meter readings and upload evidence photos.</p>
      </div>

      <div className="px-8 py-8 space-y-10">

        {/* ── Meter Readings ─────────────────────────────────────────────── */}
        <section>
          <p className="text-[11px] font-bold uppercase tracking-widest text-oz-blue mb-5">
            Meter Readings
          </p>

          <div className="bg-[#050c17] border border-white/[0.06] rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  {['TYPE', 'START', 'STOP', 'TOTAL'].map(col => (
                    <th
                      key={col}
                      className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METERS.map(({ label, key }) => {
                  const total    = calcTotal(key)
                  const rowError = getMeterError(key)
                  return (
                    <>
                      <tr key={key} className="border-t border-white/[0.04] first:border-t-0">
                        {/* Type */}
                        <td className="px-5 py-4 text-sm text-slate-300 font-medium whitespace-nowrap">
                          {label}
                        </td>

                        {/* Start — editable */}
                        <td className="px-4 py-3.5">
                          <input
                            type="number"
                            name={`${key}_start`}
                            step="0.01"
                            min="0"
                            placeholder="—"
                            value={starts[key]}
                            onChange={e => setStarts(s => ({ ...s, [key]: e.target.value }))}
                            className={meterInputCls(false)}
                          />
                        </td>

                        {/* Stop — editable, red border on error */}
                        <td className="px-4 py-3.5">
                          <input
                            type="number"
                            name={`${key}_stop`}
                            step="0.01"
                            min="0"
                            placeholder="—"
                            value={stops[key]}
                            onChange={e => setStops(s => ({ ...s, [key]: e.target.value }))}
                            className={meterInputCls(rowError !== null)}
                          />
                        </td>

                        {/* Total — read-only */}
                        <td className="px-5 py-4">
                          <span
                            className={`text-sm tabular-nums font-mono ${
                              total.value === '—'
                                ? 'text-slate-600'
                                : total.negative
                                ? 'text-amber-400'
                                : 'text-slate-300'
                            }`}
                          >
                            {total.value}
                          </span>
                        </td>
                      </tr>

                      {/* Inline row error */}
                      {rowError && (
                        <tr key={`${key}-err`} className="border-t border-white/[0.04]">
                          <td colSpan={4} className="px-5 pb-3 pt-1">
                            <p className="flex items-center gap-1.5 text-xs text-amber-400/90">
                              <span className="material-symbols-outlined text-[13px]">warning</span>
                              {rowError}
                            </p>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Add to MR */}
          <div className="mt-4 flex items-center gap-4">
            <label
              htmlFor="add_to_mr"
              className="text-[11px] uppercase tracking-widest text-slate-500 font-bold whitespace-nowrap"
            >
              Add to MR (hrs)
            </label>
            <input
              id="add_to_mr"
              type="number"
              name="add_to_mr"
              step="0.01"
              min="0"
              placeholder="0.0"
              className="w-28 bg-[#050c17] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white text-right placeholder:text-slate-700 focus:outline-none focus:border-oz-blue/50 focus:ring-1 focus:ring-oz-blue/20 hover:border-white/15 transition-colors"
            />
          </div>
        </section>

        {/* ── Operational Details ─────────────────────────────────────────── */}
        <section>
          <p className="text-[11px] font-bold uppercase tracking-widest text-oz-blue mb-5">
            Operational Details
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-widest text-slate-500 font-bold mb-2">
                Oil Added (Quarts)
              </label>
              <input
                type="number"
                name="oil_added"
                step="0.5"
                min="0"
                placeholder="e.g. 1"
                className={OP_INPUT}
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-slate-500 font-bold mb-2">
                Fuel Added (Liters)
              </label>
              <input
                type="number"
                name="fuel_added"
                step="1"
                min="0"
                placeholder="e.g. 45"
                className={OP_INPUT}
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-slate-500 font-bold mb-2">
                Landings <span className="text-amber-400/70 normal-case tracking-normal font-medium ml-1">required</span>
              </label>
              <input
                type="number"
                name="landings"
                min="0"
                step="1"
                placeholder="e.g. 1"
                value={landingsVal}
                onChange={e => setLandingsVal(e.target.value)}
                className={landingsErr ? OP_INPUT_ERR : OP_INPUT}
              />
              {landingsErr && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-400/90">
                  <span className="material-symbols-outlined text-[13px]">warning</span>
                  {landingsErr}
                </p>
              )}
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-xs uppercase tracking-widest text-slate-500 font-bold mb-2">
              Flight Notes (Optional)
            </label>
            <textarea
              name="customer_notes"
              rows={3}
              placeholder="Enter any squawks or notes here..."
              className={`${OP_INPUT} resize-none`}
            />
          </div>
        </section>

        {/* ── Evidence Upload ─────────────────────────────────────────────── */}
        <section>
          <p className="text-[11px] font-bold uppercase tracking-widest text-oz-blue mb-5">
            Evidence Upload
          </p>

          <div
            className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-oz-blue/60 bg-oz-blue/[0.04]'
                : 'border-white/10 bg-[#050c17] hover:border-white/[0.18]'
            }`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault()
              setDragOver(false)
              addFiles(Array.from(e.dataTransfer.files))
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-12 h-12 rounded-full bg-white/[0.06] flex items-center justify-center">
              <span className="material-symbols-outlined text-white/40 text-2xl">upload</span>
            </div>
            <div>
              <p className="text-sm text-white/70 font-medium">
                Drag and drop photos here, or click to browse
              </p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                JPEG or PNG only · Max 10 MB per file · Up to 10 files
              </p>
              <p className="text-[11px] text-slate-600 mt-1">
                Files are uploaded and saved when you submit your record.
              </p>
            </div>
            <button
              type="button"
              className="mt-1 px-5 py-1.5 border border-white/20 rounded text-xs font-bold uppercase tracking-wider text-white/60 hover:border-white/40 hover:text-white/80 transition-colors"
              onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}
            >
              Select Files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              multiple
              className="hidden"
              onChange={e => {
                addFiles(Array.from(e.target.files ?? []))
                // Reset input so the same file can be re-added after removal
                e.target.value = ''
              }}
            />
          </div>

          {/* Per-file rejection errors */}
          {uploadErrors.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {uploadErrors.map((r, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/[0.08] border border-red-500/20"
                >
                  <span className="material-symbols-outlined text-red-400 text-[14px] mt-0.5 flex-shrink-0">
                    error
                  </span>
                  <div className="min-w-0">
                    <span className="text-xs text-red-300/90 font-medium truncate block">{r.name}</span>
                    <span className="text-[11px] text-red-400/70">{r.reason}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Accepted file previews */}
          {files.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3">
              {files.map((entry, idx) => (
                <div
                  key={idx}
                  className="relative group w-20 h-20 rounded-lg overflow-hidden border border-white/10 bg-[#050c17] flex-shrink-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={entry.preview}
                    alt={entry.file.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors" />
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <span className="material-symbols-outlined text-white text-[12px]">close</span>
                  </button>
                  <p className="absolute bottom-0 inset-x-0 bg-black/60 text-[8px] text-white/60 px-1 py-0.5 truncate">
                    {entry.file.name}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>

      {/* ── Declaration + Submit ────────────────────────────────────────────── */}
      <div className="px-8 py-6 border-t border-white/[0.05] flex flex-col sm:flex-row items-start sm:items-center gap-5 justify-between">
        <label className="flex items-start gap-3 cursor-pointer select-none flex-1">
          <input
            type="checkbox"
            checked={declaration}
            onChange={e => setDeclaration(e.target.checked)}
            className="mt-0.5 accent-oz-blue flex-shrink-0"
          />
          <span className="text-xs text-slate-400 leading-relaxed">
            I declare that the meter readings and information provided are accurate and correspond to the completed flight.
          </span>
        </label>

        <button
          type="submit"
          disabled={isSubmitBlocked}
          className="flex-shrink-0 px-7 py-2.5 bg-oz-blue hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-widest rounded-lg transition-colors"
        >
          {loading ? 'Submitting…' : 'Submit Flight Record'}
        </button>
      </div>

      {error && (
        <div className="mx-8 mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2 text-xs text-red-400 leading-relaxed">
          <span className="material-symbols-outlined text-[14px] mt-0.5 flex-shrink-0">error</span>
          {error}
        </div>
      )}

    </form>
  )
}
