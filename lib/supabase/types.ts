export type Role = 'customer' | 'admin'

export type AccountStatus = 'active' | 'blocked' | 'archived'

export type VerificationStatus =
  | 'not_started'
  | 'pending_review'
  | 'verified'
  | 'rejected'
  | 'on_hold'

export type PilotClearanceStatus =
  | 'checkout_required'
  | 'checkout_requested'
  | 'checkout_confirmed'
  | 'checkout_completed_under_review'
  | 'checkout_payment_required'
  | 'cleared_to_fly'
  | 'additional_checkout_required'
  | 'checkout_reschedule_required'
  | 'not_currently_eligible'

export type DocumentType = 'pilot_licence' | 'medical_certificate' | 'photo_id'
export type DocumentStatus = 'uploaded' | 'approved' | 'rejected'

export type Profile = {
  id: string
  full_name: string | null
  email: string | null
  role: Role
  account_status: AccountStatus           // active | blocked | archived
  verification_status: VerificationStatus  // legacy; kept for verification_events history
  pilot_clearance_status: PilotClearanceStatus
  pilot_arn: string | null   // Aviation Reference Number — set after verification
  last_flight_date: string | null  // YYYY-MM-DD — shared between Documents page and checkout flow
  last_login_at: string | null
  login_count: number
  last_bookings_viewed_at: string | null
  last_notification_seen_at: string | null
  created_at: string
  updated_at: string
}

// Notification item derived from verification_events for the bell popover
export type PopoverNotification = {
  id: string
  title: string
  body: string | null
  event_type: string
  created_at: string
  is_new: boolean
  href?: string | null
}

export type UserDocument = {
  id: string
  user_id: string
  document_type: DocumentType
  file_name: string
  storage_path: string
  status: DocumentStatus
  review_notes: string | null
  uploaded_at: string
  expiry_date: string | null     // YYYY-MM-DD — expiry date (medical_certificate required)
  issue_date: string | null      // YYYY-MM-DD — date of issue (medical_certificate)
  reviewed_at: string | null
  created_at: string
  updated_at: string
  // Per-document metadata (migration 017 + 024)
  licence_type: string | null    // RPL | PPL | CPL | Other (pilot_licence)
  licence_number: string | null  // Pilot licence number / ARN (pilot_licence)
  medical_class: string | null   // Class 1 | Class 2 | Basic Class 2 | Other (medical_certificate)
  id_type: string | null         // Passport | Driver Licence | Other (photo_id)
  document_number: string | null // Document reference number (photo_id)
}

// ─── Verification events ──────────────────────────────────────────────────────
// Customer-visible record of every status change and admin communication.
// Internal admin notes are NOT stored here — only customer-facing content.
//
// request_kind is set by admin when event_type = 'on_hold' to tell the
// customer what kind of response is expected:
//   - document_request      → customer should upload or replace documents
//   - clarification_request → customer should reply by message
//   - confirmation_request  → customer should confirm by message
//   - general_update        → informational, no specific action required

export type EventType = 'submitted' | 'approved' | 'rejected' | 'on_hold' | 'resubmitted' | 'message'
export type ActorRole = 'admin' | 'system' | 'customer'
export type EmailStatus = 'pending' | 'sent' | 'failed' | 'skipped'
export type RequestKind =
  | 'document_request'
  | 'clarification_request'
  | 'confirmation_request'
  | 'general_update'
  | 'booking_update'
  | 'message'

// ─── Admin inbox thread summary ───────────────────────────────────────────────
// Aggregated view of one customer's chat thread for the admin inbox list.

export type ThreadSummary = {
  customerId: string
  customerName: string | null
  customerEmail: string | null
  verificationStatus: VerificationStatus
  lastMessageBody: string | null
  lastMessageAt: string | null
  lastMessageRole: ActorRole | null
  unreadCount: number
  totalMessages: number
}

export type VerificationEvent = {
  id: string
  user_id: string
  actor_user_id: string | null
  actor_role: ActorRole
  event_type: EventType
  from_status: VerificationStatus | null
  to_status: VerificationStatus | null
  title: string
  body: string | null
  request_kind: RequestKind | null
  is_read: boolean
  admin_read_at: string | null
  email_status: EmailStatus
  email_sent_at: string | null
  created_at: string
}
