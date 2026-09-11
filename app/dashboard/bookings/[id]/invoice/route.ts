import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateStandardBookingInvoicePdf } from '@/lib/invoices/standard-booking-pdf'
import { generateInvoicePdf } from '@/lib/invoices/pdf'
import { storeInvoicePdf } from '@/lib/invoices/pdf-storage'

function formatPaymentMethod(method: string | null): string | null {
  if (!method) return null
  if (method === 'bank_transfer') return 'Bank transfer'
  if (method === 'stripe' || method === 'card') return 'Card'
  return method.replace(/_/g, ' ')
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, first_name, last_name, email, phone_country_code, phone_number')
    .eq('id', user.id)
    .maybeSingle()

  const isAdmin = profile?.role === 'admin'

  // -- 1. Look up the booking (ensures ownership)
  const bookingQuery = supabase
    .from('bookings')
    .select('id, booking_owner_user_id, booking_type, scheduled_start, booking_reference, aircraft ( registration, display_name )')
    .eq('id', params.id)

  if (!isAdmin) {
    bookingQuery.eq('booking_owner_user_id', user.id)
  }

  const { data: booking, error: bookingErr } = await bookingQuery.maybeSingle()
  if (bookingErr || !booking) {
    return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
  }

  // -- 2. Try standard booking_invoices first
  const { data: stdInvoice } = await supabase
    .from('booking_invoices')
    .select('id, pdf_url, status')
    .eq('booking_id', params.id)
    .maybeSingle()

  if (stdInvoice) {
    try {
      const pdfResult = await generateStandardBookingInvoicePdf({ supabase, invoiceId: stdInvoice.id })
      if (pdfResult?.pdfBuffer) {
        return new NextResponse(new Uint8Array(pdfResult.pdfBuffer), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${pdfResult.fileName}"`,
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        })
      }
      if (pdfResult?.pdfUrl) {
        return NextResponse.redirect(`${pdfResult.pdfUrl}?v=${Date.now()}`)
      }
    } catch (error) {
      console.error('[booking invoice route] Standard PDF generation failed', error)
      if (stdInvoice.pdf_url) {
        return NextResponse.redirect(`${stdInvoice.pdf_url}?v=${Date.now()}`)
      }
    }

    return NextResponse.json({ error: 'Unable to generate invoice PDF.' }, { status: 500 })
  }

  // -- 3. Try checkout_invoices (for checkout-type bookings)
  const { data: chkInvoice } = await supabase
    .from('checkout_invoices')
    .select('id, status, invoice_number, customer_id')
    .eq('booking_id', params.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (chkInvoice) {
    if (chkInvoice.status === 'cancelled') {
      return NextResponse.json({ error: 'No PDF available for this cancelled checkout.' }, { status: 404 })
    }

    const { generateCheckoutBookingInvoicePdf } = await import('@/lib/invoices/checkout-booking-pdf')
    try {
      const pdfResult = await generateCheckoutBookingInvoicePdf({
        supabase,
        bookingId: params.id,
        invoiceId: chkInvoice.id,
      })

      if (pdfResult?.pdfBuffer) {
        return new NextResponse(new Uint8Array(pdfResult.pdfBuffer), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${pdfResult.fileName}"`,
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        })
      }
      if (pdfResult?.pdfUrl) {
        return NextResponse.redirect(`${pdfResult.pdfUrl}?v=${Date.now()}`)
      }
    } catch (error) {
      console.error('[booking invoice route] Checkout PDF generation failed', error)
      return NextResponse.json({ error: 'Unable to generate checkout invoice PDF.' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Invoice not found for this booking.' }, { status: 404 })
}
