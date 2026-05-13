import { NextResponse } from 'next/server'

import { sendEmail } from '@/lib/email/send-email'
import { paymentConfirmedEmail } from '@/lib/email/templates/payment'

export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail) {
    return NextResponse.json({ error: 'ADMIN_EMAIL is not configured' }, { status: 400 })
  }

  const template = paymentConfirmedEmail('This is a local transactional email test sent through the central sendEmail helper.')
  const result = await sendEmail({
    to: adminEmail,
    subject: `[Local Test] ${template.subject}`,
    html: template.html,
    eventType: 'dev_test_email',
    entityType: 'system',
    entityIdText: 'local-test-email',
    metadata: { source: 'app/api/dev/test-email', nodeEnv: process.env.NODE_ENV },
  })

  return NextResponse.json({ ok: true, result })
}
