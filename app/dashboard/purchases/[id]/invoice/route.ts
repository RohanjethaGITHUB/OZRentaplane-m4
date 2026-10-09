import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateBlockTimeInvoicePdf, generateBlockTimeTopupInvoicePdf } from '@/lib/invoices/block-time-pdf'

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

  // 1. Direct Invoice lookup (by invoice UUID or invoice_number e.g. OZ-2026-00141)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id)
  let invQuery = admin
    .from('invoices')
    .select(`
      id, invoice_number, block_time_purchase_id, user_id, type, subtotal, gst_amount, total, created_at, pdf_url, status,
      invoice_line_items ( id, type, description, quantity, unit_price, amount )
    `)
  if (isUuid) {
    invQuery = invQuery.or(`id.eq.${params.id},invoice_number.eq.${params.id}`)
  } else {
    invQuery = invQuery.eq('invoice_number', params.id)
  }
  const { data: invById } = await invQuery.maybeSingle()

  if (invById) {
    if (!isAdmin && invById.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
    }

    // A. Top-up invoice
    if (invById.type === 'block_time_topup') {
      if (invById.invoice_number) {
        const storagePath = `${invById.user_id}/${invById.invoice_number}.pdf`
        const { data: storageFile, error: storageErr } = await admin.storage
          .from('invoice_pdfs')
          .download(storagePath)

        if (!storageErr && storageFile) {
          const buffer = Buffer.from(await storageFile.arrayBuffer())
          return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `inline; filename="${invById.invoice_number}.pdf"`,
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            },
          })
        }
      }

      if (invById.pdf_url) {
        try {
          const res = await fetch(invById.pdf_url)
          if (res.ok) {
            const buffer = Buffer.from(await res.arrayBuffer())
            return new NextResponse(new Uint8Array(buffer), {
              status: 200,
              headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename="${invById.invoice_number || 'invoice'}.pdf"`,
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
              },
            })
          }
        } catch (fetchErr) {
          console.warn('[purchases/invoice route] topup fetch fallback failed', fetchErr)
        }
      }

      // If PDF missing from storage, generate top-up PDF on the fly
      try {
        const { data: topupRow } = await admin
          .from('block_time_topups')
          .select(`
            *,
            purchase:pilot_block_time_purchases(
              *,
              package:block_time_packages(name, validity_days)
            )
          `)
          .eq('invoice_id', invById.id)
          .maybeSingle()

        const purchaseRec: any = Array.isArray(topupRow?.purchase) ? topupRow?.purchase[0] : topupRow?.purchase
        const pkg = Array.isArray(purchaseRec?.package)
          ? purchaseRec?.package[0]
          : purchaseRec?.package
        const pkgName = pkg?.name || 'Block Time'
        const hoursAdded = Number(topupRow?.hours_added || 1)
        const ratePerHour = Number(topupRow?.rate_per_hour || (invById.total ? invById.total / hoursAdded : 320))
        const amountPaid = Number(invById.total || (topupRow?.amount_paid ?? 0))
        const subtotal = Number(invById.subtotal || Math.round((amountPaid / 1.1) * 100) / 100)
        const gstAmount = Number(invById.gst_amount || Math.round((amountPaid - subtotal) * 100) / 100)
        const newExpiresAt = topupRow?.expires_at_after || new Date(Date.now() + 30 * 86400000).toISOString()

        const { data: ownerProfile } = await admin
          .from('profiles')
          .select('full_name, first_name, last_name, phone_country_code, phone_number, email')
          .eq('id', invById.user_id)
          .maybeSingle()

        const genRes = await generateBlockTimeTopupInvoicePdf({
          supabase: admin,
          invoiceId: invById.id,
          invoiceNumber: invById.invoice_number,
          userId: invById.user_id,
          createdAt: invById.created_at,
          packageName: pkgName,
          hoursAdded,
          ratePerHour,
          amountPaid,
          subtotal,
          gstAmount,
          total: amountPaid,
          newExpiresAt,
          customerProfile: ownerProfile || profile,
        })

        if (genRes?.pdfBuffer) {
          return new NextResponse(new Uint8Array(genRes.pdfBuffer), {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `inline; filename="${genRes.fileName}"`,
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            },
          })
        }
      } catch (genErr) {
        console.error('[purchases/invoice route] generateBlockTimeTopupInvoicePdf failed:', genErr)
      }
    }

    // B. Package purchase invoice or general invoice
    if (invById.invoice_number) {
      const storagePath = `${invById.user_id}/${invById.invoice_number}.pdf`
      const { data: storageFile, error: storageErr } = await admin.storage
        .from('invoice_pdfs')
        .download(storagePath)

      if (!storageErr && storageFile) {
        const buffer = Buffer.from(await storageFile.arrayBuffer())
        return new NextResponse(new Uint8Array(buffer), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${invById.invoice_number}.pdf"`,
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          },
        })
      }
    }

    if (invById.pdf_url) {
      try {
        const res = await fetch(invById.pdf_url)
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer())
          return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `inline; filename="${invById.invoice_number || 'invoice'}.pdf"`,
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            },
          })
        }
      } catch (fetchErr) {
        console.warn('[purchases/invoice route] fetch fallback failed', fetchErr)
      }
    }
  }

  // 2. Check if params.id is a top-up record ID in block_time_topups
  const topupById = isUuid
    ? (
        await admin
          .from('block_time_topups')
          .select(`
            id, user_id, purchase_id, hours_added, rate_per_hour, amount_paid, invoice_id, created_at, expires_at_after,
            invoice:invoices(id, invoice_number, pdf_url, status, subtotal, gst_amount, total),
            purchase:pilot_block_time_purchases(
              *,
              package:block_time_packages(name, validity_days)
            )
          `)
          .eq('id', params.id)
          .maybeSingle()
      ).data
    : null

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
      try {
        const res = await fetch(inv.pdf_url)
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer())
          return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `inline; filename="${inv.invoice_number || 'invoice'}.pdf"`,
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            },
          })
        }
      } catch (fetchErr) {
        console.warn('[purchases/invoice route] topupById fetch fallback failed', fetchErr)
      }
    }

    // Generate topup PDF on the fly if needed
    try {
      const purchaseRecord: any = Array.isArray(topupById.purchase) ? topupById.purchase[0] : topupById.purchase
      const pkg = Array.isArray(purchaseRecord?.package)
        ? purchaseRecord?.package[0]
        : purchaseRecord?.package
      const pkgName = pkg?.name || 'Block Time'
      const hoursAdded = Number(topupById.hours_added || 1)
      const ratePerHour = Number(topupById.rate_per_hour || 320)
      const amountPaid = Number(topupById.amount_paid || 0)
      const subtotal = Number(inv?.subtotal || Math.round((amountPaid / 1.1) * 100) / 100)
      const gstAmount = Number(inv?.gst_amount || Math.round((amountPaid - subtotal) * 100) / 100)
      const newExpiresAt = topupById.expires_at_after || new Date(Date.now() + 30 * 86400000).toISOString()

      const { data: ownerProfile } = await admin
        .from('profiles')
        .select('full_name, first_name, last_name, phone_country_code, phone_number, email')
        .eq('id', topupById.user_id)
        .maybeSingle()

      const genRes = await generateBlockTimeTopupInvoicePdf({
        supabase: admin,
        invoiceId: inv?.id || topupById.id,
        invoiceNumber: inv?.invoice_number || `TOP-${topupById.id.slice(0, 8).toUpperCase()}`,
        userId: topupById.user_id,
        createdAt: topupById.created_at,
        packageName: pkgName,
        hoursAdded,
        ratePerHour,
        amountPaid,
        subtotal,
        gstAmount,
        total: amountPaid,
        newExpiresAt,
        customerProfile: ownerProfile || profile,
      })

      if (genRes?.pdfBuffer) {
        return new NextResponse(new Uint8Array(genRes.pdfBuffer), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${genRes.fileName}"`,
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          },
        })
      }
    } catch (genErr) {
      console.error('[purchases/invoice route] generateBlockTimeTopupInvoicePdf from topupById failed:', genErr)
    }
  }

  // 3. Check if params.id is a purchase ID in pilot_block_time_purchases
  const purchase = isUuid
    ? (
        await admin
          .from('pilot_block_time_purchases')
          .select(`
            id, user_id, package_id, hours_purchased, hours_remaining, rate_per_hour, amount_paid, status, purchased_at, activated_at, expires_at, stripe_payment_intent_id,
            package:block_time_packages(id, name, hours, rate_per_hour, validity_days, total_price)
          `)
          .eq('id', params.id)
          .maybeSingle()
      ).data
    : null

  if (!purchase) {
    return NextResponse.json({ error: 'Invoice or purchase record not found.' }, { status: 404 })
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
      try {
        const res = await fetch(existingInv.pdf_url)
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer())
          return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `inline; filename="${existingInv.invoice_number}.pdf"`,
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            },
          })
        }
      } catch (fetchErr) {
        console.warn('[invoice route] fetch fallback failed', fetchErr)
      }
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
