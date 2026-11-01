import type { Metadata, Viewport } from 'next'

// Makes the dentist dashboard installable as a phone app (PWA). Used by the
// dashboard and the dentist login layouts only, so public city pages stay
// plain websites. Manifest lives in public/dentist-app.webmanifest.
export const dentistAppMetadata: Metadata = {
  manifest: '/dentist-app.webmanifest',
  appleWebApp: { capable: true, title: 'DentistIn', statusBarStyle: 'default' },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/icons/apple-touch-icon.png',
  },
}

export const dentistAppViewport: Viewport = {
  themeColor: '#0F172A',
}
