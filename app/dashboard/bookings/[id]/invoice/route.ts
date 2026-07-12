import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateStandardBookingInvoicePdf } from '@/lib/invoices/standard-booking-pdf'

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const isAdmin = profile?.role === 'admin'

  const bookingQuery = supabase
    .from('bookings')
    .select('id, booking_owner_user_id')
    .eq('id', params.id)

  if (!isAdmin) {
    bookingQuery.eq('booking_owner_user_id', user.id)
  }

  const { data: booking, error: bookingErr } = await bookingQuery.maybeSingle()
  if (bookingErr || !booking) {
    return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
  }

  const { data: invoice, error: invoiceErr } = await supabase
    .from('booking_invoices')
    .select('id, pdf_url, status')
    .eq('booking_id', params.id)
    .maybeSingle()

  if (invoiceErr || !invoice) {
    return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
  }

  if (invoice.status === 'waived') {
    return NextResponse.json({ error: 'No PDF is available for waived invoices.' }, { status: 404 })
  }

  if (invoice.pdf_url) {
    return NextResponse.redirect(invoice.pdf_url)
  }

  try {
    const pdfResult = await generateStandardBookingInvoicePdf({ supabase, invoiceId: invoice.id })
    if (pdfResult?.pdfUrl) {
      return NextResponse.redirect(pdfResult.pdfUrl)
    }
  } catch (error) {
    console.error('[booking invoice route] PDF generation failed', error)
  }

  return NextResponse.json({ error: 'Unable to generate invoice PDF.' }, { status: 500 })
}
