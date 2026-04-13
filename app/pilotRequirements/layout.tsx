import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pilot Requirements & Vetting',
  description: 'Learn about the OZRentAPlane pilot approval process, minimum flight hour requirements, and required licences (PPL minimum).',
  alternates: {
    canonical: '/pilotRequirements'
  },
  openGraph: {
    title: 'Pilot Requirements & Vetting | OZRentAPlane',
    description: 'Learn about the OZRentAPlane pilot approval process, minimum flight hour requirements, and required licences (PPL minimum).',
    url: '/pilotRequirements',
  },
  twitter: {
    title: 'Pilot Requirements & Vetting | OZRentAPlane',
    description: 'Learn about the OZRentAPlane pilot approval process, minimum flight hour requirements, and required licences (PPL minimum).',
  }
}

export default function PilotRequirementsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
