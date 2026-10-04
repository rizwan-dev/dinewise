import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Payment is allowed for Razorpay's window; nothing needs the camera or location.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com")',
  },
]

const nextConfig: NextConfig = {
  // A self-contained server for the Docker image.
  output: 'standalone',
  poweredByHeader: false,
  // Native and driver packages run as-is in Node rather than being bundled.
  serverExternalPackages: ['@node-rs/argon2', 'sharp', 'pg'],
  experimental: {
    // Dish photos up to 5 MB, plus form overhead.
    serverActions: { bodySizeLimit: '6mb' },
  },
  images: {
    localPatterns: [
      { pathname: '/media/menu/**', search: '' },
      { pathname: '/menu/**', search: '' },
      { pathname: '/hero.webp', search: '' },
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
