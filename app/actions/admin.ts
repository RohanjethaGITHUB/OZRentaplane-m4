'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  sendVerificationEmail,
  buildApprovedEmail,
  buildRejectedEmail,
  buildOnHoldEmail,
} from '@/lib/email'

// ─── Admin guard ──────────────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') throw new Error('Forbidden')
  return { supabase, adminId: user.id }
}

// ─── Approve customer ─────────────────────────────────────────────────────────

export async function approveCustomer(customerId: string, reviewNotes: string) {
  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()

  // Fetch current state for from_status and email
  const { data: current } = await supabase
    .from('profiles')
    .select('verification_status, email, full_name')
    .eq('id', customerId)
    .single()

  const fromStatus = current?.verification_status ?? null
  const customerEmail = current?.email ?? null
  const customerName  = current?.full_name ?? 'Pilot'

  // Guard: nothing to do if already verified with the same notes
  if (fromStatus === 'verified' && (reviewNotes.trim() || null) === null) {
    // Still allow re-approve with a new note — only truly skip if identical
  }

  // Update profile
  const { error } = await supabase
    .from('profiles')
    .update({
      verification_status: 'verified',
      reviewed_at: now,
      reviewed_by: adminId,
      admin_review_note: reviewNotes.trim() || null,
    })
    .eq('id', customerId)

  if (error) {
    console.error('[approveCustomer] Profile update failed:', error)
    throw new Error('Failed to approve customer')
  }

  // Mark all documents approved
  await supabase
    .from('user_documents')
    .update({ status: 'approved', review_notes: reviewNotes.trim() || null, reviewed_at: now })
    .eq('user_id', customerId)

  // Insert customer-visible event
  const { data: event } = await supabase
    .from('verification_events')
    .insert({
      user_id:       customerId,
      actor_user_id: adminId,
      actor_role:    'admin',
      event_type:    'approved',
      from_status:   fromStatus,
      to_status:     'verified',
      title:         'Verification Approved',
      body:          'Your pilot credentials have been reviewed and verified. You are now cleared to book aircraft from the Sydney fleet.',
      email_status:  'pending',
    })
    .select('id')
    .single()

  // Send email (non-blocking relative to status update — failure is logged only)
  if (customerEmail) {
    const { subject, html } = buildApprovedEmail(customerName)
    const { status: emailStatus } = await sendVerificationEmail(customerEmail, subject, html)
    if (event?.id) {
      await supabase
        .from('verification_events')
        .update({
          email_status:  emailStatus,
          email_sent_at: emailStatus === 'sent' ? now : null,
        })
        .eq('id', event.id)
    }
  }

  revalidatePath('/admin')
  revalidatePath('/admin/pending-verifications')
  revalidatePath('/admin/on-hold')
  revalidatePath('/admin/verified-users')
  revalidatePath('/admin/all-customers')
  revalidatePath(`/admin/users/${customerId}`)
  revalidatePath('/dashboard')
}

// ─── Reject customer ──────────────────────────────────────────────────────────

export async function rejectCustomer(customerId: string, reviewNotes: string) {
  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()

  const { data: current } = await supabase
    .from('profiles')
    .select('verification_status, email, full_name')
    .eq('id', customerId)
    .single()

  const fromStatus    = current?.verification_status ?? null
  const customerEmail = current?.email ?? null
  const customerName  = current?.full_name ?? 'Pilot'

  const { error } = await supabase
    .from('profiles')
    .update({
      verification_status: 'rejected',
      reviewed_at: now,
      reviewed_by: adminId,
      admin_review_note: reviewNotes.trim() || null,
    })
    .eq('id', customerId)

  if (error) {
    console.error('[rejectCustomer] Profile update failed:', error)
    throw new Error('Failed to reject customer')
  }

  await supabase
    .from('user_documents')
    .update({ status: 'rejected', review_notes: reviewNotes.trim() || null, reviewed_at: now })
    .eq('user_id', customerId)

  const { data: event } = await supabase
    .from('verification_events')
    .insert({
      user_id:       customerId,
      actor_user_id: adminId,
      actor_role:    'admin',
      event_type:    'rejected',
      from_status:   fromStatus,
      to_status:     'rejected',
      title:         'Verification Unsuccessful',
      body:          'Your verification review has been completed. Unfortunately we were unable to approve your application at this time. Please contact support or resubmit updated documentation.',
      email_status:  'pending',
    })
    .select('id')
    .single()

  if (customerEmail) {
    const { subject, html } = buildRejectedEmail(customerName)
    const { status: emailStatus } = await sendVerificationEmail(customerEmail, subject, html)
    if (event?.id) {
      await supabase
        .from('verification_events')
        .update({
          email_status:  emailStatus,
          email_sent_at: emailStatus === 'sent' ? now : null,
        })
        .eq('id', event.id)
    }
  }

  revalidatePath('/admin')
  revalidatePath('/admin/pending-verifications')
  revalidatePath('/admin/on-hold')
  revalidatePath('/admin/rejected-users')
  revalidatePath('/admin/all-customers')
  revalidatePath(`/admin/users/${customerId}`)
  revalidatePath('/dashboard')
}

