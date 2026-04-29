'use client'

import { useState, useEffect, useTransition, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { submitCheckoutRequest } from '@/app/actions/checkout'
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
  initialLastFlightDate:   string
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

// Returns today's date in Sydney time as YYYY-MM-DD (used for min date and default date).
function getSydneyToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
}

// Returns the next 30-min slot at least 30 minutes from now in Sydney time.
// Falls back to 09:00 if it's late in the day and nothing fits.
function getDefaultStartTime(): string {
  const t    = new Date().toLocaleTimeString('en-GB', { timeZone: 'Australia/Sydney', hour12: false })
  const [hStr, mStr] = t.split(':')
  const h    = Math.min(parseInt(hStr ?? '0', 10), 23)
  const m    = parseInt(mStr ?? '0', 10)
  const totalMins  = h * 60 + m + 30          // +30 min buffer from now
  const snapped    = Math.ceil(totalMins / 30) * 30
  const clamped    = Math.min(snapped, 23 * 60) // latest 23:00 so end = 24:00
  const nh = Math.floor(clamped / 60)
  const nm = clamped % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

// Min selectable date is today in Sydney time (past times are blocked by validation).
function minDateString(): string {
  return getSydneyToday()
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
  onTimeChange,
}: {
  selectedDate:   string
  daySlots:       SafeConflict[]
  startDT:        string
  endDT:          string
  onTimeChange?:  (newTime: string) => void
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

  // ── Drag (Pointer Events — works on mouse + touch + stylus) ─────────────────
  // touch-action:none on the draggable element tells the browser to hand
  // pointer control to JS, preventing accidental page scroll during drag.
  // pointerId filtering handles multi-touch correctly.
  const barContainerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  function handlePointerDown(e: React.PointerEvent) {
    if (!hasSelection || !onTimeChange) return
    e.preventDefault()
    const rect = barContainerRef.current?.getBoundingClientRect()
    if (!rect) return

    // Capture in a local const so nested closures can call it without undefined checks
    const notifyTimeChange = onTimeChange
    const capturedId = e.pointerId

    const timePart = startDT.split('T')[1] ?? '00:00'
    const parts = timePart.split(':').map(Number)
    const startMinutes = (parts[0] ?? 0) * 60 + (parts[1] ?? 0)
    const containerWidth = rect.width
    const dragStartX = e.clientX
    let lastSnapped = ''

    setIsDragging(true)

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== capturedId) return
      const deltaPixels = ev.clientX - dragStartX
      const deltaMins   = (deltaPixels / containerWidth) * 24 * 60
      const rawMinutes  = startMinutes + deltaMins
      // Snap to 30-minute increments, clamp so 1-hr block stays within the day
      const snappedMinutes = Math.round(rawMinutes / 30) * 30
      const clamped        = Math.max(0, Math.min(23 * 60, snappedMinutes))
      const h   = Math.floor(clamped / 60)
      const m   = clamped % 60
      const newTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      if (newTime !== lastSnapped) {
        lastSnapped = newTime
        notifyTimeChange(newTime)
      }
    }

    function onEnd(ev: PointerEvent) {
      if (ev.pointerId !== capturedId) return
      setIsDragging(false)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup',   onEnd)
      document.removeEventListener('pointercancel', onEnd)
    }

    document.addEventListener('pointermove',   onMove)
    document.addEventListener('pointerup',     onEnd)
    document.addEventListener('pointercancel', onEnd)
  }

  return (
    <div className="space-y-3">
      <div className="relative" ref={barContainerRef}>
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
            onPointerDown={handlePointerDown}
            className={`absolute inset-y-[-2px] rounded-lg border-2 border-blue-400/80 bg-blue-500/15 flex items-center justify-center transition-colors ${
              onTimeChange
                ? isDragging
                  ? 'cursor-grabbing bg-blue-500/20 border-blue-400'
                  : 'cursor-grab hover:bg-blue-500/20 hover:border-blue-400'
                : 'pointer-events-none'
            }`}
            style={{
              left:        `${selLeft}%`,
              right:       `${selRight}%`,
              touchAction: onTimeChange ? 'none' : undefined, // prevents scroll hijack while dragging
            }}
            title={onTimeChange ? 'Drag to move selected time' : undefined}
          >
            {onTimeChange && (
              <div className="flex items-center gap-[3px] pointer-events-none select-none opacity-60">
                <div className="w-px h-3.5 bg-blue-300 rounded-full" />
                <div className="w-px h-3.5 bg-blue-300 rounded-full" />
              </div>
            )}
          </div>
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
            <span className="w-2.5 h-2.5 rounded-sm border-2 border-blue-400/80 inline-block" />
            {onTimeChange ? 'Selected time — drag to move' : 'Selected time'}
          </span>
        )}
        {hasSelection && onTimeChange && (
          <span className="text-[10px] text-slate-600 pl-1">· Fixed at 1 hour</span>
        )}
      </div>
    </div>
  )
}

// ── Custom time dropdown ───────────────────────────────────────────────────────
// Replaces native <select> to ensure dark-theme consistency across browsers.

