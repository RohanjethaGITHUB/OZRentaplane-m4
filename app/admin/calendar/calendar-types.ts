import type { BlockStatus, BlockType, BookingStatus, BookingType, PaymentStatus } from '@/lib/supabase/booking-types'

export type AdminCalendarView = 'day' | 'week' | 'month'

export type AdminCalendarEventType =
  | 'checkout'
  | 'booking'
  | 'maintenance'
  | 'blocked'
  | 'buffer'
  | 'fallback'

export type AdminCalendarAircraftOption = {
  id: string
  registration: string
  model: string | null
  status: string | null
  statusLabel: string | null
}

export type AdminCalendarEvent = {
  eventId: string
  sourceBlockId: string
  relatedBookingId: string | null
  customerId: string | null
  aircraftId: string
  aircraftRegistration: string
  aircraftModel: string | null
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
  eventType: AdminCalendarEventType
  blockType: BlockType
  bookingType: BookingType | null
  title: string
  publicLabel: string | null
  internalReason: string | null
  startIso: string
  endIso: string
  startSydneyDateKey: string
  endSydneyDateKey: string
  durationMinutes: number | null
  isMultiDay: boolean
  isAllDay: boolean | null
  bookingStatus: BookingStatus | null
  paymentStatus: PaymentStatus | null
  checkoutStatus: string | null
  flightRecordStatus: string | null
  postFlightStatus: string | null
  blockStatus: BlockStatus
  primaryHref: string | null
  bookingHref: string | null
  customerHref: string | null
  aircraftHref: string | null
  maintenanceHref: string | null
  eventTypeLabel: string
  statusLabel: string | null
  conflictState: null
  warningFlags: string[]
}
