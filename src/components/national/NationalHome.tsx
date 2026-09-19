import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { CITY_CONFIGS, NATIONAL_ORIGIN } from '@/config/cities'
import { COMING_SOON_CITIES } from '@/config/citiesNational'
import NationalMapSection from './NationalMapSection'
// Server-only projection of the India GeoJSON. Imported HERE (server
// component) so d3-geo + the GeoJSON stay out of the client bundle.
import { STATE_PATHS, LIVE_DOTS, SOON_DOTS } from './indiaMapData'
import BrandLogo from './BrandLogo'

// National parent homepage.
//
// Re-positioned away from the LinkedIn/Instagram-shaped "professional
// network" framing (feed, follows, likes, case discussions) toward a
// vendor-discovery utility: which labs, distributors and equipment
// technicians do verified dentists actually trust. The social layer is
// frozen — this page no longer links to /feed or /cases, and the stat
// strip and "most-followed" rail are gone because neither had real data
// behind it (zero follows platform-wide, six cases).
//
// What's left is honest: the pitch, how it works, where we're live, and
// a way back in for dentists who already have a profile.

export const dynamic = 'force-dynamic'

const DENTIST_STEPS = [
  {
    n: 1,
    title: 'Claim your verified profile',
    body: 'Pulled from your city listing. Your State Dental Council registration confirms you\'re real.',
  },
  {
    n: 2,
    title: 'Rate the labs and vendors you already use',
    body: 'Takes 30 seconds. Who you send work to, and whether you\'d send it again.',
  },
  {
    n: 3,
    title: 'Find a trusted lab near you',
    body: 'Filtered by city, ranked by real dentist ratings — not ads, not paid placement.',
  },
]

