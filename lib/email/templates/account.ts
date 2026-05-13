import { renderBaseTemplate } from './base-template'
import { getAppUrl } from '../app-url'

const appUrl = getAppUrl()

export function welcomeCheckoutRequiredEmail(name: string | null) {
  return {
    subject: 'Welcome to OZ Rent A Plane',
    html: renderBaseTemplate({
      headline: `Welcome${name ? `, ${name}` : ''}`,
      message:
        'Before your first aircraft hire, you need to complete a checkout flight with the OZ Rent A Plane team.',
      ctaLabel: 'Go to Dashboard',
      ctaUrl: `${appUrl}/dashboard`,
    }),
  }
}
