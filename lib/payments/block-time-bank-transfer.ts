import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send-email'
import { blockTimePurchaseConfirmedEmail, adminBlockTimePurchaseConfirmedEmail } from '@/lib/email/templates/block-time'
import { requestPdfGeneration } from '@/lib/invoices/request-pdf'
import { emitBlockTimeUpdated, emitBookingChanged, emitClearanceUpdated, emitOpsChanged, emitPaymentUpdated } from '@/lib/realtime/emit'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'devjamaviation@gmail.com'

/**
 * Payment reference the customer puts on the transfer:
 *   "OZ-" + name (letters, max 8) + "-" + DDHHmm of the reservation (Sydney time)
 * e.g. "OZ-JOHNSMIT-231934". The time stamp keeps it unique per purchase and it
 * stays within 18 characters, the common bank description limit. Falls back to
 * the purchase id when the customer has no usable name.
 */
export function blockTimeTransferReference(
  fullName: string | null | undefined,
  purchaseId: string,
  purchasedAt?: string | Date | null,
): string {
  const namePart = (fullName ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 8)

  let stamp = ''
  if (purchasedAt) {
    const parts = new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Sydney',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(purchasedAt))
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
    stamp = `${get('day')}${get('hour')}${get('minute')}`
  }
  if (!stamp) stamp = purchaseId.replace(/-/g, '').slice(0, 6).toUpperCase()

  if (namePart.length >= 2) return `OZ-${namePart}-${stamp}`
  return `OZ-${purchaseId.replace(/-/g, '').slice(0, 8).toUpperCase()}`
}

