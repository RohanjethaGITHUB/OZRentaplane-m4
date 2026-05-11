import type { PilotClearanceStatus, UserDocument } from '@/lib/supabase/types'

type JourneyStep =
  | 'account_created'
  | 'checkout_time_booked'
  | 'documents_uploaded'
  | 'submitted_for_review'
  | 'checkout_complete'
  | 'ready_to_fly'

export const JOURNEY_STEPS: { key: JourneyStep; label: string; icon: string }[] = [
  { key: 'account_created', label: 'Account created', icon: 'check_circle' },
  { key: 'checkout_time_booked', label: 'Checkout time booked', icon: 'calendar_month' },
  { key: 'documents_uploaded', label: 'Documents uploaded', icon: 'folder' },
  { key: 'submitted_for_review', label: 'Submitted for review', icon: 'fact_check' },
  { key: 'checkout_complete', label: 'Checkout complete', icon: 'run_circle' },
  { key: 'ready_to_fly', label: 'Ready to fly', icon: 'flight_takeoff' },
]

export type JourneyState = {
  activeIndex: number
  completedCount: number
  completedMap: Record<JourneyStep, boolean>
  documentProgress: {
    completed: number
    required: number
  }
}

const REQUIRED_DOCS = ['pilot_licence', 'medical_certificate', 'photo_id'] as const

export function deriveJourneyState(input: {
  clearanceStatus: PilotClearanceStatus
  documents: UserDocument[]
  hasCheckoutBooking: boolean
}): JourneyState {
  const { clearanceStatus, documents, hasCheckoutBooking } = input
  const today = new Date().toISOString().slice(0, 10)
  const docMap = new Map<string, UserDocument>()
  for (const doc of documents) {
    const existing = docMap.get(doc.document_type)
    if (!existing || new Date(doc.created_at).getTime() > new Date(existing.created_at).getTime()) {
      docMap.set(doc.document_type, doc)
    }
  }
  const usableDocCount = REQUIRED_DOCS.filter((docType) => {
    const row = docMap.get(docType)
    if (!row) return false
    if (row.status === 'rejected') return false
    if (row.expiry_date && row.expiry_date < today) return false
    return true
  }).length
  const docsComplete = usableDocCount === REQUIRED_DOCS.length

  const completedMap: Record<JourneyStep, boolean> = {
    account_created: true,
    checkout_time_booked: hasCheckoutBooking || clearanceStatus !== 'checkout_required',
    documents_uploaded: docsComplete || ['checkout_completed_under_review', 'checkout_payment_required', 'cleared_to_fly', 'additional_checkout_required', 'checkout_reschedule_required', 'not_currently_eligible'].includes(clearanceStatus),
    submitted_for_review: ['checkout_completed_under_review', 'checkout_payment_required', 'cleared_to_fly', 'additional_checkout_required', 'checkout_reschedule_required', 'not_currently_eligible'].includes(clearanceStatus),
    checkout_complete: ['checkout_completed_under_review', 'checkout_payment_required', 'cleared_to_fly', 'additional_checkout_required', 'checkout_reschedule_required', 'not_currently_eligible'].includes(clearanceStatus),
    ready_to_fly: clearanceStatus === 'cleared_to_fly',
  }

  const activeIndex = JOURNEY_STEPS.findIndex((_, idx) => {
    const key = JOURNEY_STEPS[idx]!.key
    return !completedMap[key]
  })

  const completedCount = JOURNEY_STEPS.filter((s) => completedMap[s.key]).length

  return {
    activeIndex: activeIndex === -1 ? JOURNEY_STEPS.length - 1 : activeIndex,
    completedCount,
    completedMap,
    documentProgress: {
      completed: usableDocCount,
      required: REQUIRED_DOCS.length,
    },
  }
}
