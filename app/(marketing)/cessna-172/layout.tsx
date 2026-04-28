import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Cessna 172N | OZRentAPlane',
  description: 'Rent a Cessna 172N in Sydney. A meticulously maintained aircraft for licensed pilots. Streamlined checkout process, easy booking.',
  alternates: {
    canonical: '/cessna-172'
  },
  openGraph: {
    title: 'Cessna 172N | OZRentAPlane',
    description: 'Rent a Cessna 172N in Sydney. Meticulously maintained for licensed pilots.',
    url: '/cessna-172',
  },
  twitter: {
    title: 'Cessna 172N | OZRentAPlane',
    description: 'Rent a Cessna 172N in Sydney. Meticulously maintained for licensed pilots.',
  }
}

export default function Cessna172Layout({ children }: { children: React.ReactNode }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Service",
            "name": "Cessna 172N Aircraft Rental",
            "provider": {
              "@type": "Organization",
              "name": "OZRentAPlane"
            },
            "description": "Access a meticulously maintained Cessna 172N for hire in Sydney.",
            "serviceType": "Aircraft Rental"
          })
        }}
      />
      {children}
    </>
  )
}
