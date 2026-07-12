import type { Metadata } from 'next'
import { Manrope, Newsreader } from 'next/font/google'
import './globals.css'
import ScreenshotMode from './ScreenshotMode'
import ContentsquareTag from './components/ContentsquareTag'
import { Suspense } from 'react'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.ozrentaplane.com'

const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
  display: 'swap',
  adjustFontFallback: false,
})

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-manrope',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    template: '%s | OZRentAPlane',
    default: 'OZ Rent A Plane',
  },
  description: 'Rent a Cessna 172 from Bankstown with transparent pricing, checkout flights, and online booking for pilots.',
  openGraph: {
    title: 'OZ Rent A Plane',
    description: 'Rent a Cessna 172 from Bankstown with transparent pricing, checkout flights, and online booking for pilots.',
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
    title: 'OZ Rent A Plane',
    description: 'Rent a Cessna 172 from Bankstown with transparent pricing, checkout flights, and online booking for pilots.',
    images: ['/Pilot&aircraftTwilight.webp'],
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: ['/favicon.ico'],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const screenshotModeBootScript = `
    (function () {
      try {
        var enabled = new URLSearchParams(window.location.search).get('screenshotMode') === '1';
        if (enabled) {
          document.documentElement.setAttribute('data-screenshot-mode', 'true');
        }
      } catch (_) {}
    })();
  `

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
        <script dangerouslySetInnerHTML={{ __html: screenshotModeBootScript }} />
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
                    "url": `${siteUrl}/Logo/ozrentaplane-transparent-bg.png`
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
      <body className={`${newsreader.variable} ${manrope.variable} bg-mkt-main text-[#0d1b3e]`}>
        <Suspense fallback={null}>
          <ScreenshotMode />
        </Suspense>
        <ContentsquareTag />
        {children}
      </body>
    </html>
  )
}
