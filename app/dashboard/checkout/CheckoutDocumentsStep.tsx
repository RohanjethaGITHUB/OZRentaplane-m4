'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { uploadVerificationDocument } from '@/app/actions/upload'
import { acceptTermsAndConditions } from '@/app/actions/terms'
import { getDocumentSignedUrl, saveCheckoutRedCardDetails } from '@/app/actions/documents'
import { saveNightVfrRatingFromReadiness } from '@/app/actions/booking-readiness'
import { saveLastFlightDate } from '@/app/actions/verification'
import CalendarDateField from '@/components/CalendarDateField'
import { TERMS_MODAL_TITLE, TERMS_MODAL_SUBTITLE, TERMS_NOTICE, TERMS_LAST_UPDATED, TERMS_SECTIONS, TERMS_END_TEXT } from '@/lib/checkout-terms-content'
import type { DocumentType, UserDocument } from '@/lib/supabase/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type DocUiState = 'missing' | 'under_review' | 'approved' | 'rejected' | 'expired'
type SectionStatus = 'not_started' | 'in_progress' | 'complete'

type DocDef = { type: DocumentType; label: string; icon: string; desc: string }
type UploadForm = {
  file: File | null; licenceType: string; licenceNumber: string
  instrumentRating: boolean | null; medicalClass: string
  issueDate: string; expiryDate: string; idType: string; documentNumber: string
}

export type CheckoutDocumentGateState = {
  documents: UserDocument[]
  termsAcceptedAt: string | null
  termsVersion: string | null
  lastFlightDate: string | null
  hasNightVfrRating: boolean | null
  pilotLicenceDoc: UserDocument | null
}

const EMPTY_FORM: UploadForm = {
  file: null, licenceType: '', licenceNumber: '', instrumentRating: null,
  medicalClass: '', issueDate: '', expiryDate: '', idType: '', documentNumber: '',
}
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_SIZE = 10 * 1024 * 1024

