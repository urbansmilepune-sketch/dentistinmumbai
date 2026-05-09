import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Dentist in Mumbai | Find Best Dentists Near You',
    template: '%s | DentistInMumbai.in',
  },
  description: 'Find verified dentists in Mumbai by area and treatment. Compare fees, read reviews, and book appointments online.',
verification: {
    google: 'w9MKNd4YeW-EMv0TpbUPPTuqUJyg3vaPOv9maU2A_ns',
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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
