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
    if (stdInvoice.pdf_url) {
      return NextResponse.redirect(stdInvoice.pdf_url)
    }

    try {
      const pdfResult = await generateStandardBookingInvoicePdf({ supabase, invoiceId: stdInvoice.id })
      if (pdfResult?.pdfUrl) {
        return NextResponse.redirect(pdfResult.pdfUrl)
      }
    } catch (error) {
      console.error('[booking invoice route] Standard PDF generation failed', error)
    }

    return NextResponse.json({ error: 'Unable to generate invoice PDF.' }, { status: 500 })
  }

  // -- 3. Try checkout_invoices (for checkout-type bookings)
  const { data: chkInvoice } = await supabase
    .from('checkout_invoices')
    .select('id, status, invoice_number, subtotal_cents, total_paid_cents, stripe_amount_due_cents, payment_method, created_at, paid_at, customer_id, waiver_reason')
    .eq('booking_id', params.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (chkInvoice) {
    if (chkInvoice.status === 'cancelled') {
      return NextResponse.json({ error: 'No PDF available for this cancelled checkout.' }, { status: 404 })
    }

    // Generate a checkout PDF on the fly
    try {
      // Resolve customer profile
      const custId = chkInvoice.customer_id ?? booking.booking_owner_user_id
      const { data: custProfile } = custId
        ? await supabase.from('profiles').select('full_name, first_name, last_name, email, phone_country_code, phone_number').eq('id', custId).maybeSingle()
        : { data: null }

      const billToName =
        custProfile?.full_name?.trim() ||
        [custProfile?.first_name, custProfile?.last_name].filter(Boolean).join(' ') ||
        profile?.full_name?.trim() ||
        [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
        'Pilot'

      const billToEmail = custProfile?.email ?? profile?.email ?? user.email ?? '—'
      const billToPhone = custProfile?.phone_number
        ? [custProfile.phone_country_code, custProfile.phone_number].filter(Boolean).join(' ')
        : null

      const isPaid = chkInvoice.status === 'paid'
      const isWaived = chkInvoice.status === 'waived' || Boolean(chkInvoice.waiver_reason)
      const grossTotal = Number(
        isWaived
          ? 0
          : isPaid
          ? chkInvoice.total_paid_cents ?? chkInvoice.subtotal_cents ?? 0
          : chkInvoice.stripe_amount_due_cents ?? chkInvoice.subtotal_cents ?? 0
      ) / 100

      const originalTotal = Number(chkInvoice.subtotal_cents || 25000) / 100
      const displayTotal = isWaived ? originalTotal : grossTotal
      const subtotal = Math.round((displayTotal / 1.1) * 100) / 100
      const gstAmount = Math.round((displayTotal - subtotal) * 100) / 100
      const invoiceNumber = chkInvoice.invoice_number ?? `CHK-${chkInvoice.id.slice(0, 8).toUpperCase()}`

      const rawAircraft = booking.aircraft
      const aircraftObj = Array.isArray(rawAircraft) ? rawAircraft[0] : rawAircraft
      const aircraftDesc = (aircraftObj as { display_name?: string; registration?: string } | null)?.display_name || (aircraftObj as { display_name?: string; registration?: string } | null)?.registration || 'Aircraft'

      const statusLabel = isPaid ? 'PAID' : isWaived ? 'WAIVED' : 'PAYMENT REQUIRED'
      const footerNote = isPaid
        ? 'This receipt confirms payment for your checkout flight. All prices include GST.'
        : isWaived
        ? `This checkout invoice has been waived by operations management${chkInvoice.waiver_reason ? `: ${chkInvoice.waiver_reason}` : ''}. No payment is required.`
        : 'All prices include GST. Payment is required to proceed with your checkout flight.'

      const pdfBuffer = await generateInvoicePdf({
        documentKind: isPaid ? 'receipt' : 'tax_invoice',
        invoiceNumber,
        statusLabel,
        createdAt: chkInvoice.created_at ?? new Date().toISOString(),
        paidAt: chkInvoice.paid_at ?? null,
        dueAt: chkInvoice.created_at ?? null,
        paymentMethodLabel: formatPaymentMethod(chkInvoice.payment_method),
        billingModeLabel: 'Checkout Flight',
        bookingRefLabel: booking.booking_reference ? `Booking: ${booking.booking_reference}` : null,
        flightDate: booking.scheduled_start ?? null,
        billToName,
        billToEmail,
        billToPhone,
        lineItems: [
          {
            description: `Checkout flight fee — ${aircraftDesc}${booking.booking_reference ? ` (${booking.booking_reference})` : ''}`,
            quantity: 1,
            unitPrice: displayTotal,
            amount: displayTotal,
          },
        ],
        subtotal,
        gstAmount,
        total: displayTotal,
        amountPaid: isPaid ? grossTotal : 0,
        footerNote,
      })

      // Store it for next time
      const stored = await storeInvoicePdf({
        supabase,
        table: 'checkout_invoices',
        rowId: chkInvoice.id,
        userId: booking.booking_owner_user_id,
        invoiceNumber,
        pdfBuffer,
      })

      if (stored?.pdfUrl) {
        return NextResponse.redirect(stored.pdfUrl)
      }

      // Return PDF inline if storage failed
      return new NextResponse(pdfBuffer as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${invoiceNumber}.pdf"`,
        },
      })
    } catch (error) {
      console.error('[booking invoice route] Checkout PDF generation failed', error)
      return NextResponse.json({ error: 'Unable to generate checkout invoice PDF.' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Invoice not found for this booking.' }, { status: 404 })
}
