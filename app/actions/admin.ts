'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  sendVerificationEmail,
  buildApprovedEmail,
  buildRejectedEmail,
  buildOnHoldEmail,
} from '@/lib/email'
import type { ThreadSummary, VerificationEvent, ActorRole, RequestKind } from '@/lib/supabase/types'

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
  revalidatePath('/admin/customers/all')
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
  revalidatePath('/admin/customers/all')
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
  requestKind: RequestKind = 'document_request',
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
    revalidatePath('/admin/customers/all')
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
  revalidatePath('/admin/customers/all')
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

// ─── Admin chat message ───────────────────────────────────────────────────────
// Admin sends a direct chat message to a customer without changing their status.
// This is separate from placeCustomerOnHold which changes status + sends a message.

export async function sendAdminChatMessage(
  customerId: string,
  message: string,
): Promise<void> {
  if (!message.trim()) {
    throw new Error('VALIDATION: Message cannot be empty.')
  }

  const { supabase, adminId } = await requireAdmin()

  const { error } = await supabase
    .from('verification_events')
    .insert({
      user_id:       customerId,
      actor_user_id: adminId,
      actor_role:    'admin',
      event_type:    'message',
      from_status:   null,
      to_status:     null,
      title:         'Message from Admin',
      body:          message.trim(),
      email_status:  'skipped',
      admin_read_at: new Date().toISOString(), // admin sent it, so already read by admin
    })

  if (error) {
    console.error('[sendAdminChatMessage] Insert failed:', error)
    throw new Error('Failed to send message. Please try again.')
  }

  revalidatePath(`/admin/users/${customerId}`)
  revalidatePath('/admin/messages')
  revalidatePath('/dashboard')
}

// ─── Mark admin chat messages as read ────────────────────────────────────────
// Called when admin opens the chat panel for a customer.
// Marks all customer-sent events for this customer as read by admin.

export async function markAdminChatRead(customerId: string): Promise<void> {
  const { supabase } = await requireAdmin()
  const now = new Date().toISOString()

  await supabase
    .from('verification_events')
    .update({ admin_read_at: now })
    .eq('user_id', customerId)
    .eq('actor_role', 'customer')
    .is('admin_read_at', null)
  // Non-throwing — read-marking failure is not critical
}

// ─── Admin inbox: thread list ─────────────────────────────────────────────────
// Returns one ThreadSummary per customer who has at least one chat event.
// Sorted: unread threads first, then by latest message timestamp desc.

export async function getAdminThreadList(): Promise<ThreadSummary[]> {
  const { supabase } = await requireAdmin()

  // All customers
  const { data: customers } = await supabase
    .from('profiles')
    .select('id, full_name, email, verification_status')
    .eq('role', 'customer')

  if (!customers || customers.length === 0) return []

  const customerIds = customers.map(c => c.id)

  // All chat events for these customers — message events OR on_hold events with a body
  const { data: events } = await supabase
    .from('verification_events')
    .select('user_id, body, created_at, actor_role, admin_read_at, event_type')
    .in('user_id', customerIds)
    .in('event_type', ['message', 'on_hold'])
    .not('body', 'is', null)
    .order('created_at', { ascending: false })

  if (!events || events.length === 0) return []

  // Aggregate: latest message + unread count per customer
  // events are sorted DESC so the first entry per user is the most recent
  const agg = new Map<string, {
    latestEvent: typeof events[0]
    unreadCount: number
    total: number
  }>()

  for (const ev of events) {
    if (!agg.has(ev.user_id)) {
      agg.set(ev.user_id, { latestEvent: ev, unreadCount: 0, total: 0 })
    }
    const entry = agg.get(ev.user_id)!
    entry.total++
    if (ev.actor_role === 'customer' && !ev.admin_read_at) {
      entry.unreadCount++
    }
  }

  // Build thread summaries for customers who have chat events
  const threads: ThreadSummary[] = customers
    .filter(c => agg.has(c.id))
    .map(c => {
      const a = agg.get(c.id)!
      return {
        customerId:          c.id,
        customerName:        c.full_name,
        customerEmail:       c.email,
        verificationStatus:  c.verification_status,
        lastMessageBody:     a.latestEvent.body,
        lastMessageAt:       a.latestEvent.created_at,
        lastMessageRole:     a.latestEvent.actor_role as ActorRole,
        unreadCount:         a.unreadCount,
        totalMessages:       a.total,
      }
    })

  // Unread first, then most-recently-updated
  threads.sort((a, b) => {
    if (a.unreadCount > 0 && b.unreadCount === 0) return -1
    if (a.unreadCount === 0 && b.unreadCount > 0) return 1
    return new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime()
  })

  return threads
}

