export const DOCUMENT_EXPIRY_WARNING_DAYS = 30
export const ACCOUNT_BLOCKED_ATTENTION_REASON = 'Account blocked, review customer access'
export const CHECKOUT_REQUEST_ATTENTION_REASON = 'Checkout request submitted, review and schedule checkout flight'
export const CHECKOUT_OUTCOME_ATTENTION_REASON = 'Checkout completed, review outcome and update clearance'

const REQUIRED_DOCUMENT_TYPES = ['pilot_licence', 'medical_certificate', 'photo_id'] as const
const EXPIRY_TRACKED_DOCUMENT_TYPES = ['medical_certificate'] as const

type DocumentRow = {
  user_id: string
  document_type: string
  status: string
  expiry_date: string | null
  medical_class?: string | null
}

type PendingReschedule = { createdAt: string; originalStart: string | null }
type PendingCancellation = { createdAt: string; bookingStart: string | null }

export type AttentionContext = {
  profileId: string
  accountStatus?: string | null
  pilotClearanceStatus: string | null
  hasCheckoutRequest: boolean
  documentsByUser: Map<string, DocumentRow[]>
  pendingCheckoutRescheduleByUser: Map<string, PendingReschedule>
  pendingCancellationByUser: Map<string, PendingCancellation>
}

function within12HourCutoff(createdAt: string, scheduledAt: string | null) {
  if (!scheduledAt) return false
  const created = new Date(createdAt).getTime()
  const scheduled = new Date(scheduledAt).getTime()
  if (!Number.isFinite(created) || !Number.isFinite(scheduled)) return false
  return scheduled > created && (scheduled - created) / (1000 * 60 * 60) <= 12
}

function getDocumentDisplayName(doc: DocumentRow): string {
  if (doc.document_type === 'medical_certificate') {
    if (doc.medical_class === 'Class 1') return 'Class 1 Medical Certificate'
    if (doc.medical_class === 'Class 2') return 'Class 2 Medical Certificate'
    return 'Medical Certificate'
  }
  if (doc.document_type === 'pilot_licence') return 'Pilot Licence'
  if (doc.document_type === 'photo_id') return 'Photo ID'
  if (doc.document_type === 'night_vfr_evidence') return 'Night VFR Evidence'
  return doc.document_type.replace(/_/g, ' ')
}

function toUtcMidnight(dateString: string): Date {
  return new Date(`${dateString}T00:00:00.000Z`)
}

function daysUntilExpiry(expiryDate: string, now: Date): number {
  const expiryUtc = toUtcMidnight(expiryDate)
  const nowUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  return Math.ceil((expiryUtc.getTime() - nowUtc.getTime()) / (1000 * 60 * 60 * 24))
}

function buildExpiryMessage(doc: DocumentRow, days: number): string {
  const name = getDocumentDisplayName(doc)
  if (days < 0) return `${name} expired ${Math.abs(days)} days ago`
  if (days === 0) return `${name} expires today`
  if (days === 1) return `${name} expires tomorrow`
  return `${name} expires in ${days} days`
}

function documentIssuesForUser(docs: DocumentRow[], hasCheckoutRequest: boolean, now: Date): string[] {
  if (!hasCheckoutRequest) return []

  const requiredDocs = docs.filter((d) => REQUIRED_DOCUMENT_TYPES.includes(d.document_type as (typeof REQUIRED_DOCUMENT_TYPES)[number]))
  const issues: string[] = []

  const rejected = requiredDocs.find((d) => d.status === 'rejected')
  if (rejected) {
    issues.push(`${getDocumentDisplayName(rejected)} rejected, follow up with customer`)
  }

  const expiryTrackedDocs = requiredDocs.filter((d) =>
    EXPIRY_TRACKED_DOCUMENT_TYPES.includes(d.document_type as (typeof EXPIRY_TRACKED_DOCUMENT_TYPES)[number]),
  )

  const expired = expiryTrackedDocs
    .filter((d) => d.expiry_date)
    .map((d) => ({ d, days: daysUntilExpiry(d.expiry_date as string, now) }))
    .filter((x) => x.days < 0)
    .sort((a, b) => a.days - b.days)
  if (expired.length > 0) {
    issues.push(buildExpiryMessage(expired[0].d, expired[0].days))
  }

  const expiringSoon = expiryTrackedDocs
    .filter((d) => d.expiry_date)
    .map((d) => ({ d, days: daysUntilExpiry(d.expiry_date as string, now) }))
    .filter((x) => x.days >= 0 && x.days <= DOCUMENT_EXPIRY_WARNING_DAYS)
    .sort((a, b) => a.days - b.days)
  if (expired.length === 0 && expiringSoon.length > 0) {
    issues.push(buildExpiryMessage(expiringSoon[0].d, expiringSoon[0].days))
  }

  const requiredSet = new Set(requiredDocs.map((d) => d.document_type))
  const missing = REQUIRED_DOCUMENT_TYPES.filter((docType) => !requiredSet.has(docType))
  if (missing.length > 0) {
    const label = missing[0] === 'medical_certificate'
      ? 'Medical Certificate'
      : missing[0] === 'pilot_licence'
      ? 'Pilot Licence'
      : 'Photo ID'
    issues.push(`Missing required document: ${label}`)
  }

  const missingExpiryDate = requiredDocs.find((d) => d.document_type === 'medical_certificate' && !d.expiry_date)
  if (missingExpiryDate) {
    issues.push(`${getDocumentDisplayName(missingExpiryDate)} needs expiry date review`)
  }

  return issues
}

