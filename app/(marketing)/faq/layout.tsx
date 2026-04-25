import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Frequently Asked Questions',
  description: 'Answers to pilots\' most common questions about the rental process, vetting, pricing, and insurance with OZRentAPlane.',
  alternates: {
    canonical: '/faq'
  },
  openGraph: {
    title: 'Frequently Asked Questions | OZRentAPlane',
    description: 'Answers to pilots\' most common questions about the rental process, vetting, pricing, and insurance with OZRentAPlane.',
    url: '/faq',
  },
  twitter: {
    title: 'Frequently Asked Questions | OZRentAPlane',
    description: 'Answers to pilots\' most common questions about the rental process, vetting, pricing, and insurance with OZRentAPlane.',
  }
}

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
              {
                "@type": "Question",
                "name": "What licences are required to rent with OZRentAPlane?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "We require a minimum of a Private Pilot Licence (PPL) with a current medical certificate and a minimum of 200 total flight hours. Specific airframes may require additional type ratings or endorsements."
                }
              },
              {
                "@type": "Question",
                "name": "What is the cancellation policy?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Cancellations made more than 48 hours before departure receive a full refund of the deposit. Cancellations within 48 hours forfeit the deposit unless weather-initiated."
                }
              },
              {
                "@type": "Question",
                "name": "How is the final rental cost calculated?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Pricing is based on Hobbs time — the actual hours logged on the aircraft's engine meter."
                }
              }
            ]
          })
        }}
      />
      {children}
    </>
  )
}
