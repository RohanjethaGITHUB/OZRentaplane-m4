import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateBlockTimeInvoicePdf } from '@/lib/invoices/block-time-pdf'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, first_name, last_name, email, phone_country_code, phone_number')
    .eq('id', user.id)
    .maybeSingle()

  const isAdmin = profile?.role === 'admin'
  const admin = createAdminClient()

  // 1. Locate purchase by purchase id, invoice id, or invoice number
  let purchase: any = null

  const { data: pById } = await admin
    .from('pilot_block_time_purchases')
    .select(`
      id, user_id, package_id, hours_purchased, hours_remaining, rate_per_hour, amount_paid, status, purchased_at, activated_at, expires_at, stripe_payment_intent_id,
      package:block_time_packages(id, name, hours, rate_per_hour, validity_days, total_price)
    `)
    .eq('id', params.id)
    .maybeSingle()

  if (pById) {
    purchase = pById
  } else {
    const { data: invById } = await admin
      .from('invoices')
      .select('id, block_time_purchase_id, user_id')
      .or(`id.eq.${params.id},invoice_number.eq.${params.id}`)
      .maybeSingle()

    if (invById?.block_time_purchase_id) {
      const { data: pByInv } = await admin
        .from('pilot_block_time_purchases')
        .select(`
          id, user_id, package_id, hours_purchased, hours_remaining, rate_per_hour, amount_paid, status, purchased_at, activated_at, expires_at, stripe_payment_intent_id,
          package:block_time_packages(id, name, hours, rate_per_hour, validity_days, total_price)
        `)
        .eq('id', invById.block_time_purchase_id)
        .maybeSingle()
      if (pByInv) purchase = pByInv
    }
  }

  if (!purchase) {
    // Check if params.id is a topup id
    const { data: topupById } = await admin
      .from('block_time_topups')
      .select(`
        id, user_id, purchase_id, hours_added, rate_per_hour, amount_paid, invoice_id, created_at,
        invoice:invoices(id, invoice_number, pdf_url, status)
      `)
      .eq('id', params.id)
      .maybeSingle()

    if (topupById) {
      if (!isAdmin && topupById.user_id !== user.id) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
      }
      const inv = Array.isArray(topupById.invoice) ? topupById.invoice[0] : topupById.invoice
      if (inv?.invoice_number) {
        const storagePath = `${topupById.user_id}/${inv.invoice_number}.pdf`
        const { data: storageFile, error: storageErr } = await admin.storage
          .from('invoice_pdfs')
          .download(storagePath)

        if (!storageErr && storageFile) {
          const buffer = Buffer.from(await storageFile.arrayBuffer())
          return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `inline; filename="${inv.invoice_number}.pdf"`,
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            },
          })
        }
      }
      if (inv?.pdf_url) {
        return NextResponse.redirect(`${inv.pdf_url}?v=${Date.now()}`)
      }
      if (topupById.invoice_id) {
        const { data: invRow } = await admin
          .from('invoices')
          .select('id, invoice_number, pdf_url')
          .eq('id', topupById.invoice_id)
          .maybeSingle()
        if (invRow?.pdf_url) {
          return NextResponse.redirect(`${invRow.pdf_url}?v=${Date.now()}`)
        }
      }
    }

    // Check if params.id is directly an invoice for topup
    const { data: topupInv } = await admin
      .from('invoices')
      .select('id, invoice_number, pdf_url, user_id, type')
      .or(`id.eq.${params.id},invoice_number.eq.${params.id}`)
      .eq('type', 'block_time_topup')
      .maybeSingle()

    if (topupInv) {
      if (!isAdmin && topupInv.user_id !== user.id) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
      }
      if (topupInv.invoice_number) {
        const storagePath = `${topupInv.user_id}/${topupInv.invoice_number}.pdf`
        const { data: storageFile, error: storageErr } = await admin.storage
          .from('invoice_pdfs')
          .download(storagePath)

        if (!storageErr && storageFile) {
          const buffer = Buffer.from(await storageFile.arrayBuffer())
          return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `inline; filename="${topupInv.invoice_number}.pdf"`,
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            },
          })
        }
      }
      if (topupInv.pdf_url) {
        return NextResponse.redirect(`${topupInv.pdf_url}?v=${Date.now()}`)
      }
    }

    return NextResponse.json({ error: 'Purchase record not found.' }, { status: 404 })
  }

  if (!isAdmin && purchase.user_id !== user.id) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
  }

  if (purchase.status === 'pending') {
    return NextResponse.json({ error: 'Invoice is only available after payment has been completed.' }, { status: 400 })
  }

  // 2. Check for existing invoice record
  const { data: existingInv } = await admin
    .from('invoices')
    .select('*')
    .eq('block_time_purchase_id', purchase.id)
    .eq('type', 'block_time_purchase')
    .maybeSingle()

  // If stored in Supabase storage and has invoice number, try reading directly
  if (existingInv?.invoice_number) {
    const storagePath = `${purchase.user_id}/${existingInv.invoice_number}.pdf`
    const { data: storageFile, error: storageErr } = await admin.storage
      .from('invoice_pdfs')
      .download(storagePath)

    if (!storageErr && storageFile) {
      const buffer = Buffer.from(await storageFile.arrayBuffer())
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${existingInv.invoice_number}.pdf"`,
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        },
      })
    }

    if (existingInv.pdf_url) {
      return NextResponse.redirect(`${existingInv.pdf_url}?v=${Date.now()}`)
    }
  }

  // 3. Fallback: Generate PDF on the fly using generateBlockTimeInvoicePdf
  try {
    const packageRow = Array.isArray(purchase.package) ? purchase.package[0] : purchase.package
    const packageName = packageRow?.name || 'Block Time Package'
    const packageHours = Number(purchase.hours_purchased || 0)
    const ratePerHour = Number(purchase.rate_per_hour || 0)
    const validityDays = Number(packageRow?.validity_days || 30)
    const amountPaid = Number(purchase.amount_paid || 0)
    const subtotal = Math.round((amountPaid / 1.1) * 100) / 100
    const gstAmount = Math.round((amountPaid - subtotal) * 100) / 100

    let invoiceId = existingInv?.id
    let invoiceNumber = existingInv?.invoice_number

    if (!invoiceId) {
      const { data: newInv } = await admin
        .from('invoices')
        .insert({
          type: 'block_time_purchase',
          user_id: purchase.user_id,
          block_time_purchase_id: purchase.id,
          subtotal,
          gst_amount: gstAmount,
          total: amountPaid,
          status: 'paid',
          payment_method: 'stripe',
          stripe_payment_intent_id: purchase.stripe_payment_intent_id,
          paid_at: purchase.activated_at || purchase.purchased_at,
        })
        .select('id, invoice_number')
        .single()

      if (newInv) {
        invoiceId = newInv.id
        invoiceNumber = newInv.invoice_number
      }
    }

    const { data: ownerProfile } = await admin
      .from('profiles')
      .select('full_name, first_name, last_name, phone_country_code, phone_number, email')
      .eq('id', purchase.user_id)
      .single()

    const pdfResult = await generateBlockTimeInvoicePdf({
      supabase: admin,
      invoiceId: invoiceId || purchase.id,
      invoiceNumber: invoiceNumber || `PKG-${purchase.id.slice(0, 8).toUpperCase()}`,
      userId: purchase.user_id,
      createdAt: purchase.purchased_at || new Date().toISOString(),
      packageName,
      packageHours,
      ratePerHour,
      validityDays,
      amountPaid,
      subtotal,
      gstAmount,
      total: amountPaid,
      customerProfile: ownerProfile || profile,
    })

    if (pdfResult?.pdfBuffer) {
      return new NextResponse(new Uint8Array(pdfResult.pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${pdfResult.fileName}"`,
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        },
      })
    }

    if (pdfResult?.pdfUrl) {
      return NextResponse.redirect(`${pdfResult.pdfUrl}?v=${Date.now()}`)
    }
  } catch (genErr) {
    console.error('[purchase invoice route] PDF generation failed:', genErr)
  }

  return NextResponse.json({ error: 'Unable to load or generate package invoice PDF.' }, { status: 500 })
}
