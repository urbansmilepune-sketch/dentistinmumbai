import Link from 'next/link'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { CITY_CONFIGS, NATIONAL_ORIGIN } from '@/config/cities'
import { COMING_SOON_CITIES } from '@/config/citiesNational'
import NationalMapSection from './NationalMapSection'
// Server-only projection of the India GeoJSON. Imported HERE (server
// component) so d3-geo + the GeoJSON stay out of the client bundle.
import { STATE_PATHS, LIVE_DOTS, SOON_DOTS } from './indiaMapData'
import BrandLogo from './BrandLogo'

// National parent homepage — reduced to a holding page.
//
// We've stopped iterating on dentistinindia.in as a platform in its own
// right; the priority is the city directories. So this page does exactly
// one job: tell a visitor we're rebuilding, and route them to their city.
// No nav, no hero, no peer-reviewed rail, no profile card, no how-it-works,
// and nothing promoting /join, /insights, /vendors or the case surfaces.
// Those pages all still exist and still work — they're just not advertised
// from here.
//
// The city links below are real anchors on purpose. The map's live dots
// navigate via an onClick (window.open), which a crawler can't follow, and
// this page is the discovery layer Google uses to reach the city domains —
// see the sitemap.ts national branch. Dropping to dots alone would quietly
// cut every dofollow link from the parent to its children.

export const dynamic = 'force-dynamic'

export default async function NationalHome() {
  // One cheap read, purely so the map's per-city tooltip can show a live
  // dentist count. Nothing else on this page touches the database.
  const adminClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: allDentistSlim } = await adminClient
    .from('dentists')
    .select('city, is_active')

  const dentistCountByCity: { [slug: string]: number } = {}
  for (const d of (allDentistSlim || []) as Array<{ city: string | null; is_active: boolean | null }>) {
    if (!d.city || !d.is_active) continue
    dentistCountByCity[d.city] = (dentistCountByCity[d.city] || 0) + 1
  }

  const liveCityCount = Object.keys(CITY_CONFIGS).length
  const soonCityCount = COMING_SOON_CITIES.length

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${NATIONAL_ORIGIN}/#organization`, name: 'DentistIn', url: NATIONAL_ORIGIN, logo: `${NATIONAL_ORIGIN}/logo-india.webp`, address: { '@type': 'PostalAddress', addressCountry: 'IN' } },
      { '@type': 'WebSite', '@id': `${NATIONAL_ORIGIN}/#website`, name: 'Dentist In India', url: NATIONAL_ORIGIN, publisher: { '@id': `${NATIONAL_ORIGIN}/#organization` }, inLanguage: 'en-IN' },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div style={{ background: '#fff', color: '#0F1923', fontFamily: 'var(--font-body)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <main style={{ flex: 1, maxWidth: 1000, width: '100%', margin: '0 auto', padding: '56px 20px 64px' }}>
          {/* Brand mark only — deliberately not a nav bar. */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
            <BrandLogo height={52} fontSize={24} />
          </div>

          <div style={{ textAlign: 'center', maxWidth: 560, margin: '0 auto 40px' }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 32, lineHeight: 1.2, marginBottom: 12 }}>
              We&apos;re rebuilding DentistIn India
            </h1>
            <p style={{ fontSize: 17, color: '#475569', lineHeight: 1.6, margin: 0 }}>
              Find your city below.
            </p>
          </div>

          <NationalMapSection
            statePaths={STATE_PATHS}
            liveDots={LIVE_DOTS}
            soonDots={SOON_DOTS}
            dentistCountByCity={dentistCountByCity}
          />

          {/* Crawlable counterpart to the map's live dots. */}
          <section style={{ marginTop: 48 }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, textAlign: 'center', marginBottom: 20 }}>
              Live in {liveCityCount} cities
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {Object.values(CITY_CONFIGS).map(c => (
                <a
                  key={c.citySlug}
                  href={`https://${c.domain}`}
                  style={{ display: 'block', padding: '14px 16px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, textDecoration: 'none', color: '#0F1923' }}
                >
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>
                    Dentists in {c.cityName}
                  </div>
                  <div style={{ fontSize: 12, color: '#1D4ED8', fontWeight: 600, marginTop: 3 }}>
                    {c.domain} →
                  </div>
                </a>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <Link href="/cities" style={{ fontSize: 14, fontWeight: 700, color: '#1D4ED8', textDecoration: 'none' }}>
                See all {liveCityCount + soonCityCount} cities →
              </Link>
            </div>
          </section>
        </main>

        <footer style={{ background: '#0F1923', color: '#64748B', padding: '20px', textAlign: 'center', fontSize: 12 }}>
          © {new Date().getFullYear()} DentistIn. All rights reserved.
        </footer>
      </div>
    </>
  )
}
