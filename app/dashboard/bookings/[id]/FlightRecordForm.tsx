'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { submitFlightRecord, uploadFlightRecordEvidence } from '@/app/actions/booking'
import TotalOnlyReadingsForm from '@/components/aircraft/TotalOnlyReadingsForm'
import { type TotalOnlyFormValues, validateTotalOnlyReadings } from '@/lib/aircraft-readings'
import { resolveMinimumVdoBilling } from '@/lib/booking/standard-booking-billing'
import { LoadingButtonContent } from '@/components/ui/Spinner'

type Airport = {
  id:        string
  icao_code: string
  name:      string
}

type LandingRow = {
  airport_id:    string
  landing_count: string
}

type ActiveBlockTimePackage = {
  id: string
  hours_remaining: number
  rate_per_hour: number
  expires_at: string
  hours_purchased: number
  package?: { name: string } | { name: string }[] | null
}

type Props = {
  bookingId:  string
  picName?:   string | null
  picArn?:    string | null
  flightDate: string
  airports?:  Airport[]
  activePackage?: ActiveBlockTimePackage | null
  bookingSlotHours: number
  is24HourBooking?: boolean
}

type UploadedFile = { file: File; preview: string }
type RejectedFile = { name: string; reason: string }

const MAX_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES  = new Set(['image/jpeg', 'image/png'])

