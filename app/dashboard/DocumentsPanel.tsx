'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import type {
  UserDocument,
  DocumentType,
} from '@/lib/supabase/types'
import { uploadVerificationDocument } from '@/app/actions/upload'
import { acceptTermsAndConditions } from '@/app/actions/terms'
import { getDocumentSignedUrlsForType, saveRedCardDetails } from '@/app/actions/documents'
import { saveLastFlightDate } from '@/app/actions/verification'
import { saveNightVfrRatingFromReadiness } from '@/app/actions/booking-readiness'
import { fmtDate } from '@/lib/utils/format'
import { getFlightReviewCutoff } from '@/lib/utils/flight-review'
import {
  TERMS_END_TEXT,
  TERMS_LAST_UPDATED,
  TERMS_MODAL_SUBTITLE,
  TERMS_MODAL_TITLE,
  TERMS_NOTICE,
  TERMS_SECTIONS,
} from '@/lib/checkout-terms-content'
import CalendarDateField from '@/components/CalendarDateField'
import ModalPortal from '@/components/ModalPortal'
import DocumentViewerModal from '@/components/ui/DocumentViewerModal'
import type { DocumentFile } from '@/components/ui/DocumentViewerModal'

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_SIZE      = 10 * 1024 * 1024
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const ALLOWED_EXT   = 'PDF, JPG, JPEG, PNG'

// ─── Document type definitions ────────────────────────────────────────────────

type DocDef = { type: DocumentType; label: string; icon: string; desc: string }

const DOC_TYPES: DocDef[] = [
  {
    type:  'pilot_licence',
    label: 'Pilot Licence',
    icon:  'badge',
    desc:  'Recreational, Private, or Commercial Pilot Licence',
  },
  {
    type:  'medical_certificate',
    label: 'Medical Certificate',
    icon:  'health_and_safety',
    desc:  'Current aviation medical certificate',
  },
  {
    type:  'photo_id',
    label: 'Photo ID',
    icon:  'id_card',
    desc:  'Passport, driver licence, or other government-issued photo ID',
  },
]

const NIGHT_VFR_EVIDENCE_DEF: DocDef = {
  type: 'night_vfr_evidence',
  label: 'Night VFR Evidence',
  icon: 'nightlight',
  desc: 'Upload supporting evidence for your Night VFR endorsement.',
}

const RED_CARD_MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
]

// ─── UI state per document ─────────────────────────────────────────────────────
// Derived from doc.status + profile verification_status + expiry_date.

type DocUiState =
  | 'missing'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'expired'

function getDocUiState(
  doc: UserDocument | undefined,
): DocUiState {
  if (!doc) return 'missing'

  // Expiry check (date-only strings compare correctly as YYYY-MM-DD)
  if (doc.expiry_date) {
    const today  = new Date()
    const yyyy   = today.getUTCFullYear()
    const mm     = String(today.getUTCMonth() + 1).padStart(2, '0')
    const dd     = String(today.getUTCDate()).padStart(2, '0')
    const todayStr = `${yyyy}-${mm}-${dd}`
    if (doc.expiry_date < todayStr) return 'expired'
  }

  if (doc.status === 'rejected') return 'rejected'
  if (doc.status === 'approved') return 'approved'
  return 'under_review'
}

function getDocumentSortTimestamp(doc: UserDocument): number {
  const candidate = doc.updated_at || doc.uploaded_at || doc.created_at
  const parsed = candidate ? Date.parse(candidate) : NaN
  return Number.isNaN(parsed) ? 0 : parsed
}

// ─── Status chip ──────────────────────────────────────────────────────────────

const CHIP_CONFIG: Record<DocUiState, { label: string; color: string; bg: string }> = {
  missing:        { label: 'Not Uploaded',    color: 'text-[#94a3b8]',  bg: 'border border-[#152d5a]/10' },
  under_review:   { label: 'Awaiting Review', color: 'text-amber-400', bg: 'bg-amber-500/10' },
  approved:       { label: 'Approved',        color: 'text-green-400', bg: 'bg-green-500/10' },
  rejected:       { label: 'Rejected',        color: 'text-red-400',   bg: 'bg-red-500/10' },
  expired:        { label: 'Expired',         color: 'text-red-400',   bg: 'bg-red-500/10' },
}

