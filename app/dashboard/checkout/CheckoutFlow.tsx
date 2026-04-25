'use client'

import { useState, useCallback, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { submitCheckoutRequest, createProvisionalSoloBooking } from '@/app/actions/checkout'
import {
  checkCustomerAvailability,
  getDayAvailability,
  type SafeConflict,
} from '@/app/actions/customer-availability'
import { uploadVerificationDocument } from '@/app/actions/upload'
import { sydneyInputToUTC, formatSydTime } from '@/lib/utils/sydney-time'
import { formatDate, formatDateTime } from '@/lib/formatDateTime'
import type { UserDocument, DocumentType } from '@/lib/supabase/types'
import type { CheckoutBookingResult } from '@/lib/supabase/booking-types'

// ── Types ──────────────────────────────────────────────────────────────────────

type AvailabilityState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'unavailable'; message: string }

type Step = 'time' | 'documents' | 'review' | 'success'

type Props = {
  aircraftId:              string
  aircraftRegistration:    string
  aircraftDisplayName:     string
  aircraftStatus:          string
  documents:               UserDocument[]
  pilotClearanceStatus:    string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// Checkout is a fixed 1-hour session at $290/hr
const CHECKOUT_DURATION_HOURS = 1
const CHECKOUT_RATE            = 290

const ALL_TIME_OPTIONS = (() => {
  const opts: { value: string; label: string }[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const value  = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      const period = h < 12 ? 'AM' : 'PM'
      const h12    = h === 0 ? 12 : h > 12 ? h - 12 : h
      opts.push({ value, label: `${h12}:${String(m).padStart(2, '0')} ${period}` })
    }
  }
  return opts
})()

// Returns an HH:MM string that is 1 hour after the given HH:MM, clamped to 23:30.
function addOneHour(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number)
  const totalMin = (h! * 60 + m!) + 60
  const newH = Math.min(23, Math.floor(totalMin / 60))
  const newM = totalMin % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}

function minDateString(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]!
}

// Returns the Sydney-local YYYY-MM-DD for the checkout end time.
// First solo can start at or after checkout end — no 24-hour buffer.
function minFirstSoloDate(checkoutEndUTC: string): string {
  return new Date(checkoutEndUTC).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
}

function addOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d! + 1))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

