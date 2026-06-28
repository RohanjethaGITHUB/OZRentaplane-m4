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

export type DocumentType = 'pilot_licence' | 'medical_certificate' | 'photo_id' | 'night_vfr_evidence'
export type DocumentStatus = 'uploaded' | 'approved' | 'rejected'

export type Profile = {
  id: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  phone_country_code: string | null
  phone_number: string | null
  email: string | null
  stripe_customer_id: string | null
  default_payment_method_id: string | null
  role: Role
  account_status: AccountStatus           // active | blocked | archived
  account_lock_reason: 'checkout_no_show' | null
  account_locked_at: string | null
  account_locked_by_admin_id: string | null
  account_unlocked_at: string | null
  account_unlocked_by_admin_id: string | null
  verification_status: VerificationStatus  // legacy; kept for verification_events history
  pilot_clearance_status: PilotClearanceStatus
  pilot_arn: string | null   // Aviation Reference Number — set after verification
  has_night_vfr_rating: boolean | null   // null = not answered, true = yes, false = no
  has_instrument_rating: boolean | null  // null = not answered, true = yes, false = no
  last_flight_date: string | null  // YYYY-MM-DD — shared between Documents page and checkout flow
  last_login_at: string | null
  login_count: number
  last_bookings_viewed_at: string | null
  last_notification_seen_at: string | null
  must_change_password: boolean
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
  has_red_card: boolean | null
  red_card_expiry_month: number | null
  red_card_expiry_year: number | null
  user_document_files?: {
    id: string
    file_name: string
    storage_path: string
    uploaded_at: string
  }[]
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

export type BlockTimePackageStatus = 'pending' | 'active' | 'exhausted' | 'expired' | 'refunded'

export type BlockTimePackage = {
  id: string
  name: string
  hours: number
  rate_per_hour: number
  total_price: number
  validity_days: number
  is_active: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export type BlockTimePurchase = {
  id: string
  user_id: string
  package_id: string
  hours_purchased: number
  hours_remaining: number
  rate_per_hour: number
  amount_paid: number
  status: BlockTimePackageStatus
  purchased_at: string
  activated_at: string | null
  expires_at: string
  stripe_payment_intent_id: string | null
  queue_position: number | null
  refund_amount: number | null
  refunded_at: string | null
  refund_stripe_id: string | null
  created_at: string
  updated_at: string
}

export type InvoiceType = 'block_time_purchase' | 'flight' | 'credit_note'
export type InvoiceStatus = 'draft' | 'paid' | 'awaiting' | 'void' | 'refunded'
export type BillingMode = 'pay_as_you_fly' | 'block_time'
export type InvoicePaymentMethod = 'stripe' | 'bank_transfer'

export type Invoice = {
  id: string
  invoice_number: string
  type: InvoiceType
  user_id: string
  booking_id: string | null
  block_time_purchase_id: string | null
  related_invoice_id: string | null
  billing_mode: BillingMode | null
  subtotal: number
  gst_amount: number
  total: number
  status: InvoiceStatus
  payment_method: InvoicePaymentMethod | null
  stripe_payment_intent_id: string | null
  bank_transfer_reference: string | null
  bank_transfer_confirmed_at: string | null
  bank_transfer_confirmed_by: string | null
  pdf_url: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
}

export type InvoiceLineItemType =
  | 'flight_hours'
  | 'block_time_hours'
  | 'overflow_hours'
  | 'landing_fee'
  | 'overnight_parking'

export type InvoiceLineItem = {
  id: string
  invoice_id: string
  type: InvoiceLineItemType
  description: string
  quantity: number
  unit_price: number
  amount: number
  display_order: number
  created_at: string
}

export type BlockTimeUsage = {
  id: string
  purchase_id: string
  user_id: string
  booking_id: string
  invoice_id: string | null
  hours_deducted: number
  overflow_hours: number
  overflow_amount: number
  hours_before: number
  hours_after: number
  deducted_at: string
  created_at: string
}

export type BlockTimeSummary = {
  hasActivePackage: boolean
  totalHoursRemaining: number
  activePackages: (BlockTimePurchase & { package?: BlockTimePackage })[]
  earliestExpiry: string | null
}
