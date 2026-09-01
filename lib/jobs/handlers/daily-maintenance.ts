import type { JobDefinition, JobContext } from '../types'
import { isAwaitingFlightRecordDue } from '@/lib/booking/flight-record-status'
import { getDaysUntilInSydney } from '../sydney-time'
import {
  enqueueDocumentExpiryReminderEmail,
  enqueueAdminDocumentExpiryAlertEmail,
  enqueueBlockTimeExpiryReminderEmail,
  enqueueBlockTimeLowBalanceEmail,
  enqueueAdminNewUserInactivityAlertEmail,
  enqueueUnpaidInvoiceCustomerEmail,
  enqueueAdminUnpaidInvoiceAlertEmail,
  enqueueOnboardingNoDocsReminderEmail,
  enqueueOnboardingIncompleteDocsReminderEmail,
  enqueueOnboardingRequestCheckoutReminderEmail,
  enqueueOnboardingActionRequiredReminderEmail,
  enqueueAdminPendingCheckoutReminderEmail,
  enqueueAdminCheckoutUrgentReview24hEmail,
  enqueueAdminCheckoutOutcomePendingAlertEmail,
  enqueueAdminFlightRecordPendingReviewEmail,
  enqueueAdminBankTransferPendingVerificationEmail,
} from '@/lib/email/outbox'
import { evaluateCustomerOnboardingState } from '@/lib/jobs/onboarding-state'
import { runUpcomingFlightRemindersSweep } from '@/lib/jobs/handlers/upcoming-flight-reminders'
import { runPostFlightActionRemindersSweep } from '@/lib/jobs/handlers/post-flight-reminders'
import { emitBookingChanged, emitOpsChanged } from '@/lib/realtime/emit'
import { getAppUrl } from '@/lib/email/app-url'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'devjamaviation@gmail.com'
const appUrl = getAppUrl()

export const dailyMaintenanceJob: JobDefinition = {
  id: 'daily-maintenance',
  description: 'Runs daily sweeps: overdue flight records, expired holds, document expiry (user+admin), state-driven customer onboarding reminders, urgent checkout reminders, post-checkout outcome alerts, 48h/12h upcoming flight reminders, post-flight action reminders, admin flight record review alerts, bank transfer proof verification alerts, unpaid invoice chase, and block-time package maintenance',
  async run(ctx: JobContext) {
    const { admin, now } = ctx
    console.info(`[job:daily-maintenance] Starting daily maintenance run at ${now.toISOString()}`)

    const overdueStats = await markFlightRecordOverdue(admin, now)
    const holdStats = await expireTemporaryHolds(admin, now)
    const docStats = await runDocumentExpiryReminders(admin, now)
    const onboardingStats = await runCustomerOnboardingReminders(admin, now)
    const urgentCheckoutStats = await runAdminCheckoutUrgentReviewSweep(admin, now)
    const pendingOutcomeStats = await runAdminCheckoutOutcomePendingSweep(admin, now)
    const upcomingFlightStats = await runUpcomingFlightRemindersSweep(admin, now)
    const postFlightActionStats = await runPostFlightActionRemindersSweep(admin, now)
    const pendingReviewStats = await runAdminPendingFlightRecordReviewSweep(admin, now)
    const pendingBankTransferStats = await runAdminPendingBankTransferSweep(admin, now)
    const newUserStats = await runNewUserInactivityCheck(admin, now)
    const unpaidInvoiceStats = await runUnpaidInvoiceChase(admin, now)
    const blockTimeStats = await runBlockTimeMaintenance(admin, now)

    const stats = {
      flightRecordsOverdue: overdueStats,
      temporaryHoldsExpired: holdStats,
      documentExpiryReminders: docStats,
      onboardingReminders: onboardingStats,
      adminUrgentCheckouts: urgentCheckoutStats,
      adminPendingCheckoutOutcomes: pendingOutcomeStats,
      upcomingFlightReminders: upcomingFlightStats,
      postFlightActionReminders: postFlightActionStats,
      adminPendingFlightRecordReviews: pendingReviewStats,
      adminPendingBankTransfers: pendingBankTransferStats,
      newUserInactivityAlerts: newUserStats,
      unpaidInvoiceChase: unpaidInvoiceStats,
      blockTimeMaintenance: blockTimeStats,
    }

    console.info('[job:daily-maintenance] Daily maintenance complete:', JSON.stringify(stats))

    return {
      ok: true,
      stats,
    }
  },
}

/**
 * 1. Find standard bookings past scheduled_end with no submitted flight record
 *    and transition status to flight_record_overdue.
 */
async function markFlightRecordOverdue(admin: JobContext['admin'], now: Date) {
  const { data: bookings, error } = await admin
    .from('bookings')
    .select(`
      id,
      booking_owner_user_id,
      status,
      scheduled_end,
      flight_records (
        id,
        status,
        submitted_at
      )
    `)
    .eq('booking_type', 'standard')
    .in('status', ['confirmed', 'ready_for_dispatch', 'dispatched', 'awaiting_flight_record'])
    .lte('scheduled_end', now.toISOString())
    .limit(200)

  if (error) {
    console.error('[daily-maintenance:overdue] Query failed:', error.message)
    return { scanned: 0, updated: 0, error: error.message }
  }

  const overdueBookings = (bookings ?? []).filter((b) =>
    isAwaitingFlightRecordDue(
      {
        status: b.status,
        scheduled_start: null,
        scheduled_end: b.scheduled_end,
        flight_records: b.flight_records,
      },
      now,
    ),
  )

  let updated = 0
  for (const booking of overdueBookings) {
    const { error: updateErr } = await admin
      .from('bookings')
      .update({
        status: 'flight_record_overdue',
        updated_at: now.toISOString(),
      })
      .eq('id', booking.id)
      .neq('status', 'flight_record_overdue')

    if (!updateErr) {
      updated += 1
      try {
        if (booking.booking_owner_user_id) {
          await emitBookingChanged({ bookingId: booking.id, userId: booking.booking_owner_user_id })
        }
      } catch {
        // Non-fatal if socket emit fails
      }
    }
  }

  if (updated > 0) {
    try {
      await emitOpsChanged()
    } catch {
      // Non-fatal
    }
  }

  return { scanned: bookings?.length ?? 0, overdueFound: overdueBookings.length, updated }
}

/**
 * 2. Expire stale temporary hold blocks.
 */
