import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How OZRentAPlane collects, handles, and protects your personal flight data and pilot credentials.',
  alternates: {
    canonical: '/privacy-policy'
  }
}

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
