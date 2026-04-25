'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type {
  CreateCheckoutBookingInput,
  CreateProvisionalSoloInput,
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
    .select('role, pilot_clearance_status')
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
  const { supabase, userId } = await requireCustomer()

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

  // Last flight date
  if (!input.last_flight_date) missing.push('last flight date')

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

  // Save last_flight_date to the booking (not part of the atomic RPC)
  if (input.last_flight_date) {
    await supabase
      .from('bookings')
      .update({ last_flight_date: input.last_flight_date })
      .eq('id', result.booking_id)
  }

  revalidatePath('/dashboard')
  revalidatePath('/admin')

  return {
    bookingId:        result.booking_id,
    bookingReference: result.booking_reference,
    scheduledStart:   result.scheduled_start,
    scheduledEnd:     result.scheduled_end,
  }
}

// ─── Create provisional first solo booking ────────────────────────────────────
// The customer may reserve one provisional first solo booking after submitting
// their checkout request. It will only be confirmed after checkout clearance.
//
// Enforced by create_provisional_solo_booking RPC:
//   • pilot_clearance_status must be in (checkout_requested, checkout_confirmed,
//     checkout_completed_under_review)
//   • Only one pending_checkout_clearance booking per user
//   • Must be >= 24h after the checkout flight end time

export async function createProvisionalSoloBooking(
  input: CreateProvisionalSoloInput,
): Promise<{ bookingId: string; bookingReference: string }> {
  const { supabase } = await requireCustomer()

  const start = new Date(input.scheduled_start)
  const end   = new Date(input.scheduled_end)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('VALIDATION: Invalid start or end time.')
  }
  if (end <= start) {
    throw new Error('VALIDATION: End time must be after start time.')
  }
  if (start <= new Date()) {
    throw new Error('VALIDATION: Flight time must be in the future.')
  }

  const { data, error } = await supabase.rpc('create_provisional_solo_booking', {
    p_aircraft_id:     input.aircraft_id,
    p_scheduled_start: input.scheduled_start,
    p_scheduled_end:   input.scheduled_end,
    p_customer_notes:  input.customer_notes ?? null,
  })

  if (error) {
    console.error('[createProvisionalSoloBooking] RPC failed:', error)
    throw new Error(error.message)
  }

  const result = data as { booking_id: string; booking_reference: string }

  revalidatePath('/dashboard')
  revalidatePath('/admin')

  return {
    bookingId:        result.booking_id,
    bookingReference: result.booking_reference,
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

// ─── Get provisional solo booking for current user ────────────────────────────

export async function getMyProvisionalSoloBooking() {
  const { supabase, userId } = await requireCustomer()

  const { data } = await supabase
    .from('bookings')
    .select('id, booking_reference, scheduled_start, scheduled_end, status, booking_type, created_at')
    .eq('booking_owner_user_id', userId)
    .eq('status', 'pending_checkout_clearance')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return data ?? null
}
