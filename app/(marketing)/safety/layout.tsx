import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Aviation Safety Standards',
  description: 'Learn about our rigorous aircraft maintenance schedules, safety checks, and strict operational standards for the fleet.',
  alternates: {
    canonical: '/safety'
  },
  openGraph: {
    title: 'Aviation Safety Standards | OZRentAPlane',
    description: 'Learn about our rigorous aircraft maintenance schedules, safety checks, and strict operational standards for the fleet.',
    url: '/safety',
  },
  twitter: {
    title: 'Aviation Safety Standards | OZRentAPlane',
    description: 'Learn about our rigorous aircraft maintenance schedules, safety checks, and strict operational standards for the fleet.',
  }
}

export default function SafetyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
