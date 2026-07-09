import type { Metadata } from 'next'

// Client component → metadata lives here. Noindex the login page (Section 8 —
// utility routes). Also Disallowed in robots.ts and absent from the sitemap.
export const metadata: Metadata = {
  robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
