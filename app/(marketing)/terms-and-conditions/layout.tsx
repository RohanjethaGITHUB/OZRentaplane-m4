import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: 'Legal terms and conditions governing the use of the OZRentAPlane platform and aircraft rental services.',
  alternates: {
    canonical: '/terms-and-conditions'
  }
}

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
