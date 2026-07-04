import type { BookingReadinessItem } from '@/lib/booking-readiness'
import type { UserDocument } from '@/lib/supabase/types'

export type DocumentProgressStepStatus = 'not_started' | 'in_progress' | 'complete'

export type DocumentProgressSnapshot = {
  statuses: DocumentProgressStepStatus[]
  percent: number
  allSubmitted: boolean
  allApproved: boolean
  bannerState: 'uploading' | 'under_review' | 'unlocked'
  bannerHeading: string
  bannerBody: string
  ctaLabel: string
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
  const anyMissing = input.documentReadinessItems.some((item) => item.state === 'missing')
  const allSubmitted = input.documentReadinessItems.every((item) => item.state !== 'missing')
  const allApproved = input.documentReadinessItems.every((item) => item.state === 'complete')

  const docsStep: DocumentProgressStepStatus = allSubmitted
    ? 'complete'
    : input.documentReadinessItems.some((item) => item.state !== 'missing')
      ? 'in_progress'
      : 'not_started'

  const flightDateComplete = Boolean(input.lastFlightDate?.trim())
  const redCardComplete = hasRedCardDetails(input.pilotLicenceDocument)
  const flightAndRedCardStep: DocumentProgressStepStatus = flightDateComplete && redCardComplete
    ? 'complete'
    : flightDateComplete || redCardComplete
      ? 'in_progress'
      : 'not_started'

  const nightVfrEvidenceUploaded = input.documentReadinessItems.some(
    (item) => item.key === 'night_vfr_evidence' && item.state !== 'missing',
  )
  const nightVfrStep: DocumentProgressStepStatus =
    input.hasNightVfrRating === null
      ? 'not_started'
      : input.hasNightVfrRating === false
        ? 'complete'
        : nightVfrEvidenceUploaded
          ? 'complete'
          : 'in_progress'

  const termsStep: DocumentProgressStepStatus = input.termsAccepted ? 'complete' : 'not_started'

  const statuses = [docsStep, flightAndRedCardStep, nightVfrStep, termsStep]
  const completedCount = statuses.filter((status) => status === 'complete').length
  const percent = Math.round((completedCount / statuses.length) * 100)

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