// ── Step indicator ─────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'time',      label: 'Checkout Time'  },
    { key: 'documents', label: 'Documents'       },
    { key: 'review',    label: 'Review & Submit' },
  ]
  const order: Step[] = ['time', 'documents', 'review', 'success']
  const currentIdx = order.indexOf(current)

  return (
    <div className="flex items-center gap-6 sm:gap-10">
      {steps.map((step, i) => {
        const state = i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'pending'
        return (
          <div key={step.key} className="flex items-center gap-2.5">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold
              ${state === 'done'    ? 'bg-green-500/15 border border-green-500/40 text-green-400' : ''}
              ${state === 'active'  ? 'bg-blue-600/20 border border-blue-500/50 text-blue-400' : ''}
              ${state === 'pending' ? 'bg-white/[0.04] border border-white/10 text-slate-600' : ''}
            `}>
              {state === 'done'
                ? <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'wght' 600" }}>check</span>
                : i + 1}
            </div>
            <span className={`text-[10px] font-semibold uppercase tracking-widest hidden sm:block
              ${state === 'done'    ? 'text-green-400/70' : ''}
              ${state === 'active'  ? 'text-white' : ''}
              ${state === 'pending' ? 'text-slate-600' : ''}
            `}>
              {step.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Availability timeline ──────────────────────────────────────────────────────

function AvailabilityTimeline({
  selectedDate,
  daySlots,
  startDT,
  endDT,
}: {
  selectedDate: string
  daySlots:     SafeConflict[]
  startDT:      string
  endDT:        string
}) {
  if (!selectedDate) return null

  const opStartUTC = sydneyInputToUTC(`${selectedDate}T00:00`)
  const opEndUTC   = sydneyInputToUTC(`${addOneDay(selectedDate)}T00:00`)
  if (!opStartUTC || !opEndUTC) return null

  const opStartMs = new Date(opStartUTC).getTime()
  const opEndMs   = new Date(opEndUTC).getTime()
  const totalMs   = opEndMs - opStartMs

  function toPercent(isoUTC: string): number {
    const t = new Date(isoUTC).getTime()
    return Math.max(0, Math.min(100, ((t - opStartMs) / totalMs) * 100))
  }

  const selStartUTC = sydneyInputToUTC(startDT)
  const selEndUTC   = sydneyInputToUTC(endDT)
  const hasSelection = !!(selStartUTC && selEndUTC && new Date(selEndUTC) > new Date(selStartUTC))

  const visibleSlots = daySlots.filter(s => {
    return new Date(s.end_time).getTime() > opStartMs && new Date(s.start_time).getTime() < opEndMs
  })

  const majorTicks = [0, 3, 6, 9, 12, 15, 18, 21, 24]
  function hourLabel(h: number): string {
    if (h === 0 || h === 24) return '12AM'
    if (h === 12) return '12PM'
    return h < 12 ? `${h}AM` : `${h - 12}PM`
  }

  const selLeft  = hasSelection ? toPercent(selStartUTC!) : 0
  const selRight = hasSelection ? 100 - toPercent(selEndUTC!) : 0

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="relative h-10 bg-green-500/15 rounded-lg overflow-hidden border border-green-500/10">
          {visibleSlots.map((slot, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 bg-red-500/60"
              style={{ left: `${toPercent(slot.start_time)}%`, right: `${100 - toPercent(slot.end_time)}%` }}
              title={slot.label}
            />
          ))}
        </div>
        {hasSelection && (
          <div
            className="absolute inset-y-[-2px] rounded-lg border-2 border-blue-400/80 bg-blue-500/10 pointer-events-none"
            style={{ left: `${selLeft}%`, right: `${selRight}%` }}
          />
        )}
      </div>
      <div className="relative h-4">
        {majorTicks.map(h => (
          <span
            key={h}
            className="absolute text-[9px] font-medium text-slate-600 -translate-x-1/2 select-none leading-none uppercase"
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {hourLabel(h)}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-5 pt-1">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-600">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-500/40 inline-block" />Available
        </span>
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-600">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-500/60 inline-block" />Booked
        </span>
        {hasSelection && (
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm border-2 border-blue-400/80 inline-block" />Selected
          </span>
        )}
      </div>
    </div>
  )
}

// ── Document card + modal pattern ─────────────────────────────────────────────
// Shows a clean status card for each document.
// Upload/Replace opens a modal overlay with the required fields.
// On success, refreshes server data via router.refresh() without losing time state.

const MAX_DOC_SIZE  = 10 * 1024 * 1024
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']

type DocCardDef = {
  type:  DocumentType
  label: string
  icon:  string
}

const DOC_DEFS: DocCardDef[] = [
  { type: 'pilot_licence',       label: 'Pilot Licence',       icon: 'badge'             },
  { type: 'medical_certificate', label: 'Medical Certificate', icon: 'health_and_safety' },
  { type: 'photo_id',            label: 'Photo ID',            icon: 'id_card'           },
]

// ── Document upload modal ──────────────────────────────────────────────────────

function DocModal({
  def,
  doc,
  onClose,
  onSuccess,
}: {
  def:       DocCardDef
  doc:       UserDocument | undefined
  onClose:   () => void
  onSuccess: () => void
}) {
  const isReplace = !!doc

  // Field state pre-filled from existing doc
  const [licenceType,    setLicenceType]    = useState(doc?.licence_type    ?? '')
  const [licenceNumber,  setLicenceNumber]  = useState(doc?.licence_number  ?? '')
  const [medicalClass,   setMedicalClass]   = useState(doc?.medical_class   ?? '')
  const [issueDate,      setIssueDate]      = useState(doc?.issue_date      ?? '')
  const [expiryDate,     setExpiryDate]     = useState(doc?.expiry_date     ?? '')
  const [idType,         setIdType]         = useState(doc?.id_type         ?? '')
  const [documentNumber, setDocumentNumber] = useState(doc?.document_number ?? '')
  const [uploading,      setUploading]      = useState(false)
  const [fileError,      setFileError]      = useState<string | null>(null)
  const [formError,      setFormError]      = useState<string | null>(null)

  function Pill({ value, active, onClick }: { value: string; active: boolean; onClick: () => void }) {
    return (
      <button type="button" onClick={onClick}
        className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all text-left ${
          active ? 'bg-blue-500/15 border-blue-500/30 text-blue-300' : 'bg-white/[0.03] border-white/10 text-white/40 hover:text-white/70'
        }`}
      >{value}</button>
    )
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setFileError(null)
    setFormError(null)
    if (!file) return
    if (!ALLOWED_TYPES.includes(file.type)) { setFileError('Only PDF, JPG, JPEG, and PNG files are allowed.'); return }
    if (file.size > MAX_DOC_SIZE)           { setFileError('File must be 10 MB or smaller.'); return }

    // Validate required fields before upload
    if (def.type === 'pilot_licence') {
      if (!licenceType)   { setFormError('Please select a licence type.'); return }
      if (!licenceNumber) { setFormError('Please enter your pilot licence number / ARN.'); return }
    }
    if (def.type === 'medical_certificate') {
      if (!medicalClass) { setFormError('Please select a medical class.'); return }
      if (!issueDate)    { setFormError('Please enter the date of issue.'); return }
      if (!expiryDate)   { setFormError('Please enter the expiry date.'); return }
    }
    if (def.type === 'photo_id') {
      if (!idType)         { setFormError('Please select an ID type.'); return }
      if (!documentNumber) { setFormError('Please enter your document number.'); return }
    }

    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file',    file)
      fd.append('docType', def.type)
      if (licenceType)    fd.append('licenceType',    licenceType)
      if (licenceNumber)  fd.append('licenceNumber',  licenceNumber)
      if (medicalClass)   fd.append('medicalClass',   medicalClass)
      if (issueDate)      fd.append('issueDate',      issueDate)
      if (expiryDate)     fd.append('expiryDate',     expiryDate)
      if (idType)         fd.append('idType',         idType)
      if (documentNumber) fd.append('documentNumber', documentNumber)
      await uploadVerificationDocument(fd)
      onSuccess()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0c1220] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-lg text-blue-400" style={{ fontVariationSettings: "'wght' 300" }}>{def.icon}</span>
            <div>
              <p className="text-[9px] uppercase tracking-widest text-blue-400/70 font-bold">{isReplace ? 'Replace' : 'Upload'}</p>
              <p className="text-sm font-semibold text-white">{def.label}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* Pilot Licence fields */}
          {def.type === 'pilot_licence' && (
            <>
              <div className="space-y-2">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Licence Type <span className="text-red-400 font-normal normal-case">Required</span></p>
                <div className="grid grid-cols-2 gap-1.5">
                  {['Recreational (RPL)', 'Private (PPL)', 'Commercial (CPL)', 'Other'].map(t => (
                    <Pill key={t} value={t} active={licenceType === t.split(' ')[0] || licenceType === t} onClick={() => setLicenceType(t.split(' ')[0] ?? t)} />
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Pilot Licence Number / ARN <span className="text-red-400 font-normal normal-case">Required</span></p>
                <p className="text-[9px] text-slate-600">Your ARN is your CASA-issued aviation reference number.</p>
                <input type="text" value={licenceNumber} onChange={e => setLicenceNumber(e.target.value)}
                  placeholder="e.g. 123456"
                  className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/40 placeholder:text-white/20"
                />
              </div>
            </>
          )}

          {/* Medical Certificate fields */}
          {def.type === 'medical_certificate' && (
            <>
              <div className="space-y-2">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Medical Class <span className="text-red-400 font-normal normal-case">Required</span></p>
                <div className="grid grid-cols-2 gap-1.5">
                  {['Class 1', 'Class 2', 'Basic Class 2', 'Other'].map(c => (
                    <Pill key={c} value={c} active={medicalClass === c} onClick={() => setMedicalClass(c)} />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Date of Issue <span className="text-red-400 font-normal normal-case">Required</span></p>
                  <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/40"
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Expiry Date <span className="text-red-400 font-normal normal-case">Required</span></p>
                  <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/40"
                  />
                </div>
              </div>
            </>
          )}

          {/* Photo ID fields */}
          {def.type === 'photo_id' && (
            <>
              <div className="space-y-2">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">ID Type <span className="text-red-400 font-normal normal-case">Required</span></p>
                <div className="grid grid-cols-3 gap-1.5">
                  {['Passport', 'Driver Licence', 'Other'].map(t => (
                    <Pill key={t} value={t} active={idType === t} onClick={() => setIdType(t)} />
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Document Number <span className="text-red-400 font-normal normal-case">Required</span></p>
                <input type="text" value={documentNumber} onChange={e => setDocumentNumber(e.target.value)}
                  placeholder="Passport or licence number"
                  className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/40 placeholder:text-white/20"
                />
              </div>
            </>
          )}

          {/* File upload */}
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Document File <span className="text-red-400 font-normal normal-case">Required</span></p>
            <label className="flex items-center gap-3 p-3 rounded-xl border-2 border-dashed cursor-pointer transition-all border-white/10 hover:border-blue-500/40 hover:bg-white/[0.02]">
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFile} disabled={uploading} />
              <span className={`material-symbols-outlined text-xl flex-shrink-0 ${uploading ? 'text-blue-400 animate-spin' : 'text-slate-500'}`} style={{ fontVariationSettings: "'wght' 300" }}>
                {uploading ? 'progress_activity' : 'cloud_upload'}
              </span>
              <div>
                <p className="text-sm text-white/50">{uploading ? 'Uploading…' : 'Choose file'}</p>
                <p className="text-[10px] text-slate-600">PDF, JPG, PNG — max 10 MB</p>
              </div>
            </label>
          </div>

          {fileError  && <p className="text-[10px] text-red-400">{fileError}</p>}
          {formError  && <p className="text-[10px] text-red-400">{formError}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/[0.06] flex items-center justify-end gap-3">
          <button onClick={onClose}
            className="px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white/70 transition-colors"
          >
            Cancel
          </button>
          <p className="text-[9px] text-slate-600 flex-1">Select a file above to upload.</p>
        </div>

      </div>
    </div>
  )
}

// ── Document status card ───────────────────────────────────────────────────────

function DocCard({
  def,
  doc,
  onUploaded,
}: {
  def:       DocCardDef
  doc:       UserDocument | undefined
  onUploaded: () => void
}) {
  const today   = new Date().toISOString().split('T')[0]!
  const expired = doc?.expiry_date ? doc.expiry_date < today : false
  const ok      = !!doc && !expired && doc.status !== 'rejected'
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      {modalOpen && (
        <DocModal
          def={def}
          doc={doc}
          onClose={() => setModalOpen(false)}
          onSuccess={() => { setModalOpen(false); onUploaded() }}
        />
      )}
      <div className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-all ${
        ok      ? 'bg-green-500/[0.04] border-green-500/15' :
        expired ? 'bg-red-500/[0.04] border-red-500/15' :
                  'bg-white/[0.03] border-white/[0.08]'
      }`}>
        {/* Left: icon + label + status */}
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`material-symbols-outlined text-lg flex-shrink-0 ${ok ? 'text-green-400' : expired ? 'text-red-400' : 'text-slate-500'}`}
            style={{ fontVariationSettings: ok ? "'FILL' 1" : "'FILL' 0, 'wght' 300" }}
          >
            {def.icon}
          </span>
          <div className="min-w-0">
            <p className={`text-sm font-medium truncate ${ok ? 'text-white' : 'text-slate-400'}`}>{def.label}</p>
            {/* Metadata summary */}
            {ok && (
              <p className="text-[10px] text-slate-600 mt-0.5 truncate">
                {doc?.licence_type  && `${doc.licence_type} · `}
                {doc?.medical_class && `${doc.medical_class} · `}
                {doc?.id_type       && `${doc.id_type} · `}
                {doc?.file_name}
              </p>
            )}
            {expired && <p className="text-[10px] text-red-400 mt-0.5">Expired — please replace</p>}
          </div>
        </div>
        {/* Right: status badge + action */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          {ok
            ? <span className="text-[9px] font-bold uppercase tracking-widest text-green-400 border border-green-400/30 bg-green-500/10 px-2 py-0.5 rounded">Uploaded</span>
            : expired
            ? <span className="text-[9px] font-bold uppercase tracking-widest text-red-400 border border-red-400/30 bg-red-500/10 px-2 py-0.5 rounded">Expired</span>
            : doc?.status === 'rejected'
            ? <span className="text-[9px] font-bold uppercase tracking-widest text-red-400 border border-red-400/30 bg-red-500/10 px-2 py-0.5 rounded">Rejected</span>
            : <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 border border-white/10 px-2 py-0.5 rounded">Required</span>
          }
          <button
            onClick={() => setModalOpen(true)}
            className={`text-[9px] font-bold uppercase tracking-widest transition-colors px-2.5 py-1 rounded-full border ${
              ok
                ? 'text-slate-500 border-white/10 hover:text-white hover:border-white/25'
                : 'text-blue-400 border-blue-500/30 hover:bg-blue-500/10'
            }`}
          >
            {ok ? 'Replace' : 'Upload'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── First solo reservation picker ─────────────────────────────────────────────

function FirstSoloPicker({
  aircraftId,
  checkoutEnd,
  onBooked,
  onSkip,
}: {
  aircraftId:   string
  checkoutEnd:  string   // UTC ISO
  onBooked:     (ref: string, start: string, end: string) => void
  onSkip:       () => void
}) {
  const minDate   = minFirstSoloDate(checkoutEnd)
  const [date, setDate]           = useState(minDate)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime]     = useState('11:00')
  const [avail, setAvail]         = useState<AvailabilityState>({ status: 'idle' })
  const [error, setError]         = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const startDT = date && startTime ? `${date}T${startTime}` : ''
  const endDT   = date && endTime   ? `${date}T${endTime}` : ''

  // Check availability when selection changes
  useEffect(() => {
    if (!startDT || !endDT) { setAvail({ status: 'idle' }); return }
    const startUTC = sydneyInputToUTC(startDT)
    const endUTC   = sydneyInputToUTC(endDT)
    if (!startUTC || !endUTC || new Date(endUTC) <= new Date(startUTC)) {
      setAvail({ status: 'idle' }); return
    }
    setAvail({ status: 'checking' })
    const t = setTimeout(() => {
      checkCustomerAvailability(aircraftId, startUTC, endUTC)
        .then(r => {
          if (r.available) setAvail({ status: 'available' })
          else setAvail({ status: 'unavailable', message: 'This time slot is not available.' })
        })
        .catch(() => setAvail({ status: 'idle' }))
    }, 600)
    return () => clearTimeout(t)
  }, [startDT, endDT, aircraftId])

  function handleBook() {
    if (!startDT || !endDT) { setError('Please select a date and time.'); return }
    const startUTC = sydneyInputToUTC(startDT)
    const endUTC   = sydneyInputToUTC(endDT)
    if (!startUTC || !endUTC) { setError('Invalid time selection.'); return }

    setError(null)
    startTransition(async () => {
      try {
        const res = await createProvisionalSoloBooking({
          aircraft_id:     aircraftId,
          scheduled_start: startUTC,
          scheduled_end:   endUTC,
        })
        onBooked(res.bookingReference, startUTC, endUTC)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to reserve. Please try again.'
        setError(msg.replace(/^VALIDATION: |^AVAILABILITY: /, ''))
      }
    })
  }

  const endOptions = ALL_TIME_OPTIONS.filter(o => o.value > startTime)

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-400 leading-relaxed">
        You can reserve your first solo flight for any available time after your checkout flight ends. This reservation will only be confirmed once you are cleared for solo hire.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">Date</label>
          <input
            type="date"
            value={date}
            min={minDate}
            onChange={e => { setDate(e.target.value); setAvail({ status: 'idle' }) }}
            className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/60"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">Departure</label>
          <select
            value={startTime}
            onChange={e => { setStartTime(e.target.value); setAvail({ status: 'idle' }) }}
            className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/60"
          >
            {ALL_TIME_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">Return</label>
          <select
            value={endTime}
            onChange={e => { setEndTime(e.target.value); setAvail({ status: 'idle' }) }}
            className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/60"
          >
            {endOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Availability indicator */}
      {avail.status === 'checking' && (
        <p className="text-xs text-slate-500 animate-pulse">Checking availability…</p>
      )}
      {avail.status === 'available' && (
        <p className="text-xs text-green-400 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          This time slot is available
        </p>
      )}
      {avail.status === 'unavailable' && (
        <p className="text-xs text-red-400 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm">block</span>
          {(avail as { status: 'unavailable'; message: string }).message}
        </p>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          onClick={handleBook}
          disabled={isPending || avail.status === 'unavailable' || avail.status === 'checking'}
          className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all"
        >
          {isPending ? 'Reserving…' : 'Reserve My First Solo Flight'}
        </button>
        <button
          onClick={onSkip}
          className="px-5 py-3 border border-white/15 hover:border-white/25 text-slate-400 hover:text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all"
        >
          Skip
        </button>
      </div>
    </div>
  )
}

// ── Main flow component ────────────────────────────────────────────────────────

export default function CheckoutFlow({
  aircraftId,
  aircraftRegistration,
  aircraftDisplayName,
  aircraftStatus,
  documents,
  pilotClearanceStatus,
}: Props) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('time')

  // Time selection state — end time is always start + 1 hour (fixed checkout duration)
  const [date, setDate]           = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [daySlots, setDaySlots]   = useState<SafeConflict[]>([])
  const [avail, setAvail]         = useState<AvailabilityState>({ status: 'idle' })

  // Submission state
  const [submitError, setSubmitError]   = useState<string | null>(null)
  const [isPending, startTransition]    = useTransition()

  // Result state
  const [checkoutResult, setCheckoutResult] = useState<CheckoutBookingResult | null>(null)

  // First solo reservation result state
  const [soloRef, setSoloRef]         = useState<string | null>(null)
  const [soloStart, setSoloStart]     = useState<string | null>(null)
  const [soloEnd, setSoloEnd]         = useState<string | null>(null)
  const [soloSkipped, setSoloSkipped] = useState(false)

  // Last flight date (captured in documents step)
  const [lastFlightDate, setLastFlightDate] = useState('')

  // ── Document gate ──────────────────────────────────────────────────────────

  const today = new Date().toISOString().split('T')[0]!

  const licenceDoc = documents.find(d => d.document_type === 'pilot_licence')
  const medicalDoc = documents.find(d => d.document_type === 'medical_certificate')
  const photoIdDoc = documents.find(d => d.document_type === 'photo_id')

  const isDocOk = (doc: UserDocument | undefined): boolean => {
    if (!doc) return false
    if (doc.status === 'rejected') return false
    if (doc.expiry_date && doc.expiry_date < today) return false
    return true
  }

  const allDocsUploaded = isDocOk(licenceDoc) && isDocOk(medicalDoc) && isDocOk(photoIdDoc)

  // ── Derived time values ────────────────────────────────────────────────────
  // end is always exactly 1 hour after start — never submitted from the client.

  const endTime  = date ? addOneHour(startTime) : ''
  const startDT  = date && startTime ? `${date}T${startTime}` : ''
  const endDT    = date && endTime   ? `${date}T${endTime}`   : ''

  const startUTC = startDT ? sydneyInputToUTC(startDT) : null
  const endUTC   = endDT   ? sydneyInputToUTC(endDT)   : null

  // ── Load day availability ──────────────────────────────────────────────────

  useEffect(() => {
    if (!date) { setDaySlots([]); return }
    getDayAvailability(aircraftId, date)
      .then(r => setDaySlots(r ?? []))
      .catch(() => setDaySlots([]))
  }, [date, aircraftId])

  // ── Live availability check ────────────────────────────────────────────────

  useEffect(() => {
    if (!startUTC || !endUTC || new Date(endUTC) <= new Date(startUTC)) {
      setAvail({ status: 'idle' }); return
    }
    setAvail({ status: 'checking' })
    const t = setTimeout(() => {
      checkCustomerAvailability(aircraftId, startUTC, endUTC)
        .then(r => {
          if (r.available) setAvail({ status: 'available' })
          else setAvail({ status: 'unavailable', message: 'This time slot is not available. Please choose another time.' })
        })
        .catch(() => setAvail({ status: 'idle' }))
    }, 600)
    return () => clearTimeout(t)
  }, [startDT, endDT, aircraftId])

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleTimeNext() {
    if (!date) { setSubmitError('Please select a date.'); return }
    if (!startUTC) { setSubmitError('Please select a departure time.'); return }
    if (new Date(startUTC) <= new Date()) {
      setSubmitError('Please select a future time.'); return
    }
    if (avail.status === 'unavailable') {
      setSubmitError('Please choose an available time slot.'); return
    }
    setSubmitError(null)
    setStep('documents')
  }

  function handleSubmit() {
    if (!startUTC) return
    setSubmitError(null)
    startTransition(async () => {
      try {
        const result = await submitCheckoutRequest({
          aircraft_id:      aircraftId,
          scheduled_start:  startUTC,
          last_flight_date: lastFlightDate || null,
          // scheduled_end is computed server-side as start + 1 hour
        })
        setCheckoutResult(result)
        setStep('success')
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Submission failed. Please try again.'
        setSubmitError(msg.replace(/^VALIDATION: |^AVAILABILITY: /, ''))
      }
    })
  }

  // ── Shared card style ──────────────────────────────────────────────────────

  const CARD = 'bg-gradient-to-br from-[#0c1525] to-[#080e1c] border border-white/[0.07] rounded-xl shadow-[0_4px_30px_rgba(0,0,0,0.35)]'

  // ── "Already submitted" view ───────────────────────────────────────────────
  // When the user lands on /dashboard/checkout with checkout_requested status
  // (e.g. navigating back after the page revalidated), show a read-only
  // confirmation instead of the checkout form.
  if (pilotClearanceStatus === 'checkout_requested' && step !== 'success') {
    return (
      <div className="px-6 md:px-10 py-10 max-w-2xl mx-auto w-full">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-oz-blue hover:text-blue-300 text-sm mb-8 transition-colors"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to Dashboard
        </Link>
        <div className={`${CARD} p-8 text-center space-y-5`}>
          <div className="w-16 h-16 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-3xl text-blue-400" style={{ fontVariationSettings: "'wght' 300" }}>pending_actions</span>
          </div>
          <div>
            <h2 className="text-2xl font-serif text-white mb-3">Checkout Request Submitted</h2>
            <p className="text-sm text-slate-400 leading-relaxed max-w-md mx-auto">
              Your checkout request has been submitted for review. An admin or approved instructor will review your selected time and documents. You will be notified once the request has been reviewed.
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="px-6 md:px-10 py-10 max-w-2xl mx-auto w-full">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-oz-blue hover:text-blue-300 text-sm mb-8 transition-colors"
      >
        <span className="material-symbols-outlined text-base">arrow_back</span>
        Back to Dashboard
      </Link>

      {/* Page header */}
      <div className="mb-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-blue-400/80 mb-2">
          Checkout Onboarding
        </p>
        <h1 className="text-3xl font-serif text-white tracking-tight">
          Book Your Checkout Flight
        </h1>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          To fly solo with us, you must first complete a checkout flight with an approved instructor.
        </p>
      </div>

      {/* Step indicator — hidden on success */}
      {step !== 'success' && (
        <div className={`${CARD} p-5 mb-6`}>
          <StepIndicator current={step} />
        </div>
      )}

      {/* ── STEP 1: Time selection ─────────────────────────────────────────── */}
      {step === 'time' && (
        <div className={`${CARD} p-7 space-y-6`}>
          <div>
            <h2 className="text-lg font-serif text-white mb-1">Select Your Checkout Flight Time</h2>
            <p className="text-sm text-slate-500">
              Choose when you would like to complete your checkout flight with {aircraftRegistration}.
            </p>
          </div>

          {/* Fixed checkout session info */}
          <div className="grid grid-cols-3 divide-x divide-white/[0.06] bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
            {[
              { label: 'Session type', value: 'Checkout Flight' },
              { label: 'Duration',     value: '1 hour'          },
              { label: 'Rate',         value: '$290 / hour'     },
            ].map(({ label, value }) => (
              <div key={label} className="px-4 py-3 text-center">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">{label}</p>
                <p className="text-sm font-medium text-white">{value}</p>
              </div>
            ))}
          </div>

          {aircraftStatus === 'inactive' || aircraftStatus === 'grounded' ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-300">
              This aircraft is currently unavailable. Please contact the flight operations team.
            </div>
          ) : (
            <>
              {/* Date + departure time only — return is auto-calculated */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">Date</label>
                  <input
                    type="date"
                    value={date}
                    min={minDateString()}
                    onChange={e => { setDate(e.target.value); setAvail({ status: 'idle' }); setSubmitError(null) }}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/60 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">Departure time</label>
                  <select
                    value={startTime}
                    onChange={e => { setStartTime(e.target.value); setAvail({ status: 'idle' }); setSubmitError(null) }}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/60"
                  >
                    {ALL_TIME_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Computed return time display */}
              {date && (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-slate-400">Return time</span>
                  <span className="text-sm font-medium text-white/70">
                    {(() => {
                      const opt = ALL_TIME_OPTIONS.find(o => o.value === endTime)
                      return opt ? opt.label : endTime
                    })()}
                    <span className="text-slate-600 font-normal ml-1.5 text-xs">(fixed)</span>
                  </span>
                </div>
              )}

              {/* Availability state */}
              {avail.status === 'checking' && (
                <p className="text-xs text-slate-500 animate-pulse">Checking availability…</p>
              )}
              {avail.status === 'available' && (
                <p className="text-xs text-green-400 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  This time slot is available
                </p>
              )}
              {avail.status === 'unavailable' && (
                <p className="text-xs text-red-400 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">block</span>
                  {(avail as { status: 'unavailable'; message: string }).message}
                </p>
              )}

              {/* Timeline */}
              {date && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                    {formatDate(date)} — Daily Schedule
                  </p>
                  <AvailabilityTimeline
                    selectedDate={date}
                    daySlots={daySlots}
                    startDT={startDT}
                    endDT={endDT}
                  />
                </div>
              )}

              {submitError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                  <p className="text-sm text-red-300">{submitError}</p>
                </div>
              )}

              <button
                onClick={handleTimeNext}
                disabled={!date || avail.status === 'checking' || avail.status === 'unavailable'}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all"
              >
                Continue to Documents
              </button>
            </>
          )}
        </div>
      )}

      {/* ── STEP 2: Documents ─────────────────────────────────────────────── */}
      {step === 'documents' && (
        <div className={`${CARD} p-7 space-y-6`}>
          <div>
            <h2 className="text-lg font-serif text-white mb-1">Pilot Documents</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Upload your required documents below. These are reviewed as part of your checkout request.
            </p>
          </div>

          {/* Document cards — click Upload/Replace to open modal */}
          <div className="space-y-2.5">
            {DOC_DEFS.map(def => (
              <DocCard
                key={def.type}
                def={def}
                doc={documents.find(d => d.document_type === def.type)}
                onUploaded={() => router.refresh()}
              />
            ))}
          </div>

          {allDocsUploaded && (
            <div className="bg-green-500/[0.06] border border-green-500/20 rounded-lg px-4 py-3 flex items-center gap-3">
              <span className="material-symbols-outlined text-green-400 text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              <p className="text-sm text-green-300">All required documents have been uploaded.</p>
            </div>
          )}

          {/* Last flight date */}
          <div className="pt-2 border-t border-white/[0.06] space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">
              When was your last flight? <span className="text-red-400 font-normal normal-case">Required</span>
            </label>
            <input
              type="date"
              value={lastFlightDate}
              max={new Date().toISOString().split('T')[0]}
              onChange={e => setLastFlightDate(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/60 transition-colors"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setStep('time')}
              className="px-5 py-3 border border-white/15 hover:border-white/25 text-slate-400 hover:text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all"
            >
              Back
            </button>
            <button
              onClick={() => { setSubmitError(null); setStep('review') }}
              disabled={!allDocsUploaded || !lastFlightDate}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all"
            >
              Continue to Review
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Review & Submit ───────────────────────────────────────── */}
      {step === 'review' && startUTC && endUTC && (
        <div className={`${CARD} p-7 space-y-6`}>
          <div>
            <h2 className="text-lg font-serif text-white mb-1">Review Your Checkout Request</h2>
            <p className="text-sm text-slate-500">
              Review the details below and submit your checkout request.
            </p>
          </div>

          {/* Summary */}
          <div className="space-y-0">
            {[
              { label: 'Aircraft',      value: `${aircraftDisplayName} (${aircraftRegistration})` },
              { label: 'Date',          value: formatDate(date) },
              { label: 'Departure',     value: formatDateTime(startUTC) },
              { label: 'Return',        value: formatDateTime(endUTC) },
              { label: 'Duration',      value: '1 hour (fixed)' },
              { label: 'Checkout rate', value: `$${CHECKOUT_RATE} / hour` },
              { label: 'Session cost',  value: `$${CHECKOUT_RATE}` },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-3 border-b border-white/[0.06] last:border-0">
                <span className="text-sm text-slate-500">{label}</span>
                <span className="text-sm text-white/90 font-medium text-right">{value}</span>
              </div>
            ))}
          </div>

          {/* Clarifying note */}
          <div className="bg-blue-500/[0.06] border border-blue-500/20 rounded-lg px-4 py-3 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">What happens next</p>
            <p className="text-sm text-blue-200/70 leading-relaxed">
              Your selected checkout time has been submitted for review. An approved instructor may confirm this time or suggest an alternative. You will be notified once the request has been reviewed.
            </p>
          </div>

          {submitError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              <p className="text-sm text-red-300">{submitError}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setStep('documents')}
              disabled={isPending}
              className="px-5 py-3 border border-white/15 hover:border-white/25 text-slate-400 hover:text-white disabled:opacity-40 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all shadow-[0_0_20px_rgba(37,99,235,0.35)]"
            >
              {isPending ? 'Submitting…' : 'Submit Checkout Request'}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Success ───────────────────────────────────────────────── */}
      {step === 'success' && checkoutResult && (
        <div className="space-y-5">
          {/* Confirmation card */}
          <div className={`${CARD} p-8 text-center space-y-5`}>
            <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-3xl text-green-400" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            </div>
            <div>
              <h2 className="text-2xl font-serif text-white mb-3">Checkout request submitted</h2>
              <p className="text-sm text-slate-400 leading-relaxed max-w-md mx-auto">
                Your checkout request has been submitted for review. An admin or approved instructor will review your selected time and documents. You will be notified once the request has been reviewed.
              </p>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-5 py-4 inline-block text-left">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Booking Reference</p>
              <p className="text-lg font-mono font-bold text-white mb-2">{checkoutResult.bookingReference}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 tabular-nums">
                <span>{formatDateTime(checkoutResult.scheduledStart)}</span>
                <span>→</span>
                <span>{formatDateTime(checkoutResult.scheduledEnd)}</span>
              </div>
            </div>
          </div>

          {/* First solo reservation offer */}
          {!soloRef && !soloSkipped && (
            <div className={`${CARD} p-7 space-y-5`}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-lg text-blue-400" style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>flight_takeoff</span>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400/80 mb-1">Optional Next Step</p>
                  <h3 className="text-lg font-serif text-white mb-1">Reserve Your First Solo Flight</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    This booking will only be confirmed after your checkout is completed and you are cleared for solo hire.
                  </p>
                </div>
              </div>
              <div className="h-px bg-white/[0.06]" />
              <FirstSoloPicker
                aircraftId={aircraftId}
                checkoutEnd={checkoutResult.scheduledEnd}
                onBooked={(ref, start, end) => {
                  setSoloRef(ref)
                  setSoloStart(start)
                  setSoloEnd(end)
                }}
                onSkip={() => setSoloSkipped(true)}
              />
            </div>
          )}

          {/* First solo reserved */}
          {soloRef && soloStart && soloEnd && (
            <div className={`${CARD} p-6 flex items-start gap-4`}>
              <div className="w-9 h-9 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-base text-blue-400" style={{ fontVariationSettings: "'FILL' 1" }}>bookmark</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400/80 mb-1">First Solo Reserved</p>
                <p className="text-sm text-white font-medium mb-0.5">{formatDateTime(soloStart)} → {formatDateTime(soloEnd)}</p>
                <p className="text-[11px] text-slate-500 font-mono">{soloRef}</p>
                <p className="text-xs text-amber-300/70 mt-2 leading-relaxed">
                  This booking will only be confirmed after your checkout is completed and you are cleared for solo hire.
                </p>
              </div>
            </div>
          )}

          {/* CTA to dashboard */}
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full py-3.5 border border-white/15 hover:border-white/25 hover:bg-white/[0.04] text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all"
          >
            Go to Dashboard
          </button>
        </div>
      )}
    </div>
  )
}