// ─── Admin inbox: single thread ───────────────────────────────────────────────
// Returns all chat events for one customer, chronological order.

export async function getAdminThread(customerId: string): Promise<VerificationEvent[]> {
  const { supabase } = await requireAdmin()

  const { data } = await supabase
    .from('verification_events')
    .select('*')
    .eq('user_id', customerId)
    .in('event_type', ['message', 'on_hold'])
    .not('body', 'is', null)
    .order('created_at', { ascending: true })

  return (data ?? []) as VerificationEvent[]
}

// ─── Admin inbox: total unread count ─────────────────────────────────────────
// Fast scalar count of all customer messages not yet read by admin.
// Used to power the sidebar badge.

export async function getAdminUnreadCount(): Promise<number> {
  const { supabase } = await requireAdmin()

  const { count } = await supabase
    .from('verification_events')
    .select('*', { count: 'exact', head: true })
    .eq('actor_role', 'customer')
    .is('admin_read_at', null)

  return count ?? 0
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

// ─── Pilot Metadata Management ────────────────────────────────────────────────

export async function updateCustomerPilotArn(customerId: string, pilotArn: string): Promise<void> {
  if (!pilotArn.trim()) throw new Error('VALIDATION: Pilot ARN cannot be empty.')
  
  const { supabase, adminId } = await requireAdmin()

  // Update profile
  const { error } = await supabase
    .from('profiles')
    .update({ pilot_arn: pilotArn.trim() })
    .eq('id', customerId)
    .eq('role', 'customer')

  if (error) {
    console.error('[updateCustomerPilotArn] Failed:', error)
    throw new Error('Failed to update Pilot ARN. Please try again.')
  }

  // Audit event
  await supabase.from('verification_events').insert({
    user_id: customerId,
    actor_user_id: adminId,
    actor_role: 'admin',
    event_type: 'message', // using message as a generic audit bucket for metadata change for now
    title: 'Pilot ARN Updated',
    body: `Admin updated Pilot ARN to: ${pilotArn.trim()}`,
    email_status: 'skipped'
  })

  revalidatePath(`/admin/users/${customerId}`)
  revalidatePath('/admin/customers/all')
  revalidatePath('/admin')
}

export async function updateDocumentExpiryDate(documentId: string, customerId: string, expiryDate: string | null): Promise<void> {
  const { supabase, adminId } = await requireAdmin()

  const { error } = await supabase
    .from('user_documents')
    .update({ expiry_date: expiryDate })
    .eq('id', documentId)
    .eq('user_id', customerId)

  if (error) {
    console.error('[updateDocumentExpiryDate] Failed:', error)
    throw new Error('Failed to update document expiry date.')
  }

  // Audit event
  await supabase.from('verification_events').insert({
    user_id: customerId,
    actor_user_id: adminId,
    actor_role: 'admin',
    event_type: 'message',
    title: 'Document Expiry Updated',
    body: `Admin updated document expiry date to: ${expiryDate || 'None'}`,
    email_status: 'skipped'
  })

  revalidatePath(`/admin/users/${customerId}`)
}

// ─── Customer Credits ──────────────────────────────────────────────────────────

export async function getCustomerCreditBalance(customerId: string): Promise<number> {
  const { supabase } = await requireAdmin()

  const { data, error } = await supabase
    .from('customer_credit_balances')
    .select('balance_cents')
    .eq('customer_id', customerId)
    .single()

  if (error && error.code !== 'PGRST116') {
    console.error('[getCustomerCreditBalance] Failed to fetch balance:', error)
    throw new Error('Failed to fetch customer credit balance.')
  }

  return data?.balance_cents ?? 0
}

export async function getCustomerCreditTransactions(customerId: string) {
  const { supabase } = await requireAdmin()

  const { data, error } = await supabase
    .from('customer_payment_ledger')
    .select('*')
    .eq('customer_id', customerId)
    .in('entry_type', ['advance_credit', 'advance_applied', 'refund', 'manual_adjustment', 'credit_reversed', 'credit_refunded'])
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[getCustomerCreditTransactions] Failed to fetch transactions:', error)
    throw new Error('Failed to fetch customer credit transactions.')
  }

  return data ?? []
}