async function expireTemporaryHolds(admin: JobContext['admin'], now: Date) {
  const { data: expiredBlocks, error } = await admin
    .from('schedule_blocks')
    .select('id')
    .eq('block_type', 'temporary_hold')
    .eq('status', 'active')
    .lte('expires_at', now.toISOString())
    .limit(200)

  if (error) {
    console.error('[daily-maintenance:holds] Query failed:', error.message)
    return { scanned: 0, expired: 0, error: error.message }
  }

  if (!expiredBlocks || expiredBlocks.length === 0) {
    return { scanned: 0, expired: 0 }
  }

  const ids = expiredBlocks.map((b) => b.id)
  const { error: updateErr } = await admin
    .from('schedule_blocks')
    .update({
      status: 'expired',
      updated_at: now.toISOString(),
    })
    .in('id', ids)

  if (updateErr) {
    console.error('[daily-maintenance:holds] Update failed:', updateErr.message)
    return { scanned: ids.length, expired: 0, error: updateErr.message }
  }

  return { scanned: ids.length, expired: ids.length }
}

/**
 * 3. Scan user documents nearing expiry (30, 14, 7, 1 days, or expired).
 *    Sends reminder to customer, and alerts ADMIN when expiry is within 1 day (or expired).
 */
async function runDocumentExpiryReminders(admin: JobContext['admin'], now: Date) {
  const { data: docs, error } = await admin
    .from('user_documents')
    .select('id, user_id, document_type, expiry_date')
    .eq('status', 'approved')
    .not('expiry_date', 'is', null)
    .limit(300)

  if (error) {
    console.error('[daily-maintenance:docs] Query failed:', error.message)
    return { scanned: 0, customerEnqueued: 0, adminAlertsEnqueued: 0, error: error.message }
  }

  if (!docs || docs.length === 0) {
    return { scanned: 0, customerEnqueued: 0, adminAlertsEnqueued: 0 }
  }

  // Fetch profiles for these document owners
  const userIds = Array.from(new Set(docs.map((d) => d.user_id).filter(Boolean)))
  const { data: profiles } = userIds.length
    ? await admin.from('profiles').select('id, email, first_name, full_name').in('id', userIds)
    : { data: [] }
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))

  let customerEnqueued = 0
  let adminAlertsEnqueued = 0
  let skipped = 0

  const DOC_LABELS: Record<string, string> = {
    pilot_licence: 'Pilot Licence',
    medical_certificate: 'Medical Certificate',
    photo_id: 'Photo ID',
    night_vfr_evidence: 'Night VFR Evidence',
  }

  for (const doc of docs) {
    const profile = profileMap.get(doc.user_id)
    if (!profile?.email || !doc.expiry_date) {
      skipped += 1
      continue
    }

    const daysUntilExpiry = getDaysUntilInSydney(doc.expiry_date, now)

    // Check reminder intervals: 30 days, 14 days, 7 days, 1 day, or <= 0 (expired)
    let threshold: number | null = null
    if (daysUntilExpiry <= 0 && daysUntilExpiry >= -3) threshold = 0
    else if (daysUntilExpiry === 1) threshold = 1
    else if (daysUntilExpiry > 1 && daysUntilExpiry <= 7) threshold = 7
    else if (daysUntilExpiry > 7 && daysUntilExpiry <= 14) threshold = 14
    else if (daysUntilExpiry > 14 && daysUntilExpiry <= 30) threshold = 30

    if (threshold === null) {
      skipped += 1
      continue
    }

    const pilotName =
      profile.first_name?.trim() ||
      profile.full_name?.split(' ')[0]?.trim() ||
      'Pilot'

    const documentTypeLabel = DOC_LABELS[doc.document_type] || 'Aviation Document'
    const idempotencyKey = `doc-expiry-reminder:${doc.id}:${threshold}:${doc.expiry_date}`

    try {
      await enqueueDocumentExpiryReminderEmail({
        recipientEmail: profile.email,
        userId: doc.user_id,
        documentId: doc.id,
        pilotName,
        documentTypeLabel,
        expiryDate: doc.expiry_date,
        daysUntilExpiry,
        idempotencyKey,
      })
      customerEnqueued += 1

      // If 1 day before expiry or expired, trigger an alert to admin as well
      if ((threshold === 1 || threshold === 0) && ADMIN_EMAIL) {
        const adminIdempotencyKey = `admin-doc-expiry-alert:${doc.id}:${threshold}:${doc.expiry_date}`
        await enqueueAdminDocumentExpiryAlertEmail({
          recipientEmail: ADMIN_EMAIL,
          userId: doc.user_id,
          documentId: doc.id,
          pilotName,
          pilotEmail: profile.email,
          documentTypeLabel,
          expiryDate: doc.expiry_date,
          daysUntilExpiry,
          idempotencyKey: adminIdempotencyKey,
        })
        adminAlertsEnqueued += 1
      }
    } catch (err) {
      console.error(`[daily-maintenance:docs] Enqueue failed for doc ${doc.id}:`, err)
      skipped += 1
    }
  }

  return { scanned: docs.length, customerEnqueued, adminAlertsEnqueued, skipped }
}

/**
 * 4. State-Driven Customer Onboarding Reminders:
 *    Evaluates each non-cleared customer's real-time actionable state (No docs, Incomplete docs,
 *    Ready for checkout, Action required / reschedule, or Waiting on admin).
 *    Fires reminders on a Day 2 (~40h), Day 5 (~112h), and Day 10 (~232h) cadence while stalled in that state.
 *    Sends reminder to customer for customer actions, and to admin for pending checkouts.
 */
