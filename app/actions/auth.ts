'use server'

import { sendEmail } from '@/lib/email/send-email'
import {
  customerWelcomeRegisteredEmail,
  adminNewCustomerRegisteredEmail,
} from '@/lib/email/templates/account'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'info@ozrentaplane.com'

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

  const customerName = opts.fullName || opts.firstName || 'Pilot'
  const firstName = opts.firstName || opts.fullName?.split(' ')[0]?.trim() || undefined

  try {
    // 1. Send immediate welcome email to the newly registered customer
    const welcomeTpl = customerWelcomeRegisteredEmail({
      customerName,
      firstName,
    })

    await sendEmail({
      to: opts.email,
      subject: welcomeTpl.subject,
      html: welcomeTpl.html,
      eventType: 'customer_welcome_registered',
      entityType: 'profile',
      entityId: opts.userId,
      metadata: { customerId: opts.userId, email: opts.email },
    })

    // 2. Send immediate new registration alert to Admin
    const adminTpl = adminNewCustomerRegisteredEmail({
      customerId: opts.userId,
      customerName,
      customerEmail: opts.email,
      customerPhone: opts.phone || null,
      registeredAt: new Date().toLocaleDateString('en-AU', {
        timeZone: 'Australia/Sydney',
        dateStyle: 'full',
      }),
    })

    await sendEmail({
      to: ADMIN_EMAIL,
      subject: adminTpl.subject,
      html: adminTpl.html,
      eventType: 'admin_new_customer_registered',
      entityType: 'profile',
      entityId: opts.userId,
      metadata: { customerId: opts.userId, customerEmail: opts.email },
    })

    return { ok: true }
  } catch (error) {
    console.error('[notifyNewRegistration] failed to send welcome emails:', error)
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

