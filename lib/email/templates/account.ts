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

export function customerWelcomeRegisteredEmail(params: {
  customerName: string
  firstName?: string
}) {
  const { customerName, firstName } = params
  const displayName = firstName || customerName || 'Pilot'

  return {
    subject: 'Welcome to OZ Rent A Plane — Next steps for your onboarding',
    html: renderBaseTemplate({
      headline: `Welcome aboard, ${displayName}!`,
      message: `Your account has been successfully created. We are excited to help you get into the air with our fleet.`,
      details: [
        { label: 'Step 1: Pilot Documents', value: 'Upload Pilot Licence, Medical & Photo ID' },
        { label: 'Step 2: Checkout Flight', value: 'Schedule your initial check flight' },
        { label: 'Step 3: Cleared to Fly', value: 'Book solo flights across our fleet 24/7' },
      ],
      extraHtml: `
        <div style="margin:20px 0;padding:16px;background:#f8fafc;border-radius:8px;border-left:4px solid #0284c7;">
          <p style="margin:0 0 8px;font-weight:600;color:#0f172a;font-size:14px;">Next Immediate Step:</p>
          <p style="margin:0;color:#475569;font-size:14px;line-height:1.5;">
            Head over to your customer portal and upload your CASA Pilot Licence, Medical Certificate, and Photo ID. Our operations team will verify your credentials so you can book your checkout.
          </p>
        </div>
      `,
      ctaLabel: 'Go to Customer Portal',
      ctaUrl: `${appUrl}/dashboard`,
    }),
  }
}

export function adminNewCustomerRegisteredEmail(params: {
  customerId: string
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  registeredAt?: string
}) {
  const { customerId, customerName, customerEmail, customerPhone, registeredAt } = params

  return {
    subject: `New Customer Registered: ${customerName} (${customerEmail})`,
    html: renderBaseTemplate({
      headline: 'New Customer Registration',
      message: 'A new customer has just created an account on OZ Rent A Plane.',
      details: [
        { label: 'Customer Name', value: customerName },
        { label: 'Email', value: customerEmail },
        ...(customerPhone ? [{ label: 'Phone', value: customerPhone }] : []),
        { label: 'Registered At', value: registeredAt || new Date().toISOString() },
        { label: 'Initial Status', value: 'Checkout Required / Awaiting Documents' },
      ],
      ctaLabel: 'View Customer Profile',
      ctaUrl: `${appUrl}/admin/users/${customerId}`,
    }),
  }
}
