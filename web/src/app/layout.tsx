import type { Metadata, Viewport } from 'next'
import { Fraunces, Inter } from 'next/font/google'
import { RESTAURANT } from '@/config/restaurant'
import './globals.css'

// Fonts are downloaded at build time and served from this site: no request to Google at runtime.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap' })

const appUrl = process.env.APP_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: `${RESTAURANT.name} · Order online in Pune`, template: `%s · ${RESTAURANT.name}` },
  description: `${RESTAURANT.tagline}. Order for delivery or pickup, pay online or in cash, and book a table.`,
  openGraph: { type: 'website', siteName: RESTAURANT.name, locale: 'en_IN' },
}

export const viewport: Viewport = {
  themeColor: '#c2410c',
  width: 'device-width',
  initialScale: 1,
}

/** Lets search engines show hours, address and the menu link directly in results. */
const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'Restaurant',
  name: RESTAURANT.name,
  servesCuisine: 'North Indian',
  priceRange: '₹₹',
  telephone: RESTAURANT.phone,
  url: appUrl,
  menu: `${appUrl}/menu`,
  acceptsReservations: true,
  address: {
    '@type': 'PostalAddress',
    streetAddress: RESTAURANT.address.street,
    addressLocality: RESTAURANT.address.city,
    addressRegion: RESTAURANT.address.region,
    postalCode: RESTAURANT.address.postalCode,
    addressCountry: RESTAURANT.address.country,
  },
  openingHoursSpecification: Object.entries(RESTAURANT.hours).map(([day, h]) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][Number(day)],
    opens: h.open,
    closes: h.close,
  })),
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-IN" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-dvh">
        {children}
        <script
          type="application/ld+json"
          // Static data from our own config, serialised by JSON.stringify: nothing user-supplied.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
        />
      </body>
    </html>
  )
}
