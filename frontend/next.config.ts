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
  async headers() {
    // HONEST SCOPE (#91 review): this CSP stops external exfiltration
    // (connect/img/font/script sources are same-origin only) and framing,
    // but 'unsafe-inline' means injected inline script CAN still run —
    // Next.js hydration needs inline scripts and there is no nonce
    // infrastructure here yet. Escaping of clause HTML remains the real
    // XSS defence; a nonce-based CSP is the follow-up. Dev additionally
    // needs eval for source maps.
    const csp = [
      "default-src 'self'",
      process.env.NODE_ENV === 'development'
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
    return [
      {
        source: '/:path*',
        headers: [
          // Client magic/review tokens travel in URL query strings; without
          // a strict Referrer-Policy any outbound navigation leaks a live
          // credential in the Referer header (issue #91).
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ]
  },
}

export default nextConfig