function StatusChip({ state }: { state: DocUiState }) {
  const { label, color, bg } = CHIP_CONFIG[state]
  return (
    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full tracking-widest ${color} ${bg}`}>
      {label}
    </span>
  )
}

function TermsContent() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-lg font-semibold text-slate-900">{TERMS_MODAL_TITLE}</p>
        <p className="text-sm font-medium text-slate-600">{TERMS_MODAL_SUBTITLE}</p>
        <p className="text-sm text-slate-600">{TERMS_NOTICE}</p>
        <p className="text-xs uppercase tracking-[0.18em] text-[#64748b]">{TERMS_LAST_UPDATED}</p>
      </div>

      {TERMS_SECTIONS.map((section) => (
        <section key={`${section.number}-${section.title}`} className="space-y-2">
          <div className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f0f6ff] text-[11px] font-semibold text-[#152d5a]">
              {section.number}
            </span>
            <h4 className="text-sm font-semibold text-slate-900 leading-6">{section.title}</h4>
          </div>
          <div className="space-y-2 pl-9">
            {section.blocks.map((block, idx) =>
              block.type === 'paragraph' ? (
                <p key={idx} className="text-sm leading-6 text-[#152d5a]">
                  {block.text}
                </p>
              ) : (
                <ul key={idx} className="list-disc space-y-1 pl-5 text-sm leading-6 text-[#152d5a]">
                  {block.items.map((item, itemIdx) => (
                    <li key={itemIdx}>{item}</li>
                  ))}
                </ul>
              ),
            )}
          </div>
        </section>
      ))}

      <p className="text-sm leading-6 text-[#152d5a]">{TERMS_END_TEXT}</p>
    </div>
  )
}

// ─── Upload modal form state ──────────────────────────────────────────────────

type UploadForm = {
  file:              File | null
  licenceType:       string    // pilot_licence
  instrumentRating:  boolean | null  // pilot_licence — null = unanswered
  licenceNumber:     string    // pilot_licence — also updates profile ARN
  medicalClass:      string    // medical_certificate
  issueDate:         string    // medical_certificate — date of issue
  expiryDate:        string    // medical_certificate — expiry date
  idType:            string    // photo_id
  documentNumber:    string    // photo_id — document/ID number
}

const EMPTY_FORM: UploadForm = {
  file:              null,
  licenceType:       '',
  instrumentRating:  null,
  licenceNumber:     '',
  medicalClass:      '',
  issueDate:         '',
  expiryDate:        '',
  idType:            '',
  documentNumber:    '',
}

// ─── Upload modal ─────────────────────────────────────────────────────────────

function UploadModal({
  docType,
  existingDoc,
  onClose,
  onSuccess,
}: {
  docType:     DocumentType
  existingDoc: UserDocument | undefined
  onClose:     () => void
  onSuccess:   () => void
}) {
  const def =
    docType === 'night_vfr_evidence'
      ? NIGHT_VFR_EVIDENCE_DEF
      : DOC_TYPES.find(d => d.type === docType)!

  // Pre-fill from existing doc if replacing
  const [form, setForm] = useState<UploadForm>({
    ...EMPTY_FORM,
    licenceType:      existingDoc?.licence_type    ?? '',
    licenceNumber:    existingDoc?.licence_number  ?? '',
    medicalClass:     existingDoc?.medical_class   ?? '',
    issueDate:        existingDoc?.issue_date       ?? '',
    expiryDate:       existingDoc?.expiry_date      ?? '',
    idType:           existingDoc?.id_type          ?? '',
    documentNumber:   existingDoc?.document_number  ?? '',
  })
  const [fileError,  setFileError]  = useState('')
  const [formError,  setFormError]  = useState('')
  const [uploading,  setUploading]  = useState(false)

  function set<K extends keyof UploadForm>(key: K, value: UploadForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setFileError('')
    if (!file) { set('file', null); return }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileError('Only PDF, JPG, JPEG, and PNG files are allowed.')
      return
    }
    if (file.size > MAX_SIZE) {
      setFileError('File must be 10 MB or smaller.')
      return
    }
    set('file', file)
  }

  function validate(): string {
    if (!form.file) return 'Please select a file to upload.'
    if (docType === 'pilot_licence') {
      if (!form.licenceType)                return 'Please select a licence type.'
      if (form.instrumentRating === null)   return 'Please confirm your Instrument Rating status.'
      if (!form.licenceNumber)              return 'Please enter your pilot licence number / ARN.'
    }
    if (docType === 'medical_certificate') {
      if (!form.medicalClass) return 'Please select a medical class.'
      if (!form.issueDate)    return 'Date of issue is required for Medical Certificate.'
      if (!form.expiryDate)   return 'Expiry date is required for Medical Certificate.'
    }
    if (docType === 'photo_id') {
      if (!form.idType)         return 'Please select an ID type.'
      if (!form.documentNumber) return 'Please enter your document number.'
    }
    return ''
  }

  async function handleUpload() {
    const err = validate()
    if (err) { setFormError(err); return }

    setUploading(true)
    setFormError('')
    try {
      const fd = new FormData()
      fd.append('file',    form.file!)
      fd.append('docType', docType)
      if (form.licenceType)                     fd.append('licenceType',       form.licenceType)
      if (form.instrumentRating !== null)       fd.append('instrumentRating',  String(form.instrumentRating))
      if (form.licenceNumber)                   fd.append('licenceNumber',     form.licenceNumber)
      if (form.medicalClass)   fd.append('medicalClass',   form.medicalClass)
      if (form.issueDate)      fd.append('issueDate',      form.issueDate)
      if (form.expiryDate)     fd.append('expiryDate',     form.expiryDate)
      if (form.idType)         fd.append('idType',         form.idType)
      if (form.documentNumber) fd.append('documentNumber', form.documentNumber)
      await uploadVerificationDocument(fd)
      onSuccess()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  // Selector row helper
  function Selector({
    label,
    options,
    value,
    onChange,
    cols = 2,
  }: {
    label: string
    options: string[]
    value: string
    onChange: (v: string) => void
    cols?: number
  }) {
    return (
      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-widest font-bold text-[#64748b]">{label}</label>
        <div className={`grid gap-2 ${cols === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all text-left ${
                value === opt
                  ? 'bg-[#1a4fd6]/10 border-[#1a4fd6]/30 text-[#1a4fd6]'
                  : 'bg-[#f0f6ff] border-[#152d5a]/10 text-[#4b6390] hover:border-[#152d5a]/20 hover:text-[#152d5a]'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[1000] flex items-start justify-center p-4 pt-24 md:pt-28 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md max-h-[calc(100vh-7.5rem)] bg-white border border-[#152d5a]/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#152d5a]/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#f0f6ff] border border-[#152d5a]/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-[#1a4fd6] text-base" style={{ fontVariationSettings: "'wght' 300" }}>
                {def.icon}
              </span>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#4b6390] font-semibold">
                {existingDoc ? 'Replace' : 'Upload'}
              </p>
              <p className="text-sm font-semibold text-[#152d5a]">{def.label}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-[#152d5a] transition-colors p-1">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto min-h-0">

          {/* Pilot Licence fields */}
          {docType === 'pilot_licence' && (
            <>
              <Selector
                label="Licence Type"
                options={['Recreational (RPL)', 'Private (PPL)', 'Commercial (CPL)', 'Other']}
                value={
                  form.licenceType === 'RPL' ? 'Recreational (RPL)'
                  : form.licenceType === 'PPL' ? 'Private (PPL)'
                  : form.licenceType === 'CPL' ? 'Commercial (CPL)'
                  : form.licenceType === 'Recreational (RPL)' ? 'Recreational (RPL)'
                  : form.licenceType === 'Private (PPL)' ? 'Private (PPL)'
                  : form.licenceType === 'Commercial (CPL)' ? 'Commercial (CPL)'
                  : form.licenceType
                }
                onChange={v => {
                  // Store the short code for backward compat with existing records
                  if (v === 'Recreational (RPL)') set('licenceType', 'RPL')
                  else if (v === 'Private (PPL)')   set('licenceType', 'PPL')
                  else if (v === 'Commercial (CPL)') set('licenceType', 'CPL')
                  else set('licenceType', v)
                }}
                cols={2}
              />

              {/* Additional Ratings */}
                <div className="pt-1 border-t border-[#152d5a]/10">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-[#64748b] mb-4">Additional Ratings</p>
                  <div className="space-y-4">
                  {/* IFR / Instrument Rating */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-[#64748b]">
                      IFR / Instrument Rating
                      <span className="text-red-400/80 text-[8px] normal-case font-normal">Required</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {([true, false] as const).map(val => (
                        <button
                          key={String(val)}
                          type="button"
                          onClick={() => set('instrumentRating', val)}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all text-left ${
                            form.instrumentRating === val
                              ? 'bg-[#1a4fd6]/10 border-[#1a4fd6]/30 text-[#1a4fd6]'
                              : 'bg-[#f0f6ff] border-[#152d5a]/10 text-[#4b6390] hover:border-[#152d5a]/20 hover:text-[#152d5a]'
                          }`}
                        >
                          {val ? 'Yes' : 'No'}
                        </button>
                      ))}
                    </div>
                  </div>

                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-[#64748b]">
                  Pilot Licence Number / ARN
                  <span className="text-red-400/80 text-[8px] normal-case font-normal">Required</span>
                </label>
                <p className="text-[10px] text-[#94a3b8]">Your ARN is your CASA-issued aviation reference number.</p>
                <input
                  type="text"
                  value={form.licenceNumber}
                  onChange={e => set('licenceNumber', e.target.value)}
                  placeholder="e.g. 123456"
                  className="w-full bg-white border border-[#152d5a]/20 focus:border-[#1a4fd6]/40 focus:outline-none text-sm text-[#152d5a] rounded-xl px-4 py-2.5 placeholder:text-[#94a3b8]"
                />
              </div>
            </>
          )}

          {/* Medical Certificate fields */}
          {docType === 'medical_certificate' && (
            <>
              <Selector
                label="Medical Class"
                options={['Class 1', 'Class 2', 'Basic Class 2', 'Other']}
                value={form.medicalClass}
                onChange={v => set('medicalClass', v)}
                cols={2}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-[#64748b]">
                    Date of Issue
                    <span className="text-red-400/80 text-[8px] normal-case font-normal">Required</span>
                  </label>
                  <CalendarDateField
                    value={form.issueDate}
                    onChange={(next) => set('issueDate', next)}
                    minYear={new Date().getFullYear() - 80}
                    maxYear={new Date().getFullYear()}
                    className="w-full bg-white border border-[#152d5a]/20 focus:border-[#1a4fd6]/40 focus:outline-none text-sm text-[#152d5a] rounded-xl px-4 py-2.5 text-left flex items-center justify-between"
                  />
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-[#64748b]">
                    Expiry Date
                    <span className="text-red-400/80 text-[8px] normal-case font-normal">Required</span>
                  </label>
                  <CalendarDateField
                    value={form.expiryDate}
                    onChange={(next) => set('expiryDate', next)}
                    minYear={new Date().getFullYear() - 5}
                    maxYear={new Date().getFullYear() + 20}
                    className="w-full bg-white border border-[#152d5a]/20 focus:border-[#1a4fd6]/40 focus:outline-none text-sm text-[#152d5a] rounded-xl px-4 py-2.5 text-left flex items-center justify-between"
                  />
                </div>
              </div>
            </>
          )}

          {/* Photo ID fields */}
          {docType === 'photo_id' && (
            <>
              <Selector
                label="ID Type"
                options={['Passport', 'Driver Licence', 'Other']}
                value={form.idType}
                onChange={v => set('idType', v)}
                cols={3}
              />
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-[#64748b]">
                  Document Number
                  <span className="text-red-400/80 text-[8px] normal-case font-normal">Required</span>
                </label>
                <input
                  type="text"
                  value={form.documentNumber}
                  onChange={e => set('documentNumber', e.target.value)}
                  placeholder="Passport or licence number"
                  className="w-full bg-white border border-[#152d5a]/20 focus:border-[#1a4fd6]/40 focus:outline-none text-sm text-[#152d5a] rounded-xl px-4 py-2.5 placeholder:text-[#94a3b8]"
                />
              </div>
            </>
          )}

          {/* File picker */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest font-bold text-[#64748b]">
              Document File
            </label>
            <label
              className={`flex items-center gap-3 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                form.file
                  ? 'border-[#1a4fd6]/30 bg-[#f0f6ff]'
                  : 'border-[#152d5a]/10 hover:border-[#152d5a]/20 bg-white hover:bg-[#f0f6ff]'
              }`}
            >
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileChange} />
              <span
                className={`material-symbols-outlined text-xl flex-shrink-0 ${form.file ? 'text-[#1a4fd6]' : 'text-[#94a3b8]'}`}
                style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
              >
                {form.file ? 'draft' : 'cloud_upload'}
              </span>
              <div className="flex-1 min-w-0">
                {form.file ? (
                  <>
                    <p className="text-sm text-[#152d5a] truncate">{form.file.name}</p>
                    <p className="text-xs text-[#64748b]">{(form.file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-[#4b6390]">Choose a file</p>
                    <p className="text-xs text-[#64748b]">{ALLOWED_EXT} — max 10 MB</p>
                  </>
                )}
              </div>
              {form.file && (
                <button
                  type="button"
                  onClick={e => { e.preventDefault(); set('file', null) }}
                  className="text-[#94a3b8] hover:text-[#152d5a] transition-colors flex-shrink-0"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              )}
            </label>
            {fileError && (
              <p className="text-xs text-red-400 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">error</span>
                {fileError}
              </p>
            )}
          </div>

          {formError && (
            <p className="text-xs text-red-400 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
              <span className="material-symbols-outlined text-sm flex-shrink-0 mt-0.5">error</span>
              {formError}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#152d5a]/10 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-[#64748b] hover:text-[#152d5a] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#1a4fd6]/10 border border-[#1a4fd6]/20 text-[#1a4fd6] hover:bg-[#1a4fd6] hover:text-white rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {uploading && (
              <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
            )}
            {uploading ? 'Uploading…' : existingDoc ? 'Replace Document' : 'Upload Document'}
          </button>
        </div>

      </div>
      </div>
    </ModalPortal>
  )
}

// ─── Document card ─────────────────────────────────────────────────────────────

function DocumentCard({
  def,
  doc,
  docState,
  idx,
  canModify,
  onOpen,
  onViewDocument,
  hasNightVfrRating,
  hasInstrumentRating,
}: {
  def:                  DocDef
  doc:                  UserDocument | undefined
  docState:             DocUiState
  idx:                  number
  canModify:            boolean
  onOpen:               () => void
  onViewDocument:       (docType: DocumentType, title: string) => Promise<void>
  hasNightVfrRating?:   boolean | null
  hasInstrumentRating?: boolean | null
  }) {
  const [viewLoading, setViewLoading] = useState(false)
  const [viewError,   setViewError]   = useState('')

  async function handleView() {
    setViewLoading(true)
    setViewError('')
    try {
      await onViewDocument(def.type, def.label)
    } catch {
      setViewError('Could not open document. Please try again.')
    } finally {
      setViewLoading(false)
    }
  }

  const iconBg: Record<DocUiState, string> = {
    missing:        'bg-[#f0f6ff] border-[#152d5a]/10 text-[#94a3b8]',
    under_review:   'bg-amber-500/10 border-amber-500/20  text-amber-400',
    approved:       'bg-green-500/10 border-green-500/20  text-green-400',
    rejected:       'bg-red-500/10   border-red-500/20    text-red-400',
    expired:        'bg-red-500/10   border-red-500/20    text-red-400',
  }

  const cardBorder: Record<DocUiState, string> = {
    missing:        'border-[#152d5a]/10 hover:bg-[#f0f6ff]',
    under_review:   'border-amber-500/15',
    approved:       'border-green-500/15',
    rejected:       'border-red-500/15',
    expired:        'border-red-500/15',
  }

  const showView    = !!doc && docState !== 'missing'
  const showUpload  = docState === 'missing'
  const showReplace = ['rejected', 'expired'].includes(docState)

  // Label for upload/replace button
  const actionLabel =
    docState === 'missing'   ? 'Upload' :
    docState === 'rejected'  ? 'Upload Replacement' :
    docState === 'expired'   ? 'Upload Updated' :
    'Replace'

  const actionIcon  =
    docState === 'missing' ? 'cloud_upload' : 'cloud_sync'
  const reviewedAt = doc?.reviewed_at ?? doc?.updated_at ?? doc?.uploaded_at ?? null

  return (
    <div
      className={`relative bg-white backdrop-blur-2xl border rounded-[1.25rem] p-6 shadow-[0_8px_24px_rgba(2,10,22,0.08)] transition-all ${cardBorder[docState]}`}
    >
      {/* Step number */}
      <span className="absolute top-6 right-6 text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]">
        {String(idx + 1).padStart(2, '0')}
      </span>

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">
        {/* Left: icon + info */}
        <div className="flex items-start gap-5">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 border ${iconBg[docState]}`}>
            <span
              className="material-symbols-outlined text-xl"
              style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
            >
              {def.icon}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            {/* Title + status chip */}
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className="text-base text-[#152d5a] font-semibold">{def.label}</h3>
              <StatusChip state={docState} />
            </div>

            {/* Description */}
            <p className="text-sm text-[#4b6390] font-light">{def.desc}</p>

            {/* Metadata row — file name, dates, classification */}
            {doc && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                {/* File name */}
                <span className="text-xs text-[#4b6390] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>draft</span>
                  {doc.file_name}
                </span>

                {/* Upload date */}
                {doc.uploaded_at && docState !== 'approved' && (
                  <span className="text-xs text-[#64748b] flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>calendar_today</span>
                    Uploaded {fmtDate(doc.uploaded_at)}
                  </span>
                )}

                {/* Expiry date */}
                {doc.expiry_date && (
                    <span className={`text-xs flex items-center gap-1 font-medium ${docState === 'expired' ? 'text-red-400/80' : 'text-[#4b6390]'}`}>
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>event</span>
                    {docState === 'expired' ? 'Expired' : 'Expires'} {fmtDate(doc.expiry_date)}
                  </span>
                )}

                {/* Approved / reviewed date */}
                {docState === 'approved' && reviewedAt && (
                  <span className="text-xs text-green-400/80 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>task_alt</span>
                    Approved {fmtDate(reviewedAt)}
                  </span>
                )}
                {docState === 'rejected' && reviewedAt && (
                  <span className="text-xs text-red-400/70 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>gpp_bad</span>
                    Rejected {fmtDate(reviewedAt)}
                  </span>
                )}

                {/* Classification chips */}
                {doc.licence_type && (
                  <span className="text-xs text-[#1a4fd6]/80 bg-[#1a4fd6]/8 px-2 py-0.5 rounded-full">{doc.licence_type} Licence</span>
                )}
                {doc.licence_number && (
                  <span className="text-xs text-[#64748b]">#{doc.licence_number}</span>
                )}
                {doc.medical_class && (
                  <span className="text-xs text-[#1a4fd6]/80 bg-[#1a4fd6]/8 px-2 py-0.5 rounded-full">{doc.medical_class}</span>
                )}
                {doc.id_type && (
                  <span className="text-xs text-[#1a4fd6]/80 bg-[#1a4fd6]/8 px-2 py-0.5 rounded-full">{doc.id_type}</span>
                )}

                {/* Pilot ratings (pilot_licence only) */}
                {def.type === 'pilot_licence' && (
                  <>
                    <span className="text-xs text-[#4b6390] flex items-center gap-1">
                      Night VFR:
                      <span className={hasNightVfrRating === true ? 'text-green-400' : hasNightVfrRating === false ? 'text-[#64748b]' : 'text-[#94a3b8] italic'}>
                        {hasNightVfrRating === true ? 'Yes' : hasNightVfrRating === false ? 'No' : 'Not provided'}
                      </span>
                    </span>
                    <span className="text-xs text-[#4b6390] flex items-center gap-1">
                      Instrument Rating:
                      <span className={hasInstrumentRating === true ? 'text-green-400' : hasInstrumentRating === false ? 'text-[#64748b]' : 'text-[#94a3b8] italic'}>
                        {hasInstrumentRating === true ? 'Yes' : hasInstrumentRating === false ? 'No' : 'Not provided'}
                      </span>
                    </span>
                    <span className="text-xs text-[#4b6390] flex items-center gap-1">
                      Red Card:
                      <span className={doc.red_card_expiry_month && doc.red_card_expiry_year ? 'text-green-400' : 'text-[#94a3b8] italic'}>
                        {doc.red_card_expiry_month && doc.red_card_expiry_year ? 'Provided' : 'Not provided'}
                      </span>
                    </span>
                    {doc.red_card_expiry_month && doc.red_card_expiry_year && (
                      <span className="text-xs text-[#64748b]">
                        Expiry: {String(doc.red_card_expiry_month).padStart(2, '0')}/{doc.red_card_expiry_year}
                      </span>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Rejection reason */}
            {docState === 'rejected' && doc?.review_notes && (
              <div className="text-xs text-red-400/90 mt-3 bg-red-500/8 border border-red-500/15 px-3 py-2 rounded-lg inline-flex items-center gap-2 max-w-sm">
                <span className="material-symbols-outlined text-[16px] text-red-400 flex-shrink-0">warning</span>
                <span className="leading-snug break-words flex-1">{doc.review_notes}</span>
              </div>
            )}

            {docState === 'under_review' && (
              <div className="text-xs text-amber-300/90 mt-3 bg-amber-500/8 border border-amber-500/15 px-3 py-2 rounded-lg inline-flex items-center gap-2 max-w-sm">
                <span className="material-symbols-outlined text-[16px] text-amber-300 flex-shrink-0">hourglass_top</span>
                <span className="leading-snug flex-1">Awaiting admin review.</span>
              </div>
            )}

            {/* Expired notice */}
            {docState === 'expired' && (
              <div className="text-xs text-red-400/90 mt-3 bg-red-500/8 border border-red-500/15 px-3 py-2 rounded-lg inline-flex items-center gap-2 max-w-sm">
                <span className="material-symbols-outlined text-[16px] text-red-400 flex-shrink-0">warning</span>
                <span className="leading-snug flex-1">Expired {doc?.expiry_date ? fmtDate(doc.expiry_date) : ''}. Please upload an updated document.</span>
              </div>
            )}

            {/* View error */}
            {viewError && (
              <p className="text-xs text-red-400 mt-2 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">error</span>
                {viewError}
              </p>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 flex-shrink-0 md:pt-0.5">
          {/* View */}
          {showView && (
            <button
              onClick={handleView}
              disabled={viewLoading}
            className="flex items-center gap-1.5 border border-[#152d5a]/10 hover:border-[#152d5a]/20 text-[#64748b] hover:text-[#152d5a] px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-40"
            >
              {viewLoading
                ? <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                : <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>open_in_new</span>
              }
              View
            </button>
          )}

          {/* Upload / Replace */}
          {(showUpload || showReplace) && (
            <button
              onClick={onOpen}
              disabled={!canModify}
              className={`flex items-center gap-2 border text-[10px] font-bold uppercase tracking-[0.12em] transition-all px-5 py-2 rounded-full disabled:opacity-30 disabled:cursor-not-allowed ${
                showUpload
                  ? 'border-[#1a4fd6]/40 hover:border-[#1a4fd6] text-[#1a4fd6] hover:bg-[#1a4fd6]/5'
                  : 'border-[#152d5a]/15 hover:border-[#152d5a]/30 hover:bg-[#f0f6ff] text-[#4b6390] hover:text-[#152d5a]'
              }`}
            >
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>
                {actionIcon}
              </span>
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  user:                 User
  documents:            UserDocument[]
  pilotLicenceDocument: UserDocument | null
  lastFlightDate:       string | null
  hasNightVfrRating:    boolean | null
  hasInstrumentRating:  boolean | null
  termsAcceptedAt:      string | null
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DocumentsPanel({
  user,
  documents,
  pilotLicenceDocument,
  lastFlightDate,
  hasNightVfrRating,
  hasInstrumentRating,
  termsAcceptedAt,
}: Props) {
  // status is derived locally — not needed from parent since we no longer gate on verification_status
  const router = useRouter()
  const [modalDocType, setModalDocType] = useState<DocumentType | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerFiles, setViewerFiles] = useState<DocumentFile[]>([])
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0)
  const [viewerTitle, setViewerTitle] = useState('')
  const [nightVfrRating, setNightVfrRating] = useState<boolean | null>(hasNightVfrRating)
  const [nightVfrSaving, setNightVfrSaving] = useState(false)
  const [nightVfrError, setNightVfrError] = useState('')
  const [redCardExpiryMonth, setRedCardExpiryMonth] = useState<number | null>(null)
  const [redCardExpiryYear, setRedCardExpiryYear] = useState<number | null>(null)
  const [redCardSaving, setRedCardSaving] = useState(false)
  const [redCardError, setRedCardError] = useState('')
  const [redCardSaved, setRedCardSaved] = useState(false)
  const [termsExpanded, setTermsExpanded] = useState(false)
  const [termsChecked, setTermsChecked] = useState(false)
  const [termsError, setTermsError] = useState('')
  const [isAcceptingTerms, setIsAcceptingTerms] = useState(false)
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false)
  const termsScrollRef = useRef<HTMLDivElement>(null)
  const flightDateDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const flightDateSavedTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const redCardSavedTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // ── Last flight date field state ─────────────────────────────────────────────
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
  const [flightDate,      setFlightDate]      = useState(lastFlightDate ?? '')
  const [flightDateSaving, setFlightDateSaving] = useState(false)
  const [flightDateError,  setFlightDateError]  = useState('')
  const [flightDateSaved,  setFlightDateSaved]  = useState(false)
  const flightDateChanged = flightDate.trim() !== (lastFlightDate ?? '')

  useEffect(() => {
    setNightVfrRating(hasNightVfrRating)
  }, [hasNightVfrRating])

  useEffect(() => {
    setFlightDate(lastFlightDate ?? '')
  }, [lastFlightDate])

  useEffect(() => {
    if (!termsAcceptedAt) {
      setIsScrolledToBottom(false)
    }
  }, [termsAcceptedAt])

  useEffect(() => {
    return () => {
      if (flightDateDebounceRef.current) clearTimeout(flightDateDebounceRef.current)
      if (flightDateSavedTimeoutRef.current) clearTimeout(flightDateSavedTimeoutRef.current)
      if (redCardSavedTimeoutRef.current) clearTimeout(redCardSavedTimeoutRef.current)
    }
  }, [])

  async function persistFlightDate(nextValue: string) {
    setFlightDateSaving(true)
    setFlightDateError('')
    setFlightDateSaved(false)
    const result = await saveLastFlightDate(nextValue.trim())
    if ('error' in result) {
      setFlightDateError(result.error)
      setFlightDateSaving(false)
      return
    }
    setFlightDateSaved(true)
    if (flightDateSavedTimeoutRef.current) clearTimeout(flightDateSavedTimeoutRef.current)
    flightDateSavedTimeoutRef.current = setTimeout(() => {
      setFlightDateSaved(false)
    }, 2000)
    router.refresh()
    setFlightDateSaving(false)
  }

  function handleFlightDateChange(nextValue: string) {
    setFlightDate(nextValue)
    setFlightDateSaved(false)
    setFlightDateError('')

    if (flightDateDebounceRef.current) clearTimeout(flightDateDebounceRef.current)
    flightDateDebounceRef.current = setTimeout(() => {
      void persistFlightDate(nextValue)
    }, 600)
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const docMap = useMemo(() => {
    const latestByType: Partial<Record<DocumentType, UserDocument>> = {}
    for (const doc of documents) {
      const current = latestByType[doc.document_type]
      if (!current || getDocumentSortTimestamp(doc) > getDocumentSortTimestamp(current)) {
        latestByType[doc.document_type] = doc
      }
    }
    return latestByType
  }, [documents])

  const docStates = useMemo(
    () => Object.fromEntries(
      DOC_TYPES.map(def => [def.type, getDocUiState(docMap[def.type])])
    ) as Record<DocumentType, DocUiState>,
    [docMap],
  )
  const sydneyToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
  const currentYear = Number(sydneyToday.slice(0, 4))
  const currentMonth = Number(sydneyToday.slice(5, 7))
  const redCardYearOptions = Array.from({ length: 11 }, (_, idx) => currentYear + idx)
  const redCardMonthOptions = useMemo(() => {
    const minMonth = redCardExpiryYear === currentYear ? currentMonth : 1
    return RED_CARD_MONTH_OPTIONS.filter((option) => option.value >= minMonth)
  }, [redCardExpiryYear, currentYear, currentMonth])

  // Documents can always be replaced
  const canModify = true

  const requiredDocTypes = DOC_TYPES.map(def => def.type)
  const hasMissingRequiredDoc = requiredDocTypes.some(type => docStates[type] === 'missing')
  const hasRejectedRequiredDoc = requiredDocTypes.some(type => docStates[type] === 'rejected')
  const allRequiredDocsUploaded = requiredDocTypes.every(type => docStates[type] !== 'missing')
  const allRequiredDocsApproved = requiredDocTypes.every(type => docStates[type] === 'approved')
  const termsAccepted = Boolean(termsAcceptedAt)
  const readinessState =
    hasMissingRequiredDoc || hasRejectedRequiredDoc ? 'red'
    : allRequiredDocsApproved && termsAccepted ? 'green'
    : 'amber'

  // ── Handlers ───────────────────────────────────────────────────────────────

  function openModal(docType: DocumentType) {
    setModalDocType(docType)
  }

  async function openDocumentViewer(docType: DocumentType, title: string) {
    const files = await getDocumentSignedUrlsForType(docType)
    setViewerFiles(files.map((file) => ({ url: file.url, name: file.fileName })))
    setViewerInitialIndex(0)
    setViewerTitle(title)
    setViewerOpen(true)
  }

  function closeModal() {
    setModalDocType(null)
  }

  function handleUploadSuccess() {
    closeModal()
    router.refresh()
  }

  async function handleAcceptTerms() {
    if (!termsChecked || !isScrolledToBottom || isAcceptingTerms) {
      setTermsError(!termsChecked ? 'Please check the box to accept the terms and conditions.' : 'Please scroll through the full terms to continue.')
      return
    }

    setTermsError('')
    setIsAcceptingTerms(true)
    try {
      const result = await acceptTermsAndConditions()
      if (!result.ok) {
        setTermsError(result.error)
        return
      }
      router.refresh()
    } catch (error: unknown) {
      setTermsError(error instanceof Error ? error.message : 'Could not save your terms acceptance right now.')
    } finally {
      setIsAcceptingTerms(false)
    }
  }

  function handleTermsScroll() {
    const el = termsScrollRef.current
    if (!el) return
    setIsScrolledToBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 10)
  }

  useEffect(() => {
    if (termsAcceptedAt) return
    handleTermsScroll()
  }, [termsAcceptedAt])

  useEffect(() => {
    setRedCardExpiryMonth(pilotLicenceDocument?.red_card_expiry_month ?? null)
    setRedCardExpiryYear(pilotLicenceDocument?.red_card_expiry_year ?? null)
    setRedCardSaved(false)
    setRedCardError('')
  }, [
    pilotLicenceDocument?.red_card_expiry_month,
    pilotLicenceDocument?.red_card_expiry_year,
  ])

  async function handleNightVfrChange(next: boolean) {
    if (nightVfrSaving || nightVfrRating === next) return

    const previous = nightVfrRating
    setNightVfrError('')
    setNightVfrRating(next)
    setNightVfrSaving(true)

    try {
      await saveNightVfrRatingFromReadiness({ hasNightVfrRating: next })
      router.refresh()
    } catch (error: unknown) {
      setNightVfrRating(previous)
      setNightVfrError(error instanceof Error ? error.message : 'Could not save Night VFR status.')
    } finally {
      setNightVfrSaving(false)
    }
  }

  async function persistRedCard(nextMonth: number, nextYear: number) {
    if (
      nextYear < currentYear ||
      (nextYear === currentYear && nextMonth < currentMonth)
    ) {
      setRedCardError('Red Card expiry must be the current month or a future date.')
      return
    }

    setRedCardSaving(true)
    setRedCardError('')
    setRedCardSaved(false)

    try {
      const result = await saveRedCardDetails(user.id, nextMonth, nextYear)
      if ('error' in result) {
        setRedCardError(result.error)
        setRedCardSaving(false)
        return
      }
      setRedCardSaved(true)
      if (redCardSavedTimeoutRef.current) clearTimeout(redCardSavedTimeoutRef.current)
      redCardSavedTimeoutRef.current = setTimeout(() => {
        setRedCardSaved(false)
      }, 2000)
      router.refresh()
    } catch (error: unknown) {
      setRedCardError(error instanceof Error ? error.message : 'Could not save Red Card details.')
    } finally {
      setRedCardSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Upload modal */}
      {modalDocType && (
        <UploadModal
          docType={modalDocType}
          existingDoc={docMap[modalDocType]}
          onClose={closeModal}
          onSuccess={handleUploadSuccess}
        />
      )}

      <DocumentViewerModal
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        files={viewerFiles}
        initialIndex={viewerInitialIndex}
        title={viewerTitle}
      />

      <div className="space-y-10 animate-fade-in flex-1 max-w-4xl mx-auto">

        {/* ── Terms & Conditions acceptance ── */}
        <section className="bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-9 h-9 rounded-xl bg-[#f0f6ff] border border-[#152d5a]/10 flex items-center justify-center flex-shrink-0">
              <span
                className="material-symbols-outlined text-[#1a4fd6] text-base"
                style={{ fontVariationSettings: "'wght' 300" }}
              >
                gavel
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-[#152d5a]">Terms & Conditions</h3>
              <p className="text-xs text-[#4b6390] mt-0.5">
                Please accept the current booking terms before requesting a checkout flight.
              </p>
            </div>
            {termsAccepted && (
              <span className="flex-shrink-0 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full tracking-widest text-green-600 bg-green-50">
                Accepted
              </span>
            )}
          </div>

          {termsAccepted ? (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-start gap-3">
              <span className="material-symbols-outlined text-base mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
              <p>
                Terms accepted on <span className="font-semibold">{termsAcceptedAt ? fmtDate(termsAcceptedAt) : '—'}</span>.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {!termsExpanded ? (
                <div className="rounded-xl border border-[#152d5a]/10 bg-white px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#152d5a]">Terms & Conditions</p>
                    <p className="text-xs text-[#4b6390] mt-0.5">
                      Open the terms to review them before accepting.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTermsExpanded(true)}
                    className="inline-flex items-center gap-2 self-start sm:self-auto px-5 py-2.5 bg-[#152d5a] border border-[#152d5a] text-white hover:bg-[#0f2446] rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all"
                  >
                    Read & Accept Terms →
                  </button>
                </div>
              ) : (
                <>
                  <div
                    ref={termsScrollRef}
                    onScroll={handleTermsScroll}
                    className="h-[240px] overflow-y-auto border border-[#152d5a]/10 rounded-lg p-4 bg-[#f0f6ff] text-sm text-[#152d5a]"
                  >
                    <TermsContent />
                  </div>

                  <label className="flex items-start gap-3 rounded-xl border border-[#152d5a]/10 bg-white px-4 py-3 cursor-pointer hover:border-[#1a4fd6]/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={termsChecked}
                      onChange={e => {
                        setTermsChecked(e.target.checked)
                        setTermsError('')
                      }}
                      className="mt-1 h-4 w-4 rounded border-[#152d5a]/20 bg-transparent text-[#1a4fd6] focus:ring-[#1a4fd6]"
                    />
                    <span className="text-sm text-[#152d5a] leading-relaxed">
                      I have read and agree to the terms and conditions.
                    </span>
                  </label>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleAcceptTerms}
                      disabled={!termsChecked || !isScrolledToBottom || isAcceptingTerms}
                      className="flex items-center gap-2 px-5 py-2.5 bg-[#152d5a] border border-[#152d5a] text-white hover:bg-[#0f2446] rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {isAcceptingTerms && (
                        <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                      )}
                      {isAcceptingTerms ? 'Saving…' : 'Accept'}
                    </button>
                    <p className="text-xs text-[#4b6390]">
                      Your acceptance will be recorded against the current terms version.
                    </p>
                  </div>

                  {(!isScrolledToBottom || !termsChecked) && (
                    <p className="text-xs text-[#94a3b8]">Please scroll through the full terms to continue</p>
                  )}

                  {termsError && (
                    <p className="text-xs text-red-400 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">error</span>
                      {termsError}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </section>

        {/* ── Overall document readiness banner ── */}
        <section
          className={`rounded-[1.25rem] px-6 py-5 flex items-start gap-4 border ${
            readinessState === 'green'
              ? 'bg-green-50 border-green-200'
              : readinessState === 'amber'
                ? 'bg-amber-50 border-amber-200'
                : 'bg-red-50 border-red-200'
          }`}
        >
          <span
            className={`material-symbols-outlined text-xl flex-shrink-0 mt-0.5 ${
              readinessState === 'green' ? 'text-green-600' : readinessState === 'amber' ? 'text-amber-600' : 'text-red-600'
            }`}
            style={{ fontVariationSettings: "'wght' 300" }}
          >
            {readinessState === 'green' ? 'check_circle' : readinessState === 'amber' ? 'hourglass_top' : 'warning'}
          </span>
          <div className="space-y-1">
            <p className={`text-sm font-medium leading-relaxed ${readinessState === 'green' ? 'text-green-700' : readinessState === 'amber' ? 'text-amber-700' : 'text-red-700'}`}>
              {readinessState === 'green'
                ? "All documents approved — you're eligible to request a checkout flight"
                : readinessState === 'amber' && allRequiredDocsApproved && !termsAccepted
                  ? 'Documents approved — accept the terms above to request a checkout flight'
                  : readinessState === 'amber'
                  ? 'Documents under review — we\'ll notify you once approved'
                  : hasMissingRequiredDoc || hasRejectedRequiredDoc
                    ? 'Action required — one or more documents need attention'
                    : 'Action required — accept the terms above to become eligible to request a checkout flight'}
            </p>
            {readinessState === 'amber' && termsAccepted && allRequiredDocsUploaded && !allRequiredDocsApproved && (
              <p className="text-xs text-[#4b6390]">
                Once every required document is approved, you’ll be able to request a checkout flight.
              </p>
            )}
            {readinessState === 'amber' && allRequiredDocsApproved && !termsAccepted && (
              <p className="text-xs text-[#4b6390]">
                The documents are ready. Accept the terms above to unlock checkout readiness.
              </p>
            )}
          </div>
        </section>

        {/* ── Pilot Flight Recency ── */}
        <section className="bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-6">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-9 h-9 rounded-xl bg-[#f0f6ff] border border-[#152d5a]/10 flex items-center justify-center flex-shrink-0">
              <span
                className="material-symbols-outlined text-[#1a4fd6] text-base"
                style={{ fontVariationSettings: "'wght' 300" }}
              >
                flight_land
              </span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#152d5a]">Pilot Flight Recency</h3>
              <p className="text-xs text-[#4b6390] mt-0.5">
                This helps the operations team assess your checkout readiness.
              </p>
            </div>
            {lastFlightDate && !flightDateChanged && (
              <span className="ml-auto flex-shrink-0 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full tracking-widest text-green-600 bg-green-50">
                Saved
              </span>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#64748b] block">
              When was your last flight review?
              <span className={`ml-1.5 font-normal normal-case ${flightDate.trim() ? 'text-green-600' : 'text-red-600'}`}>
                {flightDate.trim() ? 'Recorded for booking readiness' : 'Required for booking readiness'}
              </span>
            </label>
            <div className="flex gap-3">
              <div className="flex-1">
                <CalendarDateField
                  value={flightDate}
                  onChange={handleFlightDateChange}
                  minYear={new Date().getFullYear() - 20}
                  maxYear={new Date().getFullYear()}
                  minDate={getFlightReviewCutoff()}
                  maxDate={today}
                  className="w-full bg-white border border-[#152d5a]/20 focus:border-[#1a4fd6]/40 focus:outline-none text-sm text-[#152d5a] rounded-xl px-4 py-2.5 text-left flex items-center justify-between"
                />
              </div>
            </div>
          </div>

          {flightDateSaving && !flightDateError && (
            <p className="mt-2 text-xs text-[#64748b]">Saving...</p>
          )}
          {flightDateSaved && !flightDateSaving && !flightDateError && (
            <p className="mt-2 text-xs text-green-600 transition-opacity duration-300">Saved</p>
          )}
          {flightDateError && (
            <p className="mt-2 text-xs text-red-500 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">error</span>
              {flightDateError}
            </p>
          )}
        </section>

        {/* ── Document cards ── */}
        <section className="grid gap-5">
          {DOC_TYPES.map((def, idx) => (
            <DocumentCard
              key={def.type}
              def={def}
              doc={docMap[def.type]}
              docState={docStates[def.type]}
              idx={idx}
              canModify={canModify}
              onOpen={() => openModal(def.type)}
              onViewDocument={openDocumentViewer}
              hasNightVfrRating={def.type === 'pilot_licence' ? hasNightVfrRating : undefined}
              hasInstrumentRating={def.type === 'pilot_licence' ? hasInstrumentRating : undefined}
            />
          ))}
        </section>

        {/* ── Red Card ── */}
        <section className="bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-6 space-y-5">
          <div className="flex items-start gap-4">
            <div className="w-9 h-9 rounded-xl bg-[#f0f6ff] border border-[#152d5a]/10 flex items-center justify-center flex-shrink-0">
              <span
                className="material-symbols-outlined text-[#1a4fd6] text-base"
                style={{ fontVariationSettings: "'wght' 300" }}
              >
                badge
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-[#152d5a]">Red Card (ASIC)</h3>
              <p className="text-xs text-[#4b6390] mt-0.5">
                Enter your Aviation Security Identification Card (Red Card) expiry date.
              </p>
            </div>
            {redCardSaving && (
              <span className="flex-shrink-0 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full tracking-widest text-blue-600 bg-blue-50">
                Saving
              </span>
            )}
          </div>

          <div className="border-t border-[#152d5a]/10 pt-4">
            {!pilotLicenceDocument ? (
              <div className="rounded-lg border border-[#152d5a]/10 bg-[#f0f6ff] px-4 py-3 text-sm text-[#4b6390]">
                Please upload your Pilot Licence first before entering your Red Card details.
              </div>
            ) : (
              <div className="rounded-xl border border-[#152d5a]/10 bg-[#f0f6ff] p-4 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-[#152d5a]">Red Card Expiry</p>
                  <p className="mt-1 text-sm text-[#4b6390]">
                    Select the expiry month and year shown on your Aviation Security Identification Card.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[#64748b] block">
                      Month
                    </label>
                    <select
                      value={redCardExpiryMonth ?? ''}
                      onChange={(e) => {
                        const nextMonth = e.target.value ? Number(e.target.value) : null
                        setRedCardExpiryMonth(nextMonth)
                        setRedCardSaved(false)
                        setRedCardError('')
                        if (nextMonth && redCardExpiryYear) {
                          void persistRedCard(nextMonth, redCardExpiryYear).catch((error: unknown) => {
                            setRedCardError(error instanceof Error ? error.message : 'Could not save Red Card details.')
                            setRedCardSaving(false)
                          })
                        }
                      }}
                      className="w-full bg-white border border-[#152d5a]/20 focus:border-[#1a4fd6]/40 focus:outline-none text-sm text-[#152d5a] rounded-xl px-4 py-2.5"
                    >
                      <option value="">Select month</option>
                      {redCardMonthOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[#64748b] block">
                      Year
                    </label>
                    <select
                      value={redCardExpiryYear ?? ''}
                      onChange={(e) => {
                        const nextYear = e.target.value ? Number(e.target.value) : null
                        setRedCardExpiryYear(nextYear)
                        setRedCardSaved(false)
                        setRedCardError('')
                        if (nextYear === currentYear && redCardExpiryMonth !== null && redCardExpiryMonth < currentMonth) {
                          setRedCardExpiryMonth(null)
                          return
                        }
                        if (redCardExpiryMonth && nextYear) {
                          void persistRedCard(redCardExpiryMonth, nextYear).catch((error: unknown) => {
                            setRedCardError(error instanceof Error ? error.message : 'Could not save Red Card details.')
                            setRedCardSaving(false)
                          })
                        }
                      }}
                      className="w-full bg-white border border-[#152d5a]/20 focus:border-[#1a4fd6]/40 focus:outline-none text-sm text-[#152d5a] rounded-xl px-4 py-2.5"
                    >
                      <option value="">Select year</option>
                      {redCardYearOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {redCardSaving && !redCardError && (
                  <p className="text-xs text-[#64748b]">Saving...</p>
                )}
                {redCardSaved && !redCardSaving && !redCardError && (
                  <p className="text-xs text-green-600">Saved ✓</p>
                )}
              </div>
            )}
          </div>

          {redCardError && (
            <p className="text-xs text-red-500 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">error</span>
              {redCardError}
            </p>
          )}
        </section>

        {/* ── Night VFR endorsement ── */}
        <section className="bg-white border border-[#152d5a]/10 rounded-[1.25rem] p-6 space-y-5">
          <div className="flex items-start gap-4">
            <div className="w-9 h-9 rounded-xl bg-[#f0f6ff] border border-[#152d5a]/10 flex items-center justify-center flex-shrink-0">
              <span
                className="material-symbols-outlined text-[#1a4fd6] text-base"
                style={{ fontVariationSettings: "'wght' 300" }}
              >
                nightlight
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-[#152d5a]">Night VFR Endorsement</h3>
              <p className="text-xs text-[#4b6390] mt-0.5">
                Do you hold a Night VFR endorsement?
              </p>
            </div>
            {nightVfrSaving && (
              <span className="flex-shrink-0 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full tracking-widest text-blue-600 bg-blue-50">
                Saving
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([true, false] as const).map((val) => (
              <button
                key={String(val)}
                type="button"
                onClick={() => handleNightVfrChange(val)}
                disabled={nightVfrSaving}
                className={`px-4 py-4 rounded-xl border text-left transition-all ${
                  nightVfrRating === val
                    ? 'bg-[#1a4fd6] border-[#1a4fd6] text-white shadow-[0_0_14px_rgba(26,79,214,0.14)]'
                    : 'bg-[#f0f6ff] border-[#152d5a]/10 text-[#4b6390] hover:text-[#152d5a] hover:border-[#152d5a]/20'
                }`}
              >
                <p className="text-[17px] font-semibold">{val ? 'YES' : 'NO'}</p>
                <p className="text-sm mt-1.5 leading-relaxed">
                  {val ? 'I hold a Night VFR endorsement' : 'I do not hold a Night VFR endorsement'}
                </p>
              </button>
            ))}
          </div>

          <div className="border-t border-slate-700 pt-4">
            {nightVfrRating === true ? (
              <div className="rounded-xl border border-[#152d5a]/10 bg-[#f0f6ff] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#152d5a]">Night VFR Evidence</p>
                    <p className="mt-1 text-sm text-[#4b6390]">
                      Upload supporting evidence for your endorsement.
                    </p>
                    {docMap.night_vfr_evidence && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <StatusChip state={getDocUiState(docMap.night_vfr_evidence)} />
                        <span className="text-xs text-[#64748b]">{docMap.night_vfr_evidence.file_name}</span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => openModal('night_vfr_evidence')}
                    disabled={!canModify}
                    className="inline-flex items-center gap-2 rounded-full border border-[#1a4fd6]/30 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[#1a4fd6] hover:bg-[#1a4fd6]/10 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>
                      {docMap.night_vfr_evidence ? 'cloud_sync' : 'cloud_upload'}
                    </span>
                    {docMap.night_vfr_evidence ? 'Replace Evidence' : 'Upload Evidence'}
                  </button>
                </div>
              </div>
            ) : nightVfrRating === false ? (
              <div className="rounded-lg border-l-4 border-slate-300 bg-[#f0f6ff] px-4 py-3 text-sm text-[#4b6390]">
                Night VFR Evidence - Not required
              </div>
            ) : (
              <div className="rounded-lg border border-[#152d5a]/10 bg-[#f0f6ff] px-4 py-3 text-sm text-[#4b6390]">
                Please indicate your Night VFR status to complete your profile.
              </div>
            )}
          </div>

          {nightVfrError && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">error</span>
              {nightVfrError}
            </p>
          )}
        </section>

      </div>
    </>
  )
}
