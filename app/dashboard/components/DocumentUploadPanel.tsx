'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import type { UserDocument, DocumentType } from '@/lib/supabase/types'
import { uploadVerificationDocument, replaceVerificationDocument } from '@/app/actions/upload'
import { getDocumentSignedUrlsForType } from '@/app/actions/documents'
import { acceptTermsAndConditions } from '@/app/actions/terms'
import { saveLastFlightDate } from '@/app/actions/verification'
import { saveNightVfrRatingFromReadiness } from '@/app/actions/booking-readiness'
import { getFlightReviewCutoff } from '@/lib/utils/flight-review'
import { formatDateFromISO } from '@/lib/formatDateTime'
import DocumentProgressCard, { type DocumentProgressStepStatus } from '@/components/DocumentProgressCard'
import DocumentViewerModal from '@/components/ui/DocumentViewerModal'
import type { DocumentFile } from '@/components/ui/DocumentViewerModal'
import {
  TERMS_END_TEXT, TERMS_LAST_UPDATED, TERMS_MODAL_SUBTITLE,
  TERMS_MODAL_TITLE, TERMS_NOTICE, TERMS_SECTIONS,
} from '@/lib/checkout-terms-content'
import CalendarDateField from '@/components/CalendarDateField'

// ─── Types ────────────────────────────────────────────────────────────────────

type DocUiState = 'missing' | 'under_review' | 'approved' | 'rejected' | 'expired'
type DocDef = { type: DocumentType; label: string; icon: string; desc: string }
type UploadForm = {
  file: File[]; licenceType: string; licenceNumber: string
  medicalClass: string
  issueDate: string; expiryDate: string; idType: string; documentNumber: string
}

export type DocumentUploadPanelProps = {
  user?: User
  documents: UserDocument[]
  pilotLicenceDocument?: UserDocument | null
  lastFlightDate?: string | null
  hasNightVfrRating?: boolean | null
  termsAcceptedAt?: string | null
  initialRedCardMonth?: number | null
  initialRedCardYear?: number | null
  clearanceStatus?: string | null
  onSuccess: () => void
  onSubmit?: (note: string) => void
  onBackToStep1?: () => void
}

const EMPTY_FORM: UploadForm = {
  file: [], licenceType: '', licenceNumber: '',
  medicalClass: '', issueDate: '', expiryDate: '', idType: '', documentNumber: '',
}

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_SIZE = 10 * 1024 * 1024

const DOC_TYPES: DocDef[] = [
  { type: 'pilot_licence', label: 'Pilot Licence', icon: 'badge', desc: 'Recreational, Private, or Commercial Pilot Licence' },
  { type: 'medical_certificate', label: 'Medical Certificate', icon: 'health_and_safety', desc: 'Current aviation medical certificate' },
  { type: 'photo_id', label: 'Photo ID', icon: 'id_card', desc: 'Passport, driver licence, or other government-issued photo ID' },
]

const RED_CARD_MONTH_OPTIONS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDocUiState(doc: UserDocument | undefined): DocUiState {
  if (!doc) return 'missing'
  if (doc.expiry_date) {
    const today = new Date()
    const todayStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`
    if (doc.expiry_date < todayStr) return 'expired'
  }
  if (doc.status === 'rejected') return 'rejected'
  if (doc.status === 'approved') return 'approved'
  return 'under_review'
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return formatDateFromISO(iso)
}

const DOC_CHIP: Record<DocUiState, { label: string; cls: string }> = {
  missing: { label: 'Not Uploaded', cls: 'text-[#94a3b8] border border-[#152d5a]/10' },
  under_review: { label: 'Awaiting Review', cls: 'text-amber-600 bg-amber-500/10 border border-amber-500/20' },
  approved: { label: 'Approved', cls: 'text-green-600 bg-green-500/10 border border-green-500/20' },
  rejected: { label: 'Rejected', cls: 'text-red-600 bg-red-500/10 border border-red-500/20' },
  expired: { label: 'Expired', cls: 'text-red-600 bg-red-500/10 border border-red-500/20' },
}

function DocChip({ state }: { state: DocUiState }) {
  const { label, cls } = DOC_CHIP[state]
  return <span className={`inline-flex items-center text-[11px] font-bold uppercase px-2 py-0.5 rounded-full tracking-widest whitespace-nowrap ${cls}`}>{label}</span>
}

type SectionStatus = DocumentProgressStepStatus

const STATUS_BADGE: Record<SectionStatus, { label: string; cls: string }> = {
  not_started: { label: 'Not Started', cls: 'text-[#94a3b8] border border-[#152d5a]/10 bg-white' },
  in_progress: { label: 'In Progress', cls: 'text-amber-600 bg-amber-500/10 border border-amber-500/20' },
  complete: { label: 'Complete', cls: 'text-green-600 bg-green-500/10 border border-green-500/20' },
}

function SectionBadge({ status }: { status: SectionStatus }) {
  const { label, cls } = STATUS_BADGE[status]
  return <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full tracking-widest whitespace-nowrap ${cls}`}>{label}</span>
}

// ─── Terms Content ────────────────────────────────────────────────────────────

