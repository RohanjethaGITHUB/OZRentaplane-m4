import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Become an Flight Instructor | OZRentAPlane',
  description: 'Inspire the next generation of pilots. Get approved to teach using OZ aircraft and grow your impact in aviation.',
  alternates: {
    canonical: '/become-an-instructor',
  },
  openGraph: {
    title: 'Become an Flight Instructor | OZRentAPlane',
    description: 'Inspire the next generation of pilots. Get approved to teach using OZ aircraft and grow your impact in aviation.',
    url: '/become-an-instructor',
  },
  twitter: {
    title: 'Become an Flight Instructor | OZRentAPlane',
    description: 'Inspire the next generation of pilots. Get approved to teach using OZ aircraft and grow your impact in aviation.',
  },
}

export default function BecomeAnInstructorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
