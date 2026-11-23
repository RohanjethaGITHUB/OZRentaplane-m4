'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send-email'
import { getOutstandingOverageInvoices, overageGateMessage } from '@/lib/payments/block-time-overage'
import { canPurchaseBlockTime, getLivePromotion, getPackagePromo } from '@/lib/promotions'
import { approveBlockTimeBankTransfer, blockTimeTransferReference } from '@/lib/payments/block-time-bank-transfer'
import {
  adminBlockTimeBankTransferUploadedEmail,
  blockTimeBankTransferReceivedEmail,
  blockTimeBankTransferRejectedEmail,
  blockTimeBankTransferResubmitEmail,
} from '@/lib/email/templates/block-time-bank-transfer'
import { emitBlockTimeUpdated, emitOpsChanged, emitPaymentUpdated } from '@/lib/realtime/emit'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'devjamaviation@gmail.com'
const VALID_RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function aud(value: number) {
  return `$${Number(value).toFixed(2)} AUD`
}

async function requireUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return { supabase, user }
}

async function requireAdmin() {
  const { supabase, user } = await requireUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') throw new Error('Forbidden')
  return { supabase, adminId: user.id }
}

function revalidateBlockTimePages(purchaseId: string) {
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/pricing')
  revalidatePath('/dashboard/purchases')
  revalidatePath(`/dashboard/purchases/${purchaseId}/bank-transfer`)
  revalidatePath('/admin')
  revalidatePath('/admin/block-time-purchases')
  revalidatePath(`/admin/block-time-purchases/${purchaseId}`)
}

// ─── Customer: reserve a package to pay by bank transfer ─────────────────────