const DOC_TYPES: DocDef[] = [
  { type: 'pilot_licence',       label: 'Pilot Licence',       icon: 'badge',             desc: 'Recreational, Private, or Commercial Pilot Licence' },
  { type: 'medical_certificate', label: 'Medical Certificate', icon: 'health_and_safety', desc: 'Current aviation medical certificate' },
  { type: 'photo_id',            label: 'Photo ID',            icon: 'id_card',           desc: 'Passport, driver licence, or other government-issued photo ID' },
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
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

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
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f0f6ff] text-[13px] font-semibold text-[#152d5a]">
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
                  {block.items.map((item, itemIdx) => (
                    <li key={itemIdx}>{item}</li>
                  ))}
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

const DOC_CHIP: Record<DocUiState, { label: string; cls: string }> = {
  missing:      { label: 'Not Uploaded',    cls: 'text-[#94a3b8] border border-[#152d5a]/10 bg-white' },
  under_review: { label: 'Awaiting Review', cls: 'text-amber-600 bg-amber-500/10 border border-amber-500/20' },
  approved:     { label: 'Approved',        cls: 'text-green-600 bg-green-500/10 border border-green-500/20' },
  rejected:     { label: 'Rejected',        cls: 'text-red-600 bg-red-500/10 border border-red-500/20' },
  expired:      { label: 'Expired',         cls: 'text-red-600 bg-red-500/10 border border-red-500/20' },
}

function DocChip({ state }: { state: DocUiState }) {
  const { label, cls } = DOC_CHIP[state]
  return <span className={`inline-flex items-center text-[13px] font-bold uppercase px-2 py-0.5 rounded-full tracking-widest whitespace-nowrap ${cls}`}>{label}</span>
}

const STATUS_BADGE: Record<SectionStatus, { label: string; cls: string }> = {
  not_started: { label: 'Not Started', cls: 'text-[#94a3b8] border border-[#152d5a]/10 bg-white' },
  in_progress: { label: 'In Progress', cls: 'text-amber-600 bg-amber-500/10 border border-amber-500/20' },
  complete:    { label: 'Complete',    cls: 'text-green-600 bg-green-500/10 border border-green-500/20' },
}

function SectionBadge({ status }: { status: SectionStatus }) {
  const { label, cls } = STATUS_BADGE[status]
  return <span className={`text-[13px] font-bold uppercase px-2.5 py-1 rounded-full tracking-widest whitespace-nowrap ${cls}`}>{label}</span>
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

function UploadModal({ docType, existingDoc, onClose, onSuccess }: {
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
    const file = e.target.files?.[0]; setFileError('')
    if (!file) { set('file', null); return }
    if (!ALLOWED_TYPES.includes(file.type)) { setFileError('Only PDF, JPG, JPEG, and PNG files are allowed.'); return }
    if (file.size > MAX_SIZE) { setFileError('File must be 10 MB or smaller.'); return }
    set('file', file)
  }

  function validate(): string {
    if (!form.file) return 'Please select a file to upload.'
    if (docType === 'pilot_licence') {
      if (!form.licenceType) return 'Please select a licence type.'
      if (form.instrumentRating === null) return 'Please confirm your Instrument Rating status.'
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
      const fd = new FormData()
      fd.append('file', form.file!); fd.append('docType', docType)
      if (form.licenceType) fd.append('licenceType', form.licenceType)
      if (form.instrumentRating !== null) fd.append('instrumentRating', String(form.instrumentRating))
      if (form.licenceNumber) fd.append('licenceNumber', form.licenceNumber)
      if (form.medicalClass) fd.append('medicalClass', form.medicalClass)
      if (form.issueDate) fd.append('issueDate', form.issueDate)
      if (form.expiryDate) fd.append('expiryDate', form.expiryDate)
      if (form.idType) fd.append('idType', form.idType)
      if (form.documentNumber) fd.append('documentNumber', form.documentNumber)
      await uploadVerificationDocument(fd)
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
              <p className="text-[13px] text-[#94a3b8] font-medium uppercase tracking-wide">Upload</p>
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
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange}
              className="block w-full text-sm text-[#4b6390] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[#f0f6ff] file:text-[#1a4fd6] hover:file:bg-[#dbeafe] cursor-pointer" />
            <p className="text-[13px] text-[#94a3b8] mt-1">PDF, JPG, PNG — max 10 MB</p>
            {fileError && <p className="text-[13px] text-red-500 mt-1 flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">error</span>{fileError}</p>}
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
            <div>
              <label className="block text-[13px] font-semibold text-[#152d5a] mb-2">Instrument Rating <span className="text-red-500">*</span></label>
              <div className="flex gap-3">
                {([true, false] as const).map(val => (
                  <button key={String(val)} type="button" onClick={() => set('instrumentRating', val)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${form.instrumentRating === val ? 'bg-[#dbeafe] border-[#93c5fd] text-[#152d5a]' : 'bg-white border-[#152d5a]/15 text-[#4b6390]'}`}>
                    {val ? 'Yes' : 'No'}
                  </button>
                ))}
              </div>
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
                <CalendarDateField
                  value={form.issueDate}
                  onChange={val => set('issueDate', val)}
                  minYear={currentYear - 10}
                  maxYear={currentYear}
                  maxDate={today}
                  placeholder="Select date"
                  className="w-full h-10 bg-white border border-[#152d5a]/15 rounded-xl px-3 text-sm text-[#152d5a] focus:outline-none focus:border-blue-500/60 text-left flex items-center justify-between"
                />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-[#152d5a] mb-2">Expiry date <span className="text-red-500">*</span></label>
                <CalendarDateField
                  value={form.expiryDate}
                  onChange={val => set('expiryDate', val)}
                  minYear={currentYear}
                  maxYear={currentYear + 10}
                  minDate={today}
                  placeholder="Select date"
                  className="w-full h-10 bg-white border border-[#152d5a]/15 rounded-xl px-3 text-sm text-[#152d5a] focus:outline-none focus:border-blue-500/60 text-left flex items-center justify-between"
                />
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

// ─── Mini doc card (inside Section 1) ────────────────────────────────────────

function MiniDocCard({ def, doc, docState, onOpen }: {
  def: DocDef; doc: UserDocument | undefined; docState: DocUiState; onOpen: () => void
}) {
  const [viewLoading, setViewLoading] = useState(false)
  const [viewError, setViewError] = useState('')

  async function handleView() {
    setViewLoading(true); setViewError('')
    try { const url = await getDocumentSignedUrl(def.type); window.open(url, '_blank', 'noopener,noreferrer') }
    catch { setViewError('Could not open document.') }
    finally { setViewLoading(false) }
  }

  const borderCls: Record<DocUiState, string> = {
    missing:      'border-[#152d5a]/20',
    under_review: 'border-amber-300',
    approved:     'border-green-300',
    rejected:     'border-red-300',
    expired:      'border-red-300',
  }
  const iconCls: Record<DocUiState, string> = {
    missing:      'bg-[#f0f6ff] border-[#152d5a]/10 text-[#94a3b8]',
    under_review: 'bg-amber-500/10 border-amber-500/20 text-amber-500',
    approved:     'bg-green-500/10 border-green-500/20 text-green-600',
    rejected:     'bg-red-500/10 border-red-500/20 text-red-500',
    expired:      'bg-red-500/10 border-red-500/20 text-red-500',
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
          <p className="text-[13px] text-[#4b6390] leading-relaxed">{def.desc}</p>
        </div>
      </div>

      {doc && docState !== 'missing' && (
        <div className="text-[13px] text-[#64748b] flex items-center gap-1.5 bg-[#f0f4ff] rounded-lg px-2.5 py-1.5 min-w-0">
          <span className="material-symbols-outlined text-[13px] flex-shrink-0" style={{ fontVariationSettings: "'wght' 300" }}>draft</span>
          <span className="truncate min-w-0 flex-1">{doc.file_name}</span>
        </div>
      )}

      {docState === 'under_review' && (
        <p className="text-[13px] text-amber-600 flex items-center gap-1">
          <span className="material-symbols-outlined text-[13px]">hourglass_top</span>
          Awaiting admin review — we&apos;ll notify you once approved
        </p>
      )}
      {docState === 'rejected' && doc?.review_notes && (
        <p className="text-[13px] text-red-600 bg-red-500/5 border border-red-500/10 rounded-lg px-2.5 py-1.5 flex items-start gap-1">
          <span className="material-symbols-outlined text-[13px] flex-shrink-0 mt-0.5">warning</span>{doc.review_notes}
        </p>
      )}
      {viewError && <p className="text-[13px] text-red-500 flex items-center gap-1"><span className="material-symbols-outlined text-[13px]">error</span>{viewError}</p>}

      <div className="flex items-center gap-2 mt-auto flex-wrap">
        {doc && docState !== 'missing' && (
          <button onClick={handleView} disabled={viewLoading}
            className="flex items-center gap-1.5 border border-[#152d5a]/10 hover:border-[#152d5a]/25 text-[#64748b] hover:text-[#152d5a] px-3 py-2 rounded-xl text-[12px] font-semibold transition-all disabled:opacity-40">
            {viewLoading
              ? <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
              : <span className="material-symbols-outlined text-[14px]">open_in_new</span>}
            View
          </button>
        )}
        <button onClick={onOpen}
          className={`flex items-center gap-1.5 border text-[12px] font-semibold px-3 py-2 rounded-xl transition-all ml-auto ${
            docState === 'missing'
              ? 'border-[#1a4fd6]/40 hover:border-[#1a4fd6] text-[#1a4fd6] bg-[#f0f4ff] hover:bg-[#1a4fd6]/10'
              : 'border-[#152d5a]/15 hover:border-[#152d5a]/30 text-[#4b6390] hover:text-[#152d5a] bg-white'
          }`}>
          <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'wght' 300" }}>
            {docState === 'missing' ? 'cloud_upload' : 'cloud_sync'}
          </span>
          {docState === 'missing' ? 'Upload' : 'Replace'}
        </button>
      </div>
      <p className="text-[11px] text-[#94a3b8]">PDF, JPG, PNG — max 10MB</p>
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ num, title, desc, status, error, children }: {
  num: number; title: string; desc: string; status: SectionStatus; error?: string; children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  // Auto-open when a validation error is set
  useEffect(() => {
    if (error) setOpen(true)
  }, [error])
  return (
    <div className="bg-white border border-[#152d5a]/15 rounded-2xl overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start px-4 py-4 md:px-6 md:py-5 hover:bg-[#f8fbff] transition-colors text-left"
      >
        {/* Mobile: two-row layout. Desktop: single row */}
        <div className="flex-1 min-w-0">
          {/* Top row: circle + badge + chevron */}
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-[#1a4fd6] flex items-center justify-center flex-shrink-0">
              <span className="text-white text-[12px] font-bold">{num}</span>
            </div>
            <div className="flex-1" />
            <SectionBadge status={status} />
            <span className={`material-symbols-outlined text-[#4b6390] text-[20px] transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`}>expand_less</span>
          </div>
          {/* Bottom row: title + desc */}
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

// ─── Progress strip ───────────────────────────────────────────────────────────

function ProgressStrip({ completedCount, total }: { completedCount: number; total: number }) {
  const pct = Math.round((completedCount / total) * 100)
  const steps = [
    { label: 'Documents', num: 1 },
    { label: 'Flight & Red Card', num: 2 },
    { label: 'Night VFR', num: 3 },
    { label: 'Terms & Submit', num: 4 },
  ]
  return (
    <div className="bg-[#152d5a] rounded-2xl px-6 py-5">
      <div className="flex items-center gap-5 mb-4">
        {/* Donut */}
        <div className="relative w-24 h-24 flex-shrink-0">
          <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f59e0b" strokeWidth="3"
              strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-white text-[16px] font-bold leading-none">{pct}%</span>
            <span className="text-white/50 text-[11px] mt-0.5">Complete</span>
          </div>
        </div>
        {/* Text */}
        <div>
          <p className="text-white text-[16px] font-semibold leading-snug">Complete all {total} steps to submit your documents</p>
          <p className="text-white/60 text-[13px] mt-1">Our team will review and confirm your checkout request.</p>
        </div>
      </div>
      {/* Step strip */}
      <div className="flex items-center gap-0">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center flex-1 min-w-0">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-full text-[11px] font-semibold transition-all flex-shrink-0 ${
              i < completedCount
                ? 'bg-green-500/20 text-green-300'
                : i === completedCount
                ? 'bg-[#f59e0b]/20 text-[#f59e0b] ring-1 ring-[#f59e0b]/40'
                : 'text-white/40'
            }`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                i < completedCount ? 'bg-green-500/40 text-green-200' : i === completedCount ? 'bg-[#f59e0b]/30 text-[#f59e0b]' : 'bg-white/10 text-white/40'
              }`}>
                {i < completedCount
                  ? <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                  : s.num
                }
              </div>
              <span className="hidden sm:inline truncate">{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-1 ${i < completedCount ? 'bg-green-500/30' : 'bg-white/15'}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CheckoutDocumentsStep({
  checkoutGate, checkoutGateLoading, checkoutGateError, onRefresh, onContinue, onBackToStep1, onNoteChange,
}: {
  checkoutGate: CheckoutDocumentGateState | null
  checkoutGateLoading: boolean
  checkoutGateError: string | null
  onRefresh: () => void
  onContinue: () => void
  onBackToStep1: () => void
  onNoteChange: (note: string) => void
}) {
  const [modalDocType, setModalDocType] = useState<DocumentType | null>(null)
  const [termsChecked, setTermsChecked] = useState(false)
  const [termsAccepting, setTermsAccepting] = useState(false)
  const [termsError, setTermsError] = useState<string | null>(null)
  const [flightDate, setFlightDate] = useState(checkoutGate?.lastFlightDate ?? '')
  const [flightDateSaving, setFlightDateSaving] = useState(false)
  const [flightDateSaved, setFlightDateSaved] = useState(false)
  const [flightDateError, setFlightDateError] = useState<string | null>(null)
  const flightDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false)
  const termsScrollRef = useRef<HTMLDivElement>(null)
  const [nightVfr, setNightVfr] = useState<boolean | null>(checkoutGate?.hasNightVfrRating ?? null)
  // Sync nightVfr when gate updates (e.g. after silent refresh)
  useEffect(() => {
    if (checkoutGate?.hasNightVfrRating !== undefined) {
      setNightVfr(checkoutGate.hasNightVfrRating)
    }
  }, [checkoutGate?.hasNightVfrRating])
  const [nightVfrSaving, setNightVfrSaving] = useState(false)
  const [nightVfrError, setNightVfrError] = useState<string | null>(null)
  const pilotDoc = checkoutGate?.pilotLicenceDoc ?? null
  const [redCardMonth, setRedCardMonth] = useState<number | null>(pilotDoc?.red_card_expiry_month ?? null)
  const [redCardYear, setRedCardYear] = useState<number | null>(pilotDoc?.red_card_expiry_year ?? null)
  const [redCardSaving, setRedCardSaving] = useState(false)
  const [redCardSaved, setRedCardSaved] = useState(false)
  const [redCardError, setRedCardError] = useState<string | null>(null)
  const [customerNote, setCustomerNote] = useState('')
  // Section refs for scroll-to-validation
  const section1Ref = useRef<HTMLDivElement>(null)
  const section2Ref = useRef<HTMLDivElement>(null)
  const section3Ref = useRef<HTMLDivElement>(null)
  const section4Ref = useRef<HTMLDivElement>(null)

  // Validation errors per section
  const [validationErrors, setValidationErrors] = useState<{
    s1?: string; s2?: string; s3?: string; s4?: string
  }>({})

  const currentYear = new Date().getFullYear()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
  const redCardYearOptions = Array.from({ length: 11 }, (_, i) => currentYear + i)

  const docMap = useMemo(() => {
    const map: Partial<Record<DocumentType, UserDocument>> = {}
    for (const doc of checkoutGate?.documents ?? []) {
      if (!map[doc.document_type]) map[doc.document_type] = doc
    }
    return map
  }, [checkoutGate])

  const termsAccepted = Boolean(checkoutGate?.termsAcceptedAt)
  const hasPilotDoc = Boolean(docMap['pilot_licence'])

  const docChecks = DOC_TYPES.map(def => ({
    def, doc: docMap[def.type], state: getDocUiState(docMap[def.type]),
  }))
  const allDocsApproved   = docChecks.every(d => d.state === 'approved')
  const allDocsUploaded   = docChecks.every(d => d.state !== 'missing' && d.state !== 'rejected' && d.state !== 'expired')
  const docsGateReady     = allDocsUploaded && termsAccepted
  const docsFullyApproved = allDocsApproved && termsAccepted

  function handleTermsScroll() {
    const el = termsScrollRef.current
    if (!el) return
    setIsScrolledToBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 10)
  }

  // Section statuses
  const s1: SectionStatus = allDocsUploaded ? 'complete' : docChecks.some(d => d.state !== 'missing') ? 'in_progress' : 'not_started'
  const s2: SectionStatus = (
    flightDate.trim() !== '' && (!hasPilotDoc || (redCardMonth !== null && redCardYear !== null))
  ) ? 'complete' : (flightDate || redCardMonth || redCardYear) ? 'in_progress' : 'not_started'
  const s3: SectionStatus = nightVfr !== null ? 'complete' : 'not_started'
  const s4: SectionStatus = termsAccepted ? 'complete' : 'not_started'
  const completedCount = [s1, s2, s3, s4].filter(s => s === 'complete').length

  function validateAndScroll(): boolean {
    const errors: { s1?: string; s2?: string; s3?: string; s4?: string } = {}

    // Section 1: all 3 docs must be uploaded
    if (!allDocsUploaded) {
      const missing = docChecks.filter(d => d.state === 'missing').map(d => d.def.label)
      const rejected = docChecks.filter(d => d.state === 'rejected' || d.state === 'expired').map(d => d.def.label)
      if (missing.length > 0) errors.s1 = `Please upload: ${missing.join(', ')}`
      else if (rejected.length > 0) errors.s1 = `Please replace rejected/expired: ${rejected.join(', ')}`
    }

    // Section 2: flight date required
    const missingS2: string[] = []
    if (!flightDate.trim()) missingS2.push('Flight recency date is required')
    if (hasPilotDoc && (!redCardMonth || !redCardYear)) missingS2.push('Red Card (ASIC) expiry month and year are required')
    if (missingS2.length > 0) errors.s2 = missingS2.join(' · ')

    // Section 3: night VFR answer required
    if (nightVfr === null) {
      errors.s3 = 'Please declare your Night VFR endorsement status'
    }

    // Section 4: terms required
    if (!termsAccepted && !termsChecked) {
      errors.s4 = 'Please read and accept the terms and conditions'
    }
    if (!termsAccepted && !isScrolledToBottom) {
      errors.s4 = errors.s4 ? errors.s4 : 'Please scroll through the full terms before accepting'
    }

    setValidationErrors(errors)

    // Scroll to first error
    const firstErrorRef =
      errors.s1 ? section1Ref :
      errors.s2 ? section2Ref :
      errors.s3 ? section3Ref :
      errors.s4 ? section4Ref : null

    if (firstErrorRef?.current) {
      firstErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return false
    }

    return true
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function persistFlightDate(val: string) {
    if (!val.trim()) return
    setFlightDateSaving(true); setFlightDateError(null); setFlightDateSaved(false)
    try {
      const result = await saveLastFlightDate(val.trim()) as { error?: string }
      if (result?.error) { setFlightDateError(result.error); return }
      setFlightDateSaved(true); setTimeout(() => setFlightDateSaved(false), 2500); onRefresh()
    } catch (e: unknown) { setFlightDateError(e instanceof Error ? e.message : 'Could not save.') }
    finally { setFlightDateSaving(false) }
  }

  function handleFlightDateChange(val: string) {
    setFlightDate(val); setFlightDateSaved(false); setFlightDateError(null)
    setValidationErrors(prev => ({ ...prev, s2: undefined }))
    if (flightDebounceRef.current) clearTimeout(flightDebounceRef.current)
    flightDebounceRef.current = setTimeout(() => void persistFlightDate(val), 700)
  }

  async function handleNightVfrChange(val: boolean) {
    if (nightVfrSaving || nightVfr === val) return
    const prev = nightVfr; setNightVfr(val); setValidationErrors(prevErrors => ({ ...prevErrors, s3: undefined })); setNightVfrSaving(true); setNightVfrError(null)
    try { await saveNightVfrRatingFromReadiness({ hasNightVfrRating: val }); onRefresh() }
    catch (e: unknown) { setNightVfr(prev); setNightVfrError(e instanceof Error ? e.message : 'Could not save.') }
    finally { setNightVfrSaving(false) }
  }

  async function handleRedCardChange(month: number | null, year: number | null) {
    if (!month || !year) return
    setRedCardSaving(true); setRedCardError(null); setRedCardSaved(false)
    try {
      await saveCheckoutRedCardDetails({ redCardExpiry: `${year}-${String(month).padStart(2, '0')}` })
      setRedCardSaved(true); setTimeout(() => setRedCardSaved(false), 2500); onRefresh()
    } catch (e: unknown) { setRedCardError(e instanceof Error ? e.message : 'Could not save.') }
    finally { setRedCardSaving(false) }
  }

  async function handleAcceptTerms() {
    if (!termsChecked) { setTermsError('Please check the box first.'); return }
    setTermsAccepting(true); setTermsError(null)
    try {
      const result = await acceptTermsAndConditions()
      if (!result.ok) { setTermsError(result.error); return }
      // Silent refresh — don't show loading spinner
      onRefresh()
    } catch {
      setTermsError('Could not save terms acceptance. Please try again.')
    }
    finally { setTermsAccepting(false) }
  }

  // ── Loading / error states ──────────────────────────────────────────────────

  if (checkoutGateLoading) {
    return (
      <div className="rounded-2xl border border-[#152d5a]/10 bg-white px-5 py-6 flex items-center gap-3">
        <span className="material-symbols-outlined text-[#1a4fd6] animate-spin">progress_activity</span>
        <span className="text-[14px] text-[#4b6390]">Loading your document status…</span>
      </div>
    )
  }

  if (checkoutGateError) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-5 py-4 space-y-2">
        <p className="text-[14px] font-semibold text-red-600">Could not load document status</p>
        <p className="text-[13px] text-red-500">{checkoutGateError}</p>
        <button onClick={onRefresh} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-600 text-[13px] font-semibold">
          <span className="material-symbols-outlined text-[14px]">refresh</span>Retry
        </button>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Progress strip */}
      <ProgressStrip completedCount={completedCount} total={4} />

      <div className="bg-[#dce3ed] rounded-2xl p-3 space-y-3">
        {/* Section 1: Documents */}
        <div ref={section1Ref} className="scroll-mt-4">
          <Section num={1} title="Upload Identity & Licence Documents"
            desc="Upload clear, current copies of your pilot licence and any other required documents."
            status={s1}
            error={validationErrors.s1}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
              {docChecks.map(({ def, doc, state }) => (
                <MiniDocCard key={def.type} def={def} doc={doc} docState={state} onOpen={() => setModalDocType(def.type)} />
              ))}
            </div>
            <div className="mt-3 flex items-start gap-2 bg-[#f8fbff] border border-[#152d5a]/08 rounded-xl px-4 py-3">
              <span className="material-symbols-outlined text-[#1a4fd6] text-[16px] flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'wght' 300" }}>info</span>
              <p className="text-[13px] text-[#4b6390]">Ensure all documents are current, valid and clearly legible. Blurred or cropped documents may cause delays.</p>
            </div>
          </Section>
        </div>

        {/* Section 2: Flight Recency + Red Card */}
        <div ref={section2Ref} className="scroll-mt-4">
          <Section num={2} title="Provide Flight Recency & Red Card Details"
            desc="Tell us about your recent flying experience and provide your Red Card (ASIC) details."
            status={s2}
            error={validationErrors.s2}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
              {/* Flight recency */}
              <div className="bg-[#f8fbff] border border-[#152d5a]/08 rounded-xl p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-[#f0f6ff] border border-[#152d5a]/10 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-[#1a4fd6] text-[15px]" style={{ fontVariationSettings: "'wght' 300" }}>flight_land</span>
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-[#152d5a]">Pilot Flight Recency</p>
                    <p className="text-[13px] text-[#4b6390]">When was your last flight review?</p>
                  </div>
                </div>
                <label className="block text-[12px] font-bold text-[#64748b] uppercase tracking-widest mb-1.5">Last flight review date</label>
                <CalendarDateField
                  value={flightDate}
                  onChange={handleFlightDateChange}
                  minYear={currentYear - 20}
                  maxYear={currentYear}
                  maxDate={today}
                  placeholder="Select date"
                  className="w-full h-10 bg-white border border-[#152d5a]/15 rounded-xl px-3 text-sm text-[#152d5a] focus:outline-none focus:border-blue-500/60 text-left flex items-center justify-between"
                />
                <div className="mt-1.5 flex items-center gap-1.5 h-4">
                  {flightDateSaving && <span className="material-symbols-outlined text-[#1a4fd6] text-[13px] animate-spin">progress_activity</span>}
                  {flightDateSaved && !flightDateSaving && <span className="text-[12px] text-green-600 flex items-center gap-0.5"><span className="material-symbols-outlined text-[13px]">check_circle</span>Saved</span>}
                  {flightDateError && <span className="text-[12px] text-red-500 flex items-center gap-0.5"><span className="material-symbols-outlined text-[13px]">error</span>{flightDateError}</span>}
                </div>
              </div>

              {/* Red Card */}
              <div className="bg-[#f8fbff] border border-[#152d5a]/08 rounded-xl p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-[#f0f6ff] border border-[#152d5a]/10 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-[#1a4fd6] text-[15px]" style={{ fontVariationSettings: "'wght' 300" }}>badge</span>
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-[#152d5a]">Red Card (ASIC)</p>
                    <p className="text-[13px] text-[#4b6390]">Enter your ASIC card expiry date.</p>
                  </div>
                </div>
                {!hasPilotDoc ? (
                  <p className="text-[13px] text-[#94a3b8] bg-white border border-[#152d5a]/08 rounded-xl px-3 py-2">Upload your Pilot Licence first.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[12px] font-bold text-[#64748b] uppercase tracking-widest mb-1.5">Month</label>
                        <select value={redCardMonth ?? ''} onChange={e => { const m = e.target.value ? Number(e.target.value) : null; setRedCardMonth(m); setRedCardSaved(false); setValidationErrors(prev => ({ ...prev, s2: undefined })); void handleRedCardChange(m, redCardYear) }}
                          className="w-full h-10 border border-[#152d5a]/15 rounded-xl px-2.5 text-sm text-[#152d5a] bg-white focus:outline-none">
                          <option value="">Select month</option>
                          {RED_CARD_MONTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[12px] font-bold text-[#64748b] uppercase tracking-widest mb-1.5">Year</label>
                        <select value={redCardYear ?? ''} onChange={e => { const y = e.target.value ? Number(e.target.value) : null; setRedCardYear(y); setRedCardSaved(false); setValidationErrors(prev => ({ ...prev, s2: undefined })); void handleRedCardChange(redCardMonth, y) }}
                          className="w-full h-10 border border-[#152d5a]/15 rounded-xl px-2.5 text-sm text-[#152d5a] bg-white focus:outline-none">
                          <option value="">Select year</option>
                          {redCardYearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 h-4">
                      {redCardSaving && <span className="material-symbols-outlined text-[#1a4fd6] text-[13px] animate-spin">progress_activity</span>}
                      {redCardSaved && !redCardSaving && <span className="text-[12px] text-green-600 flex items-center gap-0.5"><span className="material-symbols-outlined text-[13px]">check_circle</span>Saved</span>}
                      {redCardError && <span className="text-[12px] text-red-500 flex items-center gap-0.5"><span className="material-symbols-outlined text-[13px]">error</span>{redCardError}</span>}
                    </div>
                  </>
                )}
              </div>
            </div>
          </Section>
        </div>

        {/* Section 3: Night VFR */}
        <div ref={section3Ref} className="scroll-mt-4">
          <Section num={3} title="Declare Night VFR Endorsement"
            desc="Let us know if you hold a current Night VFR endorsement."
            status={s3}
            error={validationErrors.s3}>
            <div className="mt-3 space-y-3">
              <p className="text-[13px] text-[#4b6390]">Do you hold a Night VFR endorsement?</p>
              <div className="grid grid-cols-2 gap-3">
                {([true, false] as const).map(val => (
                  <button key={String(val)} type="button" onClick={() => void handleNightVfrChange(val)} disabled={nightVfrSaving}
                    className={`py-3.5 px-4 rounded-xl border text-left transition-all disabled:opacity-60 ${
                      nightVfr === val
                        ? 'bg-[#1a4fd6]/5 border-[#1a4fd6]/40 text-[#152d5a]'
                        : 'bg-white border-[#152d5a]/10 text-[#4b6390] hover:border-[#152d5a]/20'
                    }`}>
                    <div className="flex items-center gap-2.5">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${nightVfr === val ? 'border-[#1a4fd6] bg-[#1a4fd6]' : 'border-[#cbd5e1]'}`}>
                        {nightVfr === val && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div>
                        <p className="text-[14px] font-semibold">{val ? 'Yes' : 'No'}</p>
                        <p className="text-[13px] mt-0.5 text-[#4b6390]">{val ? 'I hold a Night VFR endorsement' : 'I do not hold a Night VFR endorsement'}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              {nightVfrError && <p className="text-[13px] text-red-500 flex items-center gap-1"><span className="material-symbols-outlined text-[13px]">error</span>{nightVfrError}</p>}
              {nightVfr !== null && (
                <div className="bg-[#f0f6ff] border border-[#1a4fd6]/15 rounded-xl px-4 py-3 flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-[#1a4fd6] text-[16px] flex-shrink-0 mt-0.5">info</span>
                  <p className="text-[13px] text-[#4b6390] leading-relaxed">
                    This reflects your selection from Step 1. To change it,{' '}
                    <button
                      type="button"
                      onClick={onBackToStep1}
                      className="text-[#1a4fd6] underline underline-offset-2 font-medium hover:text-[#1540b8] transition-colors"
                    >
                      go back to Step 1
                    </button>
                    {' '}and update your Night VFR rating — it will sync here automatically.
                  </p>
                </div>
              )}
              {nightVfr === true && (
                <div className="bg-[#f8fbff] border border-[#152d5a]/08 rounded-xl p-4 mt-2">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-xl bg-[#f0f6ff] border border-[#152d5a]/10 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-[#1a4fd6] text-[15px]" style={{ fontVariationSettings: "'wght' 300" }}>nightlight</span>
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-[#152d5a]">Night VFR Evidence</p>
                      <p className="text-[13px] text-[#4b6390] mt-0.5">Upload supporting evidence for your endorsement.</p>
                    </div>
                  </div>
                  {docMap['night_vfr_evidence'] && (
                    <div className="mb-3"><DocChip state={getDocUiState(docMap['night_vfr_evidence'])} /></div>
                  )}
                  <button onClick={() => setModalDocType('night_vfr_evidence')}
                    className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#1a4fd6]/30 hover:border-[#1a4fd6]/60 rounded-xl py-3 text-[#1a4fd6] hover:bg-[#1a4fd6]/5 transition-all">
                    <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'wght' 200" }}>{docMap['night_vfr_evidence'] ? 'cloud_sync' : 'cloud_upload'}</span>
                    <span className="text-[13px] font-semibold">{docMap['night_vfr_evidence'] ? 'Replace Evidence' : 'Upload Evidence'}</span>
                  </button>
                </div>
              )}
            </div>
          </Section>
        </div>

        {/* Section 4: Terms */}
        <div ref={section4Ref} className="scroll-mt-4">
        <Section num={4} title="Accept Terms & Conditions"
          desc="Review and accept our terms to complete your document submission."
          status={s4}
          error={validationErrors.s4}>
          <div className="mt-3 space-y-3">
            {termsAccepted ? (
              <div className="flex items-center gap-3 bg-green-500/5 border border-green-500/20 rounded-xl px-4 py-3">
                <span className="material-symbols-outlined text-green-600 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                <div>
                  <p className="text-[13px] font-semibold text-green-700">Terms accepted</p>
                  <p className="text-[13px] text-green-600">Accepted on {fmtDate(checkoutGate?.termsAcceptedAt)}</p>
                </div>
              </div>
            ) : (
              <>
                {/* Scrollable terms box */}
                <div
                  ref={termsScrollRef}
                  onScroll={handleTermsScroll}
                  className="h-[220px] overflow-y-auto border border-[#152d5a]/10 rounded-xl p-4 bg-[#f8fbff] text-sm text-[#152d5a]"
                >
                  <TermsContent />
                </div>

                {!isScrolledToBottom && (
                  <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                    <span className="material-symbols-outlined text-amber-600 text-[14px] animate-bounce">keyboard_arrow_down</span>
                    <p className="text-[13px] text-amber-700 font-medium">Please scroll through the full terms above to continue</p>
                  </div>
                )}

                <label className="flex items-start gap-3 rounded-xl border border-[#152d5a]/10 bg-white px-4 py-3 cursor-pointer hover:border-[#1a4fd6]/30 transition-colors">
                  <input
                    type="checkbox"
                    checked={termsChecked}
                    onChange={e => { setTermsChecked(e.target.checked); setTermsError(null) }}
                    disabled={!isScrolledToBottom}
                    className="mt-0.5 w-4 h-4 rounded border-[#152d5a]/20 text-[#1a4fd6] flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                  <span className={`text-[13px] leading-relaxed ${isScrolledToBottom ? 'text-[#152d5a]' : 'text-[#94a3b8]'}`}>
                    I have read and agree to the terms and conditions
                  </span>
                </label>

                {termsError && (
                  <p className="text-[13px] text-red-600 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px]">error</span>
                    {termsError}
                  </p>
                )}
              </>
            )}

          </div>
        </Section>
        </div>

          {/* Notes for admin */}
          <div ref={section4Ref} className="bg-white border border-[#152d5a]/15 rounded-2xl overflow-hidden shadow-sm">
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
                onChange={e => { setCustomerNote(e.target.value); onNoteChange(e.target.value) }}
                placeholder="e.g. I have prior experience in a similar aircraft, or I have a time constraint on this date…"
                rows={4}
                className="w-full border border-[#152d5a]/15 rounded-xl px-4 py-3 text-[14px] text-[#152d5a] bg-[#f8fbff] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#1a4fd6]/40 resize-none transition-colors"
              />
              <p className="text-[12px] text-[#94a3b8] mt-1.5">This message will be visible to the OZ Rent A Plane team only.</p>
            </div>
          </div>
      </div>

      {/* Submit CTA — below all sections and notes */}
      <div className="space-y-3">
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
              onContinue()
            } else {
              void handleAcceptTerms()
            }
          }}
          disabled={docsGateReady ? (termsAccepting) : (termsAccepting || !termsChecked || !isScrolledToBottom)}
          className={`w-full py-4 rounded-xl text-[15px] font-semibold flex items-center justify-center gap-2 transition-all ${
            docsGateReady
              ? 'bg-[#1a4fd6] hover:bg-[#1540b8] text-white shadow-[0_4px_14px_rgba(26,79,214,0.25)]'
              : 'bg-[#152d5a]/80 hover:bg-[#152d5a] text-white disabled:opacity-40'
          }`}>
          {termsAccepting
            ? <><span className="material-symbols-outlined text-[15px] animate-spin">progress_activity</span><span>Saving…</span></>
            : docsGateReady
            ? <><span>Continue to Review</span><span className="material-symbols-outlined text-[15px]">arrow_forward</span></>
            : <><span>Submit for Instructor Review</span><span className="material-symbols-outlined text-[15px]">lock</span></>
          }
        </button>
      </div>

      {/* Security note */}
      <p className="text-[13px] text-[#94a3b8] text-center flex items-center justify-center gap-1.5">
        <span className="material-symbols-outlined text-[13px]">verified_user</span>
        Your documents are secure and will only be used for verification purposes.
      </p>

      {/* Upload modal */}
      {modalDocType && (
        <UploadModal docType={modalDocType} existingDoc={docMap[modalDocType]}
          onClose={() => setModalDocType(null)}
          onSuccess={() => { setModalDocType(null); onRefresh() }} />
      )}
    </div>
  )
}