async function runCustomerOnboardingReminders(admin: JobContext['admin'], now: Date) {
  const { data: users, error } = await admin
    .from('profiles')
    .select(`
      id,
      full_name,
      first_name,
      last_name,
      email,
      created_at,
      account_status,
      pilot_clearance_status,
      has_night_vfr_rating
    `)
    .eq('role', 'customer')
    .eq('account_status', 'active')
    .neq('pilot_clearance_status', 'cleared_to_fly')
    .limit(200)

  if (error) {
    console.error('[daily-maintenance:onboarding-reminders] Query failed:', error.message)
    return { scanned: 0, customerRemindersEnqueued: 0, adminRemindersEnqueued: 0, error: error.message }
  }

  let customerRemindersEnqueued = 0
  let adminRemindersEnqueued = 0
  let skipped = 0

  for (const user of users ?? []) {
    if (!user.email) continue

    // 1. Fetch user's documents
    const { data: docs } = await admin
      .from('user_documents')
      .select('id, document_type, status, expiry_date, created_at, updated_at')
      .eq('user_id', user.id)

    // 2. Fetch user's checkout bookings
    const { data: bookings } = await admin
      .from('bookings')
      .select('id, status, booking_type, scheduled_start, scheduled_end, created_at, checkout_lifecycle_status')
      .eq('booking_owner_user_id', user.id)
      .eq('booking_type', 'checkout')

    // 3. Evaluate real-time actionable state
    const state = evaluateCustomerOnboardingState({
      profile: user,
      documents: docs ?? [],
      checkoutBookings: bookings ?? [],
    })

    if (
      state.stateKey === 'account_blocked' ||
      state.stateKey === 'cleared_to_fly' ||
      state.stateKey === 'checkout_flight_booked'
    ) {
      skipped += 1
      continue
    }

    // 4. Calculate reference timestamp for state entry
    let referenceTime = new Date(user.created_at).getTime()

    if (state.stateKey === 'incomplete_documents' || state.stateKey === 'ready_for_checkout') {
      const docTimes = (docs ?? []).map((d) => new Date(d.updated_at || d.created_at).getTime())
      if (docTimes.length > 0) {
        referenceTime = Math.max(...docTimes)
      }
    } else if (state.stateKey === 'action_required') {
      const rejectedDocs = (docs ?? []).filter((d) => d.status === 'rejected')
      const docTimes = rejectedDocs.map((d) => new Date(d.updated_at || d.created_at).getTime())
      const bookingTimes = (bookings ?? []).map((b) => new Date(b.created_at).getTime())
      const allTimes = [...docTimes, ...bookingTimes]
      if (allTimes.length > 0) {
        referenceTime = Math.max(...allTimes)
      }
    } else if (state.stateKey === 'checkout_waiting_admin') {
      if (state.pendingCheckoutCreatedAt) {
        referenceTime = new Date(state.pendingCheckoutCreatedAt).getTime()
      }
    }

    const elapsedHours = (now.getTime() - referenceTime) / (1000 * 60 * 60)

    // Cadence check: Step 1 (Day 2 / >=40h), Step 2 (Day 5 / >=112h), Step 3 (Day 10 / >=232h)
    let cadenceStep = 0
    if (elapsedHours >= 232) {
      cadenceStep = 3
    } else if (elapsedHours >= 112) {
      cadenceStep = 2
    } else if (elapsedHours >= 40) {
      cadenceStep = 1
    }

    if (cadenceStep === 0) {
      // Too early for next reminder
      skipped += 1
      continue
    }

    const pilotName =
      user.first_name?.trim() ||
      user.full_name?.trim() ||
      'Pilot'

    try {
      if (state.stateKey === 'checkout_waiting_admin') {
        if (!ADMIN_EMAIL || !state.pendingCheckoutBookingId) {
          skipped += 1
          continue
        }

        const idempotencyKey = `admin-pending-checkout:${state.pendingCheckoutBookingId}:step-${cadenceStep}`
        await enqueueAdminPendingCheckoutReminderEmail({
          recipientEmail: ADMIN_EMAIL,
          bookingId: state.pendingCheckoutBookingId,
          customerId: user.id,
          customerName: user.full_name?.trim() || pilotName,
          customerEmail: user.email,
          requestedTime: state.pendingCheckoutRequestedTime || 'Requested Slot',
          hoursPending: Math.round(elapsedHours),
          cadenceStep,
          idempotencyKey,
        })
        adminRemindersEnqueued += 1
      } else if (state.stateKey === 'no_documents') {
        const idempotencyKey = `onboarding-reminder:no_docs:${user.id}:step-${cadenceStep}`
        await enqueueOnboardingNoDocsReminderEmail({
          recipientEmail: user.email,
          customerId: user.id,
          pilotName,
          cadenceStep,
          idempotencyKey,
        })
        customerRemindersEnqueued += 1
      } else if (state.stateKey === 'incomplete_documents') {
        const idempotencyKey = `onboarding-reminder:incomplete_docs:${user.id}:step-${cadenceStep}`
        await enqueueOnboardingIncompleteDocsReminderEmail({
          recipientEmail: user.email,
          customerId: user.id,
          pilotName,
          missingDocumentLabels: state.missingDocumentLabels,
          cadenceStep,
          idempotencyKey,
        })
        customerRemindersEnqueued += 1
      } else if (state.stateKey === 'ready_for_checkout') {
        const idempotencyKey = `onboarding-reminder:ready_checkout:${user.id}:step-${cadenceStep}`
        await enqueueOnboardingRequestCheckoutReminderEmail({
          recipientEmail: user.email,
          customerId: user.id,
          pilotName,
          cadenceStep,
          idempotencyKey,
        })
        customerRemindersEnqueued += 1
      } else if (state.stateKey === 'action_required') {
        const idempotencyKey = `onboarding-reminder:action_required:${user.id}:step-${cadenceStep}`
        await enqueueOnboardingActionRequiredReminderEmail({
          recipientEmail: user.email,
          customerId: user.id,
          pilotName,
          actionReason: state.actionReason || 'Document update or checkout action required',
          actionUrl: state.actionUrl,
          cadenceStep,
          idempotencyKey,
        })
        customerRemindersEnqueued += 1
      }
    } catch (err) {
      console.error(`[daily-maintenance:onboarding-reminders] Failed for user ${user.id}:`, err)
    }
  }

  return {
    scanned: users?.length ?? 0,
    customerRemindersEnqueued,
    adminRemindersEnqueued,
    skipped,
  }
}

/**
 * 5. Admin Urgent Pending Checkout Sweep (<24h to flight):
 *    If a requested checkout slot is scheduled to start within 24 hours and is still pending admin review,
 *    urgently alert the admin to confirm or reschedule.
 */
