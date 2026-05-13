import { NextResponse } from 'next/server'

import { sendEmail } from '@/lib/email/send-email'
import {
  notifyCheckoutRequestSubmitted,
  notifyCheckoutConfirmed,
  notifyBankTransferProofReceived,
  notifyAdminBankTransferProofUploaded,
  notifyBookingSubmitted,
  notifyCancellationRequested,
  notifyAdminCancellationReviewRequired,
  notifyFlightRecordSubmitted,
} from '@/lib/booking/notifications'
import { checkoutOutcomeEmail } from '@/lib/email/templates/checkout'
import { paymentConfirmedEmail } from '@/lib/email/templates/payment'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'info@ozrentaplane.com'
const CUSTOMER_EMAIL = process.env.ADMIN_EMAIL ?? 'info@ozrentaplane.com'
const BOOKING_ID = '00000000-0000-4000-8000-000000000123'

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { searchParams } = new URL(req.url)
  const event = searchParams.get('event') ?? ''

  try {
    switch (event) {
      case 'checkout_request_submitted': {
        await notifyCheckoutRequestSubmitted({
          customerEmail: CUSTOMER_EMAIL,
          customerName: 'Test Customer',
          bookingId: BOOKING_ID,
          requestedTime: '12 May 2026, 10:30 AM',
        })
        break
      }
      case 'checkout_confirmed': {
        await notifyCheckoutConfirmed({
          customerEmail: CUSTOMER_EMAIL,
          bookingId: BOOKING_ID,
          time: '12 May 2026, 10:30 AM',
          aircraft: 'Cessna 172N',
        })
        break
      }
      case 'checkout_payment_required': {
        const t = checkoutOutcomeEmail(
          'Payment required for your checkout flight',
          'Payment required for your checkout flight',
          'Payment is required before the checkout process can be completed.',
          'Pay Now',
        )
        await sendEmail({
          to: CUSTOMER_EMAIL,
          subject: t.subject,
          html: t.html,
          eventType: 'checkout_payment_required',
          entityType: 'checkout',
          entityId: BOOKING_ID,
          entityIdText: `${BOOKING_ID}-checkout_payment_required`,
        })
        break
      }
      case 'bank_transfer_proof_received': {
        await notifyBankTransferProofReceived({ customerEmail: CUSTOMER_EMAIL, bookingId: BOOKING_ID })
        break
      }
      case 'admin_bank_transfer_proof_uploaded': {
        await notifyAdminBankTransferProofUploaded({
          bookingId: BOOKING_ID,
          customerName: 'Test Customer',
          customerEmail: CUSTOMER_EMAIL,
          amount: '$100.00',
          invoiceType: 'checkout',
        })
        break
      }
      case 'payment_confirmed': {
        const t = paymentConfirmedEmail('Payment has been received and recorded.')
        await sendEmail({
          to: CUSTOMER_EMAIL,
          subject: t.subject,
          html: t.html,
          eventType: 'payment_confirmed',
          entityType: 'checkout',
          entityId: BOOKING_ID,
          entityIdText: `${BOOKING_ID}-payment_confirmed`,
        })
        break
      }
      case 'cleared_to_fly': {
        const t = checkoutOutcomeEmail(
          'You are cleared to fly',
          'You are cleared to fly',
          'You are now cleared to book aircraft hire through the platform.',
          'Book Aircraft',
        )
        await sendEmail({
          to: CUSTOMER_EMAIL,
          subject: t.subject,
          html: t.html,
          eventType: 'cleared_to_fly',
          entityType: 'checkout',
          entityId: BOOKING_ID,
          entityIdText: `${BOOKING_ID}-cleared_to_fly`,
        })
        break
      }
      case 'booking_confirmed': {
        await notifyBookingSubmitted({
          customerEmail: CUSTOMER_EMAIL,
          customerName: 'Test Customer',
          ref: 'BK-TEST-123',
          aircraft: 'Cessna 172N',
          start: '12 May 2026, 10:30 AM',
          end: '12 May 2026, 12:30 PM',
          bookingId: BOOKING_ID,
        })
        break
      }
      case 'cancellation_requested': {
        await notifyCancellationRequested({ customerEmail: CUSTOMER_EMAIL, bookingId: BOOKING_ID })
        await notifyAdminCancellationReviewRequired({
          bookingId: BOOKING_ID,
          customerName: 'Test Customer',
          customerEmail: CUSTOMER_EMAIL,
          reason: 'Test cancellation reason',
        })
        break
      }
      case 'flight_record_submitted': {
        await notifyFlightRecordSubmitted({
          bookingId: BOOKING_ID,
          customerEmail: CUSTOMER_EMAIL,
          customerName: 'Test Customer',
          aircraft: 'Cessna 172N',
          bookingDate: '12 May 2026',
        })
        break
      }
      default:
        return NextResponse.json({ error: 'Unknown event' }, { status: 400 })
    }

    return NextResponse.json({ ok: true, event, adminEmailConfigured: Boolean(ADMIN_EMAIL) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ ok: false, event, error: message }, { status: 500 })
  }
}