// ─── Place customer on hold ───────────────────────────────────────────────────
// Requires a non-empty customer-facing message. The message goes into
// verification_events.body and is sent via email. It is deliberately
// kept out of admin_review_note, which remains internal/admin-only.
//
// requestKind tells the customer what kind of response is expected:
//   document_request      → upload/replace documents, then resubmit
//   clarification_request → reply by message, resubmit when ready
//   confirmation_request  → confirm by message, resubmit when ready
//   general_update        → informational
//
// Returns a warning string if the status was updated but the event could
// not be saved — so the caller can surface a non-blocking advisory.

export async function placeCustomerOnHold(
  customerId: string,
  customerMessage: string,
  requestKind: 'document_request' | 'clarification_request' | 'confirmation_request' | 'general_update' = 'document_request',
): Promise<{ warning?: string }> {
  if (!customerMessage.trim()) {
    throw new Error('VALIDATION: A customer-facing message is required when placing a user on hold.')
  }

  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()

  const { data: current, error: profileSelectError } = await supabase
    .from('profiles')
    .select('verification_status, email, full_name')
    .eq('id', customerId)
    .single()

  if (profileSelectError) {
    console.warn('[placeCustomerOnHold] Profile select warning (proceeding):', profileSelectError)
  }

  const fromStatus    = current?.verification_status ?? null
  const customerEmail = current?.email ?? null
  const customerName  = current?.full_name ?? 'Pilot'

  // ── Critical path: update profile status ─────────────────────────────────
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      verification_status: 'on_hold',
      reviewed_at:  now,
      reviewed_by:  adminId,
      // admin_review_note intentionally NOT updated here — it is internal-admin-only
    })
    .eq('id', customerId)

  if (updateError) {
    // Surface Postgres error code to help diagnose constraint violations
    console.error('[placeCustomerOnHold] Profile update failed:', updateError)
    const hint = updateError.code === '23514'
      ? ' (Postgres check constraint — ensure migration 008 has been applied in the Supabase SQL Editor)'
      : ` (${updateError.code ?? 'unknown error'})`
    throw new Error(`Failed to place customer on hold${hint}`)
  }

  // ── Non-critical path: insert customer-visible event ─────────────────────
  // If this fails we do NOT throw — the status update already succeeded.
  // We return a warning so the client can show an advisory without rolling back.
  const { data: event, error: eventError } = await supabase
    .from('verification_events')
    .insert({
      user_id:       customerId,
      actor_user_id: adminId,
      actor_role:    'admin',
      event_type:    'on_hold',
      from_status:   fromStatus,
      to_status:     'on_hold',
      title:         'Additional Information Required',
      body:          customerMessage.trim(),
      request_kind:  requestKind,
      email_status:  'pending',
    })
    .select('id')
    .single()

  if (eventError || !event?.id) {
    console.error('[placeCustomerOnHold] Event insert failed (status was still updated):', eventError)
    revalidatePath('/admin')
    revalidatePath('/admin/pending-verifications')
    revalidatePath('/admin/on-hold')
    revalidatePath('/admin/all-customers')
    revalidatePath(`/admin/users/${customerId}`)
    revalidatePath('/dashboard')
    return {
      warning: 'Status updated to On Hold, but the customer message could not be saved. Check server logs and verify verification_events RLS policies.',
    }
  }

  // ── Non-critical path: send email ─────────────────────────────────────────
  if (customerEmail) {
    try {
      const { subject, html } = buildOnHoldEmail(customerName, customerMessage.trim())
      const { status: emailStatus } = await sendVerificationEmail(customerEmail, subject, html)
      await supabase
        .from('verification_events')
        .update({
          email_status:  emailStatus,
          email_sent_at: emailStatus === 'sent' ? now : null,
        })
        .eq('id', event.id)
    } catch (emailErr) {
      // Email failure is fully non-blocking
      console.error('[placeCustomerOnHold] Email send error (non-fatal):', emailErr)
      await supabase
        .from('verification_events')
        .update({ email_status: 'failed' })
        .eq('id', event.id)
    }
  } else {
    await supabase
      .from('verification_events')
      .update({ email_status: 'skipped' })
      .eq('id', event.id)
  }

  revalidatePath('/admin')
  revalidatePath('/admin/pending-verifications')
  revalidatePath('/admin/on-hold')
  revalidatePath('/admin/verified-users')
  revalidatePath('/admin/rejected-users')
  revalidatePath('/admin/all-customers')
  revalidatePath(`/admin/users/${customerId}`)
  revalidatePath('/dashboard')

  return {}
}

// ─── Signed document URL ──────────────────────────────────────────────────────

export async function getSignedDocumentUrl(storagePath: string): Promise<string> {
  const { supabase } = await requireAdmin()

  const { data, error } = await supabase.storage
    .from('verification_documents')
    .createSignedUrl(storagePath, 60 * 5)

  if (error || !data?.signedUrl) throw new Error('Could not generate secure file URL')
  return data.signedUrl
}

// ─── Customer search ──────────────────────────────────────────────────────────

export async function searchCustomers(
  query: string
): Promise<Array<{ id: string; full_name: string | null; verification_status: string }>> {
  if (!query.trim()) return []
  const { supabase } = await requireAdmin()

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, verification_status')
    .eq('role', 'customer')
    .ilike('full_name', `%${query.trim()}%`)
    .limit(8)

  return data ?? []
}
