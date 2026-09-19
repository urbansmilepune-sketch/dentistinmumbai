import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

// The register page is a client component, so it can't export metadata itself.
// This route-level layout noindexes it (Section 8 — utility routes). Excluded
// from the sitemap already; also Disallowed in robots.ts.
export const metadata: Metadata = {
  robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
}

export default async function RegisterLayout({ children }: { children: React.ReactNode }) {
  // dentistinindia.in is not a city. The form below infers its city from the
  // hostname via getCityByDomain, which falls back to DEFAULT_CITY ('mumbai')
  // for any host that isn't in CITY_CONFIGS — so on the national parent it
  // rendered a form branded "DentistInMumbai", asking for an "Area in Mumbai",
  // and submitted city='mumbai' for a dentist who could be anywhere in India.
  //
  // Redirect to /join instead: the national flow asks for the city explicitly
  // (including an "isn't listed yet" option) rather than guessing it. Done
  // server-side off the x-is-national header proxy.ts already sets, so the
  // mistagged form never reaches the browser at all.
  const h = await headers()
  if (h.get('x-is-national') === '1') redirect('/join')
  return children
}