export default function FlightRecordForm({
  bookingId, picName, picArn, flightDate, airports = [], activePackage = null, bookingSlotHours, is24HourBooking = false,
}: Props) {
  const router = useRouter()
  const airportOptions = (() => {
    const bankstown = airports.find(
      a => a.icao_code === 'YSBK' || a.name.toLowerCase().includes('bankstown'),
    )
    if (!bankstown) return airports
    return [bankstown, ...airports.filter(a => a.id !== bankstown.id)]
  })()

  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState<string | null>(null)
  const [done,            setDone]            = useState(false)
  const [declaration,     setDeclaration]     = useState(false)
  const [dragOver,        setDragOver]        = useState(false)
  const [files,           setFiles]           = useState<UploadedFile[]>([])
  const [uploadErrors,    setUploadErrors]    = useState<RejectedFile[]>([])
  const [uploadResults,   setUploadResults]   = useState<Array<{ name: string; success: boolean; error?: string }>>([])
  const [landingRows,     setLandingRows]     = useState<LandingRow[]>([{ airport_id: '', landing_count: '' }])
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [readings, setReadings] = useState<TotalOnlyFormValues>({
    vdo_total:        '',
    tacho_total:      '',
    air_switch_total: '',
    mr_total:         '',
    oil_added:        '',
    oil_total:        '',
    fuel_added:       '',
    fuel_returned:       '',
  })
  const [notes, setNotes] = useState('')

  // Landing row helpers
  function updateLandingAirport(idx: number, airportId: string) {
    setLandingRows(rows => rows.map((r, i) => {
      if (i !== idx) return r
      return {
        ...r,
        airport_id: airportId,
        landing_count: airportId ? '1' : '',
      }
    }))
  }
  function updateLandingCount(idx: number, value: string) {
    setLandingRows(rows => rows.map((r, i) => {
      if (i !== idx) return r
      if (!r.airport_id) {
        return { ...r, landing_count: value }
      }

      const nextValue = value.trim()
      const parsed = Number(nextValue)
      if (!nextValue || !Number.isFinite(parsed) || parsed < 1) {
        return { ...r, landing_count: '1' }
      }

      return {
        ...r,
        landing_count: String(Math.max(1, Math.floor(parsed))),
      }
    }))
  }
  function addLandingRow() {
    setLandingRows(rows => [...rows, { airport_id: '', landing_count: '' }])
  }
  function removeLandingRow(idx: number) {
    setLandingRows(rows => rows.filter((_, i) => i !== idx))
  }
  function getLandingRowError(row: LandingRow): string | null {
    if (!row.airport_id) return 'Select an airport.'
    const n = Number(row.landing_count)
    if (!row.landing_count || isNaN(n) || !Number.isInteger(n) || n < 1) return 'Landings must be a whole number ≥ 1.'
    return null
  }
  const hasLandingErrors    = landingRows.some(r => getLandingRowError(r) !== null)
  const allLandingsFilled   = landingRows.length > 0 && landingRows.every(r => {
    if (!r.airport_id) return false
    const n = Number(r.landing_count)
    return Number.isInteger(n) && n >= 1
  })
  const isSubmitBlocked     = loading || !declaration || hasLandingErrors || !allLandingsFilled

  // File helpers
  function addFiles(incoming: File[]) {
    const accepted: UploadedFile[] = []
    const rejected: RejectedFile[] = []
    for (const f of incoming) {
      if (!ALLOWED_TYPES.has(f.type)) {
        const ext = f.name.split('.').pop()?.toUpperCase() ?? '?'
        rejected.push({ name: f.name, reason: f.type.startsWith('image/') ? `${ext} format not supported — use JPEG or PNG` : 'Not a recognised image file — JPEG or PNG only' })
      } else if (f.size > MAX_FILE_BYTES) {
        rejected.push({ name: f.name, reason: `Too large (${(f.size / 1024 / 1024).toFixed(1)} MB) — max ${MAX_FILE_BYTES / 1024 / 1024} MB per file` })
      } else {
        accepted.push({ file: f, preview: URL.createObjectURL(f) })
      }
    }
    if (accepted.length > 0) setFiles(prev => [...prev, ...accepted])
    setUploadErrors(rejected)
  }
  function removeFile(idx: number) {
    setFiles(prev => { URL.revokeObjectURL(prev[idx].preview); return prev.filter((_, i) => i !== idx) })
  }

  function getNum(field: keyof TotalOnlyFormValues): number | null {
    const v = readings[field]
    if (!v || !v.trim()) return null
    const parsed = Number(v)
    return Number.isFinite(parsed) ? parsed : null
  }

  const enteredVdoTotal = getNum('vdo_total')
  const minimumVdoBilling = resolveMinimumVdoBilling({
    bookingSlotHours,
    actualVdoHours: enteredVdoTotal,
  })
  const overflowHours = activePackage && enteredVdoTotal != null
    ? Math.max(0, enteredVdoTotal - activePackage.hours_remaining)
    : null

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitAttempted(true)
    setError(null)

    if (!declaration) { setError('You must accept the declaration before submitting.'); return }

    if (landingRows.length === 0) { setError('At least one landing entry is required.'); return }
    for (let i = 0; i < landingRows.length; i++) {
      const err = getLandingRowError(landingRows[i])
      if (err) { setError(`Landing row ${i + 1}: ${err}`); return }
    }
    const landingRowsParsed = landingRows.map(r => ({
      airport_id:    r.airport_id,
      landing_count: Math.round(Number(r.landing_count)),
    }))
    const totalLandings = landingRowsParsed.reduce((s, r) => s + r.landing_count, 0)

    const totalReadings = {
      vdo_total:        getNum('vdo_total')        ?? 0,
      tacho_total:      getNum('tacho_total')      ?? 0,
      air_switch_total: getNum('air_switch_total') ?? 0,
      mr_total:         getNum('mr_total')         ?? 0,
      oil_added:        getNum('oil_added'),
      oil_total:        getNum('oil_total'),
      fuel_added:       getNum('fuel_added'),
      fuel_returned:       getNum('fuel_returned'),
      landings:         totalLandings,
      notes:            notes.trim() || null,
    }

    try {
      validateTotalOnlyReadings(totalReadings)
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message.replace(/^VALIDATION: /, '') : 'Invalid aircraft readings.')
      return
    }

    try {
      setLoading(true)
      const { flightRecordId } = await submitFlightRecord({
        booking_id:           bookingId,
        date:                 flightDate,
        pic_name:             picName  || null,
        pic_arn:              picArn   || null,
        vdo_total:            totalReadings.vdo_total,
        tacho_total:          totalReadings.tacho_total,
        air_switch_total:     totalReadings.air_switch_total,
        mr_total:             totalReadings.mr_total,
        oil_added:            totalReadings.oil_added,
        oil_total:            totalReadings.oil_total,
        fuel_added:           totalReadings.fuel_added,
        fuel_returned:           totalReadings.fuel_returned,
        landings:             totalLandings,
        landing_rows:         landingRowsParsed,
        customer_notes:       notes || null,
        declaration_accepted: true,
        signature_type:       'typed',
        signature_value:      picName || null,
      })

      if (files.length > 0) {
        const results: Array<{ name: string; success: boolean; error?: string }> = []
        for (const f of files) {
          const uploadFd = new FormData()
          uploadFd.set('file',           f.file)
          uploadFd.set('flightRecordId', flightRecordId)
          uploadFd.set('bookingId',      bookingId)
          try {
            await uploadFlightRecordEvidence(uploadFd)
            results.push({ name: f.file.name, success: true })
          } catch (uploadErr) {
            results.push({ name: f.file.name, success: false, error: uploadErr instanceof Error ? uploadErr.message.replace(/^VALIDATION: /, '') : 'Upload failed' })
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

  // ── Success state ─────────────────────────────────────────────────────────────

  if (done) {
    const failedUploads    = uploadResults.filter(r => !r.success)
    const succeededUploads = uploadResults.filter(r =>  r.success)
    return (
      <div className="bg-white border border-[#dbe7f4] rounded-[1.5rem] p-8 md:p-10 space-y-6 shadow-[0_8px_24px_rgba(21,45,90,0.06)]">
        <div className="flex flex-col items-center text-center gap-4">
          <span className="material-symbols-outlined text-5xl text-emerald-500" style={{ fontVariationSettings: "'FILL' 1" }}>
            check_circle
          </span>
          <h3 className="text-2xl font-serif text-[#152d5a]">Record Submitted</h3>
          <p className="text-sm text-[#4b6390] max-w-sm leading-relaxed">
            Your meter readings have been sent to operations for review.
            You will be notified once the review is complete.
          </p>
        </div>
        {uploadResults.length > 0 && (
          <div className="border-t border-[#e5eef8] pt-5 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4b6390] mb-3">Evidence Photos</p>
            {succeededUploads.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-emerald-700">
                <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>cloud_done</span>
                <span className="truncate">{r.name}</span>
                <span className="text-emerald-600/50 ml-auto flex-shrink-0">saved</span>
              </div>
            ))}
            {failedUploads.map((r, i) => (
              <div key={i} className="p-2.5 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-600">
                <span className="material-symbols-outlined text-[14px] flex-shrink-0 mt-0.5">cloud_off</span>
                <div>
                  <span className="font-medium block truncate">{r.name}</span>
                  <span className="text-red-500/80">{r.error}</span>
                </div>
              </div>
            ))}
            {failedUploads.length > 0 && (
              <p className="text-[11px] text-[#6b7280] pt-1">Failed uploads can be shared via Messages or described in your flight notes.</p>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-[#dbe7f4] rounded-[1.5rem] overflow-hidden shadow-[0_8px_24px_rgba(21,45,90,0.06)]">

      <div className="px-6 sm:px-8 pt-8 pb-6 border-b border-[#e5eef8]">
        <h2 className="text-2xl font-serif text-[#152d5a] mb-1.5">Submit Flight Record</h2>
        <p className="text-sm text-[#4b6390]">Enter the total hours for each meter and upload evidence photos.</p>
      </div>

      {activePackage && (
        <div className="px-6 sm:px-8 pt-6">
          <div className="bg-[#f8fbff] border border-[#dbe7f4] rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-[#1a4fd6] text-[14px] mt-0.5 flex-shrink-0">info</span>
              <p className="text-xs text-[#4b6390] leading-relaxed">
                Hours entered below will be deducted from your Block Time balance on submission. Your current balance is {activePackage.hours_remaining.toFixed(1)}h.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-amber-400 text-[14px] mt-0.5 flex-shrink-0">warning</span>
              <p className="text-xs text-amber-600/80 leading-relaxed">
                This booking spans {minimumVdoBilling.bookingDays} day{minimumVdoBilling.bookingDays === 1 ? '' : 's'}, so the minimum billable VDO is {minimumVdoBilling.minimumVdoHours.toFixed(1)}h at 4h per day.
                {enteredVdoTotal != null && enteredVdoTotal < minimumVdoBilling.minimumVdoHours
                  ? ` Your current entry is ${enteredVdoTotal.toFixed(1)}h, which is below that minimum.`
                  : ''}
              </p>
            </div>
            {is24HourBooking && (
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-amber-400 text-[14px] mt-0.5 flex-shrink-0">warning</span>
                <p className="text-xs text-amber-600/80 leading-relaxed">
                  Minimum 4 VDO hours applies for each 24-hour period booked.
                </p>
              </div>
            )}
            {enteredVdoTotal != null && overflowHours != null && overflowHours > 0 && (
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-amber-400 text-[14px] mt-0.5 flex-shrink-0">warning</span>
                <p className="text-xs text-amber-600/80 leading-relaxed">
                  Your balance of {activePackage.hours_remaining.toFixed(1)}h will be exceeded. {overflowHours.toFixed(1)}h overflow will be charged at ${activePackage.rate_per_hour.toFixed(2)}/hr to your card on file.
                </p>
              </div>
            )}
            {enteredVdoTotal != null && overflowHours === 0 && enteredVdoTotal >= activePackage.hours_remaining && (
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-amber-400 text-[14px] mt-0.5 flex-shrink-0">warning</span>
                <p className="text-xs text-amber-600/80 leading-relaxed">
                  This flight will exhaust your Block Time balance. Future flights will be charged at Pay As You Fly rates unless you top up.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="px-6 sm:px-8 py-8 space-y-10">

        {/* Aircraft Readings — total-only */}
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1a4fd6] mb-5">Aircraft Readings</p>
          <TotalOnlyReadingsForm
            values={readings}
            onChange={(field, value) => setReadings(prev => ({ ...prev, [field]: value }))}
            notes={notes}
            onNotesChange={setNotes}
            submitAttempted={submitAttempted}
            showBillingCaption={false}
          />
        </section>

        {/* Landing Details */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1a4fd6]">
              Landing Details <span className="text-amber-400/70 normal-case tracking-normal font-medium ml-1">required</span>
            </p>
            <button
              type="button"
              onClick={addLandingRow}
              className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#1a4fd6] hover:text-[#1540a8] transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              Add Airport
            </button>
          </div>
          <div className="space-y-3">
            {landingRows.map((row, idx) => {
              const touched = row.airport_id !== '' || row.landing_count !== ''
              return (
                <div key={idx} className="flex items-start gap-3">
                  <div className="flex-1 grid grid-cols-[1fr_120px] gap-3">
                    <select
                      value={row.airport_id}
                      onChange={e => updateLandingAirport(idx, e.target.value)}
                      className={`w-full bg-white border rounded-lg px-3 py-2.5 text-sm text-[#152d5a] focus:outline-none focus:ring-1 transition-colors shadow-[0_1px_0_rgba(255,255,255,0.8)] ${
                        touched && !row.airport_id
                          ? 'border-amber-300 focus:border-amber-400/60 focus:ring-amber-200'
                          : 'border-[#cbdcf0] focus:border-[#93c5fd] focus:ring-blue-200 hover:border-[#bfd5ee]'
                      }`}
                    >
                      <option value="">Select airport…</option>
                      {airportOptions.map(a => (
                        <option key={a.id} value={a.id}>{a.icao_code} — {a.name}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="Landings"
                      value={row.landing_count}
                      onChange={e => updateLandingCount(idx, e.target.value)}
                      className={`w-full bg-white border rounded-lg px-3 py-2.5 text-sm text-[#152d5a] text-right placeholder:text-[#94a3b8] focus:outline-none focus:ring-1 transition-colors shadow-[0_1px_0_rgba(255,255,255,0.8)] ${
                        touched && (!row.landing_count || Number(row.landing_count) < 1)
                          ? 'border-amber-300 focus:border-amber-400/60 focus:ring-amber-200'
                          : 'border-[#cbdcf0] focus:border-[#93c5fd] focus:ring-blue-200 hover:border-[#bfd5ee]'
                      }`}
                    />
                  </div>
                  {landingRows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLandingRow(idx)}
                      className="mt-2 text-[#94a3b8] hover:text-red-500 transition-colors flex-shrink-0"
                    >
                      <span className="material-symbols-outlined text-[18px]">remove_circle</span>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-[10px] text-[#6b7280] leading-relaxed">
            Add one row per airport. Include touch-and-go landings at each location.
          </p>
        </section>

        {/* Evidence Upload */}
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1a4fd6] mb-5">Evidence Upload</p>
          <div
            className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-[#1a4fd6]/60 bg-[#f0f6ff]' : 'border-[#cbdcf0] bg-[#f8fbff] hover:border-[#93c5fd]'
            }`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(Array.from(e.dataTransfer.files)) }}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-12 h-12 rounded-full bg-white border border-[#dbe7f4] flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-[#1a4fd6] text-2xl">upload</span>
            </div>
            <div>
              <p className="text-sm text-[#152d5a] font-medium">Drag and drop photos here, or click to browse</p>
              <p className="text-xs text-[#4b6390] mt-1 leading-relaxed">JPEG or PNG only · Max 10 MB per file · Up to 10 files</p>
              <p className="text-[11px] text-[#6b7280] mt-1">Files are uploaded and saved when you submit your record.</p>
            </div>
            <button
              type="button"
              className="mt-1 px-5 py-1.5 border border-[#cbdcf0] rounded text-xs font-semibold uppercase tracking-[0.14em] text-[#1a4fd6] hover:border-[#93c5fd] hover:bg-white transition-colors bg-white"
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
              onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }}
            />
          </div>
          {uploadErrors.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {uploadErrors.map((r, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                  <span className="material-symbols-outlined text-red-500 text-[14px] mt-0.5 flex-shrink-0">error</span>
                  <div className="min-w-0">
                    <span className="text-xs text-red-600 font-medium truncate block">{r.name}</span>
                    <span className="text-[11px] text-red-500/80">{r.reason}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {files.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3">
              {files.map((entry, idx) => (
                <div key={idx} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-[#dbe7f4] bg-white flex-shrink-0 shadow-[0_1px_0_rgba(255,255,255,0.8)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={entry.preview} alt={entry.file.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors" />
                  <button type="button" onClick={() => removeFile(idx)} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                    <span className="material-symbols-outlined text-[#152d5a] text-[12px]">close</span>
                  </button>
                  <p className="absolute bottom-0 inset-x-0 bg-white/90 text-[8px] text-[#152d5a] px-1 py-0.5 truncate">{entry.file.name}</p>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>

      {/* Declaration + Submit */}
      <div className="px-6 sm:px-8 py-6 border-t border-[#e5eef8] flex flex-col sm:flex-row items-start sm:items-center gap-5 justify-between bg-[#f8fbff]">
        <label className="flex items-start gap-3 cursor-pointer select-none flex-1">
          <input
            type="checkbox"
            checked={declaration}
            onChange={e => setDeclaration(e.target.checked)}
            className="mt-0.5 accent-oz-blue flex-shrink-0"
          />
          <span className="text-xs text-[#4b6390] leading-relaxed">
            I declare that the meter readings and information provided are accurate and correspond to the completed flight.
          </span>
        </label>
        <button
          type="submit"
          disabled={isSubmitBlocked}
          aria-busy={loading || undefined}
          className="w-full sm:w-auto flex-shrink-0 px-7 py-2.5 bg-[#1a4fd6] hover:bg-[#1540a8] disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs font-semibold uppercase tracking-[0.14em] rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2"
        >
          <LoadingButtonContent loading={loading} loadingLabel="Submitting…">
            Submit Flight Record
          </LoadingButtonContent>
        </button>
      </div>

      {error && (
        <div className="mx-6 sm:mx-8 mb-6 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-600 leading-relaxed">
          <span className="material-symbols-outlined text-[14px] mt-0.5 flex-shrink-0">error</span>
          {error}
        </div>
      )}
    </form>
  )
}
