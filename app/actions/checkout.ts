'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isBookingTimeAllowed } from '@/lib/utils/day-vfr'
import { validateFlightReviewDate } from '@/lib/utils/flight-review'
import type {
  CreateCheckoutBookingInput,
  CheckoutBookingResult,
} from '@/lib/supabase/booking-types'

// ─── Auth guard (no verification requirement) ─────────────────────────────────
// Checkout bookings are created before the user is verified.
// We only require a valid authenticated session and a customer account.

async function requireCustomer() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, pilot_clearance_status, has_night_vfr_rating, has_instrument_rating')
    .eq('id', user.id)
    .single()

  if (!profile) throw new Error('Profile not found')
  if (profile.role !== 'customer') throw new Error('Not a customer account')

  return { supabase, userId: user.id, profile }
}

// ─── Submit checkout request ──────────────────────────────────────────────────
// Creates a checkout booking and sets pilot_clearance_status = checkout_requested.
//
// Server-side validation before calling the RPC:
//   1. Required documents (pilot_licence, medical_certificate, photo_id) must
//      be uploaded and not rejected or expired.
//   2. Time range must be valid and in the future.
//
// The RPC (create_checkout_booking_atomic) then enforces at the database layer:
//   • Clearance status allows a new checkout request
//   • No currently active checkout booking exists
//   • Aircraft is available
//   • No schedule block conflicts

export async function submitCheckoutRequest(
  input: CreateCheckoutBookingInput,
): Promise<CheckoutBookingResult> {
  const { supabase, userId, profile } = await requireCustomer()

  // ── Document gate ──────────────────────────────────────────────────────────
  // Validates all required document fields per document type.
  const { data: docs, error: docsErr } = await supabase
    .from('user_documents')
    .select('document_type, status, expiry_date, issue_date, licence_type, licence_number, medical_class, id_type, document_number')
    .eq('user_id', userId)

  if (docsErr) {
    throw new Error('VALIDATION: Unable to verify your documents. Please try again.')
  }

  const today = new Date().toISOString().split('T')[0]!
  const docMap = Object.fromEntries((docs ?? []).map(d => [d.document_type, d]))

  const missing: string[] = []

  // Pilot Licence: file uploaded, licence type, licence number (ARN)
  const licence = docMap['pilot_licence']
  if (!licence)                         missing.push('pilot licence (file required)')
  else if (licence.status === 'rejected') missing.push('pilot licence (document rejected — please replace)')
  else if (!licence.licence_type)       missing.push('pilot licence type')
  else if (!licence.licence_number)     missing.push('pilot licence number / ARN')

  // Medical Certificate: file, medical class, date of issue, expiry date (not expired)
  const medical = docMap['medical_certificate']
  if (!medical)                          missing.push('medical certificate (file required)')
  else if (medical.status === 'rejected') missing.push('medical certificate (document rejected — please replace)')
  else if (!medical.medical_class)       missing.push('medical certificate class')
  else if (!medical.issue_date)          missing.push('medical certificate date of issue')
  else if (!medical.expiry_date)         missing.push('medical certificate expiry date')
  else if (medical.expiry_date < today)  missing.push('medical certificate (expired — please replace)')

  // Photo ID: file, ID type, document number
  const photoId = docMap['photo_id']
  if (!photoId)                          missing.push('photo ID (file required)')
  else if (photoId.status === 'rejected') missing.push('photo ID (document rejected — please replace)')
  else if (!photoId.id_type)             missing.push('photo ID type')
  else if (!photoId.document_number)     missing.push('photo ID number')

  // Flight review date — required and must be within the last 2 years
  if (!input.last_flight_date) {
    missing.push('last flight review date')
  } else {
    const flightReviewErr = validateFlightReviewDate(input.last_flight_date)
    if (flightReviewErr) throw new Error(`VALIDATION: ${flightReviewErr}`)
  }

  // Pilot ratings — must be answered (true or false), null means not yet provided
  if (profile.has_night_vfr_rating === null || profile.has_instrument_rating === null) {
    throw new Error(
      'VALIDATION: Please confirm your Night VFR and Instrument Rating status before submitting a checkout request.'
    )
  }

  // Day VFR window check — pilots without Night VFR must depart within the seasonal window
  if (!isBookingTimeAllowed(input.scheduled_start, profile.has_night_vfr_rating)) {
    throw new Error(
      'VALIDATION: This checkout time falls outside the standard Day VFR booking window. A Night VFR Rating is required for this time.'
    )
  }

  if (missing.length > 0) {
    throw new Error(
      `VALIDATION: Please complete the required information before submitting your checkout request. Missing: ${missing.join(', ')}.`
    )
  }

  // ── Time validation ────────────────────────────────────────────────────────
  const start = new Date(input.scheduled_start)
  if (isNaN(start.getTime())) {
    throw new Error('VALIDATION: Invalid start time.')
  }
  if (start <= new Date()) {
    throw new Error('VALIDATION: Checkout flight time must be in the future.')
  }

  // p_scheduled_end is not passed — the RPC computes it as start + 1 hour
  const { data, error } = await supabase.rpc('create_checkout_booking_atomic', {
    p_aircraft_id:     input.aircraft_id,
    p_scheduled_start: input.scheduled_start,
    p_customer_notes:  input.customer_notes ?? null,
  })

  if (error) {
    console.error('[submitCheckoutRequest] RPC failed:', error)
    throw new Error(error.message)
  }

  const result = data as {
    booking_id:        string
    booking_reference: string
    scheduled_start:   string
    scheduled_end:     string
    status:            string
    estimated_hours:   number
    estimated_amount:  number
  }

  // Save last_flight_date to both the booking and the profile so the Documents
  // page stays in sync with the most recently submitted checkout date.
  if (input.last_flight_date) {
    await Promise.all([
      supabase
        .from('bookings')
        .update({ last_flight_date: input.last_flight_date })
        .eq('id', result.booking_id),
      supabase
        .from('profiles')
        .update({ last_flight_date: input.last_flight_date })
        .eq('id', userId),
    ])
  }

  // Notify customer — non-fatal
  const { error: notifErr } = await supabase.from('verification_events').insert({
    user_id:      userId,
    actor_role:   'customer',
    event_type:   'submitted',
    title:        'Checkout request submitted',
    body:         'Your checkout request has been submitted for review. You will be notified once a decision has been made.',
    is_read:      false,
    email_status: 'skipped',
  })
  if (notifErr) console.error('[submitCheckoutRequest] notification failed:', notifErr.message)

  revalidatePath('/dashboard')
  revalidatePath('/admin')

  return {
    bookingId:        result.booking_id,
    bookingReference: result.booking_reference,
    scheduledStart:   result.scheduled_start,
    scheduledEnd:     result.scheduled_end,
  }
}

// ─── Get checkout booking for current user ────────────────────────────────────
// Returns the user's active checkout booking (if any) for display in the UI.

export async function getMyCheckoutBooking() {
  const { supabase, userId } = await requireCustomer()

  const { data } = await supabase
    .from('bookings')
    .select('id, booking_reference, scheduled_start, scheduled_end, status, booking_type, created_at')
    .eq('booking_owner_user_id', userId)
    .eq('booking_type', 'checkout')
    .in('status', ['checkout_requested', 'checkout_confirmed', 'checkout_completed_under_review'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return data ?? null
}

