import { renderBaseTemplate } from './base-template'

const appUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://www.ozrentaplane.com'

export function customerWelcomeAdminEmail(input: {
  fullName: string
  email: string
  actionLink: string
}) {
  return {
    subject: 'Welcome to OZ Rent A Plane',
    html: renderBaseTemplate({
      headline: `Welcome, ${input.fullName}`,
      message:
        'Your customer account has been created by the OZ Rent A Plane team. Use the link below to set your password and complete your first sign-in. This link expires in 24 hours. Contact us if you need a new one.',
      details: [
        { label: 'Login email', value: input.email },
      ],
      ctaLabel: 'Set up your password →',
      ctaUrl: input.actionLink,
    }),
  }
}
