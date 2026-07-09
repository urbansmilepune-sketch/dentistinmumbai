import type { Metadata } from 'next'

// Client component → metadata lives here. Noindex the forgot-password page
// (Section 8 — utility routes). Not in the sitemap.
export const metadata: Metadata = {
  robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
}

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
