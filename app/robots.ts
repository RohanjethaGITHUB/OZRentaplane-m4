import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
      // ─── AI Crawling / Scraping Directives ───────────────
      // OAI-SearchBot powers OpenAI's live web search engine. 
      {
        userAgent: 'OAI-SearchBot',
        allow: '/',
      },
      // GPTBot scrapes content to train future foundational models.
      {
        userAgent: 'GPTBot',
        disallow: '/',
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
