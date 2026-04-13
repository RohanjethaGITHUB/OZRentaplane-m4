import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Safety Disclaimer',
  description: 'Important legal and operational disclaimers regarding the rental and piloting of aircraft with OZRentAPlane.',
  alternates: {
    canonical: '/safety-disclaimer'
  }
}

export default function SafetyDisclaimerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
