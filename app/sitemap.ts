import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  // Standard indexable core pages
  const routes = [
    '', // Home
    '/fleet',
    '/pricing',
    '/pilotRequirements',
    '/safety',
    '/checkout-process',
    '/faq',
    '/privacy-policy',
    '/terms-and-conditions',
    '/safety-disclaimer'
  ]

  return routes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '' ? 'daily' : 'weekly',
    priority: route === '' ? 1 : 0.8,
  }))
}
