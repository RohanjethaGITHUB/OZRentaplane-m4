/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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

export default nextConfig
