'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { UserDocument, DocumentType } from '@/lib/supabase/types'
import type { BookingReadinessItem } from '@/lib/booking-readiness'
import type { normalizeActiveCheckoutTerms } from '@/lib/checkout-terms'
import { uploadVerificationDocument } from '@/app/actions/upload'
import { getDocumentSignedUrl } from '@/app/actions/documents'
import { saveLastFlightDate } from '@/app/actions/verification'
import { acceptCurrentBookingTermsFromReadiness, saveNightVfrRatingFromReadiness } from '@/app/actions/booking-readiness'
import { validateFlightReviewDate, getFlightReviewCutoff } from '@/lib/utils/flight-review'
import DocumentViewerModal from '@/components/ui/DocumentViewerModal'
import type { DocumentFile } from '@/components/ui/DocumentViewerModal'
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

type Props = {
  docItems: BookingReadinessItem[]
  documents: UserDocument[]
  lastFlightDate: string | null
  hasNightVfrRating: boolean | null
  flightRecencyComplete: boolean
  termsAccepted: boolean
  activeTerms: ReturnType<typeof normalizeActiveCheckoutTerms>
  documentsAwaitingReviewCount: number
  missingDocumentsCount: number
}

type DocCardDef = { type: DocumentType; label: string; icon: string }
const DOC_DEFS: DocCardDef[] = [
  { type: 'pilot_licence', label: 'Pilot Licence', icon: 'badge' },
  { type: 'medical_certificate', label: 'Medical Certificate', icon: 'health_and_safety' },
  { type: 'photo_id', label: 'Photo ID', icon: 'id_card' },
  { type: 'night_vfr_evidence', label: 'Night VFR', icon: 'nightlight' },
]

const MAX_DOC_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']

function pickBestDocumentForType(docs: UserDocument[], type: DocumentType, todayIso: string): UserDocument | undefined {
  const candidates = docs.filter((d) => d.document_type === type)
  if (candidates.length === 0) return undefined
  function score(d: UserDocument): number {
    const rejected = d.status === 'rejected'
    const expired = !!(d.document_type !== 'pilot_licence' && d.expiry_date && d.expiry_date < todayIso)
    if (!rejected && !expired) return 3
    if (!rejected && expired) return 2
    if (rejected && !expired) return 1
    return 0
  }
  return [...candidates].sort((a, b) => {
    const scoreDiff = score(b) - score(a)
    if (scoreDiff !== 0) return scoreDiff
    return new Date(b.uploaded_at ?? 0).getTime() - new Date(a.uploaded_at ?? 0).getTime()
  })[0]
}

function statusLabel(state: BookingReadinessItem['state']): string {
  if (state === 'complete') return 'Approved'
  if (state === 'missing') return 'Missing'
  if (state === 'expired') return 'Expired'
  return 'Submitted'
}

function statusTone(state: BookingReadinessItem['state']): string {
  if (state === 'complete') return 'text-emerald-200 border-emerald-400/35 bg-emerald-500/10'
  if (state === 'missing') return 'text-amber-200 border-amber-400/35 bg-amber-500/10'
  if (state === 'expired') return 'text-red-200 border-red-400/35 bg-red-500/10'
  return 'text-emerald-200 border-emerald-400/35 bg-emerald-500/10'
}

