import type { Metadata } from 'next'

// The register page is a client component, so it can't export metadata itself.
// This route-level layout noindexes it (Section 8 — utility routes). Excluded
// from the sitemap already; also Disallowed in robots.ts.
export const metadata: Metadata = {
  robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children
}
