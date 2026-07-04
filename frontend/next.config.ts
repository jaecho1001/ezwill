import type { NextConfig } from 'next'

const apiOrigin = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.API_URL ||
  'http://localhost:8003'
).replace(/\/$/, '')

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
