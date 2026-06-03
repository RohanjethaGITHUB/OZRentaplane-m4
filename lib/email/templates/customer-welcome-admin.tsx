import { renderBaseTemplate } from './base-template'
import { escapeHtml } from './base-template'

const appUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://www.ozrentaplane.com'

export function customerWelcomeAdminEmail(input: {
  fullName: string
  email: string
  tempPassword: string
}) {
  return {
    subject: 'Welcome to OZ Rent A Plane',
    html: renderBaseTemplate({
      headline: `Welcome, ${input.fullName}`,
      message:
        'Your customer account has been created by the OZ Rent A Plane team. Use the temporary password below to sign in, then set your own password on your first login.',
      details: [
        { label: 'Login email', value: input.email },
        { label: 'Login URL', value: `${appUrl}/login` },
      ],
      extraHtml: `
        <div style=\"margin:0 0 20px;\">
          <p style=\"margin:0 0 8px;font-size:14px;line-height:1.5;color:#334155;font-weight:700;\">Your temporary password:</p>
          <div style=\"padding:14px 16px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;font-family:'Courier New',Courier,monospace;font-size:18px;letter-spacing:0.08em;color:#0f172a;word-break:break-all;\">${escapeHtml(input.tempPassword)}</div>
          <p style=\"margin:10px 0 0;font-size:13px;line-height:1.6;color:#475569;\">You will be prompted to change this when you first log in.</p>
        </div>
      `,
      ctaLabel: 'Log in',
      ctaUrl: `${appUrl}/login`,
    }),
  }
}
