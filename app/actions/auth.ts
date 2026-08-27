'use server'

import { enqueueCustomerWelcomeEmails } from '@/lib/email/outbox'

export async function notifyNewRegistration(opts: {
  userId: string
  email: string
  fullName: string
  firstName?: string
  phone?: string | null
}) {
  if (!opts.userId || !opts.email) {
    return { ok: false, error: 'Missing user details' }
  }

  try {
    await enqueueCustomerWelcomeEmails({
      customerId: opts.userId,
      customerName: opts.fullName || opts.firstName || 'Pilot',
      customerEmail: opts.email,
      customerPhone: opts.phone || null,
      firstName: opts.firstName || undefined,
    })
    return { ok: true }
  } catch (error) {
    console.error('[notifyNewRegistration] failed to enqueue welcome emails:', error)
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