async function runAdminCheckoutUrgentReviewSweep(admin: JobContext['admin'], now: Date) {
  if (!ADMIN_EMAIL) return { scanned: 0, adminAlertsEnqueued: 0, skipped: 'ADMIN_EMAIL_NOT_CONFIGURED' }

  const nowIso = now.toISOString()
  const in24hIso = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()

  const { data: bookings, error } = await admin
    .from('bookings')
    .select('id, booking_reference, scheduled_start, booking_owner_user_id')
    .eq('booking_type', 'checkout')
    .in('status', ['pending', 'checkout_requested'])
    .gte('scheduled_start', nowIso)
    .lte('scheduled_start', in24hIso)

  if (error) {
    console.error('[daily-maintenance:admin-checkout-urgent] Query failed:', error.message)
    return { scanned: 0, adminAlertsEnqueued: 0, error: error.message }
  }

  if (!bookings || bookings.length === 0) {
    return { scanned: 0, adminAlertsEnqueued: 0 }
  }

  const userIds = Array.from(new Set(bookings.map((b) => b.booking_owner_user_id).filter(Boolean)))
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, first_name, last_name, email, phone_number, phone_country_code')
    .in('id', userIds)

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))
  let adminAlertsEnqueued = 0

  for (const booking of bookings) {
    const profile = booking.booking_owner_user_id ? profileMap.get(booking.booking_owner_user_id) : null
    if (!profile?.email) continue

    const flightStart = new Date(booking.scheduled_start)
    const hoursUntilFlight = Math.max(1, Math.round((flightStart.getTime() - now.getTime()) / (1000 * 60 * 60)))
    const requestedTime = flightStart.toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney',
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    const customerName =
      profile.full_name?.trim() ||
      `${profile.first_name || ''} ${profile.last_name || ''}`.trim() ||
      'Pilot'
    const customerPhone = profile.phone_number
      ? `${profile.phone_country_code || ''} ${profile.phone_number}`.trim()
      : null

    const idempotencyKey = `admin-checkout-urgent-24h:${booking.id}`

    try {
      await enqueueAdminCheckoutUrgentReview24hEmail({
        recipientEmail: ADMIN_EMAIL,
        bookingId: booking.id,
        customerId: profile.id,
        customerName,
        customerEmail: profile.email,
        customerPhone,
        requestedTime,
        bookingReference: booking.booking_reference,
        hoursUntilFlight,
        idempotencyKey,
      })
      adminAlertsEnqueued += 1
    } catch (err) {
      console.error(`[daily-maintenance:admin-checkout-urgent] Failed for booking ${booking.id}:`, err)
    }
  }

  return { scanned: bookings.length, adminAlertsEnqueued }
}

/**
 * 6. Admin Post-Flight Checkout Outcome Pending Sweep (>24h after flight):
 *    If a checkout flight concluded >= 24 hours ago and admin has not marked the outcome yet,
 *    alert the admin to record the outcome (Cleared to fly, additional checkout, reschedule, etc.).
 */
async function runAdminCheckoutOutcomePendingSweep(admin: JobContext['admin'], now: Date) {
  if (!ADMIN_EMAIL) return { scanned: 0, adminAlertsEnqueued: 0, skipped: 'ADMIN_EMAIL_NOT_CONFIGURED' }

  const cutoff24hAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  const { data: bookings, error } = await admin
    .from('bookings')
    .select('id, booking_reference, scheduled_start, scheduled_end, status, checkout_lifecycle_status, booking_owner_user_id, aircraft_id')
    .eq('booking_type', 'checkout')
    .neq('status', 'cancelled')
    .lte('scheduled_end', cutoff24hAgo)

  if (error) {
    console.error('[daily-maintenance:admin-checkout-outcome-pending] Query failed:', error.message)
    return { scanned: 0, adminAlertsEnqueued: 0, error: error.message }
  }

  if (!bookings || bookings.length === 0) {
    return { scanned: 0, adminAlertsEnqueued: 0 }
  }

  const userIds = Array.from(new Set(bookings.map((b) => b.booking_owner_user_id).filter(Boolean)))
  const aircraftIds = Array.from(new Set(bookings.map((b) => b.aircraft_id).filter(Boolean)))

  const [{ data: profiles }, { data: aircraftList }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name, first_name, last_name, email, pilot_clearance_status')
      .in('id', userIds),
    aircraftIds.length > 0
      ? admin.from('aircraft').select('id, registration').in('id', aircraftIds)
      : Promise.resolve({ data: [] }),
  ])

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))
  const aircraftMap = new Map((aircraftList ?? []).map((a) => [a.id, a.registration]))
  let adminAlertsEnqueued = 0

  for (const booking of bookings) {
    // If checkout lifecycle status is already completed, outcome was recorded
    if (booking.checkout_lifecycle_status === 'completed') continue

    const profile = booking.booking_owner_user_id ? profileMap.get(booking.booking_owner_user_id) : null
    if (!profile?.email) continue

    // If profile clearance status is already cleared_to_fly, outcome is recorded
    if (profile.pilot_clearance_status === 'cleared_to_fly') continue

    const flightEnd = new Date(booking.scheduled_end)
    const hoursSinceFlight = Math.max(24, Math.round((now.getTime() - flightEnd.getTime()) / (1000 * 60 * 60)))
    const flightDate = flightEnd.toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney',
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    const customerName =
      profile.full_name?.trim() ||
      `${profile.first_name || ''} ${profile.last_name || ''}`.trim() ||
      'Pilot'
    const aircraftReg = booking.aircraft_id ? aircraftMap.get(booking.aircraft_id) || null : null

    const idempotencyKey = `admin-checkout-outcome-pending:${booking.id}`

    try {
      await enqueueAdminCheckoutOutcomePendingAlertEmail({
        recipientEmail: ADMIN_EMAIL,
        bookingId: booking.id,
        customerId: profile.id,
        customerName,
        customerEmail: profile.email,
        bookingReference: booking.booking_reference,
        flightDate,
        aircraft: aircraftReg,
        hoursSinceFlight,
        idempotencyKey,
      })
      adminAlertsEnqueued += 1
    } catch (err) {
      console.error(`[daily-maintenance:admin-checkout-outcome-pending] Failed for booking ${booking.id}:`, err)
    }
  }

  return { scanned: bookings.length, adminAlertsEnqueued }
}

/**
 * 7. New User Inactivity Follow-up:
 *    When a user created an account >= 24 hours ago and has not requested a checkout flight
 *    (whether they uploaded documents or did nothing), alert the admin so they can reach out.
 */