function roundToCents(value: number) {
  return Math.round(value * 100) / 100
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

/**
 * Approves a pending block time bank-transfer submission and activates the
 * package. Mirrors what the Stripe webhook does for card payments:
 * purchase -> active, paid invoice (+ line items), promotion bonus / free
 * checkout, PDF, emails and in-app notification.
 *
 * `admin` must be a service-role client. Throws a user-facing Error on any
 * problem; in that case the submission and purchase are put back as they were.
 */
export async function approveBlockTimeBankTransfer(
  admin: SupabaseClient,
  submissionId: string,
  adminUserId: string,
) {
  // 1. Claim the submission. Only one reviewer can win this.
  const { data: claimed, error: claimErr } = await admin
    .from('block_time_bank_transfer_submissions')
    .update({
      status: 'approved',
      reviewed_by: adminUserId,
      reviewed_at: new Date().toISOString(),
      admin_note: null,
    })
    .eq('id', submissionId)
    .eq('status', 'pending_review')
    .select('id, purchase_id, customer_id, reference, promotion_id, promo_bonus_hours, promo_free_checkout')
    .maybeSingle()

  if (claimErr) throw new Error(claimErr.message || 'Failed to approve the submission.')
  if (!claimed) throw new Error('This receipt is no longer pending review.')

  const revertSubmission = async () => {
    await admin
      .from('block_time_bank_transfer_submissions')
      .update({ status: 'pending_review', reviewed_by: null, reviewed_at: null })
      .eq('id', submissionId)
  }

  try {
    const { data: purchase, error: purchaseErr } = await admin
      .from('pilot_block_time_purchases')
      .select(`
        id, user_id, package_id, status, hours_purchased, rate_per_hour, amount_paid,
        package:block_time_packages ( id, name, hours, rate_per_hour, validity_days )
      `)
      .eq('id', claimed.purchase_id)
      .single()

    if (purchaseErr || !purchase) throw new Error('Purchase not found.')
    if (purchase.status !== 'pending') {
      throw new Error(`This purchase is ${purchase.status}, not pending, so it cannot be activated.`)
    }

    const { data: alreadyActive } = await admin
      .from('pilot_block_time_purchases')
      .select('id')
      .eq('user_id', purchase.user_id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (alreadyActive) {
      throw new Error(
        'This customer already has an active block time package. A customer can only hold one active package — resolve that first (top-up or refund), then approve.',
      )
    }

    const packageRow = one(purchase.package as any) as
      | { name: string; validity_days: number }
      | null
    const packageName = packageRow?.name ?? 'Block Time'
    const packageHours = Number(purchase.hours_purchased)
    const ratePerHour = Number(purchase.rate_per_hour)
    const validityDays = Number(packageRow?.validity_days ?? 0)
    const amountPaid = Number(purchase.amount_paid)

    // 2. Re-validate the promotion terms that were locked at submission time.
    let promoBonusHours = 0
    let promoFreeCheckout = false
    let promotionId: string | null = null
    if (claimed.promotion_id) {
      const { data: rule } = await admin
        .from('promotion_package_rules')
        .select('bonus_hours, includes_free_checkout')
        .eq('promotion_id', claimed.promotion_id)
        .eq('package_id', purchase.package_id)
        .maybeSingle()
      if (rule) {
        const lockedBonus = Number(claimed.promo_bonus_hours ?? 0)
        promoBonusHours = Number.isFinite(lockedBonus) ? Math.min(Math.max(lockedBonus, 0), 50) : 0
        promoFreeCheckout = claimed.promo_free_checkout === true && rule.includes_free_checkout === true
        if (promoBonusHours > 0 || promoFreeCheckout) promotionId = claimed.promotion_id
        else promoBonusHours = 0
      }
    }
    const creditedHours = packageHours + promoBonusHours

    const total = roundToCents(amountPaid)
    const subtotal = roundToCents(total / 1.1)
    const gstAmount = roundToCents(total - subtotal)
    const activatedAt = new Date()
    const activationExpiry = new Date(activatedAt.getTime() + validityDays * 24 * 60 * 60 * 1000).toISOString()

    // 3. Activate the purchase (guarded on status so a double click is harmless).
    const { data: activated, error: activateErr } = await admin
      .from('pilot_block_time_purchases')
      .update({
        status: 'active',
        activated_at: activatedAt.toISOString(),
        expires_at: activationExpiry,
        hours_remaining: creditedHours,
        // bonus_hours must be written with hours_remaining (DB check, migration 121).
        bonus_hours: promoBonusHours,
        promotion_id: promotionId,
        payment_method: 'bank_transfer',
      })
      .eq('id', purchase.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (activateErr || !activated) {
      throw new Error(activateErr?.message || 'Failed to activate the package.')
    }

    const revertPurchase = async () => {
      await admin
        .from('pilot_block_time_purchases')
        .update({
          status: 'pending',
          activated_at: null,
          hours_remaining: packageHours,
          bonus_hours: 0,
          promotion_id: null,
        })
        .eq('id', purchase.id)
    }

    // 4. Paid invoice + line items (idempotent if an invoice already exists).
    let invoice: { id: string; invoice_number: string } | null = null
    let createdInvoice = false
    try {
      const { data: existingInvoice } = await admin
        .from('invoices')
        .select('id, invoice_number')
        .eq('block_time_purchase_id', purchase.id)
        .eq('type', 'block_time_purchase')
        .maybeSingle()

      if (existingInvoice) {
        invoice = existingInvoice
        await admin
          .from('invoices')
          .update({
            status: 'paid',
            payment_method: 'bank_transfer',
            bank_transfer_reference: claimed.reference,
            bank_transfer_confirmed_at: activatedAt.toISOString(),
            bank_transfer_confirmed_by: adminUserId,
            paid_at: activatedAt.toISOString(),
          })
          .eq('id', existingInvoice.id)
      } else {
        const { data: inserted, error: invoiceErr } = await admin
          .from('invoices')
          .insert({
            type: 'block_time_purchase',
            user_id: purchase.user_id,
            block_time_purchase_id: purchase.id,
            subtotal,
            gst_amount: gstAmount,
            total,
            status: 'paid',
            payment_method: 'bank_transfer',
            bank_transfer_reference: claimed.reference,
            bank_transfer_confirmed_at: activatedAt.toISOString(),
            bank_transfer_confirmed_by: adminUserId,
            paid_at: activatedAt.toISOString(),
          })
          .select('id, invoice_number')
          .single()

        if (invoiceErr || !inserted) throw new Error(invoiceErr?.message || 'Failed to create the invoice.')
        invoice = inserted
        createdInvoice = true

        const lines: Record<string, unknown>[] = [
          {
            invoice_id: inserted.id,
            type: 'block_time_hours',
            description: `${packageName} Block Time purchase`,
            quantity: packageHours,
            unit_price: ratePerHour,
            amount: amountPaid,
            display_order: 1,
          },
        ]
        if (promoBonusHours > 0) {
          lines.push({
            invoice_id: inserted.id,
            type: 'block_time_hours',
            description: 'Black Friday bonus hours (free)',
            quantity: promoBonusHours,
            unit_price: 0,
            amount: 0,
            display_order: 2,
          })
        }
        if (promoFreeCheckout) {
          lines.push({
            invoice_id: inserted.id,
            type: 'block_time_hours',
            description: 'Black Friday free checkout flight (included)',
            quantity: 1,
            unit_price: 0,
            amount: 0,
            display_order: 3,
          })
        }
        const { error: lineErr } = await admin.from('invoice_line_items').insert(lines)
        if (lineErr) throw new Error(lineErr.message || 'Failed to create invoice line items.')
      }
    } catch (invoiceFailure) {
      if (invoice && createdInvoice) {
        await admin.from('invoice_line_items').delete().eq('invoice_id', invoice.id)
        await admin.from('invoices').delete().eq('id', invoice.id)
      }
      await revertPurchase()
      throw invoiceFailure
    }

    // ── Everything below is best-effort: the package is already active. ──

    let applied: { out_applied_booking_id: string | null } | null = null
    if (promotionId) {
      const { data: promoData, error: promoErr } = await admin.rpc('record_block_time_promotion', {
        p_purchase_id: purchase.id,
        p_promotion_id: promotionId,
        p_bonus_hours: promoBonusHours,
        p_free_checkout: promoFreeCheckout,
      })
      if (promoErr) {
        console.error('[block-time-bank-transfer] record_block_time_promotion failed', promoErr)
      } else {
        applied = (Array.isArray(promoData) ? promoData[0] : promoData) ?? null
      }
    }

    try {
      const { data: profile } = await admin
        .from('profiles')
        .select('full_name, first_name, last_name, phone_country_code, phone_number, email, pilot_arn')
        .eq('id', purchase.user_id)
        .single()

      let pdfResult: Awaited<ReturnType<typeof requestPdfGeneration>> = null
      try {
        pdfResult = await requestPdfGeneration({
          type: 'block_time_purchase',
          invoiceId: invoice!.id,
          invoiceNumber: invoice!.invoice_number,
          userId: purchase.user_id,
          createdAt: activatedAt.toISOString(),
          packageName,
          packageHours,
          ratePerHour,
          validityDays,
          amountPaid,
          subtotal,
          gstAmount,
          total,
          customerProfile: profile ?? null,
        })
      } catch (pdfErr: any) {
        console.warn('[block-time-bank-transfer] PDF generation failed (non-fatal)', pdfErr?.message)
      }

      const expiryLabel = new Date(activationExpiry).toLocaleDateString('en-AU', {
        timeZone: 'Australia/Sydney',
        dateStyle: 'medium',
      })

      if (profile?.email) {
        const template = blockTimePurchaseConfirmedEmail({
          pilotFirstName: profile.first_name?.trim() || profile.full_name?.split(' ')[0]?.trim() || 'Pilot',
          packageName,
          packageHours,
          currentBalance: creditedHours,
          ratePerHour,
          expiryDate: expiryLabel,
          validityDays,
          amountPaid,
          invoiceNumber: invoice!.invoice_number,
          pdfUrl: pdfResult?.pdfUrl ?? null,
        })
        await sendEmail({
          to: profile.email,
          subject: template.subject,
          html: template.html,
          eventType: 'block_time_purchase_confirmed',
          entityType: 'block_time_purchase',
          entityId: purchase.id,
          metadata: { invoiceId: invoice!.id, invoiceNumber: invoice!.invoice_number, paymentMethod: 'bank_transfer' },
          attachments: pdfResult ? [pdfResult.attachment] : undefined,
        }).catch((e) => console.error('[block-time-bank-transfer] customer email failed:', e))
      }

      if (ADMIN_EMAIL) {
        const customerName =
          profile?.full_name?.trim() || `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Customer'
        const adminTemplate = adminBlockTimePurchaseConfirmedEmail({
          customerName,
          customerEmail: profile?.email || '—',
          customerPhone: profile?.phone_number
            ? `${profile?.phone_country_code || ''} ${profile.phone_number}`.trim()
            : null,
          pilotArn: profile?.pilot_arn || null,
          packageName,
          packageHours,
          ratePerHour,
          expiryDate: expiryLabel,
          validityDays,
          amountPaid,
          invoiceNumber: invoice!.invoice_number,
          pdfUrl: pdfResult?.pdfUrl ?? null,
          userId: purchase.user_id,
        })
        await sendEmail({
          to: ADMIN_EMAIL,
          subject: adminTemplate.subject,
          html: adminTemplate.html,
          eventType: 'admin_block_time_purchase_confirmed',
          entityType: 'block_time_purchase',
          entityId: purchase.id,
          metadata: { userId: purchase.user_id, paymentMethod: 'bank_transfer', amountPaid },
          attachments: pdfResult ? [pdfResult.attachment] : undefined,
        }).catch((e) => console.error('[block-time-bank-transfer] admin email failed:', e))
      }

      await admin.from('verification_events').insert({
        user_id: purchase.user_id,
        actor_role: 'admin',
        event_type: 'approved',
        title: `${packageName} Block Time activated`,
        body:
          promoBonusHours > 0 || promoFreeCheckout
            ? `Your bank transfer was verified and your ${packageHours} hour Block Time package is active.${
                promoBonusHours > 0 ? ` Bonus: +${promoBonusHours} hour${promoBonusHours === 1 ? '' : 's'} (${creditedHours} hours in total).` : ''
              }${promoFreeCheckout ? ' Your free checkout flight is ready to use.' : ''}`
            : `Your bank transfer was verified and your ${packageHours} hour Block Time package is now active.`,
        is_read: false,
        email_status: 'skipped',
      })
    } catch (notifyErr: any) {
      console.warn('[block-time-bank-transfer] post-approval notifications failed (non-fatal)', notifyErr?.message)
    }

    void emitBlockTimeUpdated(purchase.user_id)
    void emitPaymentUpdated({ userId: purchase.user_id, invoiceId: invoice!.id })
    void emitOpsChanged()
    if (applied?.out_applied_booking_id) {
      void emitBookingChanged({ bookingId: applied.out_applied_booking_id, userId: purchase.user_id })
      void emitClearanceUpdated(purchase.user_id)
    }

    return { purchaseId: purchase.id as string, userId: purchase.user_id as string }
  } catch (error) {
    await revertSubmission()
    throw error
  }
}