function TermsContent() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-base font-semibold text-[#152d5a]">{TERMS_MODAL_TITLE}</p>
        <p className="text-sm font-medium text-[#4b6390]">{TERMS_MODAL_SUBTITLE}</p>
        <p className="text-sm text-[#4b6390]">{TERMS_NOTICE}</p>
        <p className="text-xs uppercase tracking-[0.18em] text-[#64748b]">{TERMS_LAST_UPDATED}</p>
      </div>
      {TERMS_SECTIONS.map((section) => (
        <section key={`${section.number}-${section.title}`} className="space-y-2">
          <div className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f0f6ff] text-[11px] font-semibold text-[#152d5a]">
              {section.number}
            </span>
            <h4 className="text-sm font-semibold text-[#152d5a] leading-6">{section.title}</h4>
          </div>
          <div className="space-y-2 pl-9">
            {section.blocks.map((block, idx) =>
              block.type === 'paragraph' ? (
                <p key={idx} className="text-sm leading-6 text-[#152d5a]">{block.text}</p>
              ) : (
                <ul key={idx} className="list-disc space-y-1 pl-5 text-sm leading-6 text-[#152d5a]">
                  {block.items.map((item, itemIdx) => <li key={itemIdx}>{item}</li>)}
                </ul>
              )
            )}
          </div>
        </section>
      ))}
      <p className="text-sm leading-6 text-[#152d5a]">{TERMS_END_TEXT}</p>
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ num, title, desc, status, error, children }: {
  num: number; title: string; desc: string; status: SectionStatus; error?: string; children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  useEffect(() => { if (error) setOpen(true) }, [error])
  return (
    <div className="bg-white border border-[#152d5a]/15 rounded-2xl overflow-hidden shadow-sm">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-start px-4 py-4 md:px-6 md:py-5 hover:bg-[#f8fbff] transition-colors text-left">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-[#1a4fd6] flex items-center justify-center flex-shrink-0">
              <span className="text-white text-[12px] font-bold">{num}</span>
            </div>
            <div className="flex-1" />
            <SectionBadge status={status} />
            <span className={`material-symbols-outlined text-[#4b6390] text-[20px] transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`}>expand_less</span>
          </div>
          <p className="text-[16px] font-semibold text-[#152d5a] leading-snug">{title}</p>
          <p className="text-[13px] text-[#4b6390] mt-1 leading-relaxed">{desc}</p>
        </div>
      </button>
      {open && (
        <div className="px-3 pb-4 pt-3 md:px-6 md:pb-6 md:pt-4 border-t border-[#152d5a]/08">
          {error && (
            <div className="mb-4 flex items-center gap-3 bg-red-50 border-2 border-red-400 rounded-xl px-4 py-4 shadow-[0_0_0_4px_rgba(239,68,68,0.08)]">
              <span className="material-symbols-outlined text-red-500 text-[22px] flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
              <p className="text-[15px] text-red-700 font-semibold leading-snug">{error}</p>
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

export function UploadModal({ docType, existingDoc, onClose, onSuccess }: {
  docType: DocumentType; existingDoc: UserDocument | undefined
  onClose: () => void; onSuccess: () => void
}) {
  const def = DOC_TYPES.find(d => d.type === docType) ?? { label: 'Document', icon: 'upload_file', type: docType, desc: '' }
  const [form, setForm] = useState<UploadForm>({
    ...EMPTY_FORM,
    licenceType: existingDoc?.licence_type ?? '', licenceNumber: existingDoc?.licence_number ?? '',
    medicalClass: existingDoc?.medical_class ?? '', issueDate: existingDoc?.issue_date ?? '',
    expiryDate: existingDoc?.expiry_date ?? '', idType: existingDoc?.id_type ?? '',
    documentNumber: existingDoc?.document_number ?? '',
  })
  const [fileError, setFileError] = useState('')
  const [formError, setFormError] = useState('')
  const [uploading, setUploading] = useState(false)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
  const currentYear = new Date().getFullYear()

  function set<K extends keyof UploadForm>(key: K, value: UploadForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError('')
    const selected = Array.from(e.target.files ?? [])
    if (selected.length === 0) { set('file', []); return }
    const invalid = selected.find(f => !ALLOWED_TYPES.includes(f.type))
    if (invalid) { setFileError('Only PDF, JPG, JPEG, and PNG files are allowed.'); set('file', []); return }
    const tooBig = selected.find(f => f.size > MAX_SIZE)
    if (tooBig) { setFileError(`${tooBig.name} exceeds the 10 MB limit.`); set('file', []); return }
    set('file', selected)
  }

  function validate(): string {
    if (form.file.length === 0) return 'Please select a file to upload.'
    if (docType === 'pilot_licence') {
      if (!form.licenceType) return 'Please select a licence type.'
      if (!form.licenceNumber) return 'Please enter your pilot licence number / ARN.'
    }
    if (docType === 'medical_certificate') {
      if (!form.medicalClass) return 'Please select a medical class.'
      if (!form.issueDate) return 'Date of issue is required.'
      if (!form.expiryDate) return 'Expiry date is required.'
    }
    if (docType === 'photo_id') {
      if (!form.idType) return 'Please select an ID type.'
      if (!form.documentNumber) return 'Please enter your document number.'
    }
    return ''
  }

  async function handleUpload() {
    const err = validate(); if (err) { setFormError(err); return }
    setUploading(true); setFormError('')
    try {
      for (let i = 0; i < form.file.length; i++) {
        const f = form.file[i]
        const singleFd = new FormData()
        singleFd.append('isFirstFile', i === 0 ? 'true' : 'false')
        singleFd.append('file', f)
        singleFd.append('docType', docType)
        if (form.licenceType) singleFd.append('licenceType', form.licenceType)
        if (form.licenceNumber) singleFd.append('licenceNumber', form.licenceNumber)
        if (form.medicalClass) singleFd.append('medicalClass', form.medicalClass)
        if (form.issueDate) singleFd.append('issueDate', form.issueDate)
        if (form.expiryDate) singleFd.append('expiryDate', form.expiryDate)
        if (form.idType) singleFd.append('idType', form.idType)
        if (form.documentNumber) singleFd.append('documentNumber', form.documentNumber)
        await uploadVerificationDocument(singleFd)
      }
      onSuccess()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    } finally { setUploading(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#152d5a]/08">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#f0f6ff] flex items-center justify-center flex-shrink-0 border border-[#152d5a]/10">
              <span className="material-symbols-outlined text-[#1a4fd6] text-[18px]" style={{ fontVariationSettings: "'wght' 300" }}>{def.icon}</span>
            </div>
            <div>
              <p className="text-[11px] text-[#94a3b8] font-medium uppercase tracking-wide">Upload</p>
              <p className="text-[15px] font-semibold text-[#152d5a]">{def.label}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f0f6ff] text-[#4b6390]">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-[#152d5a] mb-2">Document file <span className="text-red-500">*</span></label>
            <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange}
              className="block w-full text-sm text-[#4b6390] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[#f0f6ff] file:text-[#1a4fd6] hover:file:bg-[#dbeafe] cursor-pointer" />
            {form.file.length > 0 && (
              <ul className="mt-2 space-y-1">
                {form.file.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-[12px] text-[#1a4fd6]">
                    <span className="material-symbols-outlined text-[14px]">attach_file</span>
                    <span className="truncate max-w-[260px]">{f.name}</span>
                    <span className="text-[#94a3b8]">({(f.size / 1024).toFixed(0)} KB)</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[12px] text-[#94a3b8] mt-1">PDF, JPG, PNG — max 10 MB</p>
            {fileError && <p className="text-[12px] text-red-500 mt-1 flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">error</span>{fileError}</p>}
          </div>
          {docType === 'pilot_licence' && (<>
            <div>
              <label className="block text-[13px] font-semibold text-[#152d5a] mb-2">Licence type <span className="text-red-500">*</span></label>
              <select value={form.licenceType} onChange={e => set('licenceType', e.target.value)}
                className="w-full h-10 border border-[#152d5a]/15 rounded-xl px-3 text-sm text-[#152d5a] bg-white focus:outline-none focus:border-blue-500/60">
                <option value="">Select licence type</option>
                <option value="RPL">RPL — Recreational Pilot Licence</option>
                <option value="PPL">PPL — Private Pilot Licence</option>
                <option value="CPL">CPL — Commercial Pilot Licence</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#152d5a] mb-2">Licence number / ARN <span className="text-red-500">*</span></label>
              <input type="text" value={form.licenceNumber} onChange={e => set('licenceNumber', e.target.value)}
                placeholder="e.g. 123456" className="w-full h-10 border border-[#152d5a]/15 rounded-xl px-3 text-sm text-[#152d5a] bg-white focus:outline-none focus:border-blue-500/60" />
            </div>
          </>)}
          {docType === 'medical_certificate' && (<>
            <div>
              <label className="block text-[13px] font-semibold text-[#152d5a] mb-2">Medical class <span className="text-red-500">*</span></label>
              <select value={form.medicalClass} onChange={e => set('medicalClass', e.target.value)}
                className="w-full h-10 border border-[#152d5a]/15 rounded-xl px-3 text-sm text-[#152d5a] bg-white focus:outline-none focus:border-blue-500/60">
                <option value="">Select class</option>
                <option value="Class 1">Class 1</option>
                <option value="Class 2">Class 2</option>
                <option value="Basic Class 2">Basic Class 2</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] font-semibold text-[#152d5a] mb-2">Date of issue <span className="text-red-500">*</span></label>
                <CalendarDateField value={form.issueDate} onChange={val => set('issueDate', val)}
                  minYear={currentYear - 10} maxYear={currentYear} maxDate={today} placeholder="Select date"
                  className="w-full h-10 bg-white border border-[#152d5a]/15 rounded-xl px-3 text-sm text-[#152d5a] focus:outline-none focus:border-blue-500/60 text-left flex items-center justify-between" />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-[#152d5a] mb-2">Expiry date <span className="text-red-500">*</span></label>
                <CalendarDateField value={form.expiryDate} onChange={val => set('expiryDate', val)}
                  minYear={currentYear} maxYear={currentYear + 10} minDate={today} placeholder="Select date"
                  className="w-full h-10 bg-white border border-[#152d5a]/15 rounded-xl px-3 text-sm text-[#152d5a] focus:outline-none focus:border-blue-500/60 text-left flex items-center justify-between" />
              </div>
            </div>
          </>)}
          {docType === 'photo_id' && (<>
            <div>
              <label className="block text-[13px] font-semibold text-[#152d5a] mb-2">ID type <span className="text-red-500">*</span></label>
              <select value={form.idType} onChange={e => set('idType', e.target.value)}
                className="w-full h-10 border border-[#152d5a]/15 rounded-xl px-3 text-sm text-[#152d5a] bg-white focus:outline-none focus:border-blue-500/60">
                <option value="">Select ID type</option>
                <option value="Passport">Passport</option>
                <option value="Driver Licence">Driver Licence</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#152d5a] mb-2">Document number <span className="text-red-500">*</span></label>
              <input type="text" value={form.documentNumber} onChange={e => set('documentNumber', e.target.value)}
                placeholder="e.g. PA1234567" className="w-full h-10 border border-[#152d5a]/15 rounded-xl px-3 text-sm text-[#152d5a] bg-white focus:outline-none focus:border-blue-500/60" />
            </div>
          </>)}
          {docType === 'night_vfr_evidence' && (
            <p className="text-[13px] text-[#4b6390] bg-[#f8fbff] border border-[#152d5a]/08 rounded-xl px-3 py-2">
              Upload any document that confirms your Night VFR endorsement (e.g. logbook page, CASA certificate).
            </p>
          )}
          {formError && (
            <p className="text-[13px] text-red-600 flex items-center gap-1.5 bg-red-500/5 border border-red-500/15 rounded-xl px-3 py-2.5">
              <span className="material-symbols-outlined text-[14px] flex-shrink-0">error</span>{formError}
            </p>
          )}
        </div>
        <div className="px-5 pb-5 flex items-center justify-end gap-3 border-t border-[#152d5a]/08 pt-4">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-[#152d5a]/20 text-[#4b6390] text-sm font-semibold hover:bg-[#f0f6ff] transition-colors">Cancel</button>
          <button onClick={handleUpload} disabled={uploading}
            className="px-5 py-2.5 rounded-xl bg-[#1a4fd6] hover:bg-[#1540b8] text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-2 transition-colors">
            {uploading && <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>}
            {uploading ? 'Uploading…' : 'Upload Document'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── MiniDocCard ──────────────────────────────────────────────────────────────

function MiniDocCard({ def, doc, docState, onOpen, replacing, onViewDocument }: {
  def: DocDef
  doc: UserDocument | undefined
  docState: DocUiState
  onOpen: () => void
  replacing: boolean
  onViewDocument: (docType: DocumentType, title: string, index: number) => Promise<void>
}) {
  const [viewLoadingIndex, setViewLoadingIndex] = useState<number | null>(null)
  const [viewError, setViewError] = useState('')

  async function handleViewFile(index: number) {
    setViewLoadingIndex(index)
    setViewError('')
    try {
      await onViewDocument(def.type, def.label, index)
    } catch {
      setViewError('Could not open document.')
    } finally {
      setViewLoadingIndex(null)
    }
  }

  const borderCls: Record<DocUiState, string> = {
    missing: 'border-[#152d5a]/20',
    under_review: 'border-amber-300',
    approved: 'border-green-300',
    rejected: 'border-red-300',
    expired: 'border-red-300',
  }
  const iconCls: Record<DocUiState, string> = {
    missing: 'bg-[#f0f6ff] border-[#152d5a]/10 text-[#94a3b8]',
    under_review: 'bg-amber-500/10 border-amber-500/20 text-amber-500',
    approved: 'bg-green-500/10 border-green-500/20 text-green-600',
    rejected: 'bg-red-500/10 border-red-500/20 text-red-500',
    expired: 'bg-red-500/10 border-red-500/20 text-red-500',
  }

  return (
    <div className={`bg-white border-2 rounded-2xl p-4 flex flex-col gap-3 shadow-sm ${borderCls[docState]}`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${iconCls[docState]}`}>
          <span className="material-symbols-outlined text-[17px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>{def.icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
            <p className="text-[14px] font-semibold text-[#152d5a]">{def.label}</p>
            <DocChip state={docState} />
          </div>
          <p className="text-[12px] text-[#4b6390] leading-relaxed">{def.desc}</p>
        </div>
      </div>
      {doc && docState !== 'missing' && (
        <div className="text-[11px] text-[#64748b] flex items-center gap-1.5 bg-[#f8fbff] rounded-lg px-2.5 py-1.5 border border-[#152d5a]/10 min-w-0">
          <span className="material-symbols-outlined text-[12px] flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>draft</span>
          <span className="truncate min-w-0 flex-1">{doc.file_name}</span>
        </div>
      )}
      {docState === 'under_review' && (
        <p className="text-[11px] text-amber-600 flex items-center gap-1">
          <span className="material-symbols-outlined text-[12px]">hourglass_top</span>
          Awaiting admin review — we&apos;ll notify you once approved
        </p>
      )}
      {docState === 'rejected' && doc?.review_notes && (
        <p className="text-[11px] text-red-600 bg-red-500/5 border border-red-500/10 rounded-lg px-2.5 py-1.5 flex items-start gap-1">
          <span className="material-symbols-outlined text-[12px] flex-shrink-0 mt-0.5">warning</span>{doc.review_notes}
        </p>
      )}
      {viewError && <p className="text-[11px] text-red-500 flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">error</span>{viewError}</p>}
      <div className="flex items-center gap-2 mt-auto flex-wrap">
        {(() => {
          const files = doc?.user_document_files ?? []
          return files.length > 0 ? (
          <div className="flex flex-col gap-1">
            {files.map((file, index) => (
              <button
                key={file.id}
                onClick={() => void handleViewFile(index)}
                disabled={viewLoadingIndex === index}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1a4fd6] hover:text-[#152d5a] transition-colors disabled:opacity-50 text-left"
              >
                <span className="material-symbols-outlined text-[14px]">
                  {viewLoadingIndex === index ? 'hourglass_empty' : 'open_in_new'}
                </span>
                <span className="truncate max-w-[220px] block">
                  {files.length === 1
                    ? `View — ${file.file_name}`
                    : `View File ${index + 1} — ${file.file_name}`}
                </span>
              </button>
            ))}
          </div>
          ) : (
            <span className="text-[12px] text-[#94a3b8]">No files</span>
          )
        })()}
        <button onClick={onOpen} disabled={replacing}
          className={`flex items-center gap-1.5 border text-[12px] font-semibold px-3 py-2 rounded-xl transition-all ml-auto ${
            docState === 'missing'
              ? 'border-[#1a4fd6]/40 hover:border-[#1a4fd6] text-[#1a4fd6] bg-[#f0f4ff] hover:bg-[#1a4fd6]/10'
              : 'border-[#152d5a]/15 hover:border-[#152d5a]/30 text-[#4b6390] hover:text-[#152d5a] bg-white'
          }`}>
          <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'wght' 300" }}>
            {docState === 'missing' ? 'cloud_upload' : 'cloud_sync'}
          </span>
          {docState === 'missing' ? 'Upload' : replacing ? 'Clearing…' : 'Replace'}
        </button>
      </div>
      <p className="text-[11px] text-[#94a3b8]">PDF, JPG, PNG — max 10MB</p>
    </div>
  )
}

// ─── Main export ─────────────────────────────────────────────────────────────

export default function DocumentUploadPanel({
  user,
  documents,
  pilotLicenceDocument,
  lastFlightDate,
  hasNightVfrRating,
  termsAcceptedAt,
  initialRedCardMonth,
  initialRedCardYear,
  clearanceStatus,
  onSuccess,
  onSubmit,
  onBackToStep1,
}: DocumentUploadPanelProps) {
  const router = useRouter()
  const docMap = useMemo(() => Object.fromEntries(documents.map(d => [d.document_type, d])), [documents])
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
  const currentYear = Number(today.slice(0, 4))
  const currentMonth = Number(today.slice(5, 7))
  const redCardYearOptions = useMemo(
    () => Array.from({ length: 11 }, (_, i) => currentYear + i),
    [currentYear],
  )

  const [modalDocType, setModalDocType] = useState<DocumentType | null>(null)
  const [replacing, setReplacing] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerFiles, setViewerFiles] = useState<DocumentFile[]>([])
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0)
  const [viewerTitle, setViewerTitle] = useState('')

  const [flightDate, setFlightDate] = useState(lastFlightDate ?? '')
  const [flightDateSaving, setFlightDateSaving] = useState(false)
  const [flightDateSaved, setFlightDateSaved] = useState(false)
  const [flightDateError, setFlightDateError] = useState('')
  const flightDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flightDateSavedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pilotDoc = pilotLicenceDocument
  const [redCardMonth, setRedCardMonth] = useState<number | null>(initialRedCardMonth ?? pilotDoc?.red_card_expiry_month ?? null)
  const [redCardYear, setRedCardYear] = useState<number | null>(initialRedCardYear ?? pilotDoc?.red_card_expiry_year ?? null)
  const [redCardSaving, setRedCardSaving] = useState(false)
  const [redCardSaved, setRedCardSaved] = useState(false)
  const [redCardError, setRedCardError] = useState('')
  const redCardSavedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const redCardMonthOptions = useMemo(() => {
    const minMonth = redCardYear === currentYear ? currentMonth : 1
    return RED_CARD_MONTH_OPTIONS.filter((option) => option.value >= minMonth)
  }, [redCardYear, currentYear, currentMonth])

  // Drop any previously saved past expiry so the user must pick current/future.
  useEffect(() => {
    if (
      redCardYear !== null &&
      (redCardYear < currentYear || (redCardYear === currentYear && redCardMonth !== null && redCardMonth < currentMonth))
    ) {
      setRedCardMonth(null)
      setRedCardYear(null)
      setRedCardError('Red Card expiry must be the current month or a future date.')
    }
  }, [redCardYear, redCardMonth, currentYear, currentMonth])

  const [nightVfr, setNightVfr] = useState<boolean | null>(hasNightVfrRating ?? null)
  const [nightVfrSaving, setNightVfrSaving] = useState(false)
  const [nightVfrError, setNightVfrError] = useState('')

  const [localTermsAcceptedAt, setLocalTermsAcceptedAt] = useState<string | null>(termsAcceptedAt ?? null)
  const [termsSuccess, setTermsSuccess] = useState('')
  const termsAccepted = Boolean(localTermsAcceptedAt)
  const [termsChecked, setTermsChecked] = useState(false)
  const [termsError, setTermsError] = useState('')
  const [isAcceptingTerms, setIsAcceptingTerms] = useState(false)
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false)
  const termsScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLocalTermsAcceptedAt(termsAcceptedAt ?? null)
  }, [termsAcceptedAt])

  useEffect(() => {
    if (localTermsAcceptedAt) {
      setTermsError('')
      setValidationErrors(p => ({ ...p, s4: undefined }))
    }
  }, [localTermsAcceptedAt])

  useEffect(() => {
    if (!termsSuccess) return
    const timeout = setTimeout(() => setTermsSuccess(''), 3000)
    return () => clearTimeout(timeout)
  }, [termsSuccess])

  const [customerNote, setCustomerNote] = useState('')
  const [validationErrors, setValidationErrors] = useState<{ s1?: string; s2?: string; s3?: string; s4?: string }>({})

  const section1Ref = useRef<HTMLDivElement>(null)
  const section2Ref = useRef<HTMLDivElement>(null)
  const section3Ref = useRef<HTMLDivElement>(null)
  const section4Ref = useRef<HTMLDivElement>(null)

  const docChecks = useMemo(() => DOC_TYPES.map(def => ({
    def, doc: docMap[def.type] as UserDocument | undefined, state: getDocUiState(docMap[def.type]),
  })), [docMap])

  async function openDocumentViewer(docType: DocumentType, title: string, startIndex: number) {
    const files = await getDocumentSignedUrlsForType(docType)
    setViewerFiles(files.map(file => ({ url: file.url, name: file.fileName })))
    setViewerInitialIndex(startIndex)
    setViewerTitle(title)
    setViewerOpen(true)
  }

  const hasPilotDoc = Boolean(docMap['pilot_licence'])
  const allDocsUploaded = docChecks.every(({ state }) => state !== 'missing')
  const allDocsApproved = docChecks.every(({ state }) => state === 'approved')

  const docsGateReady = docChecks.every(({ state }) => state !== 'missing' && state !== 'rejected')
  const docsFullyApproved = allDocsApproved

  const s1: SectionStatus = allDocsUploaded ? 'complete' : docChecks.some(({ state }) => state !== 'missing') ? 'in_progress' : 'not_started'
  const flightDateComplete = Boolean(flightDate)
  const redCardComplete = Boolean(redCardMonth && redCardYear)
  const s2: SectionStatus = flightDateComplete && redCardComplete ? 'complete' : flightDateComplete || redCardComplete ? 'in_progress' : 'not_started'
  const s3: SectionStatus = nightVfr === null ? 'not_started' : nightVfr === false ? 'complete' : docMap['night_vfr_evidence'] ? 'complete' : 'in_progress'
  const s4: SectionStatus = termsAccepted ? 'complete' : 'not_started'
  const completedCount = [s1, s2, s3, s4].filter(s => s === 'complete').length
  const fullyReady = allDocsApproved && s2 === 'complete' && s3 === 'complete' && s4 === 'complete'
  const isClearedToFly = clearanceStatus === 'cleared_to_fly'

  function handleFlightDateChange(val: string) {
    setFlightDate(val)
    setFlightDateSaved(false)
    setValidationErrors(p => ({ ...p, s2: undefined }))
    if (flightDebounceRef.current) clearTimeout(flightDebounceRef.current)
    flightDebounceRef.current = setTimeout(async () => {
      if (!val) return
      setFlightDateSaving(true); setFlightDateError('')
      try {
        const result = await saveLastFlightDate(val)
        if ('error' in result) { setFlightDateError(result.error); return }
        setFlightDateSaved(true)
        if (flightDateSavedTimeoutRef.current) clearTimeout(flightDateSavedTimeoutRef.current)
        flightDateSavedTimeoutRef.current = setTimeout(() => setFlightDateSaved(false), 2000)
        onSuccess()
      } catch (e: unknown) { setFlightDateError(e instanceof Error ? e.message : 'Could not save.') }
      finally { setFlightDateSaving(false) }
    }, 600)
  }

  async function handleRedCardChange(month: number | null, year: number | null) {
    if (!month || !year) return
    if (year < currentYear || (year === currentYear && month < currentMonth)) {
      setRedCardError('Red Card expiry must be the current month or a future date.')
      return
    }
    setRedCardSaving(true); setRedCardError(''); setRedCardSaved(false)
    try {
      const { saveCheckoutRedCardDetails } = await import('@/app/actions/documents')
      await saveCheckoutRedCardDetails({ redCardExpiry: `${year}-${String(month).padStart(2, '0')}` })
      setRedCardSaved(true)
      if (redCardSavedTimeoutRef.current) clearTimeout(redCardSavedTimeoutRef.current)
      redCardSavedTimeoutRef.current = setTimeout(() => setRedCardSaved(false), 2000)
      onSuccess()
    } catch (e: unknown) { setRedCardError(e instanceof Error ? e.message : 'Could not save.') }
    finally { setRedCardSaving(false) }
  }

  async function handleNightVfrChange(val: boolean) {
    setNightVfr(val); setNightVfrSaving(true); setNightVfrError('')
    setValidationErrors(p => ({ ...p, s3: undefined }))
    try {
      await saveNightVfrRatingFromReadiness({ hasNightVfrRating: val })
      onSuccess()
    } catch (e: unknown) { setNightVfrError(e instanceof Error ? e.message : 'Could not save.') }
    finally { setNightVfrSaving(false) }
  }

  async function handleAcceptTerms() {
    if (!termsChecked || !isScrolledToBottom || isAcceptingTerms) {
      setTermsError(!termsChecked ? 'Please check the box to accept.' : 'Please scroll through the full terms first.')
      return
    }
    setTermsError('')
    setTermsSuccess('')
    setIsAcceptingTerms(true)
    try {
      const result = await acceptTermsAndConditions()
      if (!result.ok) {
        setTermsError(result.error)
        return
      }
      setLocalTermsAcceptedAt(result.acceptedAt)
      setTermsSuccess('Terms accepted successfully. Your progress has been updated.')
      setValidationErrors((p) => ({ ...p, s4: undefined }))
      onSuccess()
    } catch (e: unknown) {
      setTermsError(e instanceof Error ? e.message : 'Failed to save your acceptance. Please try again.')
    } finally { setIsAcceptingTerms(false) }
  }

  function handleTermsScroll() {
    const el = termsScrollRef.current; if (!el) return
    setIsScrolledToBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 10)
  }

  function scrollTermsToBottom() {
    const el = termsScrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  function validateAndScroll(): boolean {
    const errors: { s1?: string; s2?: string; s3?: string; s4?: string } = {}
    if (docChecks.some(({ state }) => state === 'missing')) errors.s1 = 'Please upload all required documents.'
    if (!flightDate) errors.s2 = 'Please enter your last flight review date.'
    if (hasPilotDoc && (!redCardMonth || !redCardYear)) errors.s2 = errors.s2 ?? 'Please enter your Red Card expiry date.'
    if (nightVfr === null) errors.s3 = 'Please declare your Night VFR endorsement status.'
    if (!termsAccepted && !termsChecked) errors.s4 = 'Please accept the terms and conditions.'
    setValidationErrors(errors)
    if (errors.s1) { section1Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return false }
    if (errors.s2) { section2Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return false }
    if (errors.s3) { section3Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return false }
    if (errors.s4) { section4Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return false }
    if (termsChecked && !termsAccepted) {
      setTermsError('Please accept the Terms & Conditions and wait for confirmation before continuing.')
      section4Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return false
    }
    return true
  }

  return (
    <div className="space-y-4">
      <DocumentProgressCard
        statuses={[s1, s2, s3, s4]}
        heading="Complete all 4 steps to submit your documents"
        subheading="Our team will review and confirm your checkout request."
      />

      <div className="bg-[#dce3ed] rounded-2xl p-3 space-y-3">
        <div ref={section1Ref} className="scroll-mt-4">
          <Section num={1} title="Upload Identity & Licence Documents"
            desc="Upload clear, current copies of your pilot licence and any other required documents."
            status={s1} error={validationErrors.s1}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              {docChecks.map(({ def, doc, state }) => (
                <MiniDocCard key={def.type} def={def} doc={doc} docState={state} replacing={replacing} onViewDocument={openDocumentViewer} onOpen={async () => {
                  if (docMap[def.type]) {
                    setReplacing(true)
                    try { await replaceVerificationDocument(def.type) } catch (e) { console.error(e) }
                    setReplacing(false)
                  }
                  setModalDocType(def.type)
                }} />
              ))}
            </div>
            <div className="mt-3 flex items-start gap-2 bg-[#f8fbff] border border-[#152d5a]/08 rounded-xl px-4 py-3">
              <span className="material-symbols-outlined text-[#1a4fd6] text-[16px] flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'wght' 300" }}>info</span>
              <p className="text-[13px] text-[#4b6390]">Ensure all documents are current, valid and clearly legible. Blurred or cropped documents may cause delays.</p>
            </div>
          </Section>
        </div>

        <div ref={section2Ref} className="scroll-mt-4">
          <Section num={2} title="Provide Flight Recency & Red Card Details"
            desc="Tell us about your recent flying experience and provide your Red Card (ASIC) details."
            status={s2} error={validationErrors.s2}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
              <div className="bg-[#f8fbff] border border-[#152d5a]/08 rounded-xl p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-[#f0f6ff] border border-[#152d5a]/10 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-[#1a4fd6] text-[15px]" style={{ fontVariationSettings: "'wght' 300" }}>flight_land</span>
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-[#152d5a]">Pilot Flight Recency</p>
                    <p className="text-[12px] text-[#4b6390]">When was your last flight review?</p>
                  </div>
                </div>
                <label className="block text-[11px] font-bold text-[#64748b] uppercase tracking-widest mb-1.5">Last flight review date</label>
                <CalendarDateField
                  value={flightDate}
                  onChange={handleFlightDateChange}
                  minYear={currentYear - 20}
                  maxYear={currentYear}
                  minDate={getFlightReviewCutoff()}
                  maxDate={today}
                  placeholder="Select date"
                  className="w-full h-10 bg-white border border-[#152d5a]/15 rounded-xl px-3 text-sm text-[#152d5a] focus:outline-none focus:border-blue-500/60 text-left flex items-center justify-between"
                />
                <div className="mt-1.5 flex items-center gap-1.5 h-4">
                  {flightDateSaving && <span className="material-symbols-outlined text-[#1a4fd6] text-[13px] animate-spin">progress_activity</span>}
                  {flightDateSaved && !flightDateSaving && <span className="text-[11px] text-green-600 flex items-center gap-0.5"><span className="material-symbols-outlined text-[12px]">check_circle</span>Saved</span>}
                  {flightDateError && <span className="text-[11px] text-red-500 flex items-center gap-0.5"><span className="material-symbols-outlined text-[12px]">error</span>{flightDateError}</span>}
                </div>
              </div>
              <div className="bg-[#f8fbff] border border-[#152d5a]/08 rounded-xl p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-[#f0f6ff] border border-[#152d5a]/10 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-[#1a4fd6] text-[15px]" style={{ fontVariationSettings: "'wght' 300" }}>badge</span>
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-[#152d5a]">Red Card (ASIC)</p>
                    <p className="text-[12px] text-[#4b6390]">Enter your ASIC card expiry date.</p>
                  </div>
                </div>
                {!hasPilotDoc ? (
                  <p className="text-[12px] text-[#94a3b8] bg-white border border-[#152d5a]/08 rounded-xl px-3 py-2">Upload your Pilot Licence first.</p>
                ) : (<>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-[#64748b] uppercase tracking-widest mb-1.5">Month</label>
                      <select value={redCardMonth ?? ''} onChange={e => {
                        const m = e.target.value ? Number(e.target.value) : null
                        setRedCardMonth(m)
                        setRedCardSaved(false)
                        setValidationErrors(p => ({ ...p, s2: undefined }))
                        if (m && redCardYear) void handleRedCardChange(m, redCardYear)
                      }}
                        className="w-full h-10 border border-[#152d5a]/15 rounded-xl px-2.5 text-sm text-[#152d5a] bg-white focus:outline-none">
                        <option value="">Month</option>
                        {redCardMonthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#64748b] uppercase tracking-widest mb-1.5">Year</label>
                      <select value={redCardYear ?? ''} onChange={e => {
                        const y = e.target.value ? Number(e.target.value) : null
                        setRedCardYear(y)
                        setRedCardSaved(false)
                        setValidationErrors(p => ({ ...p, s2: undefined }))
                        // If switching to current year and month is already in the past, clear month.
                        if (y === currentYear && redCardMonth !== null && redCardMonth < currentMonth) {
                          setRedCardMonth(null)
                          return
                        }
                        if (redCardMonth && y) void handleRedCardChange(redCardMonth, y)
                      }}
                        className="w-full h-10 border border-[#152d5a]/15 rounded-xl px-2.5 text-sm text-[#152d5a] bg-white focus:outline-none">
                        <option value="">Year</option>
                        {redCardYearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 h-4">
                    {redCardSaving && <span className="material-symbols-outlined text-[#1a4fd6] text-[13px] animate-spin">progress_activity</span>}
                    {redCardSaved && !redCardSaving && <span className="text-[11px] text-green-600 flex items-center gap-0.5"><span className="material-symbols-outlined text-[12px]">check_circle</span>Saved</span>}
                    {redCardError && <span className="text-[11px] text-red-500 flex items-center gap-0.5"><span className="material-symbols-outlined text-[12px]">error</span>{redCardError}</span>}
                  </div>
                </>)}
              </div>
            </div>
          </Section>
        </div>

        <div ref={section3Ref} className="scroll-mt-4">
          <Section num={3} title="Declare Night VFR Endorsement"
            desc="Let us know if you hold a current Night VFR endorsement."
            status={s3} error={validationErrors.s3}>
            <div className="mt-3 space-y-3">
              <p className="text-[13px] text-[#4b6390]">Do you hold a Night VFR endorsement?</p>
              <div className="grid grid-cols-2 gap-3">
                {([true, false] as const).map(val => (
                  <button key={String(val)} type="button" onClick={() => void handleNightVfrChange(val)} disabled={nightVfrSaving}
                    className={`py-3.5 px-4 rounded-xl border text-left transition-all disabled:opacity-60 ${nightVfr === val ? 'bg-[#1a4fd6]/5 border-[#1a4fd6]/40 text-[#152d5a]' : 'bg-white border-[#152d5a]/10 text-[#4b6390] hover:border-[#152d5a]/20'}`}>
                    <div className="flex items-center gap-2.5">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${nightVfr === val ? 'border-[#1a4fd6] bg-[#1a4fd6]' : 'border-[#cbd5e1]'}`}>
                        {nightVfr === val && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div>
                        <p className="text-[14px] font-semibold">{val ? 'Yes' : 'No'}</p>
                        <p className="text-[11px] mt-0.5 text-[#4b6390]">{val ? 'I hold a Night VFR endorsement' : 'I do not hold a Night VFR endorsement'}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              {nightVfrError && <p className="text-[13px] text-red-500 flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">error</span>{nightVfrError}</p>}
              {onBackToStep1 && nightVfr !== null && (
                <div className="bg-[#f0f6ff] border border-[#1a4fd6]/15 rounded-xl px-4 py-3 flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-[#1a4fd6] text-[16px] flex-shrink-0 mt-0.5">info</span>
                  <p className="text-[13px] text-[#4b6390] leading-relaxed">
                    This reflects your selection from Step 1. To change it,{' '}
                    <button type="button" onClick={onBackToStep1}
                      className="text-[#1a4fd6] underline underline-offset-2 font-medium hover:text-[#1540b8] transition-colors">
                      go back to Step 1
                    </button>
                    {' '}and update your Night VFR rating — it will sync here automatically.
                  </p>
                </div>
              )}
              {nightVfr === true && (
                <div className="bg-[#f8fbff] border border-[#152d5a]/08 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-xl bg-[#f0f6ff] border border-[#152d5a]/10 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-[#1a4fd6] text-[15px]" style={{ fontVariationSettings: "'wght' 300" }}>nightlight</span>
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-[#152d5a]">Night VFR Evidence</p>
                      <p className="text-[13px] text-[#4b6390] mt-0.5">Upload supporting evidence for your endorsement.</p>
                    </div>
                  </div>
                  {(docMap['night_vfr_evidence']?.user_document_files ?? []).length > 0 && (
                    <div className="mb-3 flex flex-col gap-1">
                      {(docMap['night_vfr_evidence']?.user_document_files ?? []).map((file) => (
                        <span key={file.id} className="text-[12px] text-[#1a4fd6] flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[14px]">attach_file</span>
                          <span className="truncate max-w-[220px]">{file.file_name}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={async () => {
                      if (docMap['night_vfr_evidence']) {
                        setReplacing(true)
                        try { await replaceVerificationDocument('night_vfr_evidence') } catch (e) { console.error(e) }
                        setReplacing(false)
                      }
                      setModalDocType('night_vfr_evidence')
                    }}
                    disabled={replacing}
                    className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#1a4fd6]/30 hover:border-[#1a4fd6]/60 rounded-xl py-3 text-[#1a4fd6] hover:bg-[#1a4fd6]/5 transition-all">
                    <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'wght' 200" }}>
                      {docMap['night_vfr_evidence'] ? 'cloud_sync' : 'cloud_upload'}
                    </span>
                    <span className="text-[13px] font-semibold">
                      {replacing ? 'Clearing…' : docMap['night_vfr_evidence'] ? 'Replace Evidence' : 'Upload Evidence'}
                    </span>
                  </button>
                </div>
              )}
              {nightVfr === false && <p className="text-[12px] text-[#94a3b8] flex items-center gap-1"><span className="material-symbols-outlined text-[13px]">check</span>Night VFR Evidence not required</p>}
            </div>
          </Section>
        </div>

        <div ref={section4Ref} className="scroll-mt-4">
          <Section num={4} title="Accept Terms & Conditions"
            desc="Review and accept our terms to complete your document submission."
            status={s4} error={validationErrors.s4}>
            <div className="mt-3 space-y-3">
              {termsSuccess && (
                <div className="flex items-center gap-3 rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3">
                  <span className="material-symbols-outlined text-green-600 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <p className="text-[13px] text-green-700">{termsSuccess}</p>
                </div>
              )}
              {termsAccepted ? (
                <div className="flex items-center gap-3 bg-green-500/5 border border-green-500/20 rounded-xl px-4 py-3">
                  <span className="material-symbols-outlined text-green-600 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <div>
                    <p className="text-[14px] font-semibold text-green-700">Terms accepted</p>
                    <p className="text-[13px] text-green-600">Accepted on {fmtDate(localTermsAcceptedAt)}</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-[#152d5a]/10 overflow-hidden bg-[#f8fbff]">
                    <div ref={termsScrollRef} onScroll={handleTermsScroll}
                      className="h-[260px] overflow-y-scroll p-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#152d5a]/20 [&::-webkit-scrollbar-thumb]:rounded-full">
                      <TermsContent />
                    </div>
                    {!isScrolledToBottom && (
                      <button
                        type="button"
                        onClick={scrollTermsToBottom}
                        className="w-full flex items-center gap-2 border-t border-amber-500/20 bg-amber-50 hover:bg-amber-100/80 px-4 py-2.5 transition-colors cursor-pointer text-left"
                        aria-label="Scroll to the bottom of the terms"
                      >
                        <span className="material-symbols-outlined text-amber-600 text-[14px] animate-bounce">keyboard_arrow_down</span>
                        <p className="text-[13px] text-amber-700 font-medium">Scroll to the bottom to continue</p>
                      </button>
                    )}
                  </div>
                  <label className="flex items-start gap-3 rounded-xl border border-[#152d5a]/15 bg-[#f8fbff] px-4 py-3 cursor-pointer hover:border-[#1a4fd6]/30 transition-colors">
                    <input type="checkbox" checked={termsChecked}
                      onChange={e => { setTermsChecked(e.target.checked); setTermsError('') }}
                      disabled={!isScrolledToBottom}
                      className="mt-0.5 w-4 h-4 rounded border-[#152d5a]/30 accent-[#1a4fd6] flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed" />
                    <span className={`text-[13px] leading-relaxed ${isScrolledToBottom ? 'text-[#152d5a]' : 'text-[#94a3b8]'}`}>
                      I have read and agree to the terms and conditions
                    </span>
                  </label>
                  {termsChecked && !termsAccepted && (
                    <div className="flex justify-center pt-1">
                      <button
                        onClick={handleAcceptTerms}
                        disabled={isAcceptingTerms}
                        className="px-8 py-3 rounded-xl bg-[#152d5a] hover:bg-[#1a3a6e] text-white text-[13px] font-semibold disabled:opacity-40 flex items-center gap-2 transition-colors"
                      >
                        {isAcceptingTerms && <span className="material-symbols-outlined text-[15px] animate-spin">progress_activity</span>}
                        {isAcceptingTerms ? 'Saving…' : 'Accept Terms & Conditions'}
                      </button>
                    </div>
                  )}
                  {termsAccepted && (
                    <div className="flex items-center gap-3 bg-green-500/5 border border-green-500/20 rounded-xl px-4 py-3">
                      <span className="material-symbols-outlined text-green-600 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                      <div>
                        <p className="text-[14px] font-semibold text-green-700">Terms accepted</p>
                        <p className="text-[13px] text-green-600">Accepted on {fmtDate(localTermsAcceptedAt)}</p>
                      </div>
                    </div>
                  )}
                  {termsError && (
                    <p className="text-[13px] text-red-600 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">error</span>{termsError}
                    </p>
                  )}
                </>
              )}
            </div>
          </Section>
        </div>
      </div>

      {!onSubmit && (
        <div className={`rounded-2xl border px-5 py-4 space-y-3 ${
          fullyReady ? 'border-green-500/20 bg-green-500/5' : allDocsUploaded && termsAccepted ? 'border-amber-500/20 bg-amber-500/5' : 'border-[#152d5a]/10 bg-white'
        }`}>
          <div className="flex items-start gap-3">
            <span className={`material-symbols-outlined text-[20px] flex-shrink-0 mt-0.5 ${fullyReady ? 'text-green-600' : allDocsUploaded && termsAccepted ? 'text-amber-600' : 'text-[#94a3b8]'}`}
              style={{ fontVariationSettings: "'FILL' 1" }}>
              {fullyReady ? 'check_circle' : allDocsUploaded && termsAccepted ? 'hourglass_top' : 'radio_button_unchecked'}
            </span>
            <p className={`text-[14px] font-semibold ${fullyReady ? 'text-green-700' : allDocsUploaded && termsAccepted ? 'text-amber-700' : 'text-[#4b6390]'}`}>
              {fullyReady
                ? isClearedToFly
                  ? "All documents approved — you're cleared to fly and ready to book an aircraft"
                  : "All documents approved — you're ready to request a checkout flight"
                : allDocsUploaded && termsAccepted
                ? 'Documents under review — we\'ll notify you once approved'
                : 'Complete all steps above to become eligible for a checkout flight'}
            </p>
          </div>
          {allDocsUploaded && termsAccepted && (
            <div className="flex justify-center">
              <Link
                href={isClearedToFly ? '/dashboard/bookings/new' : '/dashboard/checkout'}
                className="inline-flex items-center gap-1.5 bg-[#f59e0b] hover:bg-[#d97706] text-[#0d1b3e] font-semibold text-[13px] px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap"
              >
                {isClearedToFly ? 'Book an Aircraft' : 'Book a Checkout'}
                <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              </Link>
            </div>
          )}
        </div>
      )}

      <DocumentViewerModal
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        files={viewerFiles}
        initialIndex={viewerInitialIndex}
        title={viewerTitle}
      />

      {onSubmit && (
        <div className="space-y-3">
          <div className="bg-white border border-[#152d5a]/15 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center gap-4 px-6 py-5">
              <div className="w-9 h-9 rounded-full bg-[#f0f6ff] flex items-center justify-center flex-shrink-0 border border-[#152d5a]/10">
                <span className="material-symbols-outlined text-[#1a4fd6] text-[16px]" style={{ fontVariationSettings: "'wght' 300" }}>edit_note</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[17px] font-semibold text-[#152d5a] leading-snug">Additional Notes</p>
                <p className="text-[13px] text-[#4b6390] mt-1">Optional — include any message or context for our team.</p>
              </div>
              <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full tracking-widest whitespace-nowrap text-[#94a3b8] border border-[#152d5a]/10 bg-white">Optional</span>
            </div>
            <div className="px-6 pb-6 pt-1 border-t border-[#152d5a]/08">
              <textarea
                value={customerNote}
                onChange={e => setCustomerNote(e.target.value)}
                placeholder="e.g. I have prior experience in a similar aircraft, or I have a time constraint on this date…"
                rows={4}
                className="w-full border border-[#152d5a]/15 rounded-xl px-4 py-3 text-[14px] text-[#152d5a] bg-[#f8fbff] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#1a4fd6]/40 resize-none transition-colors"
              />
              <p className="text-[12px] text-[#94a3b8] mt-1.5">This message will be visible to the OZ Rent A Plane team only.</p>
            </div>
          </div>

          {docsGateReady && !docsFullyApproved && (
            <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
              <span className="material-symbols-outlined text-amber-600 text-[16px] flex-shrink-0 mt-0.5">hourglass_top</span>
              <p className="text-[13px] text-amber-700 leading-relaxed">
                Your documents are awaiting admin review. You can proceed and submit your checkout request — your booking will be confirmed once all documents are approved.
              </p>
            </div>
          )}
          <button
            onClick={() => {
              if (!validateAndScroll()) return
              if (docsGateReady) {
                onSubmit(customerNote)
              } else {
                void handleAcceptTerms()
              }
            }}
            disabled={docsGateReady ? false : (!termsChecked || !isScrolledToBottom)}
            className={`w-full py-4 rounded-xl text-[15px] font-semibold flex items-center justify-center gap-2 transition-all ${
              docsGateReady
                ? 'bg-[#1a4fd6] hover:bg-[#1540b8] text-white shadow-[0_4px_14px_rgba(26,79,214,0.25)]'
                : 'bg-[#152d5a]/80 hover:bg-[#152d5a] text-white disabled:opacity-40'
            }`}>
            {isAcceptingTerms
              ? <><span className="material-symbols-outlined text-[15px] animate-spin">progress_activity</span><span>Saving…</span></>
              : docsGateReady
              ? <><span>Continue to Review</span><span className="material-symbols-outlined text-[15px]">arrow_forward</span></>
              : <><span>Submit for Instructor Review</span><span className="material-symbols-outlined text-[15px]">lock</span></>
            }
          </button>
        </div>
      )}

      <p className="text-[12px] text-[#94a3b8] text-center flex items-center justify-center gap-1.5">
        <span className="material-symbols-outlined text-[14px]">verified_user</span>
        Your documents are securely stored and only used for verification purposes.
      </p>

      {modalDocType && (
        <UploadModal
          docType={modalDocType}
          existingDoc={docMap[modalDocType]}
          onClose={() => setModalDocType(null)}
          onSuccess={() => { setModalDocType(null); onSuccess() }}
        />
      )}
    </div>
  )
}