async function runNewUserInactivityCheck(admin: JobContext['admin'], now: Date) {
  if (!ADMIN_EMAIL) return { scanned: 0, adminAlertsEnqueued: 0, skipped: 'ADMIN_EMAIL_NOT_CONFIGURED' }

  // Check accounts created between 24 hours and 7 days ago
  const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const cutoff7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: users, error } = await admin
    .from('profiles')
    .select(`
      id,
      full_name,
      first_name,
      last_name,
      email,
      phone_number,
      phone_country_code,
      pilot_arn,
      created_at,
      pilot_clearance_status
    `)
    .eq('role', 'customer')
    .eq('account_status', 'active')
    .lte('created_at', cutoff24h)
    .gte('created_at', cutoff7d)
    .limit(100)

  if (error) {
    console.error('[daily-maintenance:new-user-inactivity] Query failed:', error.message)
    return { scanned: 0, adminAlertsEnqueued: 0, error: error.message }
  }

  let adminAlertsEnqueued = 0

  for (const user of users ?? []) {
    if (!user.email) continue

    // Check if user has requested any checkout booking
    const { data: checkoutBookings } = await admin
      .from('bookings')
      .select('id')
      .eq('booking_owner_user_id', user.id)
      .eq('booking_type', 'checkout')
      .limit(1)

    if (checkoutBookings && checkoutBookings.length > 0) {
      // User has already requested a checkout
      continue
    }

    // Check user's uploaded documents status
    const { data: docs } = await admin
      .from('user_documents')
      .select('id, document_type, status')
      .eq('user_id', user.id)

    const docCount = docs?.length ?? 0
    const approvedCount = (docs ?? []).filter((d) => d.status === 'approved').length
    const documentStatus = docCount === 0
      ? 'No documents uploaded'
      : `${docCount} document(s) uploaded (${approvedCount} approved)`

    const customerName =
      user.full_name?.trim() ||
      `${user.first_name || ''} ${user.last_name || ''}`.trim() ||
      'New Customer'

    const customerPhone = user.phone_number
      ? `${user.phone_country_code || ''} ${user.phone_number}`.trim()
      : null

    const registeredDate = new Date(user.created_at).toLocaleDateString('en-AU', {
      timeZone: 'Australia/Sydney',
      dateStyle: 'medium',
    })

    const idempotencyKey = `admin-new-user-inactivity:${user.id}`

    try {
      await enqueueAdminNewUserInactivityAlertEmail({
        recipientEmail: ADMIN_EMAIL,
        customerId: user.id,
        customerName,
        customerEmail: user.email,
        customerPhone,
        pilotArn: user.pilot_arn,
        registeredDate,
        documentStatus,
        idempotencyKey,
      })
      adminAlertsEnqueued += 1
    } catch (err) {
      console.error(`[daily-maintenance:new-user-inactivity] Failed for user ${user.id}:`, err)
    }
  }

  return { scanned: users?.length ?? 0, adminAlertsEnqueued }
}

/**
 * 5. Unpaid Invoice Chase:
 *    When an invoice has been in 'payment_required' status for >= 24 hours,
 *    send a payment reminder to the customer and an alert to the admin.
 */
async function runUnpaidInvoiceChase(admin: JobContext['admin'], now: Date) {
  const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  let customerRemindersEnqueued = 0
  let adminAlertsEnqueued = 0

  // 5A. Checkout Invoices
  const { data: checkoutInvoices, error: chkErr } = await admin
    .from('checkout_invoices')
    .select('id, customer_id, booking_id, invoice_number, status, subtotal_cents, advance_applied_cents, stripe_amount_due_cents, created_at')
    .eq('status', 'payment_required')
    .lte('created_at', cutoff24h)
    .limit(50)

  if (!chkErr && checkoutInvoices && checkoutInvoices.length > 0) {
    const { data: activeChkSubmissions } = await admin
      .from('checkout_bank_transfer_submissions')
      .select('invoice_id')
      .in('status', ['submitted', 'pending'])

    const chkWithProof = new Set((activeChkSubmissions ?? []).map((s) => s.invoice_id))

    const custIds = Array.from(new Set(checkoutInvoices.map((i) => i.customer_id).filter(Boolean)))
    const bkIds = Array.from(new Set(checkoutInvoices.map((i) => i.booking_id).filter(Boolean)))

    const [{ data: profiles }, { data: bookings }] = await Promise.all([
      custIds.length ? admin.from('profiles').select('id, email, first_name, full_name').in('id', custIds) : Promise.resolve({ data: [] }),
      bkIds.length ? admin.from('bookings').select('id, booking_reference').in('id', bkIds) : Promise.resolve({ data: [] }),
    ])

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))
    const bookingMap = new Map((bookings ?? []).map((b) => [b.id, b]))

    for (const inv of checkoutInvoices) {
      // If customer has already uploaded bank transfer proof awaiting verification, do not chase customer
      if (chkWithProof.has(inv.id)) continue

      const customer = profileMap.get(inv.customer_id)
      const booking = bookingMap.get(inv.booking_id)
      if (!customer?.email) continue

      const pilotName = customer.first_name?.trim() || customer.full_name?.split(' ')[0]?.trim() || 'Pilot'
      const customerName = customer.full_name?.trim() || pilotName
      const amountDue = (inv.stripe_amount_due_cents || inv.subtotal_cents || 29000) / 100
      const amountFormatted = `$${amountDue.toFixed(2)}`
      const invoiceNumber = inv.invoice_number || `INV-${inv.id.slice(0, 8).toUpperCase()}`
      const invoiceUrl = `${appUrl}/dashboard/checkout`

      const createdDate = new Date(inv.created_at).toLocaleDateString('en-AU', {
        timeZone: 'Australia/Sydney',
        dateStyle: 'medium',
      })

      const custKey = `unpaid-invoice-chase:customer:chk:${inv.id}:day1`
      const admKey = `unpaid-invoice-chase:admin:chk:${inv.id}:day1`

      try {
        await enqueueUnpaidInvoiceCustomerEmail({
          recipientEmail: customer.email,
          invoiceId: inv.id,
          pilotName,
          invoiceNumber,
          amountFormatted,
          invoiceType: 'Checkout Flight Invoice',
          bookingRef: booking?.booking_reference,
          invoiceUrl,
          idempotencyKey: custKey,
        })
        customerRemindersEnqueued += 1

        if (ADMIN_EMAIL) {
          await enqueueAdminUnpaidInvoiceAlertEmail({
            recipientEmail: ADMIN_EMAIL,
            invoiceId: inv.id,
            customerId: customer.id,
            customerName,
            customerEmail: customer.email,
            invoiceNumber,
            amountFormatted,
            invoiceType: 'Checkout Flight Invoice',
            createdDate,
            idempotencyKey: admKey,
          })
          adminAlertsEnqueued += 1
        }
      } catch (err) {
        console.error(`[daily-maintenance:unpaid-invoices] Failed for checkout invoice ${inv.id}:`, err)
      }
    }
  }

  // 5B. Standard Booking Invoices
  const { data: bookingInvoices, error: bkgErr } = await admin
    .from('booking_invoices')
    .select('id, customer_id, booking_id, invoice_number, status, subtotal_cents, advance_applied_cents, stripe_amount_due_cents, created_at')
    .eq('status', 'payment_required')
    .lte('created_at', cutoff24h)
    .limit(50)

  if (!bkgErr && bookingInvoices && bookingInvoices.length > 0) {
    const { data: activeBkgSubmissions } = await admin
      .from('booking_bank_transfer_submissions')
      .select('invoice_id')
      .in('status', ['submitted', 'pending'])

    const bkgWithProof = new Set((activeBkgSubmissions ?? []).map((s) => s.invoice_id))

    const custIds = Array.from(new Set(bookingInvoices.map((i) => i.customer_id).filter(Boolean)))
    const bkIds = Array.from(new Set(bookingInvoices.map((i) => i.booking_id).filter(Boolean)))

    const [{ data: profiles }, { data: bookings }] = await Promise.all([
      custIds.length ? admin.from('profiles').select('id, email, first_name, full_name').in('id', custIds) : Promise.resolve({ data: [] }),
      bkIds.length ? admin.from('bookings').select('id, booking_reference').in('id', bkIds) : Promise.resolve({ data: [] }),
    ])

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))
    const bookingMap = new Map((bookings ?? []).map((b) => [b.id, b]))

    for (const inv of bookingInvoices) {
      // If customer has already uploaded bank transfer proof awaiting verification, do not chase customer
      if (bkgWithProof.has(inv.id)) continue

      const customer = profileMap.get(inv.customer_id)
      const booking = bookingMap.get(inv.booking_id)
      if (!customer?.email) continue

      const pilotName = customer.first_name?.trim() || customer.full_name?.split(' ')[0]?.trim() || 'Pilot'
      const customerName = customer.full_name?.trim() || pilotName
      const rawCents = inv.stripe_amount_due_cents || (inv.subtotal_cents - (inv.advance_applied_cents || 0))
      const amountDue = Math.max(0, rawCents) / 100
      const amountFormatted = `$${amountDue.toFixed(2)}`
      const invoiceNumber = inv.invoice_number || `INV-${inv.id.slice(0, 8).toUpperCase()}`
      const invoiceUrl = booking?.id ? `${appUrl}/dashboard/bookings/${booking.id}` : `${appUrl}/dashboard/bookings`

      const createdDate = new Date(inv.created_at).toLocaleDateString('en-AU', {
        timeZone: 'Australia/Sydney',
        dateStyle: 'medium',
      })

      const custKey = `unpaid-invoice-chase:customer:bkg:${inv.id}:day1`
      const admKey = `unpaid-invoice-chase:admin:bkg:${inv.id}:day1`

      try {
        await enqueueUnpaidInvoiceCustomerEmail({
          recipientEmail: customer.email,
          invoiceId: inv.id,
          pilotName,
          invoiceNumber,
          amountFormatted,
          invoiceType: 'Solo Hire Flight Invoice',
          bookingRef: booking?.booking_reference,
          invoiceUrl,
          idempotencyKey: custKey,
        })
        customerRemindersEnqueued += 1

        if (ADMIN_EMAIL) {
          await enqueueAdminUnpaidInvoiceAlertEmail({
            recipientEmail: ADMIN_EMAIL,
            invoiceId: inv.id,
            customerId: customer.id,
            customerName,
            customerEmail: customer.email,
            invoiceNumber,
            amountFormatted,
            invoiceType: 'Solo Hire Flight Invoice',
            createdDate,
            idempotencyKey: admKey,
          })
          adminAlertsEnqueued += 1
        }
      } catch (err) {
        console.error(`[daily-maintenance:unpaid-invoices] Failed for booking invoice ${inv.id}:`, err)
      }
    }
  }

  return {
    customerRemindersEnqueued,
    adminAlertsEnqueued,
  }
}

