'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import type {
  UserDocument,
  DocumentType,
  VerificationStatus,
  VerificationEvent,
  RequestKind,
} from '@/lib/supabase/types'
import { uploadVerificationDocument } from '@/app/actions/upload'
import { getDocumentSignedUrl } from '@/app/actions/documents'
import { submitForReview, sendCustomerReply } from '@/app/actions/verification'
import { fmtTimestamp, fmtDate } from '@/lib/utils/format'

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
  file:          File | null
  expiryDate:    string
  licenceType:   string   // pilot_licence
  licenceNumber: string   // pilot_licence
  medicalClass:  string   // medical_certificate
  idType:        string   // photo_id
}

const EMPTY_FORM: UploadForm = {
  file:          null,
  expiryDate:    '',
  licenceType:   '',
  licenceNumber: '',
  medicalClass:  '',
  idType:        '',
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
    expiryDate:    existingDoc?.expiry_date    ?? '',
    licenceType:   existingDoc?.licence_type   ?? '',
    licenceNumber: existingDoc?.licence_number ?? '',
    medicalClass:  existingDoc?.medical_class  ?? '',
    idType:        existingDoc?.id_type        ?? '',
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
    if (docType === 'pilot_licence'       && !form.licenceType)  return 'Please select a licence type.'
    if (docType === 'medical_certificate' && !form.medicalClass) return 'Please select a medical class.'
    if (docType === 'medical_certificate' && !form.expiryDate)   return 'Expiry date is required for Medical Certificate.'
    if (docType === 'photo_id'            && !form.idType)       return 'Please select an ID type.'
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
      if (form.expiryDate)    fd.append('expiryDate',    form.expiryDate)
      if (form.licenceType)   fd.append('licenceType',   form.licenceType)
      if (form.licenceNumber) fd.append('licenceNumber', form.licenceNumber)
      if (form.medicalClass)  fd.append('medicalClass',  form.medicalClass)
      if (form.idType)        fd.append('idType',        form.idType)
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
                options={['RPL — Recreational', 'PPL — Private', 'CPL — Commercial', 'Other']}
                value={
                  form.licenceType === 'RPL' ? 'RPL — Recreational'
                  : form.licenceType === 'PPL' ? 'PPL — Private'
                  : form.licenceType === 'CPL' ? 'CPL — Commercial'
                  : form.licenceType
                }
                onChange={v => set('licenceType', v.split(' — ')[0] || v)}
                cols={2}
              />
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-bold text-oz-subtle">
                  Licence Number{' '}
                  <span className="text-white/20 normal-case font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.licenceNumber}
                  onChange={e => set('licenceNumber', e.target.value)}
                  placeholder="e.g. P12345678"
                  className="w-full bg-white/[0.03] border border-white/8 focus:border-oz-blue/40 focus:outline-none text-sm text-white/80 rounded-xl px-4 py-2.5 placeholder:text-white/20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-bold text-oz-subtle">
                  Expiry Date{' '}
                  <span className="text-white/20 normal-case font-normal">(optional)</span>
                </label>
                <input
                  type="date"
                  value={form.expiryDate}
                  onChange={e => set('expiryDate', e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/8 focus:border-oz-blue/40 focus:outline-none text-sm text-white/80 rounded-xl px-4 py-2.5"
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
                <label className="text-[10px] uppercase tracking-widest font-bold text-oz-subtle">
                  Expiry Date{' '}
                  <span className="text-white/20 normal-case font-normal">(optional)</span>
                </label>
                <input
                  type="date"
                  value={form.expiryDate}
                  onChange={e => set('expiryDate', e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/8 focus:border-oz-blue/40 focus:outline-none text-sm text-white/80 rounded-xl px-4 py-2.5"
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
}: {
  def:       DocDef
  doc:       UserDocument | undefined
  docState:  DocUiState
  idx:       number
  canModify: boolean
  onOpen:    () => void
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

// ─── Verification thread ───────────────────────────────────────────────────────

function VerificationThread({ events }: { events: VerificationEvent[] }) {
  if (events.length === 0) return null

  return (
    <section className="space-y-3">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-oz-blue">
        Verification Thread
      </h3>
      <div className="space-y-2">
        {events.map(ev => {
          const isCustomer = ev.actor_role === 'customer'
          const isSys      = ev.actor_role === 'system'
          const when       = fmtTimestamp(ev.created_at)

          const iconColor = isCustomer
            ? 'text-blue-300/50'
            : ev.event_type === 'on_hold'    ? 'text-amber-400'
            : ev.event_type === 'approved'   ? 'text-green-400'
            : ev.event_type === 'rejected'   ? 'text-red-400'
            : 'text-slate-500'

          const icon = isCustomer
            ? 'person'
            : ev.event_type === 'on_hold'     ? 'pause_circle'
            : ev.event_type === 'approved'    ? 'verified_user'
            : ev.event_type === 'rejected'    ? 'person_off'
            : ev.event_type === 'submitted' || ev.event_type === 'resubmitted'
              ? 'upload_file'
            : 'chat'

          return (
            <div
              key={ev.id}
              className={`flex gap-3 px-4 py-3 rounded-xl border transition-colors ${
                isCustomer
                  ? 'bg-blue-500/5 border-blue-300/10 flex-row-reverse'
                  : isSys
                  ? 'bg-white/[0.02] border-white/5'
                  : ev.event_type === 'on_hold'
                  ? 'bg-amber-500/5 border-amber-500/15'
                  : 'bg-[#0c121e]/60 border-white/5'
              }`}
            >
              <span
                className={`material-symbols-outlined text-base flex-shrink-0 mt-0.5 ${iconColor}`}
                style={{ fontVariationSettings: "'wght' 300" }}
              >
                {icon}
              </span>
              <div className={`flex-1 min-w-0 ${isCustomer ? 'text-right' : ''}`}>
                <div className={`flex items-center gap-2 flex-wrap ${isCustomer ? 'justify-end' : ''}`}>
                  <p className="text-xs font-semibold text-white/80">{ev.title}</p>
                  <span className="text-[9px] text-oz-subtle font-mono">{when}</span>
                </div>
                {ev.body && (
                  <p className="text-xs text-oz-muted leading-relaxed mt-0.5">{ev.body}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Customer reply panel ─────────────────────────────────────────────────────

function CustomerReplyPanel() {
  const router = useRouter()
  const [reply,   setReply]   = useState('')
  const [sending, setSending] = useState(false)
  const [error,   setError]   = useState('')
  const [sent,    setSent]    = useState(false)

  async function handleSend() {
    if (!reply.trim()) { setError('Please write a reply before sending.'); return }
    setSending(true)
    setError('')
    try {
      await sendCustomerReply(reply.trim())
      setSent(true)
      setReply('')
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send reply.'
      setError(msg.startsWith('VALIDATION:') ? msg.replace('VALIDATION:', '').trim() : msg)
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-blue-500/5 border border-blue-300/15 rounded-xl">
        <span className="material-symbols-outlined text-blue-300 text-sm" style={{ fontVariationSettings: "'wght' 300" }}>check_circle</span>
        <p className="text-xs text-blue-200/80">Reply sent. Our team will review and get back to you.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <label className="text-[10px] text-oz-blue uppercase tracking-widest font-bold block">
        Your Reply
      </label>
      <textarea
        value={reply}
        onChange={e => setReply(e.target.value)}
        disabled={sending}
        rows={4}
        className="w-full bg-[#0c121e]/80 border border-white/8 focus:border-oz-blue/40 focus:ring-0 focus:outline-none text-sm text-[#e2e2e6] rounded-xl p-4 resize-none transition-all disabled:opacity-50 placeholder:text-oz-subtle"
        placeholder="Write your reply or provide the requested information…"
      />
      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm">error</span>
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <button
          onClick={handleSend}
          disabled={sending || !reply.trim()}
          className="flex items-center gap-2 px-6 py-2.5 bg-oz-blue/20 border border-oz-blue/30 text-oz-blue hover:bg-oz-blue hover:text-oz-deep rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {sending && <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>}
          Send Reply
        </button>
      </div>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  user:      User
  documents: UserDocument[]
  status:    VerificationStatus
  events:    VerificationEvent[]
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DocumentsPanel({ user: _user, documents, status, events }: Props) {
  const router = useRouter()
  const [modalDocType, setModalDocType] = useState<DocumentType | null>(null)
  const [submitting,   setSubmitting]   = useState(false)
  const [submitError,  setSubmitError]  = useState('')

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

  const isPending  = status === 'pending_review'
  const isVerified = status === 'verified'
  const isOnHold   = status === 'on_hold'

  // Uploads are locked only while under active review
  const canModify = !isPending

  // Find latest on_hold event
  const latestHoldEvent = events.find(e => e.event_type === 'on_hold')
  const requestKind: RequestKind = latestHoldEvent?.request_kind ?? 'document_request'
  const isDocRequest = requestKind === 'document_request'

  // Document counts
  const uploadedCount  = DOC_TYPES.filter(def => docStates[def.type] !== 'missing').length
  const missingCount   = DOC_TYPES.filter(def => docStates[def.type] === 'missing').length
  const rejectedCount  = DOC_TYPES.filter(def => docStates[def.type] === 'rejected').length
  const expiredDocs    = DOC_TYPES.filter(def => docStates[def.type] === 'expired')
  const expiredMedical = docStates['medical_certificate'] === 'expired'

  // Medical expiry check — required before submission
  const medicalDoc         = docMap['medical_certificate']
  const medicalNeedsExpiry = !!medicalDoc && !medicalDoc.expiry_date

  // canSubmit logic — all 3 docs present, medical not expired, medical has expiry date
  const allDocsPresent    = uploadedCount === 3
  const medicalBlocked    = expiredMedical || medicalNeedsExpiry
  const canSubmitWithDocs =
    allDocsPresent &&
    !medicalBlocked &&
    ['not_started', 'rejected', 'on_hold'].includes(status)
  const canSubmitClarify = isOnHold && !isDocRequest
  const canSubmit        = canSubmitWithDocs || canSubmitClarify

  // Top-banner helper text — covers every possible state
  const submitHelperText = (() => {
    if (isVerified)             return 'Documents verified'
    if (isPending)              return 'Documents submitted for review'
    if (expiredMedical)         return 'Medical certificate expired'
    if (expiredDocs.length > 0) return `Document expired — upload required`
    if (rejectedCount > 0)      return 'Action required'
    if (medicalNeedsExpiry)     return 'Medical expiry date required'
    if (missingCount > 0)       return `${missingCount} document${missingCount > 1 ? 's' : ''} still required`
    return 'Ready to submit for review'
  })()

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

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError('')
    try {
      await submitForReview(canSubmitClarify && !canSubmitWithDocs)
      router.refresh()
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed. Please try again.')
    } finally {
      setSubmitting(false)
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

      <div className="space-y-10 animate-fade-in flex-1 max-w-4xl">

        {/* ── Page header ── */}
        <section className="flex flex-col gap-4">
          <div>
            <span className="text-[10px] uppercase tracking-[0.3em] text-oz-blue/70 font-semibold">
              OZRentAPlane · Pilot Portal
            </span>
            <h2 className="text-3xl md:text-4xl font-serif italic tracking-tight text-white mt-1">
              Verification Documents
            </h2>
            <p className="text-oz-muted font-sans font-light mt-2">
              Upload your required pilot credentials so the team can review and approve your aircraft access.
            </p>
          </div>

          {/* Requirements info banner */}
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

        {/* ── Expired document alert (page-level) ── */}
        {expiredDocs.length > 0 && !isPending && (
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

        {/* ── On-hold admin request block ── */}
        {isOnHold && latestHoldEvent && (
          <section className={`border rounded-[1.25rem] p-6 space-y-5 ${
            isDocRequest
              ? 'bg-amber-500/5 border-amber-500/20'
              : 'bg-blue-500/5 border-blue-300/15'
          }`}>
            <div className="flex items-center gap-3">
              <span
                className={`material-symbols-outlined text-xl ${isDocRequest ? 'text-amber-400' : 'text-blue-300'}`}
                style={{ fontVariationSettings: "'wght' 300" }}
              >
                {isDocRequest ? 'upload_file' : 'chat'}
              </span>
              <div>
                <p className={`text-[10px] font-bold uppercase tracking-widest ${isDocRequest ? 'text-amber-400' : 'text-blue-300'}`}>
                  {isDocRequest ? 'Documents Required' : 'Response Requested'}
                </p>
                <p className="text-[9px] text-oz-subtle">{fmtTimestamp(latestHoldEvent.created_at)}</p>
              </div>
            </div>

            {latestHoldEvent.body && (
              <p className="text-sm text-[#e2e2e6] leading-relaxed">{latestHoldEvent.body}</p>
            )}

            {isDocRequest ? (
              <p className="text-xs text-oz-muted leading-relaxed">
                Please upload or replace the required documents below, then click{' '}
                <span className="text-white/70 font-medium">Resubmit for Review</span> when ready.
              </p>
            ) : (
              <div className="space-y-4 pt-1">
                <p className="text-xs text-oz-muted leading-relaxed">
                  Reply below with your response. Once you are ready for us to continue your review,
                  click <span className="text-white/70 font-medium">Resubmit for Review</span>.
                </p>
                <CustomerReplyPanel />
              </div>
            )}
          </section>
        )}

        {/* ── Status / submit panel — always visible ── */}
        <section className={`backdrop-blur-2xl border rounded-[1.25rem] p-6 shadow-[0_8px_24px_rgba(0,0,0,0.2)] ${
          isVerified
            ? 'bg-green-500/5 border-green-500/15'
            : isPending
            ? 'bg-[#0c121e]/60 border-oz-blue/10'
            : expiredMedical || (expiredDocs.length > 0 && !isPending)
            ? 'bg-red-500/5 border-red-500/15'
            : rejectedCount > 0
            ? 'bg-red-500/5 border-red-500/10'
            : 'bg-[#0c121e]/60 border-white/5'
        }`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">

            {/* Left: progress dots + status text + body */}
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-3 mb-3">
                {/* Per-document dots */}
                <div className="flex items-center gap-1.5">
                  {DOC_TYPES.map(def => (
                    <div
                      key={def.type}
                      className={`w-2 h-2 rounded-full transition-all ${
                        docStates[def.type] === 'missing'        ? 'bg-white/15'
                        : docStates[def.type] === 'verified'     ? 'bg-green-400'
                        : docStates[def.type] === 'pending_review' ? 'bg-oz-blue animate-pulse'
                        : docStates[def.type] === 'rejected' || docStates[def.type] === 'expired'
                          ? 'bg-red-400'
                        : 'bg-oz-blue'
                      }`}
                    />
                  ))}
                </div>

                {/* Helper text label */}
                <span className={`text-xs font-semibold uppercase tracking-widest ${
                  isVerified                            ? 'text-green-400'
                  : isPending                           ? 'text-oz-blue'
                  : expiredMedical || expiredDocs.length > 0 || rejectedCount > 0
                                                        ? 'text-red-400'
                  : medicalNeedsExpiry                  ? 'text-amber-400'
                  : canSubmit                           ? 'text-oz-blue'
                  :                                       'text-white/40'
                }`}>
                  {submitHelperText}
                </span>
              </div>

              {/* Body text */}
              <p className="text-sm text-oz-muted font-light leading-relaxed max-w-sm">
                {isVerified
                  ? 'Your credentials have been verified. You are cleared for fleet access. You may replace any document below to upload a renewed copy.'
                  : isPending
                  ? "Your documents have been sent to the OZRentAPlane team. We'll notify you when your access is approved or if anything needs to be updated."
                  : isOnHold && !isDocRequest
                  ? 'Reply to the request above, then resubmit when you are ready for re-review.'
                  : isOnHold && canSubmit
                  ? 'Documents updated. Resubmit below for re-review.'
                  : expiredMedical
                  ? 'Your medical certificate has expired. Please upload a current certificate to continue.'
                  : expiredDocs.length > 0
                  ? 'One or more documents have expired. Please upload updated copies.'
                  : rejectedCount > 0
                  ? 'One or more documents require attention. Check the cards below for details.'
                  : canSubmit
                  ? 'All documents are in place. Submit below to begin the official review.'
                  : medicalNeedsExpiry
                  ? 'Replace your Medical Certificate and include an expiry date to continue.'
                  : 'Upload all three required documents to unlock submission.'}
              </p>

              {submitError && (
                <p className="text-xs text-red-400 flex items-center gap-1.5 mt-2">
                  <span className="material-symbols-outlined text-sm">error</span>
                  {submitError}
                </p>
              )}
            </div>

            {/* Right: submit button (hidden when pending or verified) */}
            {!isPending && !isVerified && (
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className={`flex-shrink-0 px-8 py-4 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] transition-all flex items-center gap-3 shadow-md ${
                  canSubmit && !submitting
                    ? 'bg-oz-blue text-oz-deep hover:bg-white hover:scale-[1.02] hover:shadow-xl'
                    : 'bg-white/5 text-white/25 cursor-not-allowed border border-white/5'
                }`}
              >
                {submitting && (
                  <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                )}
                {isOnHold ? 'Resubmit for Review' : 'Submit for Review'}
              </button>
            )}
          </div>
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
            />
          ))}
        </section>

        {/* ── Verification thread ── */}
        {events.length > 0 && (
          <VerificationThread events={events} />
        )}

      </div>
    </>
  )
}