export async function createBlockTimeBankTransferPurchase(packageId: string) {
  const { supabase, user } = await requireUser()

  const outstandingOverage = await getOutstandingOverageInvoices(supabase, user.id)
  if (outstandingOverage.length > 0) throw new Error(overageGateMessage(outstandingOverage))

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, account_status, pilot_clearance_status')
    .eq('id', user.id)
    .single()
  if (profileErr || !profile) throw new Error('Profile not found.')

  const livePromotion = await getLivePromotion(supabase)
  if (
    !canPurchaseBlockTime({
      accountStatus: profile.account_status,
      pilotClearanceStatus: profile.pilot_clearance_status,
      promotion: livePromotion,
    })
  ) {
    throw new Error(
      profile.account_status && profile.account_status !== 'active'
        ? 'Your account cannot purchase block time right now. Please contact OZ Rent A Plane.'
        : 'Block time can be purchased once your checkout is cleared.',
    )
  }

  const { data: activePurchase } = await supabase
    .from('pilot_block_time_purchases')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (activePurchase) {
    throw new Error('You already have an active block time package. Please top it up instead.')
  }

  const { data: pkg, error: pkgErr } = await supabase
    .from('block_time_packages')
    .select('id, name, hours, rate_per_hour, total_price, is_active')
    .eq('id', packageId)
    .eq('is_active', true)
    .single()
  if (pkgErr || !pkg) throw new Error('Selected package is not available.')

  // Existing reservations: keep any that already has a receipt on file (never
  // lose a payment trail); reuse a same-package one; drop the rest.
  const { data: pending } = await supabase
    .from('pilot_block_time_purchases')
    .select('id, package_id')
    .eq('user_id', user.id)
    .eq('status', 'pending')

  let reuseId: string | null = null
  if (pending && pending.length > 0) {
    const { data: withReceipts } = await supabase
      .from('block_time_bank_transfer_submissions')
      .select('purchase_id, status')
      .in('purchase_id', pending.map((p) => p.id))

    const hasReceipt = new Set((withReceipts ?? []).map((s) => s.purchase_id))
    const underReview = new Set(
      (withReceipts ?? []).filter((s) => s.status === 'pending_review').map((s) => s.purchase_id),
    )

    const awaiting = pending.find((p) => underReview.has(p.id))
    if (awaiting) {
      redirect(`/dashboard/purchases/${awaiting.id}/bank-transfer`)
    }

    const sameKept = pending.find((p) => p.package_id === pkg.id && hasReceipt.has(p.id))
    const sameFresh = pending.find((p) => p.package_id === pkg.id)
    reuseId = (sameKept ?? sameFresh)?.id ?? null

    const dropIds = pending.filter((p) => p.id !== reuseId && !hasReceipt.has(p.id)).map((p) => p.id)
    if (dropIds.length > 0) {
      await supabase.from('pilot_block_time_purchases').delete().in('id', dropIds).eq('status', 'pending')
    }
  }

  if (!reuseId) {
    const { data: purchase, error: purchaseErr } = await supabase
      .from('pilot_block_time_purchases')
      .insert({
        user_id: user.id,
        package_id: pkg.id,
        hours_purchased: pkg.hours,
        hours_remaining: pkg.hours,
        rate_per_hour: pkg.rate_per_hour,
        amount_paid: pkg.total_price,
        status: 'pending',
        payment_method: 'bank_transfer',
        purchased_at: new Date().toISOString(),
        // Placeholder: replaced with now + validity when the admin approves.
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single()

    if (purchaseErr || !purchase) throw new Error(purchaseErr?.message ?? 'Failed to reserve the purchase.')
    reuseId = purchase.id
  }

  revalidatePath('/dashboard/purchases')
  redirect(`/dashboard/purchases/${reuseId}/bank-transfer`)
}

// ─── Customer: upload the receipt ────────────────────────────────────────────

export async function submitBlockTimeBankTransferProof(purchaseId: string, formData: FormData) {
  const { supabase, user } = await requireUser()

  const file = formData.get('receipt')
  if (!(file instanceof File) || file.size === 0) throw new Error('Please choose a receipt file to upload.')
  if (!VALID_RECEIPT_TYPES.includes(file.type)) {
    throw new Error('Invalid file type. Please upload a JPEG, PNG, WebP, or PDF.')
  }
  if (file.size > MAX_RECEIPT_BYTES) throw new Error('File is too large. Maximum size is 5MB.')

  const { data: purchase } = await supabase
    .from('pilot_block_time_purchases')
    .select(`
      id, user_id, package_id, status, hours_purchased, amount_paid,
      package:block_time_packages ( name )
    `)
    .eq('id', purchaseId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!purchase) throw new Error('Purchase not found.')
  if (purchase.status !== 'pending') throw new Error('This purchase is no longer awaiting payment.')

  const admin = createAdminClient()

  const { data: previous } = await admin
    .from('block_time_bank_transfer_submissions')
    .select('id, status, promotion_id, promo_bonus_hours, promo_free_checkout')
    .eq('purchase_id', purchaseId)
    .order('submitted_at', { ascending: false })

  if ((previous ?? []).some((s) => s.status === 'pending_review')) {
    throw new Error('A receipt is already awaiting review.')
  }

  // Lock the promotion terms on the first receipt; later receipts keep them.
  let promoFields: { promotion_id: string | null; promo_bonus_hours: number; promo_free_checkout: boolean }
  const firstSubmission = previous && previous.length > 0 ? previous[previous.length - 1] : null
  if (firstSubmission) {
    promoFields = {
      promotion_id: firstSubmission.promotion_id,
      promo_bonus_hours: Number(firstSubmission.promo_bonus_hours ?? 0),
      promo_free_checkout: firstSubmission.promo_free_checkout === true,
    }
  } else {
    const promo = getPackagePromo(await getLivePromotion(supabase), purchase.package_id)
    promoFields = {
      promotion_id: promo?.promotionId ?? null,
      promo_bonus_hours: promo?.bonusHours ?? 0,
      promo_free_checkout: promo?.freeCheckout ?? false,
    }
  }

  const ext = (file.name.split('.').pop() || 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'bin'
  const filePath = `${user.id}/block-time-${purchaseId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('bank_transfer_receipts')
    .upload(filePath, file, { upsert: false })
  if (uploadError) {
    console.error('[submitBlockTimeBankTransferProof] upload failed', uploadError)
    throw new Error('Failed to upload receipt. Please try again.')
  }

  const reference = blockTimeTransferReference(purchaseId)
  const { error: insertError } = await admin.from('block_time_bank_transfer_submissions').insert({
    purchase_id: purchaseId,
    customer_id: user.id,
    reference,
    receipt_storage_path: filePath,
    status: 'pending_review',
    ...promoFields,
  })

  if (insertError) {
    console.error('[submitBlockTimeBankTransferProof] insert failed', insertError)
    await supabase.storage.from('bank_transfer_receipts').remove([filePath])
    throw new Error(
      insertError.code === '23505'
        ? 'A receipt is already awaiting review.'
        : 'Failed to submit your receipt. Please try again.',
    )
  }

  await admin
    .from('pilot_block_time_purchases')
    .update({ payment_method: 'bank_transfer' })
    .eq('id', purchaseId)

  // Emails — never block the submission on these.
  try {
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single()
    const pkgName = one(purchase.package as any)?.name ?? 'Block Time'
    const details = {
      packageName: pkgName,
      packageHours: Number(purchase.hours_purchased),
      amount: aud(Number(purchase.amount_paid)),
      transferReference: reference,
      purchaseId,
    }

    if (profile?.email) {
      const t = blockTimeBankTransferReceivedEmail(details)
      await sendEmail({
        to: profile.email,
        subject: t.subject,
        html: t.html,
        eventType: 'block_time_bank_transfer_received',
        entityType: 'block_time_purchase',
        entityId: purchaseId,
      }).catch((e) => console.error('[submitBlockTimeBankTransferProof] customer email failed:', e))
    }

    if (ADMIN_EMAIL) {
      const t = adminBlockTimeBankTransferUploadedEmail({
        ...details,
        customerName: profile?.full_name?.trim() || 'Pilot',
        customerEmail: profile?.email ?? '—',
        bonusHours: promoFields.promo_bonus_hours,
        freeCheckout: promoFields.promo_free_checkout,
        isResubmission: Boolean(previous && previous.length > 0),
      })
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: t.subject,
        html: t.html,
        eventType: 'admin_block_time_bank_transfer_uploaded',
        entityType: 'block_time_purchase',
        entityId: purchaseId,
        metadata: { amount: details.amount, reference },
      }).catch((e) => console.error('[submitBlockTimeBankTransferProof] admin email failed:', e))
    }
  } catch (emailErr) {
    console.error('[submitBlockTimeBankTransferProof] notification failed (non-fatal):', emailErr)
  }

  revalidateBlockTimePages(purchaseId)
  void emitPaymentUpdated({ userId: user.id })
  void emitBlockTimeUpdated(user.id)
  void emitOpsChanged()

  return { success: true }
}

// ─── Admin: approve / request new receipt / reject ───────────────────────────

export async function adminApproveBlockTimeBankTransfer(submissionId: string) {
  const { adminId } = await requireAdmin()
  const admin = createAdminClient()
  const result = await approveBlockTimeBankTransfer(admin, submissionId, adminId)
  revalidateBlockTimePages(result.purchaseId)
  return { success: true }
}

async function reviewWithoutApproval(
  submissionId: string,
  note: string,
  nextStatus: 'resubmission_requested' | 'rejected',
) {
  const { adminId } = await requireAdmin()
  const cleanNote = note?.trim()
  if (!cleanNote) {
    throw new Error(nextStatus === 'rejected' ? 'A rejection reason is required.' : 'Please tell the customer what is needed.')
  }

  const admin = createAdminClient()
  const { data: sub, error } = await admin
    .from('block_time_bank_transfer_submissions')
    .update({
      status: nextStatus,
      admin_note: cleanNote,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .eq('status', 'pending_review')
    .select('id, purchase_id, customer_id, reference')
    .maybeSingle()

  if (error) throw new Error(error.message || 'Failed to update the submission.')
  if (!sub) throw new Error('This receipt is no longer pending review.')

  try {
    const [{ data: purchase }, { data: profile }] = await Promise.all([
      admin
        .from('pilot_block_time_purchases')
        .select('hours_purchased, amount_paid, package:block_time_packages ( name )')
        .eq('id', sub.purchase_id)
        .single(),
      admin.from('profiles').select('email').eq('id', sub.customer_id).single(),
    ])

    const details = {
      packageName: one(purchase?.package as any)?.name ?? 'Block Time',
      packageHours: Number(purchase?.hours_purchased ?? 0),
      amount: aud(Number(purchase?.amount_paid ?? 0)),
      transferReference: sub.reference ?? blockTimeTransferReference(sub.purchase_id),
      purchaseId: sub.purchase_id as string,
      note: cleanNote,
    }

    const resubmit = nextStatus === 'resubmission_requested'
    await admin.from('verification_events').insert({
      user_id: sub.customer_id,
      actor_role: 'admin',
      event_type: 'document_rejected',
      title: resubmit ? 'Please upload a new payment receipt' : 'Bank transfer could not be verified',
      body: resubmit
        ? `We need a clearer receipt for your ${details.packageName} Block Time purchase. Note: ${cleanNote}`
        : `Your bank transfer for ${details.packageName} Block Time could not be verified. Note: ${cleanNote}`,
      is_read: false,
      email_status: 'skipped',
    })

    if (profile?.email) {
      const t = resubmit ? blockTimeBankTransferResubmitEmail(details) : blockTimeBankTransferRejectedEmail(details)
      await sendEmail({
        to: profile.email,
        subject: t.subject,
        html: t.html,
        eventType: resubmit ? 'block_time_bank_transfer_resubmit' : 'block_time_bank_transfer_rejected',
        entityType: 'block_time_purchase',
        entityId: sub.purchase_id,
      }).catch((e) => console.error('[block-time-bank-transfer] customer email failed:', e))
    }
  } catch (notifyErr) {
    console.error('[block-time-bank-transfer] notification failed (non-fatal):', notifyErr)
  }

  revalidateBlockTimePages(sub.purchase_id)
  void emitPaymentUpdated({ userId: sub.customer_id })
  void emitBlockTimeUpdated(sub.customer_id)
  void emitOpsChanged()

  return { success: true }
}

export async function adminRequestNewBlockTimeReceipt(submissionId: string, note: string) {
  return reviewWithoutApproval(submissionId, note, 'resubmission_requested')
}

export async function adminRejectBlockTimeBankTransfer(submissionId: string, note: string) {
  return reviewWithoutApproval(submissionId, note, 'rejected')
}