/**
 * 6. Run sweep for admin review of submitted flight records pending >24 hours.
 */
async function runAdminPendingFlightRecordReviewSweep(admin: JobContext['admin'], now: Date) {
  const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  let adminAlertsEnqueued = 0

  const { data: rawBookings, error } = await admin
    .from('bookings')
    .select(`
      id,
      booking_reference,
      status,
      scheduled_start,
      scheduled_end,
      booking_owner_user_id,
      aircraft_id,
      updated_at,
      flight_records ( id, status, submitted_at )
    `)
    .eq('booking_type', 'standard')
    .eq('status', 'pending_post_flight_review')
    .limit(50)

  if (error) {
    console.error('[daily-maintenance:admin-flight-record-pending] Query failed:', error.message)
    return { scanned: 0, adminAlertsEnqueued: 0 }
  }

  const rawList = rawBookings ?? []
  const userIds = Array.from(new Set(rawList.map((b: any) => b.booking_owner_user_id).filter(Boolean)))
  const aircraftIds = Array.from(new Set(rawList.map((b: any) => b.aircraft_id).filter(Boolean)))

  const [{ data: profilesData }, { data: aircraftData }] = await Promise.all([
    userIds.length > 0
      ? admin.from('profiles').select('id, email, first_name, full_name, phone_number, phone_country_code, pilot_arn').in('id', userIds)
      : Promise.resolve({ data: [] }),
    aircraftIds.length > 0
      ? admin.from('aircraft').select('id, registration, model').in('id', aircraftIds)
      : Promise.resolve({ data: [] }),
  ])

  const profileMap = new Map((profilesData ?? []).map((p: any) => [p.id, p]))
  const aircraftMap = new Map((aircraftData ?? []).map((a: any) => [a.id, a]))

  for (const booking of rawList) {
    const prof = profileMap.get(booking.booking_owner_user_id) as any
    const records = (booking as any).flight_records ?? []
    const latestRecord = records.find((r: any) => r.status === 'submitted') || records[0]
    const submissionTime = latestRecord?.submitted_at || booking.updated_at || booking.scheduled_end

    if (new Date(submissionTime).getTime() > new Date(cutoff24h).getTime()) {
      continue
    }

    const hoursSinceSubmission = Math.max(24, Math.floor((now.getTime() - new Date(submissionTime).getTime()) / (60 * 60 * 1000)))
    const aircraftObj = aircraftMap.get(booking.aircraft_id) as any
    const aircraftLabel = aircraftObj?.registration
      ? `${aircraftObj.registration}${aircraftObj.model ? ` (${aircraftObj.model})` : ''}`
      : 'OZRentAPlane Aircraft'

    const customerName = prof?.full_name?.trim() || prof?.first_name?.trim() || 'Pilot'
    const customerEmail = prof?.email || ''
    const bookingRef = booking.booking_reference || `BK-${booking.id.slice(0, 8).toUpperCase()}`

    const flightDateStr = new Date(booking.scheduled_start).toLocaleDateString('en-AU', {
      timeZone: 'Australia/Sydney',
      dateStyle: 'full',
    })

    const submittedDateStr = new Date(submissionTime).toLocaleDateString('en-AU', {
      timeZone: 'Australia/Sydney',
      dateStyle: 'medium',
    })

    try {
      await enqueueAdminFlightRecordPendingReviewEmail({
        bookingId: booking.id,
        customerId: booking.booking_owner_user_id,
        customerName,
        customerEmail,
        customerPhone: prof?.phone_number ? `${prof.phone_country_code || ''} ${prof.phone_number}`.trim() : null,
        pilotArn: prof?.pilot_arn ?? null,
        bookingReference: bookingRef,
        aircraft: aircraftLabel,
        flightDate: flightDateStr,
        submittedDate: submittedDateStr,
        hoursSinceSubmission,
        idempotencySuffix: 'day1',
      })
      adminAlertsEnqueued += 1
    } catch (err) {
      console.error(`[daily-maintenance:admin-flight-record-pending] Failed for booking ${booking.id}:`, err)
    }
  }

  return { scanned: rawList.length, adminAlertsEnqueued }
}

