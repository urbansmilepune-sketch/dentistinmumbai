import type { Metadata } from 'next'
import { Sora, DM_Sans } from 'next/font/google'
import { headers } from 'next/headers'
import { getCityBySlug } from '@/config/cities'
import './globals.css'

// Self-hosted via next/font. The `variable` prop sets a CSS variable on
// whichever element gets the returned className — we apply both to <html>
// below so every CSS var(--font-heading) / var(--font-body) in the app
// resolves to the self-hosted family.
const sora = Sora({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  display: 'swap',
  variable: '--font-heading',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-body',
})

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  const origin = `https://${city.domain}`
  const cityLower = city.cityName.toLowerCase()
  const description = `Find verified dentists in ${city.cityName} by area and treatment. Compare fees, read reviews, and book appointments online.`

  return {
    title: {
      default: city.metaTitle,
      template: `%s | ${city.domain}`,
    },
    description,
    icons: {
      icon: '/favicon.svg',
      shortcut: '/favicon.svg',
      apple: '/favicon.svg',
    },
    verification: {
      google: '1T1WaA-nRtq8w-GycybOoricYbjTqql3D-au0VzFm98',
    },
    keywords: [
      `dentist in ${cityLower}`,
      `dental clinic ${cityLower}`,
      `best dentist ${cityLower}`,
      `dental implants ${cityLower}`,
      `teeth whitening ${cityLower}`,
    ],
    metadataBase: new URL(origin),
    alternates: { canonical: origin },
    openGraph: {
      type: 'website',
      locale: 'en_IN',
      url: origin,
      siteName: city.domain,
      title: city.metaTitle,
      description,
    },
    twitter: {
      card: 'summary_large_image',
    },
    robots: {
      index: true,
      follow: true,
    },
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${sora.variable} ${dmSans.variable}`}>
      <body>{children}</body>
    </html>
  )
}
