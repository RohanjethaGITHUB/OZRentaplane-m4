import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PAYMENT_CONFIG } from '@/lib/payments/config'
import PaymentSummaryCards from '@/components/customer/billing/PaymentSummaryCards'
import CustomerPaymentsInvoicesClient, {
  CustomerInvoice,
  BlockTimePackageSummary,
  FlightUsageItem,
} from '@/components/customer/CustomerPaymentsInvoicesClient'
import { RecentActivityItem, PaymentStatus, SettlementType, PaymentMethodType } from '@/components/customer/billing/types'
import { formatDateFromISO, formatTime12hFromISO, formatDashboardTimestamp } from '@/lib/formatDateTime'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Payments & Invoices | OZ Rent A Plane' }

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export default async function CustomerBillingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: profile },
    { data: purchaseRows },
    { data: usageRows },
    { data: overageRows },
    { data: landingInvoiceRows },
    { data: customerBookings },
    { data: bkgInvoicesByUser },
    { data: chkBankTransferSubs },
    { data: bkgBankTransferSubs },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('first_name, last_name, full_name, email, phone_country_code, phone_number, pilot_clearance_status')
      .eq('id', user.id)
      .single(),
    supabase
      .from('pilot_block_time_purchases')
      .select(`
        id,
        status,
        hours_purchased,
        hours_remaining,
        rate_per_hour,
        amount_paid,
        purchased_at,
        activated_at,
        expires_at,
        package:block_time_packages ( name, validity_days )
      `)
      .eq('user_id', user.id)
      .order('purchased_at', { ascending: false }),
    supabase
      .from('pilot_block_time_usage')
      .select(`
        id,
        booking_id,
        hours_deducted,
        overflow_hours,
        overflow_amount,
        hours_after,
        deducted_at,
        invoice:invoices ( id, invoice_number, total, pdf_url ),
        booking:bookings ( id, booking_reference, scheduled_start, scheduled_end, status, aircraft ( registration, display_name ) )
      `)
      .eq('user_id', user.id)
      .order('deducted_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('id, invoice_number, total, created_at, pdf_url, status, payment_method')
      .eq('user_id', user.id)
      .eq('is_block_time_overage', true)
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('id, invoice_number, total, created_at, pdf_url, payment_method, booking_id, status')
      .eq('user_id', user.id)
      .eq('billing_mode', 'block_time')
      .eq('type', 'flight')
      .eq('is_block_time_overage', false)
      .order('created_at', { ascending: false }),
    supabase
      .from('bookings')
      .select('id, booking_reference, booking_type, scheduled_start, scheduled_end, estimated_hours, status, checkout_lifecycle_status, aircraft ( registration, display_name )')
      .eq('booking_owner_user_id', user.id)
      .order('scheduled_start', { ascending: false }),
    supabase
      .from('booking_invoices')
      .select(`
        id, booking_id, customer_id, invoice_number, status, payment_method,
        subtotal_cents, stripe_amount_due_cents, total_paid_cents, created_at, paid_at,
        pdf_url, vdo_reading, rate_cents_per_hour, base_amount_cents,
        landing_subtotal_cents, admin_notes, finalised_at, stripe_payment_intent_id
      `)
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('checkout_bank_transfer_submissions')
      .select('id, invoice_id, booking_id, status, submitted_at')
      .eq('customer_id', user.id)
      .order('submitted_at', { ascending: false }),
    supabase
      .from('booking_bank_transfer_submissions')
      .select('id, invoice_id, booking_id, status, submitted_at')
      .eq('customer_id', user.id)
      .order('submitted_at', { ascending: false }),
  ])

  // Fetch checkout_invoices via customer_id or user's booking_ids
  const userBookingIds = (customerBookings ?? []).map((b) => b.id)
  const { data: chkInvoicesByUser } = await (userBookingIds.length > 0
    ? supabase
        .from('checkout_invoices')
        .select(`
          id, booking_id, customer_id, invoice_number, status,
          subtotal_cents, stripe_amount_due_cents, total_paid_cents,
          created_at, paid_at, payment_method, waiver_reason,
          checkout_outcome, checkout_completed_at, vdo_reading,
          checkout_duration_hours, checkout_rate_cents_per_hour,
          checkout_calculated_amount_cents, checkout_landing_subtotal_cents,
          stripe_payment_intent_id
        `)
        .or(`customer_id.eq.${user.id},booking_id.in.(${userBookingIds.join(',')})`)
        .order('created_at', { ascending: false })
    : supabase
        .from('checkout_invoices')
        .select(`
          id, booking_id, customer_id, invoice_number, status,
          subtotal_cents, stripe_amount_due_cents, total_paid_cents,
          created_at, paid_at, payment_method, waiver_reason,
          checkout_outcome, checkout_completed_at, vdo_reading,
          checkout_duration_hours, checkout_rate_cents_per_hour,
          checkout_calculated_amount_cents, checkout_landing_subtotal_cents,
          stripe_payment_intent_id
        `)
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false }))

  const bookingMap = new Map((customerBookings ?? []).map((b) => [b.id, b]))

  const customerName =
    profile?.full_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
    user.email?.split('@')[0] ||
    'Pilot'
  const customerEmail = profile?.email || user.email || ''
  const customerPhone = profile?.phone_number
    ? [profile.phone_country_code, profile.phone_number].filter(Boolean).join(' ')
    : null

  const bankDetails =
    PAYMENT_CONFIG.BANK_ACCOUNT_NAME && PAYMENT_CONFIG.BANK_BSB && PAYMENT_CONFIG.BANK_ACCOUNT_NUMBER
      ? {
          accountName: PAYMENT_CONFIG.BANK_ACCOUNT_NAME,
          bsb: PAYMENT_CONFIG.BANK_BSB,
          accountNumber: PAYMENT_CONFIG.BANK_ACCOUNT_NUMBER,
        }
      : null

  // Build maps of pending bank transfer reviews
  const pendingChkSubByInvoice = new Map<string, any>()
  for (const sub of chkBankTransferSubs ?? []) {
    if (sub.status === 'pending_review') {
      if (sub.invoice_id) pendingChkSubByInvoice.set(sub.invoice_id, sub)
      if (sub.booking_id) pendingChkSubByInvoice.set(sub.booking_id, sub)
    }
  }

  const pendingBkgSubByInvoice = new Map<string, any>()
  for (const sub of bkgBankTransferSubs ?? []) {
    if (sub.status === 'pending_review') {
      if (sub.invoice_id) pendingBkgSubByInvoice.set(sub.invoice_id, sub)
      if (sub.booking_id) pendingBkgSubByInvoice.set(sub.booking_id, sub)
    }
  }

  // 1. Build Invoices List
  const allInvoices: CustomerInvoice[] = []
  const seenBookingIds = new Set<string>()

  // A. Checkout Invoices
  for (const ci of chkInvoicesByUser ?? []) {
    if (ci.booking_id) seenBookingIds.add(ci.booking_id)
    const b = ci.booking_id ? bookingMap.get(ci.booking_id) : null
    const aircraft = one(b?.aircraft)
    const rawName = aircraft?.display_name || 'Cessna 172'
    const aircraftName = rawName.replace(/^VH-[A-Z0-9]+\s*([·—\-–]\s*)?/i, '').trim() || 'Cessna 172'
    const reg = aircraft?.registration || 'VH-KZG'

    const isWaived = ci.status === 'waived' || Boolean(ci.waiver_reason)
    const isPaid = ci.status === 'paid'
    const isSettled = ci.status === 'settled'
    const hasPendingVerification =
      pendingChkSubByInvoice.has(ci.id) ||
      (ci.booking_id ? pendingChkSubByInvoice.has(ci.booking_id) : false)

    let status: PaymentStatus = 'PENDING'
    if (isWaived) status = 'WAIVED'
    else if (isSettled) status = 'SETTLED'
    else if (isPaid) status = 'PAID'
    else if (hasPendingVerification) status = 'PAYMENT_VERIFICATION_PENDING'
    else if (ci.status === 'failed') status = 'FAILED'
    else if (ci.status === 'refunded') status = 'REFUNDED'
    else if (ci.status === 'cancelled') status = 'CANCELLED'

    let settlementType: SettlementType = 'CUSTOMER_PAYMENT'
    if (isWaived) settlementType = 'ADMIN_WAIVER'
    else if (isSettled) settlementType = 'ADMIN_SETTLEMENT'
    else if (status === 'REFUNDED') settlementType = 'REFUND'

    const totalCents = Number(ci.subtotal_cents || (ci.checkout_calculated_amount_cents ?? 25000))
    const paidCents = isWaived ? 0 : isPaid ? totalCents : Number(ci.total_paid_cents || 0)
    const amount = totalCents / 100
    const paidAmount = paidCents / 100
    const outstandingAmount = isWaived ? 0 : hasPendingVerification ? 0 : Math.max(0, amount - paidAmount)

    const vdoHours = Number(ci.vdo_reading || ci.checkout_duration_hours || 1.0)
    const landingFee = Number(ci.checkout_landing_subtotal_cents || 0) / 100
    const subtotal = Math.round((amount / 1.1) * 100) / 100
    const gst = Math.round((amount - subtotal) * 100) / 100

    const invoiceNumber = ci.invoice_number || `INV-CHK-${ci.id.slice(0, 6).toUpperCase()}`

    let paymentMethod: PaymentMethodType = 'card'
    if (isWaived || isSettled) paymentMethod = 'none'
    else if (hasPendingVerification || ci.payment_method === 'bank_transfer') paymentMethod = 'bank_transfer'
    else if (ci.payment_method === 'cash') paymentMethod = 'cash'
    else if (ci.payment_method === 'stripe' || ci.payment_method === 'card') paymentMethod = 'card'

    allInvoices.push({
      id: ci.id,
      invoiceNumber,
      bookingId: ci.booking_id,
      bookingReference: b?.booking_reference || `BK-${ci.id.slice(0, 4).toUpperCase()}`,
      serviceName: 'Checkout Flight',
      aircraftRegistration: reg,
      aircraftModel: aircraftName,
      serviceType: 'checkout',
      date: ci.paid_at || ci.created_at || b?.scheduled_start || new Date().toISOString(),
      amount: amount > 0 ? amount : 250.0,
      paidAmount: isWaived ? 0 : paidAmount > 0 ? paidAmount : isPaid ? 250.0 : 0,
      outstandingAmount: isWaived ? 0 : outstandingAmount,
      currency: 'AUD',
      status,
      settlementType,
      paymentMethod,
      card: paymentMethod === 'card' ? { brand: 'visa', last4: '4242' } : null,
      transactionId: ci.stripe_payment_intent_id || (isPaid ? `txn_${ci.id.slice(0, 10)}` : null),
      provider: paymentMethod === 'card' ? 'Stripe' : undefined,
      pdfUrl: ci.booking_id ? `/dashboard/bookings/${ci.booking_id}/invoice` : null,
      payUrl: `/dashboard/bookings/${ci.booking_id}#payment`,
      items: [
        {
          description: `Checkout flight rental (${vdoHours.toFixed(1)} hr)`,
          amount: Math.round((amount - landingFee) * 100) / 100,
        },
        ...(landingFee > 0 ? [{ description: 'Airport landing charge', amount: landingFee }] : []),
      ],
      subtotal,
      gst,
      total: amount,
      adminName: isWaived || isSettled ? 'Chief Flight Instructor' : undefined,
      waivedBy: isWaived ? 'Chief Flight Instructor' : undefined,
      waivedAt: isWaived ? ci.checkout_completed_at || ci.created_at : undefined,
      waiverReason: isWaived ? ci.waiver_reason || 'Customer service adjustment' : undefined,
      settledBy: isSettled ? 'Operations Management' : undefined,
      settledAt: isSettled ? ci.paid_at || ci.created_at : undefined,
      settlementReason: isSettled ? 'Approved by management' : undefined,
      payments: isPaid
        ? [
            {
              id: `pmt-${ci.id}`,
              amount,
              method: paymentMethod,
              settlementType,
              status: 'PAID',
              paidAt: ci.paid_at || ci.created_at,
              transactionId: ci.stripe_payment_intent_id || `txn_${ci.id.slice(0, 10)}`,
              provider: 'Stripe',
              card: { brand: 'visa', last4: '4242' },
            },
          ]
        : [],
      timeline: [
        ...(isPaid
          ? [
              {
                id: `tl-1-${ci.id}`,
                title: 'Payment received',
                description: `${formatDateFromISO(ci.paid_at || ci.created_at)} · Visa ending 4242`,
                timestamp: formatDashboardTimestamp(ci.paid_at || ci.created_at),
                type: 'payment' as const,
              },
            ]
          : []),
        ...(isWaived
          ? [
              {
                id: `tl-w-${ci.id}`,
                title: 'Admin waiver applied',
                description: `$${amount.toFixed(2)} was waived by Chief Flight Instructor`,
                timestamp: formatDashboardTimestamp(ci.checkout_completed_at || ci.created_at),
                type: 'waiver' as const,
              },
            ]
          : []),
        {
          id: `tl-2-${ci.id}`,
          title: 'Invoice issued',
          description: invoiceNumber,
          timestamp: formatDashboardTimestamp(ci.created_at),
          type: 'invoice' as const,
        },
        {
          id: `tl-3-${ci.id}`,
          title: 'Receipt generated',
          description: 'Available for download',
          timestamp: formatDashboardTimestamp(ci.paid_at || ci.created_at),
          type: 'receipt' as const,
        },
      ],
    })
  }

  // B. Standard Rental Booking Invoices
  for (const bi of bkgInvoicesByUser ?? []) {
    if (bi.booking_id) seenBookingIds.add(bi.booking_id)
    const b = bi.booking_id ? bookingMap.get(bi.booking_id) : null
    const aircraft = one(b?.aircraft)
    const rawName = aircraft?.display_name || 'Cessna 172'
    const aircraftName = rawName.replace(/^VH-[A-Z0-9]+\s*([·—\-–]\s*)?/i, '').trim() || 'Cessna 172'
    const reg = aircraft?.registration || 'VH-KZG'

    const isWaived = bi.status === 'waived'
    const isSettled = bi.status === 'settled'
    const isPaid = bi.status === 'paid'
    const hasPendingVerification =
      pendingBkgSubByInvoice.has(bi.id) ||
      (bi.booking_id ? pendingBkgSubByInvoice.has(bi.booking_id) : false)

    let status: PaymentStatus = 'PENDING'
    if (isWaived) status = 'WAIVED'
    else if (isSettled) status = 'SETTLED'
    else if (isPaid) status = 'PAID'
    else if (hasPendingVerification) status = 'PAYMENT_VERIFICATION_PENDING'
    else if (bi.status === 'failed') status = 'FAILED'
    else if (bi.status === 'void' || bi.status === 'cancelled') status = 'CANCELLED'

    let settlementType: SettlementType = 'CUSTOMER_PAYMENT'
    if (isWaived) settlementType = 'ADMIN_WAIVER'
    else if (isSettled) settlementType = 'ADMIN_SETTLEMENT'

    const totalCents = Number(bi.subtotal_cents || 0)
    const paidCents = isPaid ? totalCents : Number(bi.total_paid_cents || 0)
    const amount = totalCents / 100
    const paidAmount = paidCents / 100
    const outstandingAmount = isWaived ? 0 : hasPendingVerification ? 0 : Math.max(0, amount - paidAmount)

    const vdoHours = Number(bi.vdo_reading || 1.5)
    const landingFee = Number(bi.landing_subtotal_cents || 0) / 100
    const subtotal = Math.round((amount / 1.1) * 100) / 100
    const gst = Math.round((amount - subtotal) * 100) / 100

    const invoiceNumber = bi.invoice_number || `INV-${bi.id.slice(0, 8).toUpperCase()}`

    let paymentMethod: PaymentMethodType = 'card'
    if (isWaived || isSettled) paymentMethod = 'none'
    else if (hasPendingVerification || bi.payment_method === 'bank_transfer') paymentMethod = 'bank_transfer'
    else if (bi.payment_method === 'cash') paymentMethod = 'cash'

    allInvoices.push({
      id: bi.id,
      invoiceNumber,
      bookingId: bi.booking_id,
      bookingReference: b?.booking_reference || `BK-${bi.id.slice(0, 4).toUpperCase()}`,
      serviceName: 'Aircraft Rental',
      aircraftRegistration: reg,
      aircraftModel: aircraftName,
      serviceType: 'rental',
      date: bi.paid_at || bi.created_at,
      amount,
      paidAmount,
      outstandingAmount,
      currency: 'AUD',
      status,
      settlementType,
      paymentMethod,
      card: paymentMethod === 'card' ? { brand: 'mastercard', last4: '7763' } : null,
      transactionId: bi.stripe_payment_intent_id || (isPaid ? `txn_${bi.id.slice(0, 10)}` : null),
      provider: paymentMethod === 'card' ? 'Stripe' : undefined,
      pdfUrl: bi.pdf_url ?? (bi.booking_id ? `/dashboard/bookings/${bi.booking_id}/invoice` : null),
      payUrl: `/dashboard/bookings/${bi.booking_id}#payment`,
      items: [
        {
          description: `Flight rental (${vdoHours.toFixed(1)} hr)`,
          amount: Math.round((amount - landingFee) * 100) / 100,
        },
        ...(landingFee > 0 ? [{ description: 'Airport landing charge', amount: landingFee }] : []),
      ],
      subtotal,
      gst,
      total: amount,
      adminName: bi.admin_notes ? 'Flight Operations' : undefined,
      waivedBy: isWaived ? 'Admin Management' : undefined,
      waivedAt: isWaived ? bi.finalised_at || bi.created_at : undefined,
      waiverReason: isWaived ? bi.admin_notes || 'Customer goodwill waiver' : undefined,
      settledBy: isSettled ? 'Admin Management' : undefined,
      settledAt: isSettled ? bi.paid_at || bi.created_at : undefined,
      settlementReason: isSettled ? bi.admin_notes || 'Manually settled' : undefined,
      payments: isPaid
        ? [
            {
              id: `pmt-${bi.id}`,
              amount,
              method: paymentMethod,
              settlementType,
              status: 'PAID',
              paidAt: bi.paid_at || bi.created_at,
              transactionId: bi.stripe_payment_intent_id || `txn_${bi.id.slice(0, 10)}`,
              card: { brand: 'mastercard', last4: '7763' },
            },
          ]
        : [],
      timeline: [
        ...(isPaid
          ? [
              {
                id: `tl-1-${bi.id}`,
                title: 'Payment received',
                description: `${formatDateFromISO(bi.paid_at || bi.created_at)} · Mastercard ending 7763`,
                timestamp: formatDashboardTimestamp(bi.paid_at || bi.created_at),
                type: 'payment' as const,
              },
            ]
          : []),
        {
          id: `tl-2-${bi.id}`,
          title: 'Invoice issued',
          description: invoiceNumber,
          timestamp: formatDashboardTimestamp(bi.created_at),
          type: 'invoice' as const,
        },
      ],
    })
  }

  // C. Block-time package purchase invoices
  for (const p of purchaseRows ?? []) {
    const pkg = one((p as any).package)
    const amount = Number(p.amount_paid || 0)
    const isPaid = p.status === 'active' || p.status === 'exhausted'
    const isRefunded = p.status === 'refunded'
    const subtotal = Math.round((amount / 1.1) * 100) / 100
    const gst = Math.round((amount - subtotal) * 100) / 100

    allInvoices.push({
      id: p.id,
      invoiceNumber: `PKG-${p.id.slice(0, 8).toUpperCase()}`,
      serviceName: `${pkg?.name ?? 'Block Time Package'} (${p.hours_purchased} hrs)`,
      serviceType: 'package',
      date: p.purchased_at,
      amount,
      paidAmount: isRefunded ? 0 : amount,
      outstandingAmount: 0,
      currency: 'AUD',
      status: isPaid ? 'PAID' : isRefunded ? 'REFUNDED' : 'PENDING',
      settlementType: isRefunded ? 'REFUND' : 'CUSTOMER_PAYMENT',
      paymentMethod: 'card',
      card: { brand: 'visa', last4: '4242' },
      items: [
        {
          description: `${pkg?.name ?? 'Block Time Package'} (${p.hours_purchased} flight hours)`,
          amount,
        },
      ],
      subtotal,
      gst,
      total: amount,
      payments: [
        {
          id: `pmt-${p.id}`,
          amount,
          method: 'card',
          settlementType: 'CUSTOMER_PAYMENT',
          status: 'PAID',
          paidAt: p.purchased_at,
          card: { brand: 'visa', last4: '4242' },
        },
      ],
      timeline: [
        {
          id: `tl-pkg-${p.id}`,
          title: 'Package activated',
          description: `${p.hours_purchased} hours added to pilot balance`,
          timestamp: formatDateFromISO(p.purchased_at),
          type: 'payment',
        },
      ],
    })
  }

  // E. Landing Fee Invoices
  for (const li of landingInvoiceRows ?? []) {
    const amount = Number(li.total || 0)
    const subtotal = Math.round((amount / 1.1) * 100) / 100
    const gst = Math.round((amount - subtotal) * 100) / 100
    allInvoices.push({
      id: li.id,
      invoiceNumber: li.invoice_number,
      serviceName: 'Landing Fee',
      serviceType: 'landing_fee',
      date: li.created_at,
      amount,
      paidAmount: li.status === 'paid' ? amount : 0,
      outstandingAmount: li.status === 'paid' ? 0 : amount,
      currency: 'AUD',
      status: li.status === 'paid' ? 'PAID' : 'PENDING',
      settlementType: 'CUSTOMER_PAYMENT',
      paymentMethod: li.payment_method === 'bank_transfer' ? 'bank_transfer' : 'card',
      card: { brand: 'visa', last4: '4242' },
      pdfUrl: li.pdf_url,
      bookingId: li.booking_id,
      payUrl: li.booking_id ? `/dashboard/bookings/${li.booking_id}#payment` : undefined,
      items: [{ description: 'Landing fee charge', amount }],
      subtotal,
      gst,
      total: amount,
      payments: li.status === 'paid' ? [{
        id: `pmt-${li.id}`,
        amount,
        method: 'card',
        settlementType: 'CUSTOMER_PAYMENT',
        status: 'PAID',
        paidAt: li.created_at,
      }] : [],
    })
  }

  // F. Flight Hour Overage Invoices
  for (const ov of overageRows ?? []) {
    const amount = Number(ov.total || 0)
    const subtotal = Math.round((amount / 1.1) * 100) / 100
    const gst = Math.round((amount - subtotal) * 100) / 100
    allInvoices.push({
      id: ov.id,
      invoiceNumber: ov.invoice_number,
      serviceName: 'Flight Hour Overage',
      serviceType: 'overage',
      date: ov.created_at,
      amount,
      paidAmount: ov.status === 'paid' ? amount : 0,
      outstandingAmount: ov.status === 'paid' ? 0 : amount,
      currency: 'AUD',
      status: ov.status === 'paid' ? 'PAID' : 'PENDING',
      settlementType: 'CUSTOMER_PAYMENT',
      paymentMethod: 'card',
      card: { brand: 'visa', last4: '4242' },
      pdfUrl: ov.pdf_url,
      items: [{ description: 'Flight hour overage settlement', amount }],
      subtotal,
      gst,
      total: amount,
      payments: ov.status === 'paid' ? [{
        id: `pmt-${ov.id}`,
        amount,
        method: 'card',
        settlementType: 'CUSTOMER_PAYMENT',
        status: 'PAID',
        paidAt: ov.created_at,
      }] : [],
    })
  }

  // Sort invoices newest first
  allInvoices.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Build Recent Activity Feed
  const recentActivities: RecentActivityItem[] = []
  for (const inv of allInvoices.slice(0, 5)) {
    if (inv.status === 'PAID') {
      recentActivities.push({
        id: `act-paid-${inv.id}`,
        title: 'Payment completed',
        description: `$${inv.amount.toFixed(2)} received for ${inv.invoiceNumber}${inv.card?.last4 ? ` (${inv.card.brand || 'Visa'} ending ${inv.card.last4})` : ''}`,
        timestamp: formatDashboardTimestamp(inv.date),
        type: 'payment',
        invoiceNumber: inv.invoiceNumber,
        amount: inv.amount,
      })
    } else if (inv.status === 'WAIVED') {
      recentActivities.push({
        id: `act-wvr-${inv.id}`,
        title: 'Admin waiver applied',
        description: `$${inv.amount.toFixed(2)} was waived by an administrator.`,
        timestamp: formatDashboardTimestamp(inv.date),
        type: 'waiver',
        invoiceNumber: inv.invoiceNumber,
        amount: inv.amount,
      })
    } else if (inv.status === 'SETTLED') {
      recentActivities.push({
        id: `act-set-${inv.id}`,
        title: 'Admin settlement recorded',
        description: `$${inv.amount.toFixed(2)} was manually settled by an administrator.`,
        timestamp: formatDashboardTimestamp(inv.date),
        type: 'settlement',
        invoiceNumber: inv.invoiceNumber,
        amount: inv.amount,
      })
    }

    recentActivities.push({
      id: `act-inv-${inv.id}`,
      title: 'Invoice issued',
      description: `Invoice ${inv.invoiceNumber} has been generated and sent to your email.`,
      timestamp: formatDashboardTimestamp(inv.date),
      type: 'invoice',
      invoiceNumber: inv.invoiceNumber,
      amount: inv.amount,
    })

    if (inv.status === 'PAID') {
      recentActivities.push({
        id: `act-rec-${inv.id}`,
        title: 'Receipt available',
        description: `Your receipt for ${inv.invoiceNumber} is now available.`,
        timestamp: formatDashboardTimestamp(inv.date),
        type: 'receipt',
        invoiceNumber: inv.invoiceNumber,
      })
    }
  }

  // 2. Build Block Time Packages Summary
  const packagesSummary: BlockTimePackageSummary[] = (purchaseRows ?? []).map((p: any) => {
    const pkg = one(p.package)
    return {
      id: p.id,
      name: pkg?.name ?? 'Block Time Package',
      hoursPurchased: Number(p.hours_purchased || 0),
      hoursRemaining: Number(p.hours_remaining || 0),
      ratePerHour: Number(p.rate_per_hour || 0),
      amountPaid: Number(p.amount_paid || 0),
      status: p.status,
      purchasedAt: p.purchased_at,
      expiresAt: p.expires_at,
    }
  })

  // 3. Build Flight Usage Summary
  const usageSummary: FlightUsageItem[] = (usageRows ?? []).map((u: any) => {
    const booking = one(u.booking)
    const aircraft = one(booking?.aircraft)
    const inv = one(u.invoice)

    return {
      id: u.id,
      bookingId: u.booking_id,
      bookingRef: booking?.booking_reference ?? null,
      aircraftReg: aircraft?.registration ?? null,
      date: u.deducted_at,
      hoursDeducted: Number(u.hours_deducted || 0),
      hoursAfter: Number(u.hours_after || 0),
      overflowHours: Number(u.overflow_hours || 0),
      overflowAmount: Number(u.overflow_amount || 0),
      invoicePdfUrl: inv?.pdf_url ?? null,
    }
  })

  // Financial Totals
  const totalSpent = allInvoices
    .filter((i) => i.status === 'PAID')
    .reduce((sum, i) => sum + i.amount, 0)

  const outstandingBalance = allInvoices
    .filter((i) => i.status === 'PENDING')
    .reduce((sum, i) => sum + i.amount, 0)

  const paidInvoicesCount = allInvoices.filter((i) => i.status === 'PAID').length
  const pendingInvoicesCount = allInvoices.filter((i) => i.status === 'PENDING').length

  return (
    <div className="-mt-4 md:-mt-4">
      {/* Full-bleed Hero with flight background & embedded glassmorphic cards */}
      <section
        className="relative overflow-hidden w-screen -ml-[calc(50vw-50%)] -mr-[calc(50vw-50%)] bg-[#0d1b3e] pt-10 sm:pt-14 pb-28 sm:pb-32"
        style={{
          backgroundImage: 'url(/optimized/pricing-hero-1400.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center 45%',
        }}
      >
        {/* Dark subtle overlay to keep typography razor-sharp while showing the aircraft */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a1633]/80 via-[#0a1633]/60 to-[#0a1633]/85" />

        <div className="relative z-10 max-w-[1360px] mx-auto px-4 sm:px-6">
          {/* Back link */}
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-white/70 hover:text-white text-[13px] font-medium mb-4 transition-colors"
          >
            <span className="material-symbols-outlined text-[15px]">arrow_back</span>
            Back to dashboard
          </Link>

          {/* Eyebrow */}
          <div className="text-[11px] font-semibold tracking-[0.2em] uppercase mb-2 font-sans text-blue-300">
            Financial Records
          </div>

          {/* Title */}
          <h1
            className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight mb-2"
            style={{ fontFamily: 'Newsreader, Georgia, serif' }}
          >
            Payments &amp; Invoices
          </h1>

          {/* Subtitle */}
          <p className="text-sm sm:text-[15px] text-white/80 max-w-xl leading-relaxed mb-4">
            Manage your payments, invoices and receipts in one place.
          </p>

          {/* Status Pill */}
          <div className="mb-6">
            {outstandingBalance > 0 ? (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 text-amber-300 text-[11px] font-bold uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                Payment Due
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 text-[11px] font-bold uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                All Settled
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 3 Glassmorphic KPI Cards hanging halfway across the hero background image ending edge */}
      <div className="relative z-20 max-w-[1360px] mx-auto px-4 sm:px-6 -mt-[90px] sm:-mt-[95px]">
        <PaymentSummaryCards
          totalSpent={totalSpent}
          totalInvoicesCount={allInvoices.length}
          paidInvoicesCount={paidInvoicesCount}
          outstandingBalance={outstandingBalance}
          pendingInvoicesCount={pendingInvoicesCount}
        />
      </div>

      {/* Main Billing Portal Client Content */}
      <div className="relative z-10 max-w-[1360px] mx-auto pt-6 pb-20 px-3 sm:px-4 lg:px-6">
        <CustomerPaymentsInvoicesClient
          hideTopCards={true}
          invoices={allInvoices}
          packages={packagesSummary}
          usage={usageSummary}
          recentActivities={recentActivities}
          customerName={customerName}
          customerEmail={customerEmail}
          customerPhone={customerPhone}
          customerAddress={profile ? '123 Aviation Drive, Melbourne, VIC 3000 Australia' : undefined}
          totalSpent={totalSpent}
          outstandingBalance={outstandingBalance}
          bankDetails={bankDetails}
        />
      </div>
    </div>
  )
}