export function getAttentionAssessment(context: AttentionContext): { reason: string; hasIssue: boolean } {
  const now = new Date()
  const docs = context.documentsByUser.get(context.profileId) ?? []
  const docIssues = documentIssuesForUser(docs, context.hasCheckoutRequest, now)
  const issues: string[] = []

  if (context.accountStatus === 'blocked') issues.push(ACCOUNT_BLOCKED_ATTENTION_REASON)

  const pendingCancellation = context.pendingCancellationByUser.get(context.profileId)
  if (pendingCancellation) {
    if (within12HourCutoff(pendingCancellation.createdAt, pendingCancellation.bookingStart)) {
      issues.push('Cancellation requested inside 12-hour cutoff, contact customer')
    } else {
      issues.push('Cancellation request pending admin review')
    }
  }

  const pendingReschedule = context.pendingCheckoutRescheduleByUser.get(context.profileId)
  if (pendingReschedule) {
    if (within12HourCutoff(pendingReschedule.createdAt, pendingReschedule.originalStart)) {
      issues.push('Reschedule requested inside 12-hour cutoff, contact customer')
    } else {
      issues.push('Reschedule request pending admin approval')
    }
  }

  const status = context.pilotClearanceStatus ?? 'checkout_required'
  if (status === 'additional_checkout_required') issues.push('Additional checkout required, review checkout outcome')
  if (status === 'not_currently_eligible') issues.push('Customer marked not currently eligible, review outcome notes')
  // Avoid stacking clearance-outcome "reschedule required" with an active pending change request
  if (status === 'checkout_reschedule_required' && !pendingReschedule) {
    issues.push('Reschedule request pending admin approval')
  }
  // Pending reschedule/cancel already explains why the checkout needs attention —
  // don't also stack the generic "checkout request submitted" copy.
  if (status === 'checkout_requested' && !pendingReschedule && !pendingCancellation) {
    issues.push(CHECKOUT_REQUEST_ATTENTION_REASON)
  }
  if (status === 'checkout_completed_under_review') issues.push(CHECKOUT_OUTCOME_ATTENTION_REASON)

  const shouldSuppressGenericDocumentReview =
    status === 'checkout_requested' || status === 'checkout_completed_under_review'

  const filteredDocIssues = shouldSuppressGenericDocumentReview
    ? docIssues.filter((issue) => !issue.endsWith('needs review'))
    : docIssues

  if (filteredDocIssues.length > 0) {
    issues.push(...filteredDocIssues)
  }

  const isKnownLifecycleOrFlowStatus = [
    'checkout_required',
    'checkout_requested',
    'checkout_confirmed',
    'checkout_completed_under_review',
    'checkout_payment_required',
    'cleared_to_fly',
    'additional_checkout_required',
    'checkout_reschedule_required',
    'not_currently_eligible',
  ].includes(status)
  if (context.hasCheckoutRequest && !isKnownLifecycleOrFlowStatus) {
    issues.push('Status inconsistency, review customer record')
  }

  if (issues.length === 0) return { reason: '', hasIssue: false }

  const primary = issues[0]
  if (issues.length === 1) return { reason: primary, hasIssue: true }
  // Surface the next concrete issue instead of an opaque "plus N other issues" count
  return {
    reason: `${primary}. Also: ${issues[1]}${issues.length > 2 ? ` (+${issues.length - 2} more)` : ''}`,
    hasIssue: true,
  }
}
