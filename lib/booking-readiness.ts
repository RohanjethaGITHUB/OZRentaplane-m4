import type { UserDocument } from '@/lib/supabase/types'
import { validateFlightReviewDate } from '@/lib/utils/flight-review'

export type BookingReadinessState = 'complete' | 'missing' | 'needs_review' | 'expired'

export type BookingReadinessItem = {
  key: 'pilot_licence' | 'medical_certificate' | 'photo_id' | 'night_vfr_evidence'
  label: string
  state: BookingReadinessState
  detail: string
}

export type BookingClearanceSource = 'normal_checkout' | 'historical_checkout' | 'not_cleared'

export type BookingReadinessDecision = {
  clearanceStatus: string
  clearanceSource: BookingClearanceSource
  hasPaidCheckoutInvoice: boolean
  checkoutInvoiceRequired: boolean
  documentsRequired: BookingReadinessItem['key'][]
  documentsComplete: boolean
  documentStatuses: Record<BookingReadinessItem['key'], BookingReadinessState>
  missingDocuments: BookingReadinessItem['key'][]
  documentsAwaitingReview: BookingReadinessItem['key'][]
  expiredDocuments: BookingReadinessItem['key'][]
  flightRecencyRequired: boolean
  flightRecencyDate: string | null
  flightRecencyComplete: boolean
  termsRequired: boolean
  currentTermsAccepted: boolean
  bookingReady: boolean
  blockingReasons: string[]
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

export function evaluateBookingReadinessDecision(input: {
  clearanceStatus: string
  hasHistoricalClearance: boolean
  hasPaidCheckoutInvoice: boolean
  documents: UserDocument[]
  hasNightVfrRating: boolean | null
  lastFlightDate: string | null
  termsAccepted: boolean
}): BookingReadinessDecision {
  const docItems = evaluateBookingDocumentsReadiness({
    documents: input.documents,
    hasNightVfrRating: input.hasNightVfrRating,
  })
  const docsRequired = docItems.map((item) => item.key)
  const docsComplete = docItems.every((item) => item.state === 'complete')

  const documentStatuses = docItems.reduce((acc, item) => {
    acc[item.key] = item.state
    return acc
  }, {} as Record<BookingReadinessItem['key'], BookingReadinessState>)

  const missingDocuments = docItems.filter((item) => item.state === 'missing').map((item) => item.key)
  const documentsAwaitingReview = docItems
    .filter((item) => item.state === 'needs_review')
    .map((item) => item.key)
  const expiredDocuments = docItems.filter((item) => item.state === 'expired').map((item) => item.key)

  const flightRecencyRequired = true
  const flightRecencyDate = input.lastFlightDate?.trim() ? input.lastFlightDate.trim() : null
  const flightRecencyComplete = !flightRecencyRequired || !!flightRecencyDate && !validateFlightReviewDate(flightRecencyDate)
  const termsRequired = true

  const clearanceSource: BookingClearanceSource = input.hasHistoricalClearance
    ? 'historical_checkout'
    : input.hasPaidCheckoutInvoice
      ? 'normal_checkout'
      : 'not_cleared'
  const checkoutInvoiceRequired = clearanceSource === 'normal_checkout'
  const bookingReady = docsComplete && flightRecencyComplete && input.termsAccepted

  const blockingReasons: string[] = []
  if (!docsComplete) {
    if (missingDocuments.length) blockingReasons.push('documents_missing')
    if (expiredDocuments.length) blockingReasons.push('documents_expired')
    if (documentsAwaitingReview.length) blockingReasons.push('documents_awaiting_review')
  }
  if (!flightRecencyComplete) blockingReasons.push('flight_recency_missing_or_invalid')
  if (!input.termsAccepted) blockingReasons.push('terms_not_accepted')

  return {
    clearanceStatus: input.clearanceStatus,
    clearanceSource,
    hasPaidCheckoutInvoice: input.hasPaidCheckoutInvoice,
    checkoutInvoiceRequired,
    documentsRequired: docsRequired,
    documentsComplete: docsComplete,
    documentStatuses,
    missingDocuments,
    documentsAwaitingReview,
    expiredDocuments,
    flightRecencyRequired,
    flightRecencyDate,
    flightRecencyComplete,
    termsRequired,
    currentTermsAccepted: input.termsAccepted,
    bookingReady,
    blockingReasons,
  }
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
