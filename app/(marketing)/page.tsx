import HomeHeroScrollSequence from '@/components/HomeHeroScrollSequence'
import HomeContent from '@/components/HomeContent'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    absolute: 'OZ Rent A Plane | Aircraft Hire From Bankstown',
  },
  description: 'Rent a Cessna 172 from Bankstown with transparent pricing, checkout flights, and online booking for pilots.',
  alternates: {
    canonical: 'https://www.ozrentaplane.com/',
  },
  openGraph: {
    title: 'OZ Rent A Plane | Aircraft Hire From Bankstown',
    description: 'Rent a Cessna 172 from Bankstown with transparent pricing, checkout flights, and online booking for pilots.',
    url: 'https://www.ozrentaplane.com/',
    images: [{ url: '/Pilot&aircraftTwilight.webp', width: 1200, height: 630 }],
  },
  twitter: {
    title: 'OZ Rent A Plane | Aircraft Hire From Bankstown',
    description: 'Rent a Cessna 172 from Bankstown with transparent pricing, checkout flights, and online booking for pilots.',
  }
}

export default function Home() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.ozrentaplane.com'
  
  return (
    <main className="bg-deep-ink">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            "name": "OZRentAPlane",
            "image": `${siteUrl}/Pilot&aircraftTwilight.webp`,
            "@id": `${siteUrl}/#localBusiness`,
            "url": siteUrl,
            "telephone": "(02) 8000 0000",
            "address": {
              "@type": "PostalAddress",
              "streetAddress": "Bankstown Airport",
              "addressLocality": "Sydney",
              "addressRegion": "NSW",
              "postalCode": "2200",
              "addressCountry": "AU"
            },
            "description": "Premium Cessna 172 rental services for licensed pilots across Sydney, Australia."
          })
        }}
      />
      <div className="relative bg-deep-ink">
        <HomeHeroScrollSequence />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[120px] md:h-[170px]"
          style={{
            background:
              'linear-gradient(180deg, rgba(2,11,25,0) 0%, rgba(2,11,25,0.35) 42%, rgba(2,11,25,0.75) 78%, #061524 100%)',
          }}
        />
      </div>
      <HomeContent />
    </main>
  )
}
