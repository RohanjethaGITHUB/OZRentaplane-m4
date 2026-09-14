import 'server-only'

import { generateInvoicePdf } from './pdf'
import { storeInvoicePdf } from './pdf-storage'

type BlockTimePdfResult = Awaited<ReturnType<typeof storeInvoicePdf>>

function getFullName(profile: { full_name?: string | null; first_name?: string | null; last_name?: string | null } | null | undefined): string {
  const fullName = profile?.full_name?.trim()
  if (fullName) return fullName
  const parts = [profile?.first_name?.trim(), profile?.last_name?.trim()].filter(Boolean)
  return parts.join(' ') || 'Pilot'
}

function getPhoneDisplay(profile: { phone_country_code?: string | null; phone_number?: string | null } | null | undefined): string | null {
  const phoneNumber = profile?.phone_number?.trim()
  if (!phoneNumber) return null
  const countryCode = profile?.phone_country_code?.trim()
  return countryCode ? `${countryCode} ${phoneNumber}` : phoneNumber
}

export async function generateBlockTimeInvoicePdf(params: {
  supabase: any
  invoiceId: string
  invoiceNumber: string
  userId: string
  createdAt: string
  packageName: string
  packageHours: number
  ratePerHour: number
  validityDays: number
  amountPaid: number
  subtotal: number
  gstAmount: number
  total: number
  customerProfile: {
    full_name?: string | null
    first_name?: string | null
    last_name?: string | null
    phone_country_code?: string | null
    phone_number?: string | null
    email?: string | null
  } | null
}): Promise<BlockTimePdfResult> {
  const {
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
  } = params

  const purchaseDate = new Date(createdAt)
  const expiryDate = new Date(purchaseDate.getTime() + validityDays * 24 * 60 * 60 * 1000)
  const pdfBuffer = await generateInvoicePdf({
    invoiceNumber,
    documentKind: 'tax_invoice',
    statusLabel: 'PAID',
    createdAt,
    dueAt: createdAt,
    billingModeLabel: 'Block Time',
    billToName: getFullName(customerProfile),
    billToEmail: customerProfile?.email ?? '—',
    billToPhone: getPhoneDisplay(customerProfile),
    lineItems: [
      {
        description: `Block Time Package — ${packageName}`,
        quantity: packageHours,
        unitPrice: ratePerHour,
        amount: amountPaid,
      },
    ],
    subtotal,
    gstAmount,
    total,
    footerNote: `All prices include GST. Hours are valid until ${new Intl.DateTimeFormat('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(expiryDate)}. Unused hours at expiry are forfeited per Terms & Conditions.`,
  })

  return storeInvoicePdf({
    supabase,
    table: 'invoices',
    rowId: invoiceId,
    userId,
    invoiceNumber,
    pdfBuffer,
  })
}

export async function generateBlockTimeTopupInvoicePdf(params: {
  supabase: any
  invoiceId: string
  invoiceNumber: string
  userId: string
  createdAt: string
  packageName: string
  hoursAdded: number
  ratePerHour: number
  amountPaid: number
  subtotal: number
  gstAmount: number
  total: number
  newExpiresAt: string
  customerProfile: {
    full_name?: string | null
    first_name?: string | null
    last_name?: string | null
    phone_country_code?: string | null
    phone_number?: string | null
    email?: string | null
  } | null
}): Promise<BlockTimePdfResult> {
  const {
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
  } = params

  const pdfBuffer = await generateInvoicePdf({
    invoiceNumber,
    documentKind: 'tax_invoice',
    statusLabel: 'PAID',
    createdAt,
    dueAt: createdAt,
    billingModeLabel: 'Block Time',
    billToName: getFullName(customerProfile),
    billToEmail: customerProfile?.email ?? '—',
    billToPhone: getPhoneDisplay(customerProfile),
    lineItems: [
      {
        description: `Block Time Top-Up — ${packageName}`,
        quantity: hoursAdded,
        unitPrice: ratePerHour,
        amount: amountPaid,
      },
    ],
    subtotal,
    gstAmount,
    total,
    footerNote: `All prices include GST. Hours are valid until ${new Intl.DateTimeFormat('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(newExpiresAt))}. Unused hours at expiry are forfeited per Terms & Conditions.`,
  })

  return storeInvoicePdf({
    supabase,
    table: 'invoices',
    rowId: invoiceId,
    userId,
    invoiceNumber,
    pdfBuffer,
  })
}
