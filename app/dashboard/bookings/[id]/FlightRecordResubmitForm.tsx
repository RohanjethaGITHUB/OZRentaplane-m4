'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { resubmitFlightRecord, uploadFlightRecordEvidence } from '@/app/actions/booking'
import TotalOnlyReadingsForm from '@/components/aircraft/TotalOnlyReadingsForm'
import {
  type TotalOnlyFormValues,
  validateTotalOnlyReadings,
  numberInputValue,
} from '@/lib/aircraft-readings'
import type { FlightRecord } from '@/lib/supabase/booking-types'

type UploadedFile = { file: File; preview: string }
type RejectedFile = { name: string; reason: string }

const MAX_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png'])

type Props = {
  flightRecord: FlightRecord
  bookingId: string
  onSuccess?: () => void
}

export default function FlightRecordResubmitForm({ flightRecord, bookingId, onSuccess }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState<string | null>(null)
  const [done,            setDone]            = useState(false)
  const [declaration,     setDeclaration]     = useState(false)
  const [dragOver,        setDragOver]        = useState(false)
  const [newFiles,        setNewFiles]        = useState<UploadedFile[]>([])
  const [fileErrors,      setFileErrors]      = useState<RejectedFile[]>([])
  const [uploadResults,   setUploadResults]   = useState<Array<{ name: string; success: boolean; error?: string }>>([])
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [notes,           setNotes]           = useState(flightRecord.customer_notes ?? '')

  // Pre-populate from the stored totals (generated columns from start/stop)
  const [readings, setReadings] = useState<TotalOnlyFormValues>({
    vdo_total:        numberInputValue(flightRecord.vdo_total),
    tacho_total:      numberInputValue(flightRecord.tacho_total),
    air_switch_total: numberInputValue(flightRecord.air_switch_total),
    mr_total:         numberInputValue(flightRecord.mr_total),
    oil_added:        numberInputValue(flightRecord.oil_added),
    oil_total:        numberInputValue(flightRecord.oil_total),
    fuel_added:       numberInputValue(flightRecord.fuel_added),
    fuel_returned:       numberInputValue(flightRecord.fuel_returned),
  })

  function addFiles(incoming: File[]) {
    const accepted: UploadedFile[] = []
    const rejected: RejectedFile[] = []
    for (const file of incoming) {
      if (!ALLOWED_TYPES.has(file.type)) {
        const ext = file.name.split('.').pop()?.toUpperCase() ?? '?'
        rejected.push({ name: file.name, reason: file.type.startsWith('image/') ? `${ext} not supported — use JPEG or PNG` : 'Not a recognised image file' })
      } else if (file.size > MAX_FILE_BYTES) {
        rejected.push({ name: file.name, reason: `Too large (${(file.size / 1024 / 1024).toFixed(1)} MB) — max 10 MB` })
      } else {
        accepted.push({ file, preview: URL.createObjectURL(file) })
      }
    }
    if (accepted.length > 0) setNewFiles(prev => [...prev, ...accepted])
    setFileErrors(rejected)
  }

  function removeNewFile(index: number) {
    setNewFiles(prev => {
      URL.revokeObjectURL(prev[index].preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  function getNum(field: keyof TotalOnlyFormValues): number | null {
    const v = readings[field]
    if (!v || !v.trim()) return null
    const parsed = Number(v)
    return Number.isFinite(parsed) ? parsed : null
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitAttempted(true)
    setError(null)

    if (!declaration) { setError('You must accept the declaration before resubmitting.'); return }

    const totalReadings = {
      vdo_total:        getNum('vdo_total')        ?? 0,
      tacho_total:      getNum('tacho_total')      ?? 0,
      air_switch_total: getNum('air_switch_total') ?? 0,
      mr_total:         getNum('mr_total')         ?? 0,
      oil_added:        getNum('oil_added'),
      oil_total:        getNum('oil_total'),
      fuel_added:       getNum('fuel_added'),
      fuel_returned:       getNum('fuel_returned'),
      landings:         flightRecord.landings ?? null,
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

      await resubmitFlightRecord({
        flight_record_id: flightRecord.id,
        booking_id:       bookingId,
        vdo_total:        totalReadings.vdo_total,
        tacho_total:      totalReadings.tacho_total,
        air_switch_total: totalReadings.air_switch_total,
        mr_total:         totalReadings.mr_total,
        oil_added:        totalReadings.oil_added,
        oil_total:        totalReadings.oil_total,
        fuel_added:       totalReadings.fuel_added,
        fuel_returned:       totalReadings.fuel_returned,
        landings:         flightRecord.landings ?? null,
        customer_notes:   totalReadings.notes,
      })

      if (newFiles.length > 0) {
        const results: Array<{ name: string; success: boolean; error?: string }> = []
        for (const file of newFiles) {
          const uploadFd = new FormData()
          uploadFd.set('file',           file.file)
          uploadFd.set('flightRecordId', flightRecord.id)
          uploadFd.set('bookingId',      bookingId)
          try {
            await uploadFlightRecordEvidence(uploadFd)
            results.push({ name: file.file.name, success: true })
          } catch (uploadErr) {
            results.push({ name: file.file.name, success: false, error: uploadErr instanceof Error ? uploadErr.message.replace(/^VALIDATION: /, '') : 'Upload failed' })
          }
        }
        setUploadResults(results)
      }

      setDone(true)
      router.refresh()
      onSuccess?.()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message.replace(/^VALIDATION: /, '') : 'Resubmission failed.')
      setLoading(false)
    }
  }

  if (done) {
    const failedUploads    = uploadResults.filter(r => !r.success)
    const succeededUploads = uploadResults.filter(r =>  r.success)
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-[1.5rem] p-6 space-y-4 shadow-[0_8px_24px_rgba(21,45,90,0.06)]">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-emerald-500 text-2xl flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
            check_circle
          </span>
          <div>
            <p className="text-sm font-semibold text-emerald-700">Resubmitted for review</p>
            <p className="text-xs text-emerald-700/70 mt-0.5">The operations team will review your updated record shortly.</p>
          </div>
        </div>
        {uploadResults.length > 0 && (
          <div className="border-t border-emerald-200 pt-3 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700/60 mb-2">Evidence Photos</p>
            {succeededUploads.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-emerald-700">
                <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>cloud_done</span>
                <span className="truncate">{r.name}</span>
              </div>
            ))}
            {failedUploads.map((r, i) => (
              <div key={i} className="text-xs text-red-500 flex items-start gap-2">
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
    <form onSubmit={handleSubmit} className="bg-white border border-[#dbe7f4] rounded-[1.5rem] overflow-hidden shadow-[0_8px_24px_rgba(21,45,90,0.06)]">
      <div className="px-7 pt-7 pb-5 border-b border-[#e5eef8]">
        <h3 className="text-lg font-serif text-[#152d5a] mb-1">Update Flight Record</h3>
        <p className="text-xs text-[#4b6390]">Correct the fields flagged by operations, then resubmit for review.</p>
      </div>

      <div className="px-7 py-6 space-y-8">
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1a4fd6] mb-4">Aircraft Readings</p>
          <TotalOnlyReadingsForm
            values={readings}
            onChange={(field, value) => setReadings(prev => ({ ...prev, [field]: value }))}
            notes={notes}
            onNotesChange={setNotes}
            submitAttempted={submitAttempted}
            showBillingCaption={false}
          />
        </section>

        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1a4fd6] mb-4">Additional Evidence Photos</p>
          <div
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-[#1a4fd6]/60 bg-[#f0f6ff]' : 'border-[#cbdcf0] bg-[#f8fbff] hover:border-[#93c5fd]'
            }`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(Array.from(e.dataTransfer.files)) }}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-10 h-10 rounded-full bg-white border border-[#dbe7f4] flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-[#1a4fd6] text-xl">add_photo_alternate</span>
            </div>
            <div>
              <p className="text-sm text-[#152d5a] font-medium">Add more evidence photos</p>
              <p className="text-xs text-[#4b6390] mt-1">JPEG or PNG · Max 10 MB per file · Saved on resubmit</p>
            </div>
            <button type="button" className="mt-1 px-4 py-1.5 border border-[#cbdcf0] rounded text-xs font-semibold uppercase tracking-[0.14em] text-[#1a4fd6] hover:border-[#93c5fd] hover:bg-white transition-colors bg-white">
              Choose Files
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            multiple
            className="hidden"
            onChange={e => addFiles(Array.from(e.target.files ?? []))}
          />
          {fileErrors.length > 0 && (
            <div className="mt-3 space-y-2">
              {fileErrors.map((fe, i) => (
                <div key={`${fe.name}-${i}`} className="text-xs text-red-500">{fe.name} — {fe.reason}</div>
              ))}
            </div>
          )}
          {newFiles.length > 0 && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {newFiles.map((file, index) => (
                <div key={`${file.file.name}-${index}`} className="relative rounded-xl overflow-hidden border border-[#dbe7f4] bg-white aspect-square shadow-[0_1px_0_rgba(255,255,255,0.8)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={file.preview} alt={file.file.name} className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removeNewFile(index)} className="absolute top-2 right-2 rounded-full bg-white/90 text-[#152d5a] p-1 hover:bg-white shadow-sm">
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-[#f8fbff] border border-[#dbe7f4] rounded-2xl p-5 space-y-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={declaration} onChange={e => setDeclaration(e.target.checked)} className="mt-1" />
            <span className="text-sm text-[#4b6390] leading-relaxed">
              I confirm these aircraft readings are accurate to the best of my knowledge and reflect the completed flight.
            </span>
          </label>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#1a4fd6] hover:bg-[#1540a8] disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-3 text-sm font-semibold transition-colors shadow-sm"
          >
            {loading ? 'Resubmitting...' : 'Resubmit Flight Record'}
          </button>
        </section>
      </div>
    </form>
  )
}
