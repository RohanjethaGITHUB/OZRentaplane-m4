import bundleAnalyzer from '@next/bundle-analyzer'

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['playwright-core', '@sparticuz/chromium-min'],
  async redirects() {
    return [
      {
        source: '/how-it-works',
        destination: '/checkout-process',
        permanent: true,
      },
    ]
  },
}

export default withBundleAnalyzer(nextConfig)