/**
 * 7. Run sweep for admin verification of bank transfer proofs pending >24 hours.
 */
async function runAdminPendingBankTransferSweep(admin: JobContext['admin'], now: Date) {
  const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  let adminAlertsEnqueued = 0

  // 1. Checkout Bank Transfers
  const { data: chkSubmissions, error: chkErr } = await admin
    .from('checkout_bank_transfer_submissions')
    .select(`
      id,
      customer_id,
      booking_id,
      invoice_id,
      status,
      created_at,
      profiles:customer_id ( full_name, email, phone_number, phone_country_code ),
      checkout_invoices:invoice_id ( id, invoice_number, subtotal_cents, stripe_amount_due_cents ),
      bookings:booking_id ( booking_reference )
    `)
    .in('status', ['submitted', 'pending'])
    .lte('created_at', cutoff24h)
    .limit(50)

  if (!chkErr && chkSubmissions) {
    for (const sub of chkSubmissions) {
      const prof = Array.isArray(sub.profiles) ? sub.profiles[0] : sub.profiles
      const inv = Array.isArray(sub.checkout_invoices) ? sub.checkout_invoices[0] : sub.checkout_invoices
      const bk = Array.isArray(sub.bookings) ? sub.bookings[0] : sub.bookings

      const hoursSince = Math.max(24, Math.floor((now.getTime() - new Date(sub.created_at).getTime()) / (60 * 60 * 1000)))
      const amountDue = (inv?.stripe_amount_due_cents || inv?.subtotal_cents || 29000) / 100
      const customerName = prof?.full_name?.trim() || 'Pilot'
      const submittedDateStr = new Date(sub.created_at).toLocaleDateString('en-AU', {
        timeZone: 'Australia/Sydney',
        dateStyle: 'medium',
      })

      try {
        await enqueueAdminBankTransferPendingVerificationEmail({
          invoiceId: sub.invoice_id,
          bookingId: sub.booking_id,
          customerId: sub.customer_id,
          customerName,
          customerEmail: prof?.email || '',
          customerPhone: prof?.phone_number ? `${prof.phone_country_code || ''} ${prof.phone_number}`.trim() : null,
          invoiceNumber: inv?.invoice_number || `INV-${sub.invoice_id.slice(0, 8).toUpperCase()}`,
          bookingRef: bk?.booking_reference ?? null,
          amountFormatted: `$${amountDue.toFixed(2)}`,
          invoiceType: 'Checkout Flight Invoice',
          submittedDate: submittedDateStr,
          hoursSinceSubmission: hoursSince,
          idempotencySuffix: 'day1',
        })
        adminAlertsEnqueued += 1
      } catch (err) {
        console.error(`[daily-maintenance:admin-bank-transfer-pending] Failed for checkout submission ${sub.id}:`, err)
      }
    }
  }

  // 2. Standard Booking Bank Transfers
  const { data: bkgSubmissions, error: bkgErr } = await admin
    .from('booking_bank_transfer_submissions')
    .select(`
      id,
      customer_id,
      booking_id,
      invoice_id,
      status,
      created_at,
      profiles:customer_id ( full_name, email, phone_number, phone_country_code ),
      booking_invoices:invoice_id ( id, invoice_number, subtotal_cents, advance_applied_cents, stripe_amount_due_cents ),
      bookings:booking_id ( booking_reference )
    `)
    .in('status', ['submitted', 'pending'])
    .lte('created_at', cutoff24h)
    .limit(50)

  if (!bkgErr && bkgSubmissions) {
    for (const sub of bkgSubmissions) {
      const prof = Array.isArray(sub.profiles) ? sub.profiles[0] : sub.profiles
      const inv = Array.isArray(sub.booking_invoices) ? sub.booking_invoices[0] : sub.booking_invoices
      const bk = Array.isArray(sub.bookings) ? sub.bookings[0] : sub.bookings

      const hoursSince = Math.max(24, Math.floor((now.getTime() - new Date(sub.created_at).getTime()) / (60 * 60 * 1000)))
      const rawCents = inv?.stripe_amount_due_cents || (inv ? inv.subtotal_cents - (inv.advance_applied_cents || 0) : 0)
      const amountDue = Math.max(0, rawCents) / 100
      const customerName = prof?.full_name?.trim() || 'Pilot'
      const submittedDateStr = new Date(sub.created_at).toLocaleDateString('en-AU', {
        timeZone: 'Australia/Sydney',
        dateStyle: 'medium',
      })

      try {
        await enqueueAdminBankTransferPendingVerificationEmail({
          invoiceId: sub.invoice_id,
          bookingId: sub.booking_id,
          customerId: sub.customer_id,
          customerName,
          customerEmail: prof?.email || '',
          customerPhone: prof?.phone_number ? `${prof.phone_country_code || ''} ${prof.phone_number}`.trim() : null,
          invoiceNumber: inv?.invoice_number || `INV-${sub.invoice_id.slice(0, 8).toUpperCase()}`,
          bookingRef: bk?.booking_reference ?? null,
          amountFormatted: `$${amountDue.toFixed(2)}`,
          invoiceType: 'Solo Hire Flight Invoice',
          submittedDate: submittedDateStr,
          hoursSinceSubmission: hoursSince,
          idempotencySuffix: 'day1',
        })
        adminAlertsEnqueued += 1
      } catch (err) {
        console.error(`[daily-maintenance:admin-bank-transfer-pending] Failed for booking submission ${sub.id}:`, err)
      }
    }
  }

  return { adminAlertsEnqueued }
}

