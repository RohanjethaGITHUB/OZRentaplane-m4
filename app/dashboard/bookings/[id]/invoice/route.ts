import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateStandardBookingInvoicePdf } from '@/lib/invoices/standard-booking-pdf'
import { generateInvoicePdf, type InvoiceLineItem } from '@/lib/invoices/pdf'
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
    .select('id, booking_owner_user_id, booking_type, scheduled_start, booking_reference, aircraft ( registration, display_name ), flight_records ( vdo_start, vdo_stop, vdo_total, air_switch_start, air_switch_stop, air_switch_total, landings )')
    .eq('id', params.id)

  if (!isAdmin) {
    bookingQuery.eq('booking_owner_user_id', user.id)
  }

  const { data: booking, error: bookingErr } = await bookingQuery.maybeSingle()
  if (bookingErr || !booking) {
    return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
  }

  // Helper to fetch and stream PDF without exposing external storage URLs
  const streamPdfBuffer = (buffer: Buffer | Uint8Array, fileName: string) => {
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })
  }

  const streamFromUrl = async (url: string, fileName: string) => {
    try {
      const res = await fetch(url)
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer()
        return streamPdfBuffer(Buffer.from(arrayBuf), fileName)
      }
    } catch (err) {
      console.warn('[booking invoice route] Failed to fetch PDF from URL:', err)
    }
    return null
  }

  // -- 2. Try standard booking_invoices first
  const { data: stdInvoice } = await supabase
    .from('booking_invoices')
    .select('id, pdf_url, status, invoice_number')
    .eq('booking_id', params.id)
    .maybeSingle()

  if (stdInvoice) {
    if (!['paid', 'settled', 'waived'].includes(stdInvoice.status)) {
      return NextResponse.json(
        { error: 'Tax Invoice PDF is only available once payment is settled.' },
        { status: 403 }
      )
    }

    try {
      const pdfResult = await generateStandardBookingInvoicePdf({ supabase, invoiceId: stdInvoice.id })
      if (pdfResult?.pdfBuffer) {
        return streamPdfBuffer(pdfResult.pdfBuffer, pdfResult.fileName)
      }
      if (pdfResult?.pdfUrl) {
        const streamed = await streamFromUrl(pdfResult.pdfUrl, pdfResult.fileName || `${stdInvoice.invoice_number || 'invoice'}.pdf`)
        if (streamed) return streamed
      }
    } catch (error) {
      console.error('[booking invoice route] Standard PDF generation failed', error)
      if (stdInvoice.pdf_url) {
        const streamed = await streamFromUrl(stdInvoice.pdf_url, `${stdInvoice.invoice_number || 'invoice'}.pdf`)
        if (streamed) return streamed
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

    if (!['paid', 'settled', 'waived'].includes(chkInvoice.status)) {
      return NextResponse.json(
        { error: 'Tax Invoice PDF is only available once payment is settled.' },
        { status: 403 }
      )
    }

    const { generateCheckoutBookingInvoicePdf } = await import('@/lib/invoices/checkout-booking-pdf')
    try {
      const pdfResult = await generateCheckoutBookingInvoicePdf({
        supabase,
        bookingId: params.id,
        invoiceId: chkInvoice.id,
      })

      if (pdfResult?.pdfBuffer) {
        return streamPdfBuffer(pdfResult.pdfBuffer, pdfResult.fileName)
      }
      if (pdfResult?.pdfUrl) {
        const streamed = await streamFromUrl(pdfResult.pdfUrl, pdfResult.fileName || `${chkInvoice.invoice_number}.pdf`)
        if (streamed) return streamed
      }
    } catch (error) {
      console.error('[booking invoice route] Checkout PDF generation failed', error)
      return NextResponse.json({ error: 'Unable to generate checkout invoice PDF.' }, { status: 500 })
    }
  }

  // -- 4. Try block-time / package flight invoices from the `invoices` table
  const { data: fltInvoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, pdf_url, user_id, billing_mode, type, total, subtotal, gst_amount, paid_at, created_at, payment_method, is_block_time_overage')
    .eq('booking_id', params.id)
    .eq('type', 'flight')
    .order('is_block_time_overage', { ascending: false })
    .order('created_at', { ascending: true })

  if (fltInvoices && fltInvoices.length > 0) {
    const isAnyUnsettled = fltInvoices.some((inv) => !['paid', 'settled', 'waived'].includes(inv.status))
    if (isAnyUnsettled) {
      return NextResponse.json(
        { error: 'Tax Invoice PDF is only available once payment is settled.' },
        { status: 403 }
      )
    }

    const landingInv = fltInvoices.find((i) => !i.is_block_time_overage)
    const overageInv = fltInvoices.find((i) => i.is_block_time_overage)
    const primaryInvoice = landingInv || fltInvoices[0]

    // Fetch line items across all flight invoices for this booking
    const invoiceIds = fltInvoices.map((i) => i.id)
    const { data: lineItems } = await supabase
      .from('invoice_line_items')
      .select('id, invoice_id, type, description, quantity, unit_price, amount, display_order')
      .in('invoice_id', invoiceIds)
      .order('display_order', { ascending: true })

    const total = Math.round(fltInvoices.reduce((acc, inv) => acc + Number(inv.total || 0), 0) * 100) / 100
    const gstAmount = Math.round((total / 11) * 100) / 100
    const subtotal = Math.round((total - gstAmount) * 100) / 100
    const isAllPaid = fltInvoices.every((inv) => inv.status === 'paid')

    // Generate consolidated Tax Invoice PDF dynamically
    try {
      const { data: pilotProfile } = await supabase
        .from('profiles')
        .select('full_name, first_name, last_name, email, phone_country_code, phone_number')
        .eq('id', primaryInvoice.user_id)
        .maybeSingle()

      const aircraftData = Array.isArray(booking.aircraft) ? booking.aircraft[0] : booking.aircraft
      const fr = Array.isArray((booking as any).flight_records) ? (booking as any).flight_records[0] : (booking as any).flight_records

      const formattedLineItems: InvoiceLineItem[] = (lineItems ?? []).map((li) => {
        let desc = li.description
        if (li.type === 'overflow_hours' || desc.includes('BLOCK TIME OVERAGE')) {
          desc = `Flight Hour Overage (${Number(li.quantity).toFixed(1)} hrs @ $${Number(li.unit_price).toFixed(2)}/hr)`
        }
        return {
          description: desc,
          quantity: Number(li.quantity),
          unitPrice: Number(li.unit_price),
          amount: Number(li.amount),
        }
      })

      // Fallback if raw line items were not recorded
      if (formattedLineItems.length === 0) {
        if (landingInv) {
          formattedLineItems.push({
            description: 'Airport Landing Fee',
            quantity: 1,
            unitPrice: Number(landingInv.total),
            amount: Number(landingInv.total),
          })
        }
        if (overageInv) {
          formattedLineItems.push({
            description: 'Flight Hour Overage',
            quantity: 1,
            unitPrice: Number(overageInv.total),
            amount: Number(overageInv.total),
          })
        }
      }

      const paidAt = primaryInvoice.paid_at || fltInvoices.find((i) => i.paid_at)?.paid_at || null
      const paymentMethod = formatPaymentMethod(primaryInvoice.payment_method || fltInvoices.find((i) => i.payment_method)?.payment_method) || 'Direct Deposit (Bank Transfer)'

      const pdfBuffer = await generateInvoicePdf({
        invoiceNumber: primaryInvoice.invoice_number,
        documentKind: 'tax_invoice',
        statusLabel: isAllPaid ? 'PAID' : 'TAX INVOICE',
        createdAt: primaryInvoice.created_at,
        dueAt: paidAt || primaryInvoice.created_at,
        paidAt,
        paymentMethodLabel: paymentMethod,
        billingModeLabel: 'Block Time',
        bookingRefLabel: booking.booking_reference,
        flightDate: booking.scheduled_start ?? null,
        billToName: pilotProfile?.full_name || [pilotProfile?.first_name, pilotProfile?.last_name].filter(Boolean).join(' ') || 'Pilot',
        billToEmail: pilotProfile?.email || '—',
        billToPhone: pilotProfile?.phone_number || null,
        lineItems: formattedLineItems,
        subtotal,
        gstAmount,
        total,
        amountPaid: isAllPaid ? total : 0,
        footerNote: 'All prices include GST. Block time usage is deducted from your package balance.',
        flightMetrics: {
          aircraftRegistration: aircraftData?.registration || 'VH-KZG',
          aircraftModel: aircraftData?.display_name || (aircraftData as any)?.aircraft_type || 'Cessna 172N',
          vdoStart: fr?.vdo_start,
          vdoEnd: fr?.vdo_stop,
          vdoHours: fr?.vdo_total,
          airswitchStart: fr?.air_switch_start,
          airswitchEnd: fr?.air_switch_stop,
          airswitchHours: fr?.air_switch_total,
          landingsCount: fr?.landings ?? (formattedLineItems.some((li) => li.description.toLowerCase().includes('landing')) ? 1 : null),
        },
      })

      // Store in storage in background/safely
      try {
        await storeInvoicePdf({
          supabase,
          table: 'invoices',
          rowId: primaryInvoice.id,
          userId: primaryInvoice.user_id,
          invoiceNumber: primaryInvoice.invoice_number,
          pdfBuffer,
        })
        if (overageInv && overageInv.id !== primaryInvoice.id) {
          await storeInvoicePdf({
            supabase,
            table: 'invoices',
            rowId: overageInv.id,
            userId: overageInv.user_id,
            invoiceNumber: overageInv.invoice_number,
            pdfBuffer,
          })
        }
      } catch (storeErr) {
        console.warn('[booking invoice route] Failed to persist generated PDF to storage:', storeErr)
      }

      return streamPdfBuffer(pdfBuffer, `${primaryInvoice.invoice_number}.pdf`)
    } catch (genErr) {
      console.error('[booking invoice route] Dynamic block-time PDF generation failed:', genErr)
      if (primaryInvoice.pdf_url) {
        const streamed = await streamFromUrl(primaryInvoice.pdf_url, `${primaryInvoice.invoice_number}.pdf`)
        if (streamed) return streamed
      }
      return NextResponse.json({ error: 'Unable to generate invoice PDF.' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Invoice not found for this booking.' }, { status: 404 })
}
