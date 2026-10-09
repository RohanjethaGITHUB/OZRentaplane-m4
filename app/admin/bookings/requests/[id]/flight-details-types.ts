export type FlightLandingItem = {
  airportName: string
  icaoCode: string
  count: number
  unitFeeCents: number
  totalFeeCents: number
}

export type FlightEvidenceItem = {
  id: string
  fileName: string
  signedUrl: string
  fileSize?: number | null
}

export type FlightBlockTimeDetails = {
  packageHoursDeducted: number
  overageHours?: number
  overageAmountCents?: number
  landingFeesCents?: number
  packageName?: string | null
  isExpired?: boolean
  isExhausted?: boolean
  expiresAt?: string | null
  packageRatePerHour?: number | null
  landingInvoiceNumber?: string | null
  usageInvoiceNumber?: string | null
  overageInvoiceNumber?: string | null
  detailLines?: { label: string; value: string }[]
}

export type FlightMultiDayMinimumDetails = {
  isMultiDay: boolean
  bookingDays: number
  minimumHours: number
  actualHours: number
  billedHours: number
  decision: 'enforce_minimum' | 'bill_actual'
  isBelowMinimum: boolean
  explanation: string
}

export type FlightDetailsData = {
  bookingId: string
  bookingReference: string
  bookingType: 'standard' | 'checkout'
  isMultiDay?: boolean
  daysCount?: number
  flightDate: string | null
  scheduledTimeRange?: string | null
  aircraft: {
    registration: string
    model: string
  }
  pilot: {
    name: string
    arn?: string | null
    email?: string | null
    phone?: string | null
  }
  readings: {
    vdoHours: number | null
    airSwitchHours: number | null
  }
  landings: {
    totalLandings: number
    breakdown: FlightLandingItem[]
  }
  pricing: {
    hourlyRateCents: number
    billableHours: number
    flightAmountCents: number
    landingSubtotalCents: number
    subtotalCents: number
    advanceAppliedCents: number
    amountDueCents: number
    totalPaidCents: number
    status: string
    waiverReason?: string | null
    invoiceNumber?: string | null
    paymentMethod?: string | null
    paidAt?: string | null
    isBlockTime?: boolean
    blockTimeDetails?: FlightBlockTimeDetails | null
    multiDayMinimum?: FlightMultiDayMinimumDetails | null
  }
  operational?: {
    customerNotes?: string | null
    adminNotes?: string | null
    evidenceAttachments?: FlightEvidenceItem[]
    receiptUrl?: string | null
  }
  receiptUrl?: string | null
}