export async function recordAdvancePayment(
  customerId: string,
  amountDollars: number,
  paymentMethod: string,
  receivedAt: string,
  reference?: string,
  note?: string
): Promise<void> {
  if (amountDollars <= 0) {
    throw new Error('VALIDATION: Amount must be greater than 0.')
  }

  const { supabase, adminId } = await requireAdmin()
  const amountCents = Math.round(amountDollars * 100)

  const { error } = await supabase
    .from('customer_payment_ledger')
    .insert({
      customer_id: customerId,
      amount_cents: amountCents,
      entry_type: 'advance_credit',
      payment_method: paymentMethod,
      note: note || `Advance payment received. Ref: ${reference || 'N/A'}`,
      created_by: adminId,
      created_at: receivedAt || new Date().toISOString(),
    })

  if (error) {
    console.error('[recordAdvancePayment] Failed to record advance payment:', error)
    throw new Error('Failed to record advance payment.')
  }

  revalidatePath(`/admin/customers/ledger`)
  revalidatePath(`/admin/users/${customerId}`)
}

export async function reverseCreditEntry(ledgerId: string, reason: string): Promise<void> {
  const { supabase, adminId } = await requireAdmin()

  if (!reason || reason.trim() === '') {
    throw new Error('VALIDATION: Reason is required for reversal.')
  }

  const { error } = await supabase.rpc('reverse_customer_credit_atomic', {
    p_ledger_id: ledgerId,
    p_reason: reason.trim()
  })

  if (error) {
    console.error('[reverseCreditEntry] Failed:', error)
    throw new Error(error.message || 'Failed to reverse credit entry.')
  }

  revalidatePath(`/admin/customers/ledger`)
}

export async function recordRefund(
  customerId: string,
  amountDollars: number,
  paymentMethod: string,
  reference: string,
  note: string
): Promise<void> {
  if (amountDollars <= 0) {
    throw new Error('VALIDATION: Refund amount must be greater than 0.')
  }

  const { supabase, adminId } = await requireAdmin()
  const amountCents = Math.round(amountDollars * 100)

  const { error } = await supabase.rpc('record_customer_refund_atomic', {
    p_customer_id: customerId,
    p_amount_cents: amountCents,
    p_payment_method: paymentMethod,
    p_reference: reference.trim(),
    p_note: note.trim()
  })

  if (error) {
    console.error('[recordRefund] Failed:', error)
    throw new Error(error.message || 'Failed to record refund.')
  }

  revalidatePath(`/admin/customers/ledger`)
  revalidatePath(`/admin/users/${customerId}`)
}

// ─── Update account status ────────────────────────────────────────────────────
// Admin blocks, unblocks, or archives a customer account.
// 'blocked'  → customer cannot create any new bookings.
// 'archived' → hidden from active queues; soft-deleted state.
// 'active'   → normal account.

export async function updateAccountStatus(
  customerId: string,
  status: 'active' | 'blocked' | 'archived',
  reason?: string,
) {
  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('profiles')
    .update({
      account_status:    status,
      admin_review_note: reason?.trim() || null,
      reviewed_at:       now,
      reviewed_by:       adminId,
      updated_at:        now,
    })
    .eq('id', customerId)

  if (error) {
    console.error('[updateAccountStatus] Failed:', error)
    throw new Error('Failed to update account status.')
  }

  revalidatePath('/admin/customers')
  revalidatePath('/admin/customers/all')
  revalidatePath(`/admin/users/${customerId}`)
  revalidatePath('/dashboard')
}

// ─── Update pilot clearance status ───────────────────────────────────────────
// Admin manually overrides a customer's pilot clearance status.
// Used for edge cases such as manually clearing a pilot or marking them
// not eligible without going through the full checkout flow.

export async function updatePilotClearanceStatus(
  customerId: string,
  status: string,
  note?: string,
) {
  const { supabase, adminId } = await requireAdmin()
  const now = new Date().toISOString()

  const ALLOWED = [
    'checkout_required',
    'checkout_requested',
    'checkout_confirmed',
    'checkout_completed_under_review',
    'checkout_payment_required',
    'cleared_to_fly',
    'additional_checkout_required',
    'checkout_reschedule_required',
    'not_currently_eligible',
  ]

  if (!ALLOWED.includes(status)) {
    throw new Error(`VALIDATION: Invalid clearance status: ${status}`)
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      pilot_clearance_status: status,
      admin_review_note:      note?.trim() || null,
      reviewed_at:            now,
      reviewed_by:            adminId,
      updated_at:             now,
    })
    .eq('id', customerId)

  if (error) {
    console.error('[updatePilotClearanceStatus] Failed:', error)
    throw new Error('Failed to update pilot clearance status.')
  }

  revalidatePath('/admin/customers')
  revalidatePath('/admin/customers/all')
  revalidatePath(`/admin/users/${customerId}`)
  revalidatePath('/dashboard')
}
