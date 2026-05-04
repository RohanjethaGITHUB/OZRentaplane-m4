'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import type {
  UserDocument,
  DocumentType,
  VerificationStatus,
} from '@/lib/supabase/types'
import { uploadVerificationDocument } from '@/app/actions/upload'
import { getDocumentSignedUrl } from '@/app/actions/documents'
import { saveLastFlightDate } from '@/app/actions/verification'
import { fmtDate } from '@/lib/utils/format'
import { validateFlightReviewDate, getFlightReviewCutoff } from '@/lib/utils/flight-review'

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

// ─── UI state per document ─────────────────────────────────────────────────────
// Derived from doc.status + profile verification_status + expiry_date.

type DocUiState =
  | 'missing'
  | 'uploaded'
  | 'pending_review'
  | 'verified'
  | 'rejected'
  | 'expired'

function getDocUiState(
  doc: UserDocument | undefined,
  verificationStatus: VerificationStatus,
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
  if (doc.status === 'approved') return 'verified'
  if (verificationStatus === 'pending_review') return 'pending_review'
  return 'uploaded'
}

// ─── Status chip ──────────────────────────────────────────────────────────────

const CHIP_CONFIG: Record<DocUiState, { label: string; color: string; bg: string }> = {
  missing:        { label: 'Required',        color: 'text-white/30',  bg: 'border border-white/10' },
  uploaded:       { label: 'Uploaded',        color: 'text-oz-blue',   bg: 'bg-oz-blue/10' },
  pending_review: { label: 'Pending Review',  color: 'text-amber-400', bg: 'bg-amber-500/10' },
  verified:       { label: 'Verified',        color: 'text-green-400', bg: 'bg-green-500/10' },
  rejected:       { label: 'Action Required', color: 'text-red-400',   bg: 'bg-red-500/10' },
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

// ─── Upload modal form state ──────────────────────────────────────────────────

type UploadForm = {
  file:              File | null
  licenceType:       string    // pilot_licence
  nightVfrRating:    boolean | null  // pilot_licence — null = unanswered
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
  nightVfrRating:    null,
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
  const def = DOC_TYPES.find(d => d.type === docType)!

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
      if (form.nightVfrRating === null)     return 'Please confirm your Night VFR rating status.'
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
      if (form.nightVfrRating !== null)         fd.append('nightVfrRating',    String(form.nightVfrRating))
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
        <label className="text-[10px] uppercase tracking-widest font-bold text-oz-subtle">{label}</label>
        <div className={`grid gap-2 ${cols === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all text-left ${
                value === opt
                  ? 'bg-oz-blue/20 border-oz-blue/50 text-oz-blue'
                  : 'bg-white/[0.03] border-white/10 text-white/50 hover:border-white/20 hover:text-white/70'
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0c1220] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-oz-blue/10 border border-oz-blue/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-oz-blue text-base" style={{ fontVariationSettings: "'wght' 300" }}>
                {def.icon}
              </span>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-oz-blue/70 font-semibold">
                {existingDoc ? 'Replace' : 'Upload'}
              </p>
              <p className="text-sm font-semibold text-white">{def.label}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors p-1">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">

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
              <div className="pt-1 border-t border-white/5">
                <p className="text-[10px] uppercase tracking-widest font-bold text-oz-subtle mb-4">Additional Ratings</p>
                <div className="space-y-4">
                  {/* Night VFR */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-oz-subtle">
                      Night VFR Rating
                      <span className="text-red-400/80 text-[8px] normal-case font-normal">Required</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {([true, false] as const).map(val => (
                        <button
                          key={String(val)}
                          type="button"
                          onClick={() => set('nightVfrRating', val)}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all text-left ${
                            form.nightVfrRating === val
                              ? 'bg-oz-blue/20 border-oz-blue/50 text-oz-blue'
                              : 'bg-white/[0.03] border-white/10 text-white/50 hover:border-white/20 hover:text-white/70'
                          }`}
                        >
                          {val ? 'Yes' : 'No'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* IFR / Instrument Rating */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-oz-subtle">
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
                              ? 'bg-oz-blue/20 border-oz-blue/50 text-oz-blue'
                              : 'bg-white/[0.03] border-white/10 text-white/50 hover:border-white/20 hover:text-white/70'
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
                <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-oz-subtle">
                  Pilot Licence Number / ARN
                  <span className="text-red-400/80 text-[8px] normal-case font-normal">Required</span>
                </label>
                <p className="text-[10px] text-white/25">Your ARN is your CASA-issued aviation reference number.</p>
                <input
                  type="text"
                  value={form.licenceNumber}
                  onChange={e => set('licenceNumber', e.target.value)}
                  placeholder="e.g. 123456"
                  className="w-full bg-white/[0.03] border border-white/8 focus:border-oz-blue/40 focus:outline-none text-sm text-white/80 rounded-xl px-4 py-2.5 placeholder:text-white/20"
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-oz-subtle">
                    Date of Issue
                    <span className="text-red-400/80 text-[8px] normal-case font-normal">Required</span>
                  </label>
                  <input
                    type="date"
                    value={form.issueDate}
                    onChange={e => set('issueDate', e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/8 focus:border-oz-blue/40 focus:outline-none text-sm text-white/80 rounded-xl px-4 py-2.5"
                  />
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-oz-subtle">
                    Expiry Date
                    <span className="text-red-400/80 text-[8px] normal-case font-normal">Required</span>
                  </label>
                  <input
                    type="date"
                    value={form.expiryDate}
                    onChange={e => set('expiryDate', e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/8 focus:border-oz-blue/40 focus:outline-none text-sm text-white/80 rounded-xl px-4 py-2.5"
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
                <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-oz-subtle">
                  Document Number
                  <span className="text-red-400/80 text-[8px] normal-case font-normal">Required</span>
                </label>
                <input
                  type="text"
                  value={form.documentNumber}
                  onChange={e => set('documentNumber', e.target.value)}
                  placeholder="Passport or licence number"
                  className="w-full bg-white/[0.03] border border-white/8 focus:border-oz-blue/40 focus:outline-none text-sm text-white/80 rounded-xl px-4 py-2.5 placeholder:text-white/20"
                />
              </div>
            </>
          )}

          {/* File picker */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest font-bold text-oz-subtle">
              Document File
            </label>
            <label
              className={`flex items-center gap-3 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                form.file
                  ? 'border-oz-blue/30 bg-oz-blue/5'
                  : 'border-white/10 hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.04]'
              }`}
            >
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileChange} />
              <span
                className={`material-symbols-outlined text-xl flex-shrink-0 ${form.file ? 'text-oz-blue' : 'text-white/30'}`}
                style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
              >
                {form.file ? 'draft' : 'cloud_upload'}
              </span>
              <div className="flex-1 min-w-0">
                {form.file ? (
                  <>
                    <p className="text-sm text-white/80 truncate">{form.file.name}</p>
                    <p className="text-xs text-oz-subtle">{(form.file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-white/50">Choose a file</p>
                    <p className="text-xs text-oz-subtle">{ALLOWED_EXT} — max 10 MB</p>
                  </>
                )}
              </div>
              {form.file && (
                <button
                  type="button"
                  onClick={e => { e.preventDefault(); set('file', null) }}
                  className="text-white/30 hover:text-white/60 transition-colors flex-shrink-0"
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
            <p className="text-xs text-red-400 bg-red-500/8 border border-red-500/15 rounded-xl px-4 py-3 flex items-start gap-2">
              <span className="material-symbols-outlined text-sm flex-shrink-0 mt-0.5">error</span>
              {formError}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/5 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white/70 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="flex items-center gap-2 px-6 py-2.5 bg-oz-blue/20 border border-oz-blue/30 text-oz-blue hover:bg-oz-blue hover:text-oz-deep rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {uploading && (
              <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
            )}
            {uploading ? 'Uploading…' : existingDoc ? 'Replace Document' : 'Upload Document'}
          </button>
        </div>

      </div>
    </div>
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
  hasNightVfrRating,
  hasInstrumentRating,
}: {
  def:                  DocDef
  doc:                  UserDocument | undefined
  docState:             DocUiState
  idx:                  number
  canModify:            boolean
  onOpen:               () => void
  hasNightVfrRating?:   boolean | null
  hasInstrumentRating?: boolean | null
}) {
  const [viewLoading, setViewLoading] = useState(false)
  const [viewError,   setViewError]   = useState('')

  async function handleView() {
    setViewLoading(true)
    setViewError('')
    try {
      const url = await getDocumentSignedUrl(def.type)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      setViewError('Could not open document. Please try again.')
    } finally {
      setViewLoading(false)
    }
  }

  const iconBg: Record<DocUiState, string> = {
    missing:        'bg-white/5      border-white/10      text-white/40',
    uploaded:       'bg-oz-blue/10   border-oz-blue/20    text-oz-blue',
    pending_review: 'bg-amber-500/10 border-amber-500/20  text-amber-400',
    verified:       'bg-green-500/10 border-green-500/20  text-green-400',
    rejected:       'bg-red-500/10   border-red-500/20    text-red-400',
    expired:        'bg-red-500/10   border-red-500/20    text-red-400',
  }

  const cardBorder: Record<DocUiState, string> = {
    missing:        'border-white/5      hover:bg-[#0c121e]/80',
    uploaded:       'border-oz-blue/15',
    pending_review: 'border-amber-500/15',
    verified:       'border-green-500/15',
    rejected:       'border-red-500/15',
    expired:        'border-red-500/15',
  }

  const showView    = !!doc && ['uploaded', 'pending_review', 'verified'].includes(docState)
  const showUpload  = docState === 'missing'
  const showReplace = ['uploaded', 'verified', 'rejected', 'expired'].includes(docState)

  // Label for upload/replace button
  const actionLabel =
    docState === 'missing'   ? 'Upload' :
    docState === 'rejected'  ? 'Upload Replacement' :
    docState === 'expired'   ? 'Upload Updated' :
    'Replace'

  const actionIcon  =
    docState === 'missing' ? 'cloud_upload' : 'cloud_sync'

  return (
    <div
      className={`relative bg-[#0c121e]/60 backdrop-blur-2xl border rounded-[1.25rem] p-6 shadow-[0_8px_24px_rgba(0,0,0,0.3)] transition-all ${cardBorder[docState]}`}
    >
      {/* Step number */}
      <span className="absolute top-6 right-6 text-[10px] font-bold uppercase tracking-widest text-white/15">
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
              <h3 className="text-base text-white font-semibold">{def.label}</h3>
              <StatusChip state={docState} />
            </div>

            {/* Description */}
            <p className="text-sm text-oz-muted font-light">{def.desc}</p>

            {/* Metadata row — file name, dates, classification */}
            {doc && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                {/* File name */}
                <span className="text-xs text-white/50 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>draft</span>
                  {doc.file_name}
                </span>

                {/* Upload date */}
                {doc.uploaded_at && (
                  <span className="text-xs text-white/40 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>calendar_today</span>
                    Uploaded {fmtDate(doc.uploaded_at)}
                  </span>
                )}

                {/* Expiry date */}
                {doc.expiry_date && (
                  <span className={`text-xs flex items-center gap-1 font-medium ${docState === 'expired' ? 'text-red-400/80' : 'text-white/50'}`}>
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>event</span>
                    {docState === 'expired' ? 'Expired' : 'Expires'} {fmtDate(doc.expiry_date)}
                  </span>
                )}

                {/* Classification chips */}
                {doc.licence_type && (
                  <span className="text-xs text-oz-blue/60 bg-oz-blue/8 px-2 py-0.5 rounded-full">{doc.licence_type} Licence</span>
                )}
                {doc.licence_number && (
                  <span className="text-xs text-white/40">#{doc.licence_number}</span>
                )}
                {doc.medical_class && (
                  <span className="text-xs text-oz-blue/60 bg-oz-blue/8 px-2 py-0.5 rounded-full">{doc.medical_class}</span>
                )}
                {doc.id_type && (
                  <span className="text-xs text-oz-blue/60 bg-oz-blue/8 px-2 py-0.5 rounded-full">{doc.id_type}</span>
                )}

                {/* Pilot ratings (pilot_licence only) */}
                {def.type === 'pilot_licence' && (
                  <>
                    <span className="text-xs text-white/40 flex items-center gap-1">
                      Night VFR:
                      <span className={hasNightVfrRating === true ? 'text-green-400' : hasNightVfrRating === false ? 'text-white/60' : 'text-white/25 italic'}>
                        {hasNightVfrRating === true ? 'Yes' : hasNightVfrRating === false ? 'No' : 'Not provided'}
                      </span>
                    </span>
                    <span className="text-xs text-white/40 flex items-center gap-1">
                      Instrument Rating:
                      <span className={hasInstrumentRating === true ? 'text-green-400' : hasInstrumentRating === false ? 'text-white/60' : 'text-white/25 italic'}>
                        {hasInstrumentRating === true ? 'Yes' : hasInstrumentRating === false ? 'No' : 'Not provided'}
                      </span>
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Rejection reason */}
            {docState === 'rejected' && doc?.review_notes && (
              <p className="text-xs text-red-400/80 mt-3 bg-red-500/8 border border-red-500/15 px-3 py-2 rounded-lg inline-flex items-start gap-1.5 max-w-sm">
                <span className="material-symbols-outlined text-sm flex-shrink-0 mt-0.5">warning</span>
                {doc.review_notes}
              </p>
            )}

            {/* Expired notice */}
            {docState === 'expired' && (
              <p className="text-xs text-red-400/80 mt-3 bg-red-500/8 border border-red-500/15 px-3 py-2 rounded-lg inline-flex items-start gap-1.5 max-w-sm">
                <span className="material-symbols-outlined text-sm flex-shrink-0 mt-0.5">warning</span>
                Expired {doc?.expiry_date ? fmtDate(doc.expiry_date) : ''}. Please upload an updated document.
              </p>
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
              className="flex items-center gap-1.5 border border-white/12 hover:border-white/25 text-white/40 hover:text-white/70 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-40"
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
                  ? 'border-oz-blue/40 hover:border-oz-blue text-oz-blue hover:bg-oz-blue/5'
                  : 'border-white/15 hover:border-white/30 hover:bg-white/5 text-white/60 hover:text-white'
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
  lastFlightDate:       string | null
  hasNightVfrRating:    boolean | null
  hasInstrumentRating:  boolean | null
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DocumentsPanel({ user: _user, documents, lastFlightDate, hasNightVfrRating, hasInstrumentRating }: Props) {
  // status is derived locally — not needed from parent since we no longer gate on verification_status
  const status: VerificationStatus = 'not_started'   // used only by getDocUiState for chip display
  const router = useRouter()
  const [modalDocType, setModalDocType] = useState<DocumentType | null>(null)

  // ── Last flight date field state ─────────────────────────────────────────────
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
  const [flightDate,      setFlightDate]      = useState(lastFlightDate ?? '')
  const [flightDateSaving, setFlightDateSaving] = useState(false)
  const [flightDateError,  setFlightDateError]  = useState('')
  const [flightDateSaved,  setFlightDateSaved]  = useState(false)
  const flightDateChanged = flightDate.trim() !== (lastFlightDate ?? '')

  async function handleSaveFlightDate() {
    const err = validateFlightReviewDate(flightDate.trim())
    if (err) { setFlightDateError(err); return }
    setFlightDateSaving(true)
    setFlightDateError('')
    setFlightDateSaved(false)
    try {
      await saveLastFlightDate(flightDate.trim())
      setFlightDateSaved(true)
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save.'
      setFlightDateError(msg.replace('VALIDATION:', '').trim())
    } finally {
      setFlightDateSaving(false)
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const docMap = useMemo(
    () => Object.fromEntries(documents.map(d => [d.document_type, d])) as Partial<Record<DocumentType, UserDocument>>,
    [documents],
  )

  const docStates = useMemo(
    () => Object.fromEntries(
      DOC_TYPES.map(def => [def.type, getDocUiState(docMap[def.type], status)])
    ) as Record<DocumentType, DocUiState>,
    [docMap, status],
  )

  // Documents can always be replaced
  const canModify = true

  const expiredDocs    = DOC_TYPES.filter(def => docStates[def.type] === 'expired')
  const expiredMedical = docStates['medical_certificate'] === 'expired'
  const medicalDoc     = docMap['medical_certificate']

  // ── Handlers ───────────────────────────────────────────────────────────────

  function openModal(docType: DocumentType) {
    setModalDocType(docType)
  }

  function closeModal() {
    setModalDocType(null)
  }

  function handleUploadSuccess() {
    closeModal()
    router.refresh()
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

      <div className="space-y-10 animate-fade-in flex-1 max-w-4xl mx-auto">

        {/* ── Page header ── */}
        <section className="flex flex-col gap-4">
          <div>
            <span className="text-[10px] uppercase tracking-[0.3em] text-oz-blue/70 font-semibold">
              OZRentAPlane · Pilot Portal
            </span>
            <h2 className="text-3xl md:text-4xl font-serif italic tracking-tight text-white mt-1">
              My Documents
            </h2>
            <p className="text-oz-muted font-sans font-light mt-2">
              Manage the documents and flight recency details used for your checkout request. If anything needs updating, replace the document below.
            </p>
          </div>

          {/* Format info */}
          <div className="flex items-start gap-4 bg-oz-blue/5 border border-oz-blue/15 rounded-xl px-5 py-4">
            <span
              className="material-symbols-outlined text-oz-blue/60 text-xl flex-shrink-0 mt-0.5"
              style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
            >
              info
            </span>
            <div className="flex flex-col sm:flex-row sm:items-center sm:divide-x sm:divide-white/10 gap-2 sm:gap-0">
              <p className="text-sm text-oz-muted font-light sm:pr-5">
                <span className="text-white/70 font-medium">Accepted formats:</span>{' '}
                {ALLOWED_EXT}
              </p>
              <p className="text-sm text-oz-muted font-light sm:pl-5">
                <span className="text-white/70 font-medium">Max size:</span>{' '}
                10 MB per file
              </p>
            </div>
          </div>
        </section>

        {/* ── Pilot Flight Recency ── */}
        <section className="bg-[#0c121e]/60 border border-white/[0.07] rounded-[1.25rem] p-6">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-9 h-9 rounded-xl bg-oz-blue/10 border border-oz-blue/20 flex items-center justify-center flex-shrink-0">
              <span
                className="material-symbols-outlined text-oz-blue text-base"
                style={{ fontVariationSettings: "'wght' 300" }}
              >
                flight_land
              </span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Pilot Flight Recency</h3>
              <p className="text-xs text-oz-muted mt-0.5">
                This helps the operations team assess your checkout readiness.
              </p>
            </div>
            {lastFlightDate && !flightDateChanged && (
              <span className="ml-auto flex-shrink-0 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full tracking-widest text-green-400 bg-green-500/10">
                Saved
              </span>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">
              When was your last flight review?
              <span className="ml-1.5 text-red-400/80 font-normal normal-case">Required for checkout</span>
            </label>
            <div className="flex gap-3">
              <input
                type="date"
                value={flightDate}
                min={getFlightReviewCutoff()}
                max={today}
                onChange={e => { setFlightDate(e.target.value); setFlightDateSaved(false); setFlightDateError('') }}
                className="flex-1 bg-white/[0.03] border border-white/[0.08] focus:border-oz-blue/40 focus:outline-none text-sm text-white/80 rounded-xl px-4 py-2.5"
              />
              <button
                type="button"
                onClick={handleSaveFlightDate}
                disabled={flightDateSaving || !flightDate.trim() || !flightDateChanged}
                className="flex items-center gap-2 px-5 py-2.5 bg-oz-blue/15 border border-oz-blue/30 text-oz-blue hover:bg-oz-blue hover:text-oz-deep rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {flightDateSaving && (
                  <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                )}
                {flightDateSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

          {flightDateSaved && !flightDateError && (
            <p className="mt-2 text-xs text-green-400 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              Flight review date saved.
            </p>
          )}
          {flightDateError && (
            <p className="mt-2 text-xs text-red-400 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">error</span>
              {flightDateError}
            </p>
          )}
        </section>

        {/* ── Expired document alert (page-level) ── */}
        {expiredDocs.length > 0 && (
          <section className="bg-red-500/5 border border-red-500/20 rounded-[1.25rem] px-6 py-5 flex items-start gap-4">
            <span
              className="material-symbols-outlined text-red-400 text-xl flex-shrink-0 mt-0.5"
              style={{ fontVariationSettings: "'wght' 300" }}
            >
              warning
            </span>
            <div className="space-y-1">
              {expiredMedical && medicalDoc?.expiry_date && (
                <p className="text-sm text-red-300 font-medium leading-relaxed">
                  Medical certificate expired{' '}
                  <span className="text-red-400">{fmtDate(medicalDoc.expiry_date)}</span>.
                  Please upload an updated certificate before requesting a booking.
                </p>
              )}
              {expiredDocs.filter(d => d.type !== 'medical_certificate').map(d => (
                <p key={d.type} className="text-sm text-red-300/80 leading-relaxed">
                  {d.label} has expired. Please upload an updated document.
                </p>
              ))}
            </div>
          </section>
        )}

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
              hasNightVfrRating={def.type === 'pilot_licence' ? hasNightVfrRating : undefined}
              hasInstrumentRating={def.type === 'pilot_licence' ? hasInstrumentRating : undefined}
            />
          ))}
        </section>

      </div>
    </>
  )
}
