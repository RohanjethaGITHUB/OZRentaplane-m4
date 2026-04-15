import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Aircraft Rental Pricing',
  description: 'Transparent aircraft rental pricing based on Hobbs time. See our hourly rates and membership tiers for the Cessna 172 fleet.',
  alternates: {
    canonical: '/pricing'
  },
  openGraph: {
    title: 'Aircraft Rental Pricing | OZRentAPlane',
    description: 'Transparent aircraft rental pricing based on Hobbs time. See our hourly rates and membership tiers for the Cessna 172 fleet.',
    url: '/pricing',
  },
  twitter: {
    title: 'Aircraft Rental Pricing | OZRentAPlane',
    description: 'Transparent aircraft rental pricing based on Hobbs time. See our hourly rates and membership tiers for the Cessna 172 fleet.',
  }
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Service",
            "name": "Aircraft Hire Pricing",
            "provider": {
              "@type": "Organization",
              "name": "OZRentAPlane"
            },
            "description": "Transparent aircraft rental pricing based on Hobbs time, with competitive hourly rates for licensed pilots.",
            "serviceType": "Aircraft Rental",
            "offers": {
              "@type": "AggregateOffer",
              "priceCurrency": "AUD",
              "lowPrice": "260.00",
              "highPrice": "395.00"
            }
          })
        }}
      />
      {children}
    </>
  )
}