function TimeDropdown({
  value,
  options,
  onChange,
  disabled,
}: {
  value:    string
  options:  { value: string; label: string }[]
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const containerRef    = useRef<HTMLDivElement>(null)
  const listRef         = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  // Scroll selected option into view when opened
  useEffect(() => {
    if (!open || !listRef.current) return
    const selected = listRef.current.querySelector('[data-selected="true"]') as HTMLElement | null
    selected?.scrollIntoView({ block: 'nearest' })
  }, [open])

  const selectedLabel = options.find(o => o.value === value)?.label ?? value

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/60 flex items-center justify-between transition-colors hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span>{selectedLabel}</span>
        <span
          className={`material-symbols-outlined text-[18px] text-slate-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          style={{ fontVariationSettings: "'wght' 300" }}
        >
          expand_more
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-[#0c1220] border border-white/[0.12] rounded-lg shadow-2xl overflow-hidden">
          <div ref={listRef} className="max-h-52 overflow-y-auto overscroll-contain">
            {options.map(o => (
              <button
                key={o.value}
                type="button"
                data-selected={o.value === value ? 'true' : undefined}
                onClick={() => { onChange(o.value); setOpen(false) }}
                className={`w-full px-3 py-2 text-sm text-left transition-colors ${
                  o.value === value
                    ? 'bg-blue-500/20 text-blue-300 font-medium'
                    : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
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

// ── Main flow component ────────────────────────────────────────────────────────

export default function CheckoutFlow({
  aircraftId,
  aircraftRegistration,
  aircraftDisplayName,
  aircraftStatus,
  documents,
  pilotClearanceStatus,
  initialLastFlightDate,
}: Props) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('time')

  // Time selection state — end time is always start + 1 hour (fixed checkout duration)
  // Lazy initialisers run once: pre-fill with today + next available 30-min slot in Sydney time.
  const [date, setDate]           = useState(getSydneyToday)
  const [startTime, setStartTime] = useState(getDefaultStartTime)
  const [daySlots, setDaySlots]   = useState<SafeConflict[]>([])
  const [avail, setAvail]         = useState<AvailabilityState>({ status: 'idle' })

  // Submission state
  const [submitError, setSubmitError]   = useState<string | null>(null)
  const [isPending, startTransition]    = useTransition()

  // Result state
  const [checkoutResult, setCheckoutResult] = useState<CheckoutBookingResult | null>(null)

  // Optional message to admin
  const [adminMessage, setAdminMessage] = useState('')

  // Last flight date — pre-filled from profile so it stays in sync with Documents page
  const [lastFlightDate, setLastFlightDate] = useState(initialLastFlightDate)

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

  // ── Unified availability + future-time check ──────────────────────────────
  // Single source of truth for the avail state — past-time is treated as
  // unavailable here so the UI never shows a conflicting "available" message
  // alongside a separate future-time error.

  useEffect(() => {
    if (!startUTC || !endUTC || new Date(endUTC) <= new Date(startUTC)) {
      setAvail({ status: 'idle' }); return
    }

    // Synchronous past-time guard — no server call needed.
    if (new Date(startUTC) <= new Date()) {
      setAvail({ status: 'unavailable', message: 'Please select a future checkout time.' })
      return
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
    // avail is the single source of truth — past times and booked times both
    // resolve to avail.status === 'unavailable', so no separate checks needed.
    if (avail.status !== 'available') return
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
          customer_notes:   adminMessage.trim() || null,
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

          {/* Header */}
          <div>
            <h2 className="text-lg font-serif text-white mb-1">Select Your Checkout Flight Time</h2>
            <p className="text-sm text-slate-500">
              Choose when you would like to complete your checkout flight in the{' '}
              {aircraftDisplayName}, registration {aircraftRegistration}.
            </p>
          </div>

          {/* A: Session summary tiles — read-only info, not form fields */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl overflow-hidden bg-white/[0.05]">
            {([
              { icon: 'flight_takeoff', label: 'Session type', value: 'Checkout Flight',          sub: null                              },
              { icon: 'flight',         label: 'Aircraft',     value: aircraftDisplayName,         sub: `Registration ${aircraftRegistration}` },
              { icon: 'schedule',       label: 'Duration',     value: '1 hour',                   sub: 'Fixed session'                   },
              { icon: 'payments',       label: 'Rate',         value: '$290 / hour',              sub: 'Billed after checkout approval'  },
            ] as { icon: string; label: string; value: string; sub: string | null }[]).map(({ icon, label, value, sub }) => (
              <div key={label} className="bg-[#060b17] px-4 py-4 flex flex-col gap-1">
                <span
                  className="material-symbols-outlined text-[15px] text-blue-500/50 mb-0.5"
                  style={{ fontVariationSettings: "'wght' 300" }}
                >
                  {icon}
                </span>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">{label}</p>
                <p className="text-sm font-semibold text-white/95 leading-tight">{value}</p>
                {sub && <p className="text-[10px] text-slate-500 leading-snug">{sub}</p>}
              </div>
            ))}
          </div>

          {aircraftStatus === 'inactive' || aircraftStatus === 'grounded' ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-300">
              This aircraft is currently unavailable. Please contact the flight operations team.
            </div>
          ) : (
            <>
              {/* B: Date + departure time */}
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
                  <TimeDropdown
                    value={startTime}
                    options={ALL_TIME_OPTIONS}
                    onChange={v => { setStartTime(v); setAvail({ status: 'idle' }); setSubmitError(null) }}
                  />
                </div>
              </div>

              {/* C: Selected checkout window summary — replaces the old "Return time" field */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-3">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1.5">
                  Selected checkout window
                </p>
                <p className="text-sm font-medium text-white/90">
                  {ALL_TIME_OPTIONS.find(o => o.value === startTime)?.label ?? startTime}
                  <span className="mx-2 text-slate-600">→</span>
                  {ALL_TIME_OPTIONS.find(o => o.value === endTime)?.label ?? endTime}
                </p>
                <p className="text-[10px] text-slate-600 mt-1">Checkout flights are fixed 1-hour sessions.</p>
              </div>

              {/* D: Daily schedule timeline */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    {formatDate(date)} — Daily Schedule
                  </p>
                </div>
                <p className="text-[10px] text-blue-400/60 mb-3 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'wght' 300" }}>drag_pan</span>
                  Drag the blue slot to adjust your checkout flight time.
                </p>
                <AvailabilityTimeline
                  selectedDate={date}
                  daySlots={daySlots}
                  startDT={startDT}
                  endDT={endDT}
                  onTimeChange={v => { setStartTime(v); setAvail({ status: 'idle' }); setSubmitError(null) }}
                />
              </div>

              {/* F: Availability state — intentionally below the timeline + legend */}
              {avail.status === 'checking' && (
                <p className="text-xs text-slate-500 animate-pulse flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                  Checking availability…
                </p>
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

              {/* G: Payment timing notice — blue/slate info style (not green, to avoid clashing with availability success) */}
              <div className="bg-[#0a1628] border border-blue-500/[0.18] rounded-lg px-4 py-3">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-blue-400/60 text-[16px] mt-0.5 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>info</span>
                  <div>
                    <p className="text-sm text-blue-200/80 font-medium leading-snug">
                      No payment is required now.
                    </p>
                    <p className="text-[11px] text-slate-400/80 mt-0.5 leading-relaxed">
                      The checkout flight fee is paid after your checkout flight is completed and approved. You will receive the checkout invoice after the flight is completed.
                    </p>
                  </div>
                </div>
              </div>

              {/* H: Continue button — only enabled when avail confirms the slot is future + available */}
              <button
                onClick={handleTimeNext}
                disabled={avail.status !== 'available'}
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

          {/* Optional admin message */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">
              Additional message to admin <span className="text-slate-600 font-normal normal-case">(optional)</span>
            </label>
            <textarea
              value={adminMessage}
              onChange={e => setAdminMessage(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Add any notes, timing preferences, questions, or context for the admin team..."
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/60 transition-colors placeholder:text-white/20 resize-none"
            />
            {adminMessage.length > 800 && (
              <p className="text-[10px] text-slate-500 text-right">{adminMessage.length} / 1000</p>
            )}
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

          {/* Admin message summary */}
          {adminMessage.trim() && (
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg px-4 py-3 space-y-1">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Your message to admin</p>
              <p className="text-sm text-slate-300 leading-relaxed italic">&quot;{adminMessage.trim()}&quot;</p>
            </div>
          )}

          {/* Payment notice */}
          <div className="bg-emerald-500/[0.06] border border-emerald-500/20 rounded-lg px-4 py-3 flex items-start gap-2">
            <span className="material-symbols-outlined text-emerald-400 text-[15px] mt-0.5 flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>info</span>
            <p className="text-[11px] text-emerald-300/80 leading-relaxed">
              No payment is required now. The checkout flight fee is paid after your checkout flight is completed and approved.
            </p>
          </div>

          {/* Clarifying note */}
          <div className="bg-blue-500/[0.06] border border-blue-500/20 rounded-lg px-4 py-3 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">What happens after you submit</p>
            <p className="text-sm text-blue-200/70 leading-relaxed">
              Once you submit this checkout request, your selected checkout time and documents will be sent to the admin team for review. An approved instructor may confirm this time or suggest an alternative. You&apos;ll be notified once the request has been reviewed.
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
        <div className={`${CARD} p-8 text-center space-y-5`}>
          <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-3xl text-green-400" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          </div>
          <div>
            <h2 className="text-2xl font-serif text-white mb-3">Checkout request submitted</h2>
            <p className="text-sm text-slate-400 leading-relaxed max-w-md mx-auto">
              Your checkout request has been submitted for review. An admin or approved instructor will review your selected time and documents. Aircraft bookings will become available after your checkout flight is completed, approved, and paid.
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
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <button
              onClick={() => router.push('/dashboard/bookings')}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-[0.15em] rounded-full transition-all"
            >
              View My Bookings
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="flex-1 py-3 border border-white/15 hover:border-white/25 hover:bg-white/[0.04] text-white/70 hover:text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
