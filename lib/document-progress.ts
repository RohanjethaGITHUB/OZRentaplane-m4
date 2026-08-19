import type { BookingReadinessItem } from '@/lib/booking-readiness'
import type { UserDocument } from '@/lib/supabase/types'

export type DocumentProgressStepStatus = 'not_started' | 'in_progress' | 'complete'

export type DocumentProgressSnapshot = {
  statuses: DocumentProgressStepStatus[]
  percent: number
  allSubmitted: boolean
  allApproved: boolean
  bannerState: 'uploading' | 'under_review' | 'unlocked' | 'rejected'
  bannerHeading: string
  bannerBody: string
  ctaLabel: string
  rejectedDocumentLabels?: string[]
}

function hasRedCardDetails(pilotLicenceDocument: UserDocument | null): boolean {
  return Boolean(pilotLicenceDocument?.red_card_expiry_month && pilotLicenceDocument?.red_card_expiry_year)
}

export function getDocumentProgressSnapshot(input: {
  documentReadinessItems: BookingReadinessItem[]
  pilotLicenceDocument: UserDocument | null
  lastFlightDate: string | null
  hasNightVfrRating: boolean | null
  termsAccepted: boolean
}): DocumentProgressSnapshot {
  const rejectedItems = input.documentReadinessItems.filter(
    (item) => item.state === 'needs_review' && item.detail.toLowerCase().startsWith('rejected'),
  )
  const hasRejected = rejectedItems.length > 0
  const anyMissing = input.documentReadinessItems.some((item) => item.state === 'missing')
  const allSubmitted = input.documentReadinessItems.every((item) => item.state !== 'missing')
  const allApproved = input.documentReadinessItems.every((item) => item.state === 'complete')

  // Step 1: Core docs (pilot licence, medical certificate, photo id)
  const coreDocItems = input.documentReadinessItems.filter((item) => item.key !== 'night_vfr_evidence')
  const coreDocsRejected = coreDocItems.some(
    (item) => item.state === 'needs_review' && item.detail.toLowerCase().startsWith('rejected'),
  )
  const coreDocsAllSubmitted = coreDocItems.length > 0 && coreDocItems.every((item) => item.state !== 'missing')
  const docsStep: DocumentProgressStepStatus = (coreDocsAllSubmitted && !coreDocsRejected)
    ? 'complete'
    : coreDocItems.some((item) => item.state !== 'missing')
      ? 'in_progress'
      : 'not_started'

  // Step 2: Flight date & Red card
  const flightDateComplete = Boolean(input.lastFlightDate?.trim())
  const redCardComplete = hasRedCardDetails(input.pilotLicenceDocument)
  const flightAndRedCardStep: DocumentProgressStepStatus = flightDateComplete && redCardComplete
    ? 'complete'
    : flightDateComplete || redCardComplete
      ? 'in_progress'
      : 'not_started'

  // Step 3: Night VFR
  const nightVfrItem = input.documentReadinessItems.find((item) => item.key === 'night_vfr_evidence')
  const nightVfrRejected = Boolean(
    nightVfrItem &&
    nightVfrItem.state === 'needs_review' &&
    nightVfrItem.detail.toLowerCase().startsWith('rejected'),
  )
  const nightVfrEvidenceUploaded = Boolean(nightVfrItem && nightVfrItem.state !== 'missing')

  const nightVfrStep: DocumentProgressStepStatus =
    input.hasNightVfrRating === null
      ? 'not_started'
      : input.hasNightVfrRating === false
        ? 'complete'
        : (nightVfrEvidenceUploaded && !nightVfrRejected)
          ? 'complete'
          : 'in_progress'

  // Step 4: Terms
  const termsStep: DocumentProgressStepStatus = input.termsAccepted ? 'complete' : 'not_started'

  const statuses = [docsStep, flightAndRedCardStep, nightVfrStep, termsStep]
  const completedCount = statuses.filter((status) => status === 'complete').length
  const percent = Math.round((completedCount / statuses.length) * 100)

  // 1. Rejected state takes highest priority
  if (hasRejected) {
    const rejectedLabels = rejectedItems.map((item) => item.label)
    const formattedLabels = rejectedLabels.join(', ')
    const heading = rejectedLabels.length === 1
      ? `${rejectedLabels[0]} rejected`
      : 'Documents rejected'
    const body = rejectedLabels.length === 1
      ? `Your ${rejectedLabels[0].toLowerCase()} was rejected by our team. Please review the feedback and re-upload the document to proceed with booking.`
      : `Your ${formattedLabels.toLowerCase()} were rejected by our team. Please review the feedback and re-upload the documents to proceed with booking.`

    return {
      statuses,
      percent,
      allSubmitted,
      allApproved,
      bannerState: 'rejected',
      bannerHeading: heading,
      bannerBody: body,
      ctaLabel: 'Re-upload Documents',
      rejectedDocumentLabels: rejectedLabels,
    }
  }

  // 2. Incomplete / missing steps
  if (percent < 100) {
    return {
      statuses,
      percent,
      allSubmitted,
      allApproved,
      bannerState: 'uploading',
      bannerHeading: 'Please upload all your documents',
      bannerBody: anyMissing
        ? 'Complete the remaining upload and profile steps below so our team can review your file.'
        : 'Finish the remaining profile steps below so our team can review your file.',
      ctaLabel: 'Upload Documents',
    }
  }

  // 3. All steps submitted, awaiting admin review
  if (!allApproved) {
    return {
      statuses,
      percent,
      allSubmitted,
      allApproved,
      bannerState: 'under_review',
      bannerHeading: 'Your documents are under review',
      bannerBody: 'Everything has been submitted. Our team is reviewing your file and will notify you once the remaining documents are approved.',
      ctaLabel: 'Go to Documents',
    }
  }

  // 4. Fully approved
  return {
    statuses,
    percent,
    allSubmitted,
    allApproved,
    bannerState: 'unlocked',
    bannerHeading: 'Your documents are approved',
    bannerBody: 'All required documents have been individually approved and booking is now unlocked.',
    ctaLabel: 'Go to Documents',
  }
}
