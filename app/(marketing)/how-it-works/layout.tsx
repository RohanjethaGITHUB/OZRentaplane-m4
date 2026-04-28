import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Checkout Process | OZRentAPlane',
  description: 'Learn the checkout process required before solo aircraft hire, including documents, checkout flight, clearance outcomes, and post-flight records.',
  alternates: {
    canonical: '/how-it-works'
  },
  openGraph: {
    title: 'Checkout Process | OZRentAPlane',
    description: 'Learn the checkout process required before solo aircraft hire, including documents, checkout flight, clearance outcomes, and post-flight records.',
    url: '/how-it-works',
  },
  twitter: {
    title: 'Checkout Process | OZRentAPlane',
    description: 'Learn the checkout process required before solo aircraft hire, including documents, checkout flight, clearance outcomes, and post-flight records.',
  }
}

export default function HowItWorksLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
