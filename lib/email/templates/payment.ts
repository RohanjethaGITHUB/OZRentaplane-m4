import { renderBaseTemplate } from './base-template'
import { getAppUrl } from '../app-url'

const appUrl = getAppUrl()

export function paymentConfirmedEmail(message: string) {
  return {
    subject: 'Payment confirmed',
    html: renderBaseTemplate({
      headline: 'Payment confirmed',
      message,
      ctaLabel: 'View Dashboard',
      ctaUrl: `${appUrl}/dashboard`,
    }),
  }
}
