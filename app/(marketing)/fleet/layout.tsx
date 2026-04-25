import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Our Aircraft Fleet',
  description: 'Explore the OZRentAPlane aircraft. We offer a meticulously maintained Cessna 172 for private rental.',
  alternates: {
    canonical: '/fleet'
  },
  openGraph: {
    title: 'Our Aircraft Fleet | OZRentAPlane',
    description: 'Explore the OZRentAPlane aircraft. We offer a meticulously maintained Cessna 172 for private rental.',
    url: '/fleet',
  },
  twitter: {
    title: 'Our Aircraft Fleet | OZRentAPlane',
    description: 'Explore the OZRentAPlane aircraft. We offer a meticulously maintained Cessna 172 for private rental.',
  }
}

export default function FleetLayout({ children }: { children: React.ReactNode }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Service",
            "name": "Aircraft Rental Fleet",
            "provider": {
              "@type": "Organization",
              "name": "OZRentAPlane"
            },
            "description": "Access meticulously maintained Cessna 172 aircraft for hire.",
            "serviceType": "Aircraft Rental"
          })
        }}
      />
      {children}
    </>
  )
}
