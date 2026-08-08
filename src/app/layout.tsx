import type { Metadata, Viewport } from 'next'
import { Sora, DM_Sans } from 'next/font/google'
import { headers } from 'next/headers'
import { CITY_CONFIGS, getCityBySlug, NATIONAL_HOST, NATIONAL_ORIGIN } from '@/config/cities'
import { COMING_SOON_CITIES } from '@/config/citiesNational'
import './globals.css'
// SupportButton was previously mounted here for every route and gated its
// own visibility via usePathname. That conditional kept tripping over
// hydration edge cases and the button intermittently disappeared on
// valid dashboard routes. It now mounts inside the dashboard layout
// (src/app/for-dentists/dashboard/layout.tsx) so it appears purely by
// virtue of where it's mounted — no client-side path matching needed.

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

// Without this, mobile browsers render the desktop layout at desktop width
// and let users pinch-zoom — which makes touch targets unusably small and
// breaks every @media (max-width:768px) rule in the app.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0057A8',
}

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers()
  // National parent (dentistinindia.in) gets its own title/keywords +
  // canonical origin. Everything below the conditional is the existing
  // per-city metadata for the live city domains.
  if (h.get('x-is-national') === '1') {
    // Derived, not hardcoded — this used to be a literal 13 and silently went
    // stale the moment a city was added to CITY_CONFIGS.
    const liveCount = Object.keys(CITY_CONFIGS).length
    const totalCount = liveCount + COMING_SOON_CITIES.length
    const nationalTitle = `Find Verified Dentists in ${totalCount} Indian Cities | Dentist In India`
    const nationalDesc = `India's dental network across ${liveCount} live cities and ${COMING_SOON_CITIES.length} more launching soon. State Dental Council-registered dentists, zero commission, 30-second booking.`
    return {
      title: { default: nationalTitle, template: `%s | ${NATIONAL_HOST}` },
      description: nationalDesc,
      icons: { icon: '/favicon.svg', shortcut: '/favicon.svg', apple: '/favicon.svg' },
      verification: { google: '1T1WaA-nRtq8w-GycybOoricYbjTqql3D-au0VzFm98' },
      keywords: ['dentist in india', 'verified dentists india', 'dental clinic india', 'dental tourism india', 'state dental council registered dentist'],
      metadataBase: new URL(NATIONAL_ORIGIN),
      alternates: { canonical: NATIONAL_ORIGIN },
      openGraph: {
        type: 'website', locale: 'en_IN',
        url: NATIONAL_ORIGIN, siteName: NATIONAL_HOST,
        title: nationalTitle, description: nationalDesc,
      },
      twitter: { card: 'summary_large_image' },
      robots: { index: true, follow: true },
    }
  }

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
      <body>
        {children}
      </body>
    </html>
  )
}
