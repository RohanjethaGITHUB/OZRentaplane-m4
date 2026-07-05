'use server'

import Stripe from 'stripe'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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

export async function refundBlockTimePurchase(purchaseId: string) {
  const { supabase, adminId } = await requireAdmin()

  const stripeSecret = process.env.STRIPE_SECRET_KEY
  if (!stripeSecret) throw new Error('Server misconfiguration')
  const stripe = new Stripe(stripeSecret, { apiVersion: '2023-10-16' as any })

  // Phase 1: validate and mark refunded. This locks the row and immediately
  // removes the package from the drawdown queue, so a flight cannot consume
  // hours while the Stripe refund is in flight.
  const { data: beginRows, error: beginErr } = await supabase.rpc('begin_block_time_refund', {
    p_purchase_id: purchaseId,
  })

  if (beginErr || !beginRows?.[0]) {
    throw new Error(beginErr?.message ?? 'Refund could not be started.')
  }

  const refundInfo = beginRows[0] as {
    out_stripe_payment_intent_id: string
    out_refund_amount: number
    out_user_id: string
    out_hours_purchased: number
  }

  // Phase 2: refund the money in Stripe.
  let refundId: string
  try {
    const refund = await stripe.refunds.create({
      payment_intent: refundInfo.out_stripe_payment_intent_id,
      metadata: {
        purchase_type: 'block_time_refund',
        purchase_id: purchaseId,
        supabase_user_id: refundInfo.out_user_id,
        refunded_by_admin_id: adminId,
      },
    })
    refundId = refund.id
  } catch (stripeErr: unknown) {
    const message = stripeErr instanceof Error ? stripeErr.message : 'Stripe refund failed.'
    console.error('[refundBlockTimePurchase] Stripe refund failed, reverting', { purchaseId, message })

    const { error: revertErr } = await supabase.rpc('revert_block_time_refund', {
      p_purchase_id: purchaseId,
    })

    if (revertErr) {
      console.error('[refundBlockTimePurchase] revert FAILED — purchase stuck in refunded state', revertErr)
      await supabase.from('verification_events').insert({
        user_id: refundInfo.out_user_id,
        actor_role: 'system',
        event_type: 'message',
        title: 'Block time refund inconsistent — manual review required',
        body: `Stripe refund for purchase ${purchaseId} failed (${message}) and the purchase could not be reverted to active (${revertErr.message}). The package is marked refunded in the database but no money has been refunded. Please resolve manually.`,
        is_read: false,
        email_status: 'pending',
      })
    }

    throw new Error(`Stripe refund failed: ${message}`)
  }

  // Phase 3: record the Stripe refund id and mark the purchase invoice refunded.
  const { error: finaliseErr } = await supabase.rpc('finalise_block_time_refund', {
    p_purchase_id: purchaseId,
    p_refund_stripe_id: refundId,
  })

  if (finaliseErr) {
    // Money has moved; never revert here. Alert admins so the bookkeeping
    // (refund_stripe_id + invoice status) can be completed by hand.
    console.error('[refundBlockTimePurchase] finalise FAILED after Stripe refund', finaliseErr)
    await supabase.from('verification_events').insert({
      user_id: refundInfo.out_user_id,
      actor_role: 'system',
      event_type: 'message',
      title: 'Block time refund needs bookkeeping — manual follow-up required',
      body: `Stripe refund ${refundId} for purchase ${purchaseId} succeeded, but recording it in the database failed: ${finaliseErr.message}. Please set refund_stripe_id and mark the purchase invoice refunded manually.`,
      is_read: false,
      email_status: 'pending',
    })
  }

  // Customer notification (non-fatal).
  try {
    await supabase.from('verification_events').insert({
      user_id: refundInfo.out_user_id,
      actor_role: 'admin',
      event_type: 'message',
      title: 'Block Time purchase refunded',
      body: `Your ${Number(refundInfo.out_hours_purchased).toFixed(0)} hour Block Time purchase has been refunded in full ($${Number(refundInfo.out_refund_amount).toFixed(2)}). The refund will appear on your original payment method within 5–10 business days.`,
      is_read: false,
      email_status: 'pending',
    })
  } catch (notifErr) {
    console.warn('[refundBlockTimePurchase] customer notification failed (non-fatal)', notifErr)
  }

  revalidatePath(`/admin/users/${refundInfo.out_user_id}`)
  revalidatePath('/dashboard/purchases')
  revalidatePath('/dashboard/pricing')
  revalidatePath('/dashboard')

  return {
    success: true,
    refundId,
    refundAmount: Number(refundInfo.out_refund_amount),
    bookkeepingComplete: !finaliseErr,
  }
}
