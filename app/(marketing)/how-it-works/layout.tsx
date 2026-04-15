import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'How It Works',
  description: 'The complete process for renting a Cessna 172 with OZRentAPlane. From initial vetting to dispatch and landing.',
  alternates: {
    canonical: '/how-it-works'
  },
  openGraph: {
    title: 'How It Works | OZRentAPlane',
    description: 'The complete process for renting a Cessna 172 with OZRentAPlane. From initial vetting to dispatch and landing.',
    url: '/how-it-works',
  },
  twitter: {
    title: 'How It Works | OZRentAPlane',
    description: 'The complete process for renting a Cessna 172 with OZRentAPlane. From initial vetting to dispatch and landing.',
  }
}

export default function HowItWorksLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
