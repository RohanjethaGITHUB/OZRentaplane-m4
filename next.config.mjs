import bundleAnalyzer from '@next/bundle-analyzer'

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['playwright-core', '@sparticuz/chromium-min'],
    outputFileTracingIncludes: {
      '/api/invoices/generate-pdf': ['./lib/invoices/assets/**/*'],
      '/dashboard/bookings/[id]/invoice': ['./lib/invoices/assets/**/*'],
    },
    outputFileTracingExcludes: {
      '*': [
        'public/**',
        'node_modules/@swc/core-linux-x64-gnu/**',
        'node_modules/@swc/core-linux-x64-musl/**',
        'node_modules/@esbuild/linux-x64/**',
      ],
    },
  },
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

