import { renderBaseTemplate } from './base-template'
import { getAppUrl } from '../app-url'

const appUrl = getAppUrl()

export function paymentConfirmedEmail(message: string, pdfUrl?: string) {
  return {
    subject: 'Payment confirmed',
    html: renderBaseTemplate({
      headline: 'Payment confirmed',
      message,
      ctaLabel: 'View Dashboard',
      ctaUrl: `${appUrl}/dashboard`,
      extraHtml: pdfUrl
        ? `<div style="margin: 0 0 20px; padding: 12px 14px; background: #f0f7ff; border: 1px solid #d0e5ff; border-radius: 6px;"><p style="margin: 0 0 8px; font-size: 14px; color: #1e3a8a; font-weight: bold;">Tax Invoice Available</p><p style="margin: 0 0 10px; font-size: 14px; color: #1e40af; line-height: 1.4;">Your official tax invoice PDF has been generated. You can download it directly using the link below:</p><a href="${pdfUrl}" target="_blank" style="display: inline-block; color: #1a4fd6; text-decoration: underline; font-size: 14px; font-weight: 600;">Download Tax Invoice (PDF)</a></div>`
        : undefined,
    }),
  }
}

export function flightReceiptPayfEmail({
  customerName,
  invoiceNumber,
  aircraftReg,
  vdoHours,
  landingFees,
  totalCharged,
  pdfUrl,
}: {
  customerName: string
  invoiceNumber: string
  aircraftReg: string
  vdoHours: number
  landingFees: number
  totalCharged: number
  pdfUrl?: string
}) {
  return {
    subject: `Flight Receipt & Tax Invoice - ${invoiceNumber}`,
    html: renderBaseTemplate({
      headline: 'Flight Receipt & Tax Invoice',
      message: `Dear ${customerName},<br/><br/>Thank you for flying with us. Here is the receipt and invoice summary for your recent flight in <strong>${aircraftReg}</strong>.`,
      ctaLabel: 'View Invoices',
      ctaUrl: `${appUrl}/dashboard`,
      extraHtml: `
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 20px; font-family: sans-serif; font-size: 14px; color: #374151;">
          <thead>
            <tr style="border-bottom: 2px solid #e5e7eb;">
              <th style="text-align: left; padding: 8px 0; font-weight: 600;">Description</th>
              <th style="text-align: right; padding: 8px 0; font-weight: 600;">Qty</th>
              <th style="text-align: right; padding: 8px 0; font-weight: 600;">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 10px 0;">Flight Time Hire (${vdoHours.toFixed(1)} VDO hours)</td>
              <td style="text-align: right; padding: 10px 0;">${vdoHours.toFixed(1)}</td>
              <td style="text-align: right; padding: 10px 0;">$${(vdoHours * 330).toFixed(2)}</td>
            </tr>
            ${landingFees > 0 ? `
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 10px 0;">Airport Landing Fees</td>
              <td style="text-align: right; padding: 10px 0;">—</td>
              <td style="text-align: right; padding: 10px 0;">$${landingFees.toFixed(2)}</td>
            </tr>` : ''}
            <tr style="border-bottom: 2px solid #e5e7eb; font-weight: bold; color: #111827;">
              <td style="padding: 12px 0;">Total (incl. GST)</td>
              <td style="text-align: right; padding: 12px 0;">—</td>
              <td style="text-align: right; padding: 12px 0;">$${totalCharged.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
        ${pdfUrl ? `
        <div style="margin: 20px 0 0; padding: 14px; background: #f0f7ff; border: 1px solid #d0e5ff; border-radius: 8px; text-align: center;">
          <p style="margin: 0 0 10px; font-size: 14px; color: #1e3a8a; font-weight: bold;">Download PDF Invoice</p>
          <a href="${pdfUrl}" target="_blank" style="display: inline-block; background-color: #1a4fd6; color: #ffffff; text-decoration: none; padding: 8px 16px; border-radius: 6px; font-size: 14px; font-weight: 600;">Download Invoice PDF</a>
        </div>
        ` : ''}
      `,
    }),
  }
}

