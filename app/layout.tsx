import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    template: '%s | OZRentAPlane',
    default: 'OZRentAPlane — Fly Your Way',
  },
  description: 'Rent a Cessna 172 and take to the skies. A modern aircraft rental platform for licensed pilots.',
  openGraph: {
    title: 'OZRentAPlane — Fly Your Way',
    description: 'Rent a Cessna 172 and take to the skies. A modern aircraft rental platform for licensed pilots.',
    url: '/',
    siteName: 'OZRentAPlane',
    images: [
      {
        url: '/Pilot&aircraftTwilight.webp', // We will assume this visual behaves well for default OG
        width: 1200,
        height: 630,
        alt: 'OZRentAPlane Aircraft',
      },
    ],
    locale: 'en_AU',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OZRentAPlane — Fly Your Way',
    description: 'Rent a Cessna 172 and take to the skies. A modern aircraft rental platform for licensed pilots.',
    images: ['/Pilot&aircraftTwilight.webp'],
  },
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicon.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/favicon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,200..800;1,6..72,200..800&family=Manrope:wght@200..800&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": `${siteUrl}/#organization`,
                  "name": "OZRentAPlane",
                  "url": siteUrl,
                  "logo": {
                    "@type": "ImageObject",
                    "url": `${siteUrl}/OZRentAPlanelogo.png`
                  },
                  "description": "A modern aircraft rental platform for licensed pilots.",
                  "contactPoint": {
                    "@type": "ContactPoint",
                    "email": "ops@ozrentaplane.com.au",
                    "contactType": "customer support"
                  }
                },
                {
                  "@type": "WebSite",
                  "@id": `${siteUrl}/#website`,
                  "url": siteUrl,
                  "name": "OZRentAPlane",
                  "publisher": {
                    "@id": `${siteUrl}/#organization`
                  }
                }
              ]
            })
          }}
        />
      </head>
      <body>
        <Navbar />
        {children}
        <Footer />
      </body>
    </html>
  )
}