function DocModal({
  def,
  existingDoc,
  onClose,
  onSuccess,
}: {
  def: DocCardDef
  existingDoc: UserDocument | undefined
  onClose: () => void
  onSuccess: () => void
}) {
  const [licenceType, setLicenceType] = useState(existingDoc?.licence_type ?? '')
  const [licenceNumber, setLicenceNumber] = useState(existingDoc?.licence_number ?? '')
  const [nightVfrRating, setNightVfrRating] = useState<boolean | null>(null)
  const [instrumentRating, setInstrumentRating] = useState<boolean | null>(null)
  const [medicalClass, setMedicalClass] = useState(existingDoc?.medical_class ?? '')
  const [issueDate, setIssueDate] = useState(existingDoc?.issue_date ?? '')
  const [expiryDate, setExpiryDate] = useState(existingDoc?.expiry_date ?? '')
  const [idType, setIdType] = useState(existingDoc?.id_type ?? '')
  const [documentNumber, setDocumentNumber] = useState(existingDoc?.document_number ?? '')
  const [uploading, setUploading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fileResults, setFileResults] = useState<{ name: string; ok: boolean; msg?: string }[]>([])

  async function uploadFiles(files: File[]) {
    setFormError(null)
    if (def.type === 'pilot_licence') {
      if (!licenceType) return setFormError('Please select a licence type.')
      if (nightVfrRating === null) return setFormError('Please confirm your Night VFR rating status.')
      if (instrumentRating === null) return setFormError('Please confirm your Instrument Rating status.')
      if (!licenceNumber.trim()) return setFormError('Please enter your pilot licence number / ARN.')
    }
    if (def.type === 'medical_certificate') {
      if (!medicalClass) return setFormError('Please select a medical class.')
      if (!issueDate) return setFormError('Please provide date of issue.')
      if (!expiryDate) return setFormError('Please provide expiry date.')
    }
    if (def.type === 'photo_id') {
      if (!idType) return setFormError('Please select an ID type.')
      if (!documentNumber.trim()) return setFormError('Please enter your document number.')
    }

    const results: { name: string; ok: boolean; msg?: string }[] = []
    setUploading(true)
    try {
      for (const file of files) {
        if (!ALLOWED_TYPES.includes(file.type)) {
          results.push({ name: file.name, ok: false, msg: 'Not PDF/JPG/PNG' })
          continue
        }
        if (file.size > MAX_DOC_SIZE) {
          results.push({ name: file.name, ok: false, msg: 'Over 10 MB' })
          continue
        }
        try {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('docType', def.type)
          if (licenceType) fd.append('licenceType', licenceType)
          if (nightVfrRating !== null) fd.append('nightVfrRating', String(nightVfrRating))
          if (instrumentRating !== null) fd.append('instrumentRating', String(instrumentRating))
          if (licenceNumber) fd.append('licenceNumber', licenceNumber)
          if (medicalClass) fd.append('medicalClass', medicalClass)
          if (issueDate) fd.append('issueDate', issueDate)
          if (expiryDate) fd.append('expiryDate', expiryDate)
          if (idType) fd.append('idType', idType)
          if (documentNumber) fd.append('documentNumber', documentNumber)
          await uploadVerificationDocument(fd)
          results.push({ name: file.name, ok: true })
        } catch (err) {
          results.push({ name: file.name, ok: false, msg: err instanceof Error ? err.message : 'Upload failed' })
        }
      }
    } finally {
      setUploading(false)
    }
    setFileResults(results)
    if (results.length > 0 && results.every((r) => r.ok)) onSuccess()
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) uploadFiles(files)
    e.target.value = ''
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[1000] flex items-start justify-center p-4 pt-24 md:pt-28 bg-black/70 backdrop-blur-sm">
        <div className="w-full max-w-md max-h-[calc(100vh-7.5rem)] bg-white border border-[#152d5a]/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#152d5a]/10">
            <div>
              <p className="text-xs uppercase tracking-widest text-[#1a4fd6] font-bold">{existingDoc ? 'Replace' : 'Upload'}</p>
              <p className="text-lg font-semibold text-[#152d5a]">{def.label}</p>
            </div>
            <button onClick={onClose} disabled={uploading} className="text-[#4b6390] hover:text-[#152d5a] disabled:opacity-40">
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>
          <div className="px-5 py-5 space-y-4 overflow-y-auto min-h-0">
            {def.type === 'pilot_licence' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {['RPL', 'PPL', 'CPL', 'Other'].map((t) => (
                    <button key={t} type="button" onClick={() => setLicenceType(t)} className={`px-3 py-2 rounded-lg text-sm border ${licenceType === t ? 'bg-[#e8f0fe] border-[#1a4fd6]/50 text-[#152d5a]' : 'bg-[#f0f6ff] border-[#152d5a]/15 text-[#4b6390]'}`}>{t}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[true, false].map((v) => (
                    <button key={`n-${v}`} type="button" onClick={() => setNightVfrRating(v)} className={`px-3 py-2 rounded-lg text-sm border ${nightVfrRating === v ? 'bg-[#e8f0fe] border-[#1a4fd6]/50 text-[#152d5a]' : 'bg-[#f0f6ff] border-[#152d5a]/15 text-[#4b6390]'}`}>Night VFR: {v ? 'Yes' : 'No'}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[true, false].map((v) => (
                    <button key={`i-${v}`} type="button" onClick={() => setInstrumentRating(v)} className={`px-3 py-2 rounded-lg text-sm border ${instrumentRating === v ? 'bg-[#e8f0fe] border-[#1a4fd6]/50 text-[#152d5a]' : 'bg-[#f0f6ff] border-[#152d5a]/15 text-[#4b6390]'}`}>IFR: {v ? 'Yes' : 'No'}</button>
                  ))}
                </div>
                <input value={licenceNumber} onChange={(e) => setLicenceNumber(e.target.value)} placeholder="Pilot licence number / ARN" className="w-full bg-[#f0f6ff] border border-[#152d5a]/15 rounded-lg px-3 py-2.5 text-sm text-[#152d5a]" />
              </>
            )}
            {def.type === 'medical_certificate' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {['Class 1', 'Class 2', 'Basic Class 2', 'Other'].map((t) => (
                    <button key={t} type="button" onClick={() => setMedicalClass(t)} className={`px-3 py-2 rounded-lg text-sm border ${medicalClass === t ? 'bg-[#e8f0fe] border-[#1a4fd6]/50 text-[#152d5a]' : 'bg-[#f0f6ff] border-[#152d5a]/15 text-[#4b6390]'}`}>{t}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <CalendarDateField value={issueDate} onChange={setIssueDate} minYear={new Date().getFullYear() - 80} maxYear={new Date().getFullYear()} className="w-full bg-[#f0f6ff] border border-[#152d5a]/15 rounded-lg px-3 py-2.5 text-sm text-[#152d5a] text-left flex items-center justify-between" />
                  <CalendarDateField value={expiryDate} onChange={setExpiryDate} minYear={new Date().getFullYear() - 5} maxYear={new Date().getFullYear() + 20} className="w-full bg-[#f0f6ff] border border-[#152d5a]/15 rounded-lg px-3 py-2.5 text-sm text-[#152d5a] text-left flex items-center justify-between" />
                </div>
              </>
            )}
            {def.type === 'photo_id' && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {['Passport', 'Driver Licence', 'Other'].map((t) => (
                    <button key={t} type="button" onClick={() => setIdType(t)} className={`px-3 py-2 rounded-lg text-sm border ${idType === t ? 'bg-[#e8f0fe] border-[#1a4fd6]/50 text-[#152d5a]' : 'bg-[#f0f6ff] border-[#152d5a]/15 text-[#4b6390]'}`}>{t}</button>
                  ))}
                </div>
                <input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} placeholder="Document number" className="w-full bg-[#f0f6ff] border border-[#152d5a]/15 rounded-lg px-3 py-2.5 text-sm text-[#152d5a]" />
              </>
            )}

            <label className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-dashed border-[#152d5a]/15 bg-[#f0f6ff] hover:border-[#1a4fd6]/40 cursor-pointer">
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple className="hidden" onChange={onFileChange} disabled={uploading} />
              <span className={`material-symbols-outlined text-2xl ${uploading ? 'text-[#1a4fd6] animate-spin' : 'text-[#4b6390]'}`}>{uploading ? 'progress_activity' : 'cloud_upload'}</span>
              <p className="text-sm text-[#152d5a]">{uploading ? 'Uploading…' : 'Drop files or click to upload'}</p>
              <p className="text-xs text-[#4b6390]">PDF, JPG, PNG - up to 10 MB each - multiple files supported</p>
            </label>

            {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
            {fileResults.map((r, i) => (
              <p key={`${r.name}-${i}`} className={`text-xs ${r.ok ? 'text-green-600' : 'text-red-600'}`}>{r.name}{r.msg ? ` - ${r.msg}` : ''}</p>
            ))}
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

export default function BookingReadinessInlinePanel({
  docItems,
  documents,
  lastFlightDate,
  hasNightVfrRating,
  flightRecencyComplete,
  termsAccepted,
  activeTerms,
  documentsAwaitingReviewCount,
  missingDocumentsCount,
}: Props) {
  const router = useRouter()
  const [flightDate, setFlightDate] = useState(lastFlightDate ?? '')
  const [dateError, setDateError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [modalType, setModalType] = useState<DocumentType | null>(null)
  const [viewLoadingType, setViewLoadingType] = useState<DocumentType | null>(null)
  const [nightVfrAnswer, setNightVfrAnswer] = useState<boolean | null>(hasNightVfrRating)
  const [termsModalOpen, setTermsModalOpen] = useState(false)
  const [termsScrolledToEnd, setTermsScrolledToEnd] = useState(false)
  const [termsModalChecked, setTermsModalChecked] = useState(false)
  const [acceptedInModal, setAcceptedInModal] = useState(termsAccepted)
  const [termsError, setTermsError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isTermsPending, startTermsTransition] = useTransition()
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerFiles, setViewerFiles] = useState<DocumentFile[]>([])
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0)
  const [viewerTitle, setViewerTitle] = useState('')

  const today = new Date().toISOString().slice(0, 10)
  const docMap = useMemo(() => {
    const map: Partial<Record<DocumentType, UserDocument>> = {}
    for (const def of DOC_DEFS) map[def.type] = pickBestDocumentForType(documents, def.type, today)
    return map
  }, [documents, today])

  const actionableItemsLeft = missingDocumentsCount > 0 || !flightRecencyComplete || !(termsAccepted || acceptedInModal) || nightVfrAnswer === null
  const awaitingAdminOnly = !actionableItemsLeft && documentsAwaitingReviewCount > 0

  async function handleView(docType: DocumentType) {
    setViewLoadingType(docType)
    try {
      const url = await getDocumentSignedUrl(docType)
      const def = DOC_DEFS.find((item) => item.type === docType)
      setViewerFiles([{ url, name: def?.label ?? 'Document' }])
      setViewerInitialIndex(0)
      setViewerTitle(def?.label ?? 'Document')
      setViewerOpen(true)
    } catch {
      setSaveError('Could not open document. Please try again.')
    } finally {
      setViewLoadingType(null)
    }
  }

  const canAcceptTerms = (termsAccepted || acceptedInModal)

  function handleSaveAndCheck() {
    setDateError(null)
    setSaveError(null)
    setMessage(null)
    const trimmed = flightDate.trim()
    const err = validateFlightReviewDate(trimmed)
    if (err) {
      setDateError(err)
      return
    }
    startTransition(async () => {
      try {
        if (nightVfrAnswer !== hasNightVfrRating && nightVfrAnswer !== null) {
          await saveNightVfrRatingFromReadiness({ hasNightVfrRating: nightVfrAnswer })
        }
        await saveLastFlightDate(trimmed)
        setMessage('Saved. Checking readiness…')
        router.refresh()
      } catch (err) {
        setSaveError(err instanceof Error ? err.message.replace('VALIDATION:', '').trim() : 'Could not save readiness details.')
      }
    })
  }

  return (
    <div className="mt-6 space-y-4">
      {modalType ? <DocModal def={DOC_DEFS.find((d) => d.type === modalType)!} existingDoc={docMap[modalType]} onClose={() => setModalType(null)} onSuccess={() => { setModalType(null); router.refresh() }} /> : null}
      <div className="grid gap-3">
        <div className="rounded-xl border border-[#152d5a]/10 bg-white p-4">
          <p className="text-sm text-[#152d5a]">Night VFR rating</p>
          <p className="text-xs text-[#4b6390] mt-1">Do you have Night VFR?</p>
          <div className="mt-3 grid grid-cols-2 gap-2 max-w-md">
            {[true, false].map((val) => (
              <button
                key={`nvfr-${val}`}
                type="button"
                onClick={() => setNightVfrAnswer(val)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                  nightVfrAnswer === val
                    ? 'bg-[#e8f0fe] border-[#1a4fd6]/50 text-[#152d5a]'
                    : 'bg-[#f0f6ff] border-[#152d5a]/15 text-[#4b6390] hover:text-[#152d5a]'
                }`}
              >
                {val ? 'Yes' : 'No'}
              </button>
            ))}
          </div>
          {nightVfrAnswer === false ? (
            <p className="mt-2 text-xs text-emerald-700">Night VFR evidence is not required when you select No.</p>
          ) : null}
          {nightVfrAnswer === null ? (
            <p className="mt-2 text-xs text-amber-700">Please select Yes or No.</p>
          ) : null}
        </div>
        {docItems.map((item) => {
          if (item.key === 'night_vfr_evidence' && nightVfrAnswer !== true) return null
          const def = DOC_DEFS.find((d) => d.type === item.key)
          const docType = item.key
          const showUpload = item.state === 'missing' || item.state === 'expired' || item.state === 'needs_review'
          const docDetail = item.state === 'needs_review' ? 'Submitted, awaiting admin review.' : item.detail
          return (
            <div key={item.key} className="rounded-xl border border-[#152d5a]/10 bg-white p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-[#152d5a]">{def?.label ?? item.label}</p>
                <p className="text-xs text-[#4b6390]">{docDetail}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full border tracking-widest ${statusTone(item.state)}`}>{statusLabel(item.state)}</span>
                {docMap[docType] ? (
                  <button onClick={() => handleView(docType)} disabled={viewLoadingType === docType} className="text-xs font-bold uppercase tracking-widest text-[#1a4fd6] border border-[#1a4fd6]/20 hover:bg-[#f0f6ff] px-3 py-1.5 rounded-full">
                    {viewLoadingType === docType ? 'Opening…' : 'View'}
                  </button>
                ) : null}
                {showUpload ? (
                  <button onClick={() => setModalType(docType)} className="text-xs font-bold uppercase tracking-widest text-[#152d5a] border border-[#152d5a]/20 hover:bg-[#f0f6ff] px-3 py-1.5 rounded-full">
                    {docMap[docType] ? 'Replace' : 'Upload'}
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      <div className="rounded-xl border border-[#152d5a]/10 bg-white p-4">
        <p className="text-[17px] font-semibold text-[#152d5a]">Last flight review</p>
        <p className="text-[15px] text-[#4b6390] mt-1 leading-relaxed">Tell us when your most recent flight review was completed.</p>
        <div className="mt-3">
          <label className="text-sm font-medium text-[#152d5a] block mb-2">
            When was your last flight review? <span className="text-red-600 font-normal">Required</span>
          </label>
          <CalendarDateField
            value={flightDate}
            onChange={(next) => { setFlightDate(next); setDateError(null) }}
            minYear={new Date().getFullYear() - 20}
            maxYear={new Date().getFullYear()}
            minDate={getFlightReviewCutoff()}
            maxDate={today}
            className="w-full bg-[#f0f6ff] border border-[#152d5a]/15 rounded-lg px-3 py-2.5 text-sm text-[#152d5a] text-left flex items-center justify-between"
          />
          {dateError ? <p className="mt-2 text-xs text-red-600">{dateError}</p> : null}
        </div>
      </div>

      <div className="rounded-xl border border-[#152d5a]/10 bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-[#4b6390]">Terms and conditions</p>
        <p className={`mt-2 text-sm ${canAcceptTerms ? 'text-emerald-700' : 'text-amber-700'}`}>
          {canAcceptTerms ? 'Accepted current version.' : 'Current version not accepted.'}
        </p>
        {!canAcceptTerms && activeTerms ? (
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setTermsModalOpen(true)
                setTermsScrolledToEnd(false)
                setTermsModalChecked(false)
              }}
              className="inline-flex items-center gap-2 rounded-full bg-[#1a4fd6] px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-[#1540a8] disabled:opacity-40"
            >
              Open terms
            </button>
          </div>
        ) : null}
      </div>

      {awaitingAdminOnly ? (
        <div className="rounded-xl border border-[#1a4fd6]/15 bg-[#f0f6ff] p-4">
          <p className="text-sm text-[#152d5a]">Your documents have been submitted and are awaiting review by OZ Rent A Plane.</p>
        </div>
      ) : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {saveError ? <p className="text-sm text-red-600">{saveError}</p> : null}

      <DocumentViewerModal
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        files={viewerFiles}
        initialIndex={viewerInitialIndex}
        title={viewerTitle}
      />

      <div className="flex flex-wrap gap-3">
        {awaitingAdminOnly ? (
          <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 bg-[#1a4fd6] hover:bg-[#1540a8] text-white font-semibold rounded-xl px-5 py-2.5 transition-colors">
            View my bookings
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleSaveAndCheck}
            disabled={isPending}
            className="inline-flex items-center justify-center gap-2 bg-[#1a4fd6] hover:bg-[#1540a8] text-white font-semibold rounded-xl px-5 py-2.5 transition-colors disabled:opacity-40"
          >
            {isPending ? 'Saving…' : 'Save and check readiness'}
          </button>
        )}
        <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 border border-[#152d5a]/20 text-[#152d5a] hover:bg-[#f0f6ff] font-semibold rounded-xl px-5 py-2.5 transition-colors">
          Go to overview
        </Link>
      </div>

      {termsModalOpen && activeTerms ? (
        <ModalPortal>
          <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-4xl bg-white border border-[#152d5a]/10 rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#152d5a]/10">
                <h4 className="text-sm font-semibold text-[#152d5a]">Booking Terms and Conditions</h4>
                <button type="button" onClick={() => setTermsModalOpen(false)} className="text-[#4b6390] hover:text-[#152d5a] transition-colors">
                  <span className="material-symbols-outlined text-xl">close</span>
                </button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <p className="text-sm text-[#4b6390]">Scroll to the end to enable acceptance.</p>
                <div
                  className="h-[55vh] min-h-[340px] max-h-[680px] overflow-y-auto rounded-xl border border-[#152d5a]/10 bg-white"
                  onScroll={(e) => {
                    const el = e.currentTarget
                    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) setTermsScrolledToEnd(true)
                  }}
                >
                  <div className="px-6 py-6 md:px-8 md:py-8">
                    <div className="max-w-3xl mx-auto space-y-8">
                      <div className="pb-5 border-b border-[#152d5a]/10 space-y-3">
                        <p className="text-[10px] uppercase tracking-[0.24em] text-[#1a4fd6]/80 font-bold">OZ Rent A Plane</p>
                        <h5 className="text-2xl md:text-3xl font-serif text-[#152d5a]">{TERMS_MODAL_TITLE}</h5>
                        <p className="text-sm text-[#4b6390]">{TERMS_MODAL_SUBTITLE}</p>
                        <div className="rounded-lg border border-amber-200 bg-[#fff3cd] px-4 py-3">
                          <p className="text-sm text-[#152d5a] leading-relaxed">{TERMS_NOTICE}</p>
                        </div>
                        <p className="text-xs text-[#4b6390]">Version: {TERMS_LAST_UPDATED}</p>
                        <Link href={activeTerms.public_url} target="_blank" className="inline-flex items-center gap-2 rounded-full border border-[#152d5a]/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#152d5a] hover:bg-[#f0f6ff] hover:border-[#152d5a]/30">
                          Open official terms document
                        </Link>
                      </div>
                      {TERMS_SECTIONS.map((section) => (
                        <section key={`${section.number}-${section.title}`} className="space-y-2">
                          <div className="flex items-baseline gap-3">
                            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#1a4fd6]/50">{section.number}</span>
                            <h6 className="text-lg md:text-xl font-serif text-[#152d5a]">{section.title}</h6>
                          </div>
                          <div className="space-y-2 pl-6">
                            {section.blocks.map((block, idx) => (
                              block.type === 'paragraph' ? (
                                <p key={idx} className="text-sm md:text-[15px] leading-7 text-[#4b6390]">{block.text}</p>
                              ) : (
                                <ul key={idx} className="list-disc list-outside ml-5 space-y-1 text-sm md:text-[15px] leading-7 text-[#4b6390]">
                                  {block.items.map((item, itemIdx) => <li key={itemIdx}>{item}</li>)}
                                </ul>
                              )
                            ))}
                          </div>
                        </section>
                      ))}
                      <div className="pt-4 border-t border-[#152d5a]/10">
                        <p className="text-sm md:text-[15px] font-semibold text-[#152d5a]">{TERMS_END_TEXT}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className={`text-sm ${termsScrolledToEnd ? 'text-green-700' : 'text-amber-700'}`}>
                  {termsScrolledToEnd ? 'You have reached the end. You can now accept the terms.' : 'Scroll to the bottom to continue.'}
                </div>
              </div>
              <div className="sticky bottom-0 px-5 py-4 border-t border-[#152d5a]/10 bg-white flex flex-col gap-3">
                <label className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${termsScrolledToEnd ? 'border-green-200 bg-green-50' : 'border-[#152d5a]/10 bg-[#f0f6ff]'}`}>
                  <input
                    type="checkbox"
                    checked={termsModalChecked}
                    disabled={!termsScrolledToEnd}
                    onChange={(e) => setTermsModalChecked(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-blue-500 rounded cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <div className="space-y-1">
                    <span className={`text-sm ${termsScrolledToEnd ? 'text-[#152d5a]' : 'text-[#4b6390]'}`}>
                      I have read and accept the Booking Terms and Conditions.
                    </span>
                  </div>
                </label>
                <div className="flex items-center justify-end gap-3">
                  <button type="button" onClick={() => setTermsModalOpen(false)} className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[#4b6390] hover:text-[#152d5a] transition-colors">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTermsError(null)
                      startTermsTransition(async () => {
                        const result = await acceptCurrentBookingTermsFromReadiness()
                        if (!result.ok) {
                          setTermsError(result.error)
                          return
                        }
                        setAcceptedInModal(true)
                        setTermsModalOpen(false)
                        router.refresh()
                      })
                    }}
                    disabled={!termsScrolledToEnd || !termsModalChecked || isTermsPending}
                    className="px-4 py-2 bg-[#1a4fd6] hover:bg-[#1540a8] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-[10px] font-bold uppercase tracking-[0.15em] transition-all"
                  >
                    {isTermsPending ? 'Saving…' : 'Accept terms'}
                  </button>
                </div>
                {termsError ? <p className="text-sm text-red-600">{termsError}</p> : null}
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </div>
  )
}