export function flightReceiptBlockTimeEmail({
  customerName,
  invoiceNumber,
  aircraftReg,
  vdoHours,
  deductedHours,
  remainingBalance,
  overflowHours,
  overflowAmount,
  landingFees,
  totalCharged,
  pdfUrl,
}: {
  customerName: string
  invoiceNumber: string
  aircraftReg: string
  vdoHours: number
  deductedHours: number
  remainingBalance: number
  overflowHours: number
  overflowAmount: number
  landingFees: number
  totalCharged: number
  pdfUrl?: string
}) {
  return {
    subject: `Flight Deduction Receipt & Tax Invoice - ${invoiceNumber}`,
    html: renderBaseTemplate({
      headline: 'Flight Deduction Receipt',
      message: `Dear ${customerName},<br/><br/>Here is the summary of your recent flight in <strong>${aircraftReg}</strong>. Your prepaid block time balance has been deducted for this flight.`,
      ctaLabel: 'View Account Balance',
      ctaUrl: `${appUrl}/dashboard`,
      extraHtml: `
        <div style="margin-bottom: 20px; padding: 14px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; font-family: sans-serif;">
          <p style="margin: 0 0 4px; font-size: 13px; color: #047857; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Updated Block Balance</p>
          <p style="margin: 0; font-size: 24px; font-weight: 800; color: #065f46;">${remainingBalance.toFixed(1)} hours remaining</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 20px; font-family: sans-serif; font-size: 14px; color: #374151;">
          <thead>
            <tr style="border-bottom: 2px solid #e5e7eb;">
              <th style="text-align: left; padding: 8px 0; font-weight: 600;">Description</th>
              <th style="text-align: right; padding: 8px 0; font-weight: 600;">Qty</th>
              <th style="text-align: right; padding: 8px 0; font-weight: 600;">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 10px 0;">Prepaid Block Time Deduction</td>
              <td style="text-align: right; padding: 10px 0;">${deductedHours.toFixed(1)}h</td>
              <td style="text-align: right; padding: 10px 0;">$0.00 (Prepaid)</td>
            </tr>
            ${overflowHours > 0 ? `
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 10px 0;">Block Time Overflow Overage</td>
              <td style="text-align: right; padding: 10px 0;">${overflowHours.toFixed(1)}h</td>
              <td style="text-align: right; padding: 10px 0;">$${overflowAmount.toFixed(2)}</td>
            </tr>` : ''}
            ${landingFees > 0 ? `
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 10px 0;">Airport Landing Fees</td>
              <td style="text-align: right; padding: 10px 0;">—</td>
              <td style="text-align: right; padding: 10px 0;">$${landingFees.toFixed(2)}</td>
            </tr>` : ''}
            <tr style="border-bottom: 2px solid #e5e7eb; font-weight: bold; color: #111827;">
              <td style="padding: 12px 0;">Total Cash Due (incl. GST)</td>
              <td style="text-align: right; padding: 12px 0;">—</td>
              <td style="text-align: right; padding: 12px 0;">$${totalCharged.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
        ${pdfUrl ? `
        <div style="margin: 20px 0 0; padding: 14px; background: #f0f7ff; border: 1px solid #d0e5ff; border-radius: 8px; text-align: center;">
          <p style="margin: 0 0 10px; font-size: 14px; color: #1e3a8a; font-weight: bold;">Download PDF Invoice</p>
          <a href="${pdfUrl}" target="_blank" style="display: inline-block; background-color: #1a4fd6; color: #ffffff; text-decoration: none; padding: 8px 16px; border-radius: 6px; font-size: 14px; font-weight: 600;">Download Invoice PDF</a>
        </div>
        ` : ''}
      `,
    }),
  }
}
