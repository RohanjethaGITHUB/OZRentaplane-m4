import type { UserDocument } from '@/lib/supabase/types'

export type BookingReadinessState = 'complete' | 'missing' | 'needs_review' | 'expired'

export type BookingReadinessItem = {
  key: 'pilot_licence' | 'medical_certificate' | 'photo_id' | 'night_vfr_evidence'
  label: string
  state: BookingReadinessState
  detail: string
}

type ActiveTermsLike = {
  id: string
  version: string
  content_hash: string
} | null

type AcceptanceLike = {
  terms_document_id: string | null
  terms_version: string | null
  terms_content_hash: string | null
  accepted_at: string | null
}

function docTypeLabel(type: BookingReadinessItem['key']): string {
  if (type === 'pilot_licence') return 'Pilot licence'
  if (type === 'medical_certificate') return 'Medical certificate'
  if (type === 'photo_id') return 'Photo ID'
  return 'Night VFR evidence'
}

function rankDoc(doc: UserDocument, todayIso: string): number {
  if (doc.status === 'rejected') return 0
  if (doc.document_type !== 'pilot_licence' && doc.expiry_date && doc.expiry_date < todayIso) return 1
  if (doc.status === 'uploaded') return 2
  if (doc.status === 'approved') return 3
  return 0
}

function pickBestDoc(docs: UserDocument[], todayIso: string): UserDocument | null {
  if (!docs.length) return null
  return [...docs].sort((a, b) => {
    const rankDiff = rankDoc(b, todayIso) - rankDoc(a, todayIso)
    if (rankDiff !== 0) return rankDiff
    return (b.uploaded_at ?? '').localeCompare(a.uploaded_at ?? '')
  })[0] ?? null
}

function evaluateDocument(type: BookingReadinessItem['key'], documents: UserDocument[], todayIso: string): BookingReadinessItem {
  const label = docTypeLabel(type)
  const candidates = documents.filter((d) => d.document_type === type)
  const doc = pickBestDoc(candidates, todayIso)

  if (!doc) {
    return { key: type, label, state: 'missing', detail: 'Not uploaded' }
  }
  if (doc.status === 'rejected') {
    return { key: type, label, state: 'needs_review', detail: 'Rejected - upload a replacement' }
  }

  // Product rule: pilot licence expiry is not tracked as a readiness blocker.
  if (type !== 'pilot_licence' && doc.expiry_date && doc.expiry_date < todayIso) {
    return { key: type, label, state: 'expired', detail: `Expired on ${doc.expiry_date}` }
  }

  if (doc.status === 'uploaded') {
    return { key: type, label, state: 'needs_review', detail: 'Submitted, awaiting review' }
  }

  return { key: type, label, state: 'complete', detail: 'Complete' }
}

export function evaluateBookingDocumentsReadiness(input: {
  documents: UserDocument[]
  hasNightVfrRating: boolean | null
}): BookingReadinessItem[] {
  const todayIso = new Date().toISOString().slice(0, 10)
  const required: BookingReadinessItem['key'][] = ['pilot_licence', 'medical_certificate', 'photo_id']
  if (input.hasNightVfrRating === true) required.push('night_vfr_evidence')

  return required.map((type) => evaluateDocument(type, input.documents, todayIso))
}

export function hasAcceptedCurrentTerms(activeTerms: ActiveTermsLike, acceptance: AcceptanceLike | null): boolean {
  if (!activeTerms) return false
  if (!acceptance?.accepted_at) return false
  if (!acceptance.terms_document_id || !acceptance.terms_version) return false

  if (acceptance.terms_document_id !== activeTerms.id) return false
  if (acceptance.terms_version !== activeTerms.version) return false
  if (activeTerms.content_hash && acceptance.terms_content_hash && acceptance.terms_content_hash !== activeTerms.content_hash) {
    return false
  }
  return true
}

export function statePriority(state: BookingReadinessState): number {
  if (state === 'missing') return 4
  if (state === 'expired') return 3
  if (state === 'needs_review') return 2
  return 1
}