export default async function NationalHome() {
  const adminClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Auth lookup — swaps the signed-out "Claim your profile" CTA for the
  // dentist's own profile entry point.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const signedIn = !!user?.email

  // The only read this page still needs: per-city active-dentist counts for
  // the map tooltip and the city grid. The dentist/case/follower counts that
  // fed the old stat strip and "most-followed" rail are gone with them.
  const { data: allDentistSlim } = await adminClient
    .from('dentists')
    .select('city, is_active')

  const liveCityCount = Object.keys(CITY_CONFIGS).length
  const soonCityCount = COMING_SOON_CITIES.length

  const dentistCountByCity: { [slug: string]: number } = {}
  for (const d of (allDentistSlim || []) as Array<{ city: string | null; is_active: boolean | null }>) {
    if (!d.city || !d.is_active) continue
    dentistCountByCity[d.city] = (dentistCountByCity[d.city] || 0) + 1
  }

  // JSON-LD. Reframed off "professional network" — this is a directory of
  // verified dentists plus the vendor trust layer built on top of it.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${NATIONAL_ORIGIN}/#organization`, name: 'DentistIn', url: NATIONAL_ORIGIN, logo: `${NATIONAL_ORIGIN}/logo-india.webp`, address: { '@type': 'PostalAddress', addressCountry: 'IN' } },
      { '@type': 'WebSite', '@id': `${NATIONAL_ORIGIN}/#website`, name: 'Dentist In India', url: NATIONAL_ORIGIN, publisher: { '@id': `${NATIONAL_ORIGIN}/#organization` }, inLanguage: 'en-IN' },
      { '@type': 'MedicalOrganization', '@id': `${NATIONAL_ORIGIN}/#medical-organization`, name: 'Dentist In India — Verified Dentist Directory', url: NATIONAL_ORIGIN, medicalSpecialty: 'Dentistry', areaServed: { '@type': 'Country', name: 'India' }, memberOf: { '@id': `${NATIONAL_ORIGIN}/#organization` } },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div style={{ background: '#fff', color: '#0F1923', fontFamily: 'var(--font-body)' }}>
        {/* Nav */}
        <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '14px 20px' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Link href="/" style={{ display: 'flex', alignItems: 'center', color: '#0F1923', textDecoration: 'none' }}>
              <BrandLogo height={32} />
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 14, fontWeight: 600 }}>
              <Link href="/vendors"      style={{ color: '#475569', textDecoration: 'none' }}>Find a Lab</Link>
              <Link href="/for-dentists" style={{ color: '#475569', textDecoration: 'none' }}>For Dentists</Link>
              {signedIn ? (
                <>
                  <Link href="/professional/me" style={{ padding: '8px 16px', background: '#0F1923', color: '#fff', borderRadius: 8, textDecoration: 'none' }}>My Profile</Link>
                  <form action="/auth/signout" method="post" style={{ margin: 0 }}>
                    <button type="submit" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit', fontSize: 14, fontWeight: 600, color: '#475569' }}>
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" style={{ color: '#475569', textDecoration: 'none' }}>Login</Link>
                  <Link href="/join" style={{ padding: '8px 16px', background: '#1D4ED8', color: '#fff', borderRadius: 8, textDecoration: 'none' }}>Claim your profile</Link>
                </>
              )}
            </div>
          </div>
        </nav>

        {/* Hero */}
        <section style={{ padding: '72px 20px 40px', background: 'linear-gradient(180deg, #F8FAFC 0%, #fff 100%)' }}>
          <div style={{ maxWidth: 980, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ marginBottom: 22, display: 'flex', justifyContent: 'center' }}>
              <BrandLogo height={64} fontSize={28} />
            </div>
            <div style={{ display: 'inline-block', background: '#EFF6FF', color: '#1D4ED8', padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, marginBottom: 18, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              For dental professionals
            </div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 52, lineHeight: 1.08, marginBottom: 18, color: '#0F1923' }}>
              Find a lab you can trust, <span style={{ color: '#1D4ED8' }}>verified by dentists who&apos;ve actually used them.</span>
            </h1>
            <p style={{ fontSize: 18, color: '#475569', maxWidth: 680, margin: '0 auto 28px', lineHeight: 1.55 }}>
              Ratings and referrals from real, verified dentists across India — for labs, materials, and urgent equipment repair.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Link href="/vendors" style={{ padding: '14px 26px', minHeight: 48, background: '#1D4ED8', color: '#fff', borderRadius: 10, fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>
                Find a lab near you →
              </Link>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section style={{ padding: '40px 20px 64px', background: '#F8FAFC' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <SectionEyebrow>How it works</SectionEyebrow>
            <SectionHeadline>Three steps to a lab you can trust</SectionHeadline>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24, marginTop: 32 }}>
              {DENTIST_STEPS.map(s => (
                <div key={s.n} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '24px 22px' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1D4ED8', color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                    {s.n}
                  </div>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, color: '#0F1923', marginBottom: 6 }}>{s.title}</h3>
                  <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6 }}>{s.body}</p>
                </div>
              ))}
            </div>
            {!signedIn && (
              <div style={{ textAlign: 'center', marginTop: 28 }}>
                <Link href="/join" style={{ padding: '12px 24px', minHeight: 44, background: '#0F1923', color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none', display: 'inline-block' }}>
                  Claim your profile — it&apos;s free →
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Map */}
        <section style={{ padding: '32px 20px 24px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <NationalMapSection
              statePaths={STATE_PATHS}
              liveDots={LIVE_DOTS}
              soonDots={SOON_DOTS}
              dentistCountByCity={dentistCountByCity}
            />
          </div>
        </section>

        {/* Existing-user CTA — the way back in for dentists who already have
            a profile, so the page isn't addressed only to new signups. */}
        <section style={{ padding: '8px 20px 56px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 14, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#475569' }}>Already have a profile?</span>
              <Link href="/for-dentists/login" style={{ padding: '11px 22px', minHeight: 44, background: '#0F1923', color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
                Manage your practice →
              </Link>
            </div>
          </div>
        </section>

        {/* Where we're live */}
        <section style={{ padding: '8px 20px 64px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <SectionEyebrow>Where we&apos;re live</SectionEyebrow>
            <SectionHeadline>Live in {liveCityCount} cities, {soonCityCount} more coming</SectionHeadline>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginTop: 28 }}>
              {Object.values(CITY_CONFIGS).map(c => (
                <a key={c.citySlug} href={`https://${c.domain}`} target="_blank" rel="noopener" style={{ display: 'block', padding: '16px 18px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, textDecoration: 'none', color: '#0F1923' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>{c.cityName}</span>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#DCFCE7', color: '#166534', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Live</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#1D4ED8', fontWeight: 600 }}>
                    {dentistCountByCity[c.citySlug] ?? 0} dentist{(dentistCountByCity[c.citySlug] ?? 0) === 1 ? '' : 's'} →
                  </div>
                </a>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              {/* Derived, not hardcoded — the old copy read "See all 63 cities"
                  as a literal, which goes stale the moment a city moves
                  between CITY_CONFIGS and COMING_SOON_CITIES. */}
              <Link href="/cities" style={{ color: '#1D4ED8', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                See all {liveCityCount + soonCityCount} cities →
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer style={{ background: '#0F1923', color: '#94A3B8', padding: '40px 20px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ maxWidth: 320 }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: '#fff', marginBottom: 8 }}>Dentist In India</div>
              <p style={{ fontSize: 13, lineHeight: 1.6 }}>India&apos;s verified dentist directory. Built by dental professionals.</p>
            </div>
            <div style={{ display: 'flex', gap: 32 }}>
              <FooterColumn title="Get started">
                <FooterLink href="/join">Claim your profile</FooterLink>
                <FooterLink href="/for-dentists/login">Sign in</FooterLink>
                <FooterLink href="/for-dentists">For dentists</FooterLink>
              </FooterColumn>
              <FooterColumn title="Company">
                <FooterLink href="/cities">Cities</FooterLink>
                <FooterLink href="/about">About</FooterLink>
              </FooterColumn>
            </div>
          </div>

          {/* Explore by City — reciprocal dofollow links back to each
              city domain. Inline row so the link juice stays compact
              rather than competing with the brand columns above. */}
          <div style={{ maxWidth: 1100, margin: '24px auto 0', paddingTop: 18, borderTop: '1px solid #1E293B' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
              Explore by City
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: 13, color: '#94A3B8' }}>
              {Object.values(CITY_CONFIGS).map((c, i) => (
                <span key={c.citySlug} style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <a href={`https://${c.domain}`} style={{ color: '#94A3B8', textDecoration: 'none' }}>{c.cityName}</a>
                  {i < Object.values(CITY_CONFIGS).length - 1 && <span aria-hidden="true" style={{ margin: '0 8px', color: '#475569' }}>|</span>}
                </span>
              ))}
            </div>
          </div>

          <div style={{ maxWidth: 1100, margin: '20px auto 0', paddingTop: 14, borderTop: '1px solid #1E293B', fontSize: 12, color: '#64748B' }}>
            © {new Date().getFullYear()} DentistIn. All rights reserved.
          </div>
        </footer>
      </div>
    </>
  )
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 8 }}>{children}</div>
}

function SectionHeadline({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 32, color: '#0F1923', textAlign: 'center', lineHeight: 1.2 }}>{children}</h2>
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  )
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} style={{ fontSize: 13, color: '#94A3B8', textDecoration: 'none' }}>{children}</Link>
}
