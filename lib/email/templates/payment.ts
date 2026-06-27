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
