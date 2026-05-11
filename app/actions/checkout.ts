'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeActiveCheckoutTerms } from '@/lib/checkout-terms'
import { isWithinDayVfrWindow } from '@/lib/utils/day-vfr'
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
  const ACCEPTANCE_TEXT = 'I have read and accept the Checkout Terms and Conditions.'

  // ── Document gate ──────────────────────────────────────────────────────────
  // Validates all required document fields per document type.
  const { data: docs, error: docsErr } = await supabase
    .from('user_documents')
    .select('document_type, status, expiry_date, issue_date, licence_type, licence_number, medical_class, id_type, document_number')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (docsErr) {
    throw new Error('VALIDATION: Unable to verify your documents. Please try again.')
  }

  const today = new Date().toISOString().split('T')[0]!
  const docMap: Record<string, typeof docs[0]> = {}

  // Build a map of the best (latest non-rejected, non-expired) row per type.
  // Multiple rows per type are now allowed; we validate against the most recent valid one.
  for (const d of (docs ?? [])) {
    const isRejected = d.status === 'rejected'
    const isExpired  = d.expiry_date ? d.expiry_date < today : false
    const existing   = docMap[d.document_type]
    // Prefer: non-rejected and non-expired; then latest by insertion order (docs are ordered by created_at desc)
    if (!existing) {
      docMap[d.document_type] = d
    } else if (!isRejected && !isExpired) {
      // Replace if current best is rejected or expired
      const existingRejected = existing.status === 'rejected'
      const existingExpired  = existing.expiry_date ? existing.expiry_date < today : false
      if (existingRejected || existingExpired) docMap[d.document_type] = d
    }
  }

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

  // Night VFR: use the form selection (not just the stored profile value),
  // then verify against the profile to ensure evidence has been uploaded.
  if (input.has_night_vfr === null) {
    throw new Error(
      'VALIDATION: Please confirm your Night VFR rating status before submitting a checkout request.'
    )
  }

  // Instrument rating must be answered on the stored profile.
  if (profile.has_instrument_rating === null) {
    throw new Error(
      'VALIDATION: Please confirm your Instrument Rating status before submitting a checkout request.'
    )
  }

  // Night VFR evidence gate: require at least one valid night_vfr_evidence document.
  if (input.has_night_vfr === true) {
    const nightVfrEvidence = docMap['night_vfr_evidence']
    const hasValidEvidence =
      !!nightVfrEvidence &&
      nightVfrEvidence.status !== 'rejected' &&
      !(nightVfrEvidence.expiry_date && nightVfrEvidence.expiry_date < today)
    if (!hasValidEvidence) {
      throw new Error(
        'VALIDATION: Please upload Night VFR evidence before requesting a night checkout.'
      )
    }
  }

  // Day VFR window check — only applied when Night VFR is not confirmed.
  if (input.has_night_vfr !== true) {
    if (!isWithinDayVfrWindow(input.scheduled_time_sydney, input.scheduled_date_sydney, 120)) {
      throw new Error(
        'VALIDATION: Checkout bookings reserve a 2-hour window and must fit within the allowed flight window.'
      )
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `VALIDATION: Please complete the required information before submitting your checkout request. Missing: ${missing.join(', ')}.`
    )
  }

  if (!input.terms_accepted) {
    throw new Error('VALIDATION: You must accept the Checkout Terms and Conditions before submitting.')
  }

  let activeTermsRow: Record<string, unknown> | null = null
  {
    const primary = await supabase
      .from('terms_documents')
      .select('*')
      .eq('is_active', true)
      .order('effective_from', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()

    activeTermsRow = (primary.data as Record<string, unknown> | null)
      ?? (await supabase
        .from('terms_documents')
        .select('*')
        .order('effective_from', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()).data as Record<string, unknown> | null
    if (!activeTermsRow) {
      // RLS-safe fallback: use service role for authoritative active terms lookup.
      const admin = createAdminClient()
      const adminPrimary = await admin
        .from('terms_documents')
        .select('*')
        .eq('is_active', true)
        .order('effective_from', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
      activeTermsRow = (adminPrimary.data as Record<string, unknown> | null)
        ?? (await admin
          .from('terms_documents')
          .select('*')
          .order('effective_from', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle()).data as Record<string, unknown> | null
    }
  }
  const normalizedTerms = normalizeActiveCheckoutTerms(activeTermsRow)
  if (!normalizedTerms) {
    throw new Error('VALIDATION: No active checkout terms document is available right now. Please try again.')
  }
  const activeTermsId = normalizedTerms.id
  const activeTermsVersion = normalizedTerms.version
  const activeTermsUrl = normalizedTerms.public_url
  const activeTermsHash = normalizedTerms.content_hash
  if (!input.terms_document_id || !input.terms_version || !input.terms_content_hash) {
    throw new Error('VALIDATION: Terms acceptance details were not submitted. Please review and accept terms again.')
  }
  if (input.terms_document_id !== activeTermsId || input.terms_version !== activeTermsVersion) {
    throw new Error('VALIDATION: Checkout Terms and Conditions were updated. Please review and accept the latest version.')
  }
  if (activeTermsHash && input.terms_content_hash !== activeTermsHash) {
    throw new Error('VALIDATION: Checkout Terms and Conditions were updated. Please review and accept the latest version.')
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

  const rpcRow = Array.isArray(data) ? data[0] : data
  const result = rpcRow as {
    booking_id:        string
    booking_reference: string
    scheduled_start:   string
    scheduled_end:     string
    status:            string
    estimated_hours:   number
    estimated_amount:  number
  }
  const bookingId = typeof result?.booking_id === 'string' ? result.booking_id : ''
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bookingId)
  if (!isUuid) {
    console.error('[submitCheckoutRequest] RPC returned invalid booking_id shape:', {
      data,
      parsed: result,
    })
    throw new Error('Checkout request could not be created due to an invalid server response. Please try again.')
  }

  if (process.env.NODE_ENV !== 'production') {
    console.info(
      '[submitCheckoutRequest] booking_id=%s status=%s booking_reference=%s scheduled_start=%s',
      bookingId,
      result.status,
      result.booking_reference,
      result.scheduled_start,
    )
  }

  const h = await headers()
  const forwardedFor = h.get('x-forwarded-for')
  const acceptedIp =
    forwardedFor?.split(',')[0]?.trim() ||
    h.get('x-real-ip')?.trim() ||
    h.get('cf-connecting-ip')?.trim() ||
    null
  const userAgent = h.get('user-agent') ?? null

  const admin = createAdminClient()
  const acceptancePayload = {
    user_id: userId,
    booking_id: null,
    checkout_request_id: bookingId,
    terms_document_id: activeTermsId,
    terms_version: activeTermsVersion,
    terms_document_url: input.terms_document_url || activeTermsUrl,
    terms_content_hash: input.terms_content_hash || (activeTermsHash || null),
    acceptance_text: ACCEPTANCE_TEXT,
    accepted_ip: acceptedIp,
    user_agent: userAgent,
  }

  const { error: termsErr } = await admin
    .from('booking_terms_acceptances')
    .insert(acceptancePayload)
  if (termsErr) {
    console.error('[submitCheckoutRequest] booking_terms_acceptances insert failed:', {
      message: termsErr.message,
      details: termsErr.details,
      hint: termsErr.hint,
      code: termsErr.code,
      booking_id: bookingId,
      user_id: userId,
      terms_document_id: activeTermsId,
      terms_version: activeTermsVersion,
      terms_content_hash: acceptancePayload.terms_content_hash,
    })
    const rollback: {
      attempted: boolean
      blocks_deleted: number | null
      booking_deleted: boolean
      profile_restored: boolean
      error: string | null
      skipped_cleanup_reason: string | null
    } = {
      attempted: true,
      blocks_deleted: null,
      booking_deleted: false,
      profile_restored: false,
      error: null,
      skipped_cleanup_reason: null,
    }

    try {
      if (!isUuid) {
        rollback.skipped_cleanup_reason = 'booking_id missing/invalid; cleanup not attempted'
      } else {
        const { count: deletedBlocks, error: blocksErr } = await admin
          .from('schedule_blocks')
          .delete({ count: 'exact' })
          .eq('related_booking_id', bookingId)
        if (blocksErr) throw new Error(`schedule_blocks cleanup failed: ${blocksErr.message}`)
        rollback.blocks_deleted = deletedBlocks ?? 0

        const { error: bookingDeleteErr } = await admin
          .from('bookings')
          .delete()
          .eq('id', bookingId)
          .eq('booking_owner_user_id', userId)
          .eq('booking_type', 'checkout')
          .eq('status', 'checkout_requested')
        if (bookingDeleteErr) throw new Error(`booking cleanup failed: ${bookingDeleteErr.message}`)
        rollback.booking_deleted = true

        const previousClearance = profile.pilot_clearance_status
        if (previousClearance && previousClearance !== 'checkout_requested') {
          const { error: profileRestoreErr } = await admin
            .from('profiles')
            .update({ pilot_clearance_status: previousClearance, updated_at: new Date().toISOString() })
            .eq('id', userId)
          if (profileRestoreErr) throw new Error(`profile restore failed: ${profileRestoreErr.message}`)
          rollback.profile_restored = true
        }
      }
    } catch (rollbackErr) {
      rollback.error = rollbackErr instanceof Error ? rollbackErr.message : 'unknown rollback error'
      console.error('[submitCheckoutRequest] rollback failed after terms insert error:', {
        booking_id: bookingId || null,
        user_id: userId,
        rollback,
      })
    }

    const isSchemaCacheError =
      termsErr.code === 'PGRST204' &&
      (termsErr.message?.includes("'terms_content_hash' column") || termsErr.message?.includes('schema cache'))

    if (process.env.NODE_ENV !== 'production') {
      if (isSchemaCacheError) {
        throw new Error(
          `Unable to record your terms acceptance. Schema cache mismatch for booking_terms_acceptances. Apply migration 059/061 and run: notify pgrst, 'reload schema'. DB error: ${termsErr.message}. Rollback: ${JSON.stringify(rollback)}`
        )
      }
      throw new Error(
        `Unable to record your terms acceptance. DB error: ${termsErr.message}${termsErr.code ? ` (code ${termsErr.code})` : ''}. Rollback: ${JSON.stringify(rollback)}`
      )
    }
    throw new Error('Unable to record your terms acceptance. Please try again.')
  }

  // Save last_flight_date to both the booking and the profile so the Documents
  // page stays in sync with the most recently submitted checkout date.
  if (input.last_flight_date) {
    await Promise.all([
      supabase
        .from('bookings')
        .update({ last_flight_date: input.last_flight_date })
        .eq('id', bookingId),
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
  revalidatePath('/admin/checkouts')
  revalidatePath('/admin/checkouts/all')

  return {
    bookingId,
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
