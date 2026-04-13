import HeroScrollStage from '@/components/HeroScrollStage'
import HomeContent from '@/components/HomeContent'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sydney Aircraft Rental | Cessna 172 | OZRentAPlane',
  description: 'Rent a Cessna 172 in Sydney. A premium aircraft rental platform exclusively for licensed pilots. Streamlined vetting, easy approval, and meticulously maintained fleet.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Sydney Aircraft Rental | Cessna 172 | OZRentAPlane',
    description: 'Premium Cessna 172 rental for licensed pilots in Sydney. Fast approval process.',
    url: '/',
    images: [{ url: '/Pilot&aircraftTwilight.webp', width: 1200, height: 630 }],
  },
  twitter: {
    title: 'Sydney Aircraft Rental | OZRentAPlane',
    description: 'Premium Cessna 172 rental for licensed pilots in Sydney.',
  }
}

export default function Home() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  
  return (
    <main>
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
      <HeroScrollStage />
      <HomeContent />
    </main>
  )
}
