'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  sendVerificationEmail,
  buildSubmittedEmail,
} from '@/lib/email'

// ─── Submit for review ────────────────────────────────────────────────────────
// Called when customer submits or resubmits their documents.
// For on_hold clarification requests the doc check is relaxed — the customer
// may have already uploaded all docs and just needs to reply and resubmit.

export async function submitForReview(skipDocCheck = false) {
  const supabase = await createClient()

  // 1. Authenticate
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Unauthorized')

  // 2. Fetch current profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('verification_status, full_name')
    .eq('id', user.id)
    .single()

  if (profileError) throw new Error('Failed to fetch profile')

  const fromStatus   = profile?.verification_status ?? 'not_started'
  const customerName = profile?.full_name ?? 'Pilot'
  const isResubmit   = fromStatus === 'on_hold' || fromStatus === 'rejected'

  // 3. Verify required documents (skippable for clarification resubmits)
  if (!skipDocCheck) {
    const { data: docs, error: fetchError } = await supabase
      .from('user_documents')
      .select('document_type')
      .eq('user_id', user.id)

    if (fetchError) throw new Error('Failed to verify documents')

    const hasLicence = docs?.some(d => d.document_type === 'pilot_licence')
    const hasMedical = docs?.some(d => d.document_type === 'medical_certificate')
    const hasId      = docs?.some(d => d.document_type === 'photo_id')

    if (!hasLicence || !hasMedical || !hasId) {
      throw new Error('Missing required verification documents')
    }
  }

  // 4. Update verification_status to pending_review
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ verification_status: 'pending_review' })
    .eq('id', user.id)
    .in('verification_status', ['not_started', 'rejected', 'on_hold'])

  if (updateError) throw new Error('Failed to update verification status')

  // 5. Insert customer-visible event
  const eventTitle = isResubmit
    ? 'Documents Resubmitted for Review'
    : 'Documents Submitted for Review'
  const eventBody = isResubmit
    ? 'Your updated documents have been submitted and are now pending review. You will be notified once a decision has been made.'
    : 'Your verification documents have been submitted and are now pending review. You will be notified once a decision has been made.'

  const { data: event } = await supabase
    .from('verification_events')
    .insert({
      user_id:       user.id,
      actor_user_id: user.id,
      actor_role:    'customer',
      event_type:    isResubmit ? 'resubmitted' : 'submitted',
      from_status:   fromStatus,
      to_status:     'pending_review',
      title:         eventTitle,
      body:          eventBody,
      email_status:  'pending',
    })
    .select('id')
    .single()

  // 6. Send email confirmation (non-blocking)
  const customerEmail = user.email ?? null
  if (customerEmail) {
    const { subject, html } = buildSubmittedEmail(customerName, isResubmit)
    const { status: emailStatus } = await sendVerificationEmail(customerEmail, subject, html)
    if (event?.id) {
      await supabase
        .from('verification_events')
        .update({
          email_status:  emailStatus,
          email_sent_at: emailStatus === 'sent' ? new Date().toISOString() : null,
        })
        .eq('id', event.id)
    }
  }

  // 7. Revalidate
  revalidatePath('/dashboard')
  revalidatePath('/admin')
  revalidatePath('/admin/pending-verifications')
  revalidatePath('/admin/on-hold')
  revalidatePath('/admin/all-customers')
}

// ─── Customer chat message ────────────────────────────────────────────────────
// Customer sends a message in their verification thread.
// This does NOT change verification_status — it just adds a message event.
// Available whenever the customer has started the process (not_started blocked).
// The admin will see it as unread when they open the detail page.

export async function sendCustomerReply(message: string): Promise<void> {
  if (!message.trim()) {
    throw new Error('VALIDATION: Message cannot be empty.')
  }

  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('verification_status')
    .eq('id', user.id)
    .single()

  const currentStatus = profile?.verification_status ?? 'not_started'

  const { error: insertError } = await supabase
    .from('verification_events')
    .insert({
      user_id:       user.id,
      actor_user_id: user.id,
      actor_role:    'customer',
      event_type:    'message',
      from_status:   currentStatus,
      to_status:     currentStatus,  // status unchanged
      title:         'Customer Message',
      body:          message.trim(),
      email_status:  'skipped',  // customer-initiated, no email to customer
      // admin_read_at left NULL so admin sees it as unread
    })

  if (insertError) {
    console.error('[sendCustomerReply] Insert failed:', insertError)
    throw new Error('Failed to send message. Please try again.')
  }

  revalidatePath('/dashboard')
  revalidatePath(`/admin/users/${user.id}`)
}

// ─── Mark customer messages as read ──────────────────────────────────────────
// Called when customer opens the Messages tab or Verification Updates section.
// Marks all unread admin events for this customer as read (is_read = true).

export async function markCustomerMessagesRead(): Promise<void> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return  // Non-throwing — read-marking is not critical

  await supabase
    .from('verification_events')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('is_read', false)
  // No revalidatePath needed — this is a background read-state update
}

// ─── Save last flight date ────────────────────────────────────────────────────
// Customer records when they last flew. Stored on profiles.last_flight_date so
// it is shared between the Documents page and the checkout flow.

export async function saveLastFlightDate(dateStr: string): Promise<void> {
  const trimmed = dateStr.trim()
  if (!trimmed) throw new Error('VALIDATION: Date cannot be empty.')

  // Must be a valid YYYY-MM-DD date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) throw new Error('VALIDATION: Invalid date format.')

  // Must not be a future date
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
  if (trimmed > today) throw new Error('VALIDATION: Last flight date cannot be in the future.')

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('profiles')
    .update({ last_flight_date: trimmed })
    .eq('id', user.id)

  if (error) throw new Error('Failed to save last flight date. Please try again.')

  revalidatePath('/dashboard/documents')
  revalidatePath('/dashboard/checkout')
}

// ─── Save customer ARN ────────────────────────────────────────────────────────
// Customer enters their own Aviation Reference Number during verification.
// Stored on profiles.pilot_arn — admin can also set/override this separately.

export async function saveCustomerArn(arn: string): Promise<void> {
  const trimmed = arn.trim()
  if (!trimmed) throw new Error('VALIDATION: ARN cannot be empty.')
  if (trimmed.length > 20) throw new Error('VALIDATION: ARN must be 20 characters or fewer.')

  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('profiles')
    .update({ pilot_arn: trimmed })
    .eq('id', user.id)

  if (error) throw new Error('Failed to save ARN. Please try again.')

  revalidatePath('/dashboard/documents')
  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard/bookings/new')
}
