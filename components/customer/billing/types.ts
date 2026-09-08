export type SettlementType =
  | 'CUSTOMER_PAYMENT'
  | 'ADMIN_WAIVER'
  | 'ADMIN_SETTLEMENT'
  | 'REFUND'
  | 'ADJUSTMENT'

export type PaymentStatus =
  | 'PAID'
  | 'PARTIALLY_PAID'
  | 'PENDING'
  | 'FAILED'
  | 'REFUNDED'
  | 'WAIVED'
  | 'SETTLED'
  | 'CANCELLED'

export type PaymentMethodType =
  | 'card'
  | 'cash'
  | 'online_payment'
  | 'bank_transfer'
  | 'block_time'
  | 'other'
  | 'none'

export type CardDetails = {
  brand?: 'visa' | 'mastercard' | 'amex' | string
  last4?: string
  expiry?: string
}

export type PaymentRecord = {
  id: string
  amount: number
  method: PaymentMethodType
  settlementType: SettlementType
  status: PaymentStatus
  paidAt?: string | null
  transactionId?: string | null
  provider?: string | null
  card?: CardDetails | null
  recordedBy?: string | null
  bankReference?: string | null
  waiverReason?: string | null
  settlementReason?: string | null
  note?: string | null
}

export type InvoiceLineItem = {
  description: string
  quantity?: number
  unitPrice?: number
  amount: number
}

export type InvoiceRefundInfo = {
  amount: number
  refundDate: string
  reference: string
  reason?: string
}

export type InvoiceTimelineEvent = {
  id: string
  title: string
  description: string
  timestamp: string
  icon?: string
  type?: 'payment' | 'invoice' | 'receipt' | 'waiver' | 'settlement' | 'refund'
}

export type CustomerBillingDetails = {
  name: string
  email: string
  phone?: string | null
  address?: string | null
}

export type CustomerInvoice = {
  id: string
  invoiceNumber: string
  bookingId?: string | null
  bookingReference?: string | null
  serviceName: string
  aircraftRegistration?: string | null
  aircraftModel?: string | null
  serviceType: 'rental' | 'checkout' | 'package' | 'landing_fee' | 'overage'
  date: string
  amount: number
  paidAmount: number
  outstandingAmount: number
  currency: string
  status: PaymentStatus
  settlementType: SettlementType
  paymentMethod: PaymentMethodType
  card?: CardDetails | null
  transactionId?: string | null
  provider?: string | null
  bankReference?: string | null
  pdfUrl?: string | null
  payUrl?: string | null
  
  // Line items & totals
  items: InvoiceLineItem[]
  subtotal: number
  gst: number
  serviceFee?: number
  total: number

  // Admin audit fields
  adminName?: string | null
  waivedBy?: string | null
  waivedAt?: string | null
  waiverReason?: string | null
  settledBy?: string | null
  settledAt?: string | null
  settlementReason?: string | null

  // Multiple payments / partial / refunds
  payments: PaymentRecord[]
  refunds?: InvoiceRefundInfo[]

  // Timeline events
  timeline?: InvoiceTimelineEvent[]
}

export type BlockTimePackageSummary = {
  id: string
  name: string
  hoursPurchased: number
  hoursRemaining: number
  ratePerHour: number
  amountPaid: number
  status: string
  purchasedAt: string
  expiresAt: string
}

export type FlightUsageItem = {
  id: string
  bookingId: string
  bookingRef: string | null
  aircraftReg: string | null
  date: string
  hoursDeducted: number
  hoursAfter: number
  overflowHours: number
  overflowAmount: number
  invoicePdfUrl?: string | null
}

export type RecentActivityItem = {
  id: string
  title: string
  description: string
  timestamp: string
  type: 'payment' | 'invoice' | 'receipt' | 'waiver' | 'settlement' | 'refund'
  invoiceNumber?: string
  amount?: number
  methodLabel?: string
}
