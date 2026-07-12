import type { BlockType, BookingStatus, BookingType, PaymentStatus, ScheduleBlock } from '@/lib/supabase/booking-types'
import { deriveEventCoverageKeys } from './calendar-range'
import type { AdminCalendarEvent } from './calendar-types'

type AircraftRow = {
  id: string
  registration: string
  aircraft_type: string | null
}

type BookingFlightRecord = {
  status: string | null
  submitted_at: string | null
}

type BookingSummary = {
  id: string
  booking_reference: string | null
  booking_type: BookingType
  booking_owner_user_id: string
  status: BookingStatus
  payment_status: PaymentStatus | null
  checkout_lifecycle_status: string | null
  pic_name: string | null
  flight_records?: BookingFlightRecord[] | null
}

type ProfileSummary = {
  id: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone_country_code: string | null
  phone_number: string | null
}

function humanizeStatus(value: string | null) {
  if (!value) return null
  return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function getProfileName(profile: ProfileSummary | null | undefined, fallback: string | null) {
  if (profile?.full_name?.trim()) return profile.full_name.trim()
  const parts = [profile?.first_name, profile?.last_name].filter(Boolean)
  if (parts.length > 0) return parts.join(' ').trim()
  return fallback
}

function formatPhone(profile: ProfileSummary | null | undefined) {
  const phoneNumber = profile?.phone_number?.trim()
  if (!phoneNumber) return null
  const countryCode = profile?.phone_country_code?.trim()
  return countryCode ? `${countryCode} ${phoneNumber}` : phoneNumber
}

function getEventType(blockType: BlockType, bookingType: BookingType | null, hasBooking: boolean): AdminCalendarEvent['eventType'] {
  if (blockType === 'customer_booking') {
    if (!hasBooking) return 'fallback'
    return bookingType === 'checkout' ? 'checkout' : 'booking'
  }
  if (blockType === 'buffer') return 'buffer'
  if (blockType === 'maintenance' || blockType === 'inspection') return 'maintenance'
  return 'blocked'
}

function getEventTypeLabel(eventType: AdminCalendarEvent['eventType']) {
  if (eventType === 'checkout') return 'Checkout Flight'
  if (eventType === 'booking') return 'Customer Booking'
  if (eventType === 'buffer') return 'Buffer'
  if (eventType === 'maintenance') return 'Maintenance'
  if (eventType === 'blocked') return 'Blocked Time'
  return 'Fallback'
}

function getBlockTitle(block: ScheduleBlock, eventType: AdminCalendarEvent['eventType']) {
  if (eventType === 'checkout') return 'Checkout Flight'
  if (eventType === 'booking') return 'Customer Booking'
  if (eventType === 'buffer') return 'Buffer'
  if (eventType === 'maintenance') return block.public_label?.trim() || humanizeStatus(block.block_type) || 'Maintenance'
  if (eventType === 'blocked') return block.public_label?.trim() || humanizeStatus(block.block_type) || 'Blocked Time'
  return block.block_type === 'customer_booking' ? 'Orphan schedule block' : humanizeStatus(block.block_type) || 'Schedule block'
}

function getDurationMinutes(startIso: string, endIso: string) {
  const startMs = new Date(startIso).getTime()
  const endMs = new Date(endIso).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null
  return Math.round((endMs - startMs) / 60000)
}

export function mapScheduleBlockToAdminCalendarEvent(input: {
  block: ScheduleBlock
  aircraft: AircraftRow
  booking: BookingSummary | null
  profile: ProfileSummary | null
}): AdminCalendarEvent {
  const { block, aircraft, booking, profile } = input
  const eventType = getEventType(block.block_type, booking?.booking_type ?? null, Boolean(booking))
  const bookingHref = booking ? `/admin/bookings/requests/${booking.id}` : null
  const customerHref = booking?.booking_owner_user_id ? `/admin/users/${booking.booking_owner_user_id}` : null
  const aircraftHref = `/admin/aircraft/${aircraft.id}/flight-log`
  const maintenanceHref = `/admin/aircraft/${aircraft.id}/maintenance`
  const coverage = deriveEventCoverageKeys(block.start_time, block.end_time)
  const customerName = getProfileName(profile, booking?.pic_name ?? null)

  let primaryHref: string | null = null
  if (eventType === 'checkout' || eventType === 'booking') primaryHref = bookingHref
  else if (eventType === 'maintenance') primaryHref = maintenanceHref
  else if ((eventType === 'buffer' || eventType === 'fallback') && bookingHref) primaryHref = bookingHref

  const warningFlags: string[] = []
  if (block.block_type === 'temporary_hold') warningFlags.push('temporary_hold')
  if (block.block_type === 'customer_booking' && !booking) warningFlags.push('orphan_related_booking')

  return {
    eventId: block.id,
    sourceBlockId: block.id,
    relatedBookingId: booking?.id ?? null,
    customerId: booking?.booking_owner_user_id ?? null,
    aircraftId: aircraft.id,
    aircraftRegistration: aircraft.registration,
    aircraftModel: aircraft.aircraft_type ?? null,
    customerName,
    customerEmail: profile?.email ?? null,
    customerPhone: formatPhone(profile),
    eventType,
    blockType: block.block_type,
    bookingType: booking?.booking_type ?? null,
    title: getBlockTitle(block, eventType),
    publicLabel: block.public_label ?? null,
    internalReason: block.internal_reason ?? null,
    startIso: block.start_time,
    endIso: block.end_time,
    startSydneyDateKey: coverage.startSydneyDateKey,
    endSydneyDateKey: coverage.endSydneyDateKey,
    durationMinutes: getDurationMinutes(block.start_time, block.end_time),
    isMultiDay: coverage.isMultiDay,
    isAllDay: null,
    bookingStatus: booking?.status ?? null,
    paymentStatus: booking?.payment_status ?? null,
    checkoutStatus: booking?.checkout_lifecycle_status ?? null,
    flightRecordStatus: null,
    postFlightStatus: null,
    blockStatus: block.status,
    primaryHref,
    bookingHref,
    customerHref,
    aircraftHref,
    maintenanceHref,
    eventTypeLabel: getEventTypeLabel(eventType),
    statusLabel: humanizeStatus(booking?.status ?? block.status),
    conflictState: null,
    warningFlags,
  }
}