/**
 * 6. Run block-time package expiry and 7-day reminder sweeps.
 */
async function runBlockTimeMaintenance(admin: JobContext['admin'], now: Date) {
  // Step 1: Expire any active packages past expiration date via RPC
  let expiredCount = 0
  try {
    const { data, error } = await admin.rpc('expire_block_time_packages')
    if (error) {
      console.error('[daily-maintenance:block-time] expire_block_time_packages RPC failed:', error.message)
    } else {
      expiredCount = typeof data === 'number' ? data : 0
    }
  } catch (err) {
    console.error('[daily-maintenance:block-time] expire RPC error:', err)
  }

  // Step 2: Find packages expiring within 7 days needing reminders
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const { data: expiringPurchases, error: fetchErr } = await admin
    .from('pilot_block_time_purchases')
    .select(`
      id,
      user_id,
      hours_remaining,
      rate_per_hour,
      expires_at,
      expiry_reminder_sent_at,
      package:block_time_packages (
        name,
        validity_days
      )
    `)
    .eq('status', 'active')
    .gt('hours_remaining', 0)
    .lte('expires_at', sevenDaysFromNow.toISOString())
    .gt('expires_at', now.toISOString())
    .is('expiry_reminder_sent_at', null)

  if (fetchErr) {
    console.error('[daily-maintenance:block-time] Fetch expiring purchases failed:', fetchErr.message)
    return { expiredCount, remindersEnqueued: 0, error: fetchErr.message }
  }

  if (!expiringPurchases || expiringPurchases.length === 0) {
    return { expiredPackagesCount: expiredCount, expiringPackagesFound: 0, remindersEnqueued: 0 }
  }

  // Fetch profiles for users
  const userIds = Array.from(new Set(expiringPurchases.map((p) => p.user_id).filter(Boolean)))
  const { data: profiles } = userIds.length
    ? await admin.from('profiles').select('id, email, first_name, full_name').in('id', userIds)
    : { data: [] }
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))

  let remindersEnqueued = 0

  for (const purchase of expiringPurchases) {
    const profile = profileMap.get(purchase.user_id)
    if (!profile?.email) continue

    const pilotFirstName =
      profile.first_name?.trim() ||
      profile.full_name?.split(' ')[0]?.trim() ||
      'Pilot'

    const expiryDate = new Date(purchase.expires_at).toLocaleDateString('en-AU', {
      timeZone: 'Australia/Sydney',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })

    const daysUntilExpiry = Math.ceil(
      (new Date(purchase.expires_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    )

    const packageRow = Array.isArray(purchase.package) ? purchase.package[0] : purchase.package
    const packageName = packageRow?.name ?? 'Block Time'
    const validityDays = packageRow?.validity_days ?? 30
    const validityPeriodLabel = validityDays === 1 ? '1 day' : `${validityDays} days`

    const idempotencyKey = `block-time-expiry:${purchase.id}:7day`

    try {
      await enqueueBlockTimeExpiryReminderEmail({
        recipientEmail: profile.email,
        purchaseId: purchase.id,
        userId: purchase.user_id,
        pilotFirstName,
        packageName,
        hoursRemaining: Number(purchase.hours_remaining),
        expiryDate,
        daysUntilExpiry,
        ratePerHour: Number(purchase.rate_per_hour),
        validityPeriodLabel,
        idempotencyKey,
      })

      // Mark reminder sent on purchase record
      await admin
        .from('pilot_block_time_purchases')
        .update({ expiry_reminder_sent_at: now.toISOString() })
        .eq('id', purchase.id)

      remindersEnqueued += 1
    } catch (err) {
      console.error(`[daily-maintenance:block-time] Failed to enqueue reminder for purchase ${purchase.id}:`, err)
    }
  }

  // 3. Low-balance sweep (<= 2.0 hours remaining on active packages)
  let lowBalanceRemindersEnqueued = 0
  const { data: lowBalancePurchases, error: lowBalErr } = await admin
    .from('pilot_block_time_purchases')
    .select(`
      id,
      user_id,
      hours_purchased,
      hours_remaining,
      rate_per_hour,
      expires_at,
      activated_at,
      package:block_time_packages (
        name
      )
    `)
    .eq('status', 'active')
    .gt('hours_remaining', 0)
    .lte('hours_remaining', 2.0)
    .gt('expires_at', now.toISOString())

  if (!lowBalErr && lowBalancePurchases && lowBalancePurchases.length > 0) {
    const lbUserIds = Array.from(new Set(lowBalancePurchases.map((p) => p.user_id).filter(Boolean)))
    const { data: lbProfiles } = lbUserIds.length
      ? await admin.from('profiles').select('id, email, first_name, full_name').in('id', lbUserIds)
      : { data: [] }
    const lbProfileMap = new Map((lbProfiles ?? []).map((p) => [p.id, p]))

    for (const purchase of lowBalancePurchases) {
      const profile = lbProfileMap.get(purchase.user_id)
      if (!profile?.email) continue

      const pilotFirstName =
        profile.first_name?.trim() ||
        profile.full_name?.split(' ')[0]?.trim() ||
        'Pilot'

      const expiryDate = new Date(purchase.expires_at).toLocaleDateString('en-AU', {
        timeZone: 'Australia/Sydney',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })

      const packageRow = Array.isArray(purchase.package) ? purchase.package[0] : purchase.package
      const packageName = packageRow?.name ?? 'Block Time'

      // Idempotency key per package purchase cycle: Prevents duplicates for the same purchase unless replenished
      const idempotencyKey = `block-time-low-balance:${purchase.id}:${purchase.hours_purchased}`

      try {
        await enqueueBlockTimeLowBalanceEmail({
          recipientEmail: profile.email,
          purchaseId: purchase.id,
          userId: purchase.user_id,
          pilotFirstName,
          packageName,
          hoursRemaining: Number(purchase.hours_remaining),
          ratePerHour: Number(purchase.rate_per_hour),
          expiryDate,
          idempotencyKey,
        })
        lowBalanceRemindersEnqueued += 1
      } catch (err) {
        console.error(`[daily-maintenance:block-time] Failed to enqueue low-balance reminder for purchase ${purchase.id}:`, err)
      }
    }
  }

  return {
    expiredPackagesCount: expiredCount,
    expiringPackagesFound: expiringPurchases.length,
    expiryRemindersEnqueued: remindersEnqueued,
    lowBalanceRemindersEnqueued,
  }
}
