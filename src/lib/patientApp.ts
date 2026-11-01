import type { Metadata, Viewport } from 'next'

// Makes the patient portal (/patient) installable as a phone app (PWA).
// Same icon and navy/teal look as the dentist app, its own manifest so it
// opens straight into the patient's records. See public/patient-app.webmanifest.
export const patientAppMetadata: Metadata = {
  title: 'My dental records · DentistIn',
  manifest: '/patient-app.webmanifest',
  appleWebApp: { capable: true, title: 'DentistIn', statusBarStyle: 'default' },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/icons/apple-touch-icon.png',
  },
  robots: { index: false, follow: false },
}

export const patientAppViewport: Viewport = {
  themeColor: '#0F172A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}
