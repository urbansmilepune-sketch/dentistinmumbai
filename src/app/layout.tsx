import type { Metadata } from 'next'
import { Sora, DM_Sans } from 'next/font/google'
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

export const metadata: Metadata = {
  title: {
    default: 'Dentist in Mumbai | Find Best Dentists Near You',
    template: '%s | DentistInMumbai.in',
  },
  description: 'Find verified dentists in Mumbai by area and treatment. Compare fees, read reviews, and book appointments online.',
verification: {
    google: '1T1WaA-nRtq8w-GycybOoricYbjTqql3D-au0VzFm98',
  },
  keywords: ['dentist in mumbai', 'dental clinic mumbai', 'best dentist mumbai', 'dental implants mumbai', 'teeth whitening mumbai'],
  metadataBase: new URL('https://dentistinmumbai.in'),
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: 'https://dentistinmumbai.in',
    siteName: 'DentistInMumbai.in',
  },
  twitter: {
    card: 'summary_large_image',
  },
  robots: {
    index: true,
    follow: true,
  },
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
