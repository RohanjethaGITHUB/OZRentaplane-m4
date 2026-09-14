import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateStandardBookingInvoicePdf } from '@/lib/invoices/standard-booking-pdf'
import { generateCheckoutBookingInvoicePdf } from '@/lib/invoices/checkout-booking-pdf'
import { generateBlockTimeInvoicePdf, generateBlockTimeTopupInvoicePdf } from '@/lib/invoices/block-time-pdf'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const internalSecret = req.headers.get('x-internal-secret')
    const validSecret =
      process.env.INTERNAL_SERVICE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.CRON_SECRET

    if (!validSecret || internalSecret !== validSecret) {
      return NextResponse.json({ error: 'Unauthorized internal call' }, { status: 401 })
    }

    const body = await req.json()
    const { type } = body

    const supabase = createAdminClient()

    let result: {
      pdfUrl: string
      storagePath: string
      fileName: string
      attachment: {
        filename: string
        content: string
        contentType: string
      }
    } | null = null

    if (type === 'standard_booking') {
      const { invoiceId } = body
      if (!invoiceId) {
        return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 })
      }
      result = await generateStandardBookingInvoicePdf({ supabase, invoiceId })
    } else if (type === 'checkout_booking') {
      const { bookingId, invoiceId } = body
      if (!bookingId) {
        return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 })
      }
      result = await generateCheckoutBookingInvoicePdf({ supabase, bookingId, invoiceId })
    } else if (type === 'block_time_purchase') {
      const {
        invoiceId,
        invoiceNumber,
        userId,
        createdAt,
        packageName,
        packageHours,
        ratePerHour,
        validityDays,
        amountPaid,
        subtotal,
        gstAmount,
        total,
        customerProfile,
      } = body
      result = await generateBlockTimeInvoicePdf({
        supabase,
        invoiceId,
        invoiceNumber,
        userId,
        createdAt,
        packageName,
        packageHours,
        ratePerHour,
        validityDays,
        amountPaid,
        subtotal,
        gstAmount,
        total,
        customerProfile,
      })
    } else if (type === 'block_time_topup') {
      const {
        invoiceId,
        invoiceNumber,
        userId,
        createdAt,
        packageName,
        hoursAdded,
        ratePerHour,
        amountPaid,
        subtotal,
        gstAmount,
        total,
        newExpiresAt,
        customerProfile,
      } = body
      result = await generateBlockTimeTopupInvoicePdf({
        supabase,
        invoiceId,
        invoiceNumber,
        userId,
        createdAt,
        packageName,
        hoursAdded,
        ratePerHour,
        amountPaid,
        subtotal,
        gstAmount,
        total,
        newExpiresAt,
        customerProfile,
      })
    } else {
      return NextResponse.json({ error: `Unsupported PDF type: ${type}` }, { status: 400 })
    }

    if (!result) {
      return NextResponse.json({ error: 'PDF generation returned no result' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      pdfUrl: result.pdfUrl,
      fileName: result.fileName,
      storagePath: result.storagePath,
      attachment: result.attachment,
    })
  } catch (error: any) {
    console.error('[generate-pdf-route] Error generating PDF:', error)
    return NextResponse.json(
      { error: error?.message || 'Internal PDF generation error' },
      { status: 500 }
    )
  }
}
