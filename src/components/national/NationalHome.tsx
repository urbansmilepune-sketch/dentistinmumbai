import Link from 'next/link'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { CITY_CONFIGS, NATIONAL_ORIGIN } from '@/config/cities'
import { COMING_SOON_CITIES } from '@/config/citiesNational'
import NationalMapSection from './NationalMapSection'
// Server-only projection of the India GeoJSON. Imported HERE (server
// component) so d3-geo + the GeoJSON stay out of the client bundle.
import { STATE_PATHS, LIVE_DOTS, SOON_DOTS } from './indiaMapData'

// National parent homepage. Server component — fetches everything the map
// + live counters need in a single Promise.all and hands them to the
// interactive island.
//
// Profile-views-this-month is read via the service-role client because
// analytics_events has restrictive RLS (the user-bound anon client returns
// 0 rows). Service-role is safe here: this page runs server-only and
// returns just a scalar count to the browser, never the raw events.

export const dynamic = 'force-dynamic'

// Hardcoded blog tile placeholders so the section renders something
// recognisable until the blog system ships. Slugs are the URL we'd
// pre-allocate when the posts go live.
const BLOG_PLACEHOLDERS = [
  { slug: 'how-to-choose-a-dentist-india', title: 'How to choose a verified dentist in India', excerpt: 'Six things every patient should check before booking — MCI registration, real reviews, and the questions that separate a good clinic from a great one.', tag: 'Patient Guide' },
  { slug: 'cost-of-dental-implants-india', title: 'What dental implants actually cost across India (2026)',  excerpt: 'City-by-city price ranges for single implants, full-mouth restorations, and All-on-4 — plus how to compare quotes without falling for upsells.', tag: 'Cost Guide' },
  { slug: 'dental-tourism-india-guide',    title: 'India is the world\'s smartest dental tourism destination', excerpt: 'How NRIs and international patients save 70-80% on world-class treatment, and the four cities best set up for medical-tourism stays.', tag: 'Dental Tourism' },
]

const TRUST_PILLARS = [
  { icon: '✓', label: 'Verified Dentists',    sub: 'MCI-registered only' },
  { icon: '₹', label: '0% Commission',        sub: 'You pay only the dentist' },
  { icon: '⚡', label: '30-Second Booking',    sub: 'Direct WhatsApp + calendar' },
  { icon: '🏥', label: 'MCI Registered Only', sub: 'Every clinic, verified' },
]

const PATIENT_STEPS = [
  { n: 1, title: 'Search your city',     body: 'Pick from 13 live cities or get notified when yours launches.' },
  { n: 2, title: 'Browse verified dentists', body: 'Real photos, real reviews, transparent fees — every listing is MCI-checked.' },
  { n: 3, title: 'Book in 30 seconds',   body: 'WhatsApp the clinic directly or pick a calendar slot. No middlemen.' },
]

const DENTIST_STEPS = [
  { n: 1, title: 'Register your clinic',     body: 'Five-minute signup. We verify your MCI number and you go live the same week.' },
  { n: 2, title: 'Own your local SEO',       body: 'Get listed on your city domain — dentistin[city].in — with a profile that ranks.' },
  { n: 3, title: 'Receive direct enquiries', body: 'Patients reach you on WhatsApp or your phone. Zero commission, ever.' },
]

export default async function NationalHome() {
  // analytics_events has RLS that blocks anon reads, so we use the service
  // role for this single count. The track route uses the same key for
  // writes — see src/app/api/analytics/track/route.ts.
  const adminClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Calendar-month start in UTC. Mirrors admin/page.tsx so "this month"
  // means the same window to both surfaces.
  const monthStart = new Date()
  monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0)
  const monthStartIso = monthStart.toISOString()

  const [
    { data: allDentistSlim },
    { count: totalDentistsRaw },
    { count: profileViewsRaw },
  ] = await Promise.all([
    adminClient.from('dentists').select('city, is_active'),
    adminClient.from('dentists').select('*', { count: 'exact', head: true }).eq('is_active', true),
    adminClient.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event_type', 'profile_view').gte('created_at', monthStartIso),
  ])

  const totalDentists = totalDentistsRaw || 0
  const profileViewsThisMonth = profileViewsRaw || 0

  // Aggregate active-dentist count per city slug for the map tooltip.
  const dentistCountByCity: { [slug: string]: number } = {}
  for (const d of (allDentistSlim || []) as Array<{ city: string | null; is_active: boolean | null }>) {
    if (!d.city || !d.is_active) continue
    dentistCountByCity[d.city] = (dentistCountByCity[d.city] || 0) + 1
  }

  const liveCityCount = Object.keys(CITY_CONFIGS).length
  const featuredCities = Object.values(CITY_CONFIGS)

  // JSON-LD payload bundled here so the schema lives next to the component
  // that owns its content. Three entities: the LLP, the website, and the
  // medical-organization umbrella that ties every city listing together.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${NATIONAL_ORIGIN}/#organization`,
        name: 'Dentaura Prime LLP',
        url: NATIONAL_ORIGIN,
        logo: `${NATIONAL_ORIGIN}/logo.png`,
        founder: { '@type': 'Person', name: 'Ashish' },
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Pune',
          addressRegion: 'Maharashtra',
          addressCountry: 'IN',
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${NATIONAL_ORIGIN}/#website`,
        name: 'Dentist In India',
        url: NATIONAL_ORIGIN,
        publisher: { '@id': `${NATIONAL_ORIGIN}/#organization` },
        inLanguage: 'en-IN',
      },
      {
        '@type': 'MedicalOrganization',
        '@id': `${NATIONAL_ORIGIN}/#medical-organization`,
        name: 'Dentist In India — National Dental Network',
        url: NATIONAL_ORIGIN,
        medicalSpecialty: 'Dentistry',
        areaServed: { '@type': 'Country', name: 'India' },
        memberOf: { '@id': `${NATIONAL_ORIGIN}/#organization` },
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div style={{ background: '#fff', color: '#0F1923', fontFamily: 'var(--font-body)' }}>
        {/* Nav */}
        <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '14px 20px' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Link href="/" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, color: '#0F1923', textDecoration: 'none' }}>
              Dentist<span style={{ color: '#1D4ED8' }}>InIndia</span>.in
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 14, fontWeight: 600 }}>
              <Link href="/cities"        style={{ color: '#475569', textDecoration: 'none' }}>Cities</Link>
              <Link href="/for-dentists"  style={{ color: '#475569', textDecoration: 'none' }}>For Dentists</Link>
              <Link
                href="/cities"
                style={{ padding: '8px 16px', background: '#1D4ED8', color: '#fff', borderRadius: 8, textDecoration: 'none' }}
              >Find a Dentist</Link>
            </div>
          </div>
        </nav>

        {/* Hero */}
        <section style={{ background: 'linear-gradient(180deg, #F8FAFC 0%, #fff 100%)', padding: '64px 20px 40px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ display: 'inline-block', background: '#EFF6FF', color: '#1D4ED8', padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, marginBottom: 18, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              National Dental Network
            </div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 48, lineHeight: 1.1, marginBottom: 16, color: '#0F1923' }}>
              India's Dental Network.<br />Every City. <span style={{ color: '#1D4ED8' }}>One Platform.</span>
            </h1>
            <p style={{ fontSize: 18, color: '#475569', maxWidth: 640, margin: '0 auto 28px', lineHeight: 1.55 }}>
              Verified dentists across {liveCityCount} live cities and {COMING_SOON_CITIES.length} more launching soon. Zero commission, MCI-registered only, 30-second booking.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Link href="/cities" style={{ padding: '14px 26px', minHeight: 48, background: '#1D4ED8', color: '#fff', borderRadius: 10, fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>
                Find a Dentist →
              </Link>
              <Link href="/for-dentists" style={{ padding: '14px 26px', minHeight: 48, background: '#fff', color: '#0F1923', borderRadius: 10, fontSize: 15, fontWeight: 700, textDecoration: 'none', border: '1.5px solid #0F1923' }}>
                List Your Clinic
              </Link>
            </div>
          </div>
        </section>

        {/* Map + counters */}
        <section style={{ padding: '20px 20px 60px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <NationalMapSection
              statePaths={STATE_PATHS}
              liveDots={LIVE_DOTS}
              soonDots={SOON_DOTS}
              dentistCountByCity={dentistCountByCity}
            />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 36, maxWidth: 880, marginLeft: 'auto', marginRight: 'auto' }}>
              <CounterCard value={totalDentists.toLocaleString('en-IN')} label="Dentists Listed" />
              <CounterCard value={liveCityCount.toString()}              label="Cities Live" />
              <CounterCard value={profileViewsThisMonth.toLocaleString('en-IN')} label="Profile Views This Month" />
            </div>
          </div>
        </section>

        {/* Trust bar */}
        <section style={{ background: '#0F1923', padding: '32px 20px', color: '#fff' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24 }}>
            {TRUST_PILLARS.map(p => (
              <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(59, 130, 246, 0.15)', color: '#60A5FA', fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {p.icon}
                </span>
                <div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14 }}>{p.label}</div>
                  <div style={{ fontSize: 12, color: '#94A3B8' }}>{p.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works — patients */}
        <section style={{ padding: '64px 20px 32px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <SectionEyebrow>For patients</SectionEyebrow>
            <SectionHeadline>How it works</SectionHeadline>
            <StepGrid steps={PATIENT_STEPS} accent="#1D4ED8" />
          </div>
        </section>

        {/* How it works — dentists */}
        <section style={{ padding: '32px 20px 64px', background: '#F8FAFC' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <SectionEyebrow>For dentists</SectionEyebrow>
            <SectionHeadline>List your clinic in 3 steps</SectionHeadline>
            <StepGrid steps={DENTIST_STEPS} accent="#166534" />
            <div style={{ textAlign: 'center', marginTop: 28 }}>
              <Link href="/for-dentists" style={{ padding: '12px 22px', minHeight: 44, background: '#0F1923', color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none', display: 'inline-block' }}>
                Register your clinic →
              </Link>
            </div>
          </div>
        </section>

        {/* Featured cities — 13 live */}
        <section style={{ padding: '64px 20px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <SectionEyebrow>Live in {liveCityCount} cities</SectionEyebrow>
            <SectionHeadline>Where you can find dentists today</SectionHeadline>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginTop: 28 }}>
              {featuredCities.map(c => (
                <a
                  key={c.citySlug}
                  href={`https://${c.domain}`}
                  target="_blank"
                  rel="noopener"
                  style={{
                    display: 'block', padding: '20px',
                    background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14,
                    textDecoration: 'none', color: '#0F1923',
                    boxShadow: '0 2px 6px rgba(15, 25, 35, 0.04)',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17 }}>{c.cityName}</span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#DCFCE7', color: '#166534', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Live</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', marginBottom: 8 }}>{c.state}</div>
                  <div style={{ fontSize: 13, color: '#1D4ED8', fontWeight: 600 }}>
                    {dentistCountByCity[c.citySlug] ?? 0} dentist{(dentistCountByCity[c.citySlug] ?? 0) === 1 ? '' : 's'} →
                  </div>
                </a>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 28 }}>
              <Link href="/cities" style={{ color: '#1D4ED8', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                See all 63 cities →
              </Link>
            </div>
          </div>
        </section>

        {/* Blog preview */}
        <section style={{ padding: '32px 20px 64px', background: '#F8FAFC' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <SectionEyebrow>Dental health journal</SectionEyebrow>
            <SectionHeadline>What to read next</SectionHeadline>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, marginTop: 28 }}>
              {BLOG_PLACEHOLDERS.map(p => (
                <article key={p.slug} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#1D4ED8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{p.tag}</span>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, lineHeight: 1.3, color: '#0F1923', marginTop: 8, marginBottom: 10 }}>{p.title}</h3>
                  <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.55 }}>{p.excerpt}</p>
                  <div style={{ marginTop: 14, fontSize: 12, color: '#94A3B8', fontWeight: 600 }}>Coming soon</div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer style={{ background: '#0F1923', color: '#94A3B8', padding: '40px 20px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ maxWidth: 320 }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: '#fff', marginBottom: 8 }}>
                Dentist In India
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.6 }}>
                Verified dentists across every Indian city. Built by Dentaura Prime LLP, Pune.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 32 }}>
              <FooterColumn title="Patients">
                <FooterLink href="/cities">Find a dentist</FooterLink>
              </FooterColumn>
              <FooterColumn title="Dentists">
                <FooterLink href="/for-dentists">List your clinic</FooterLink>
              </FooterColumn>
            </div>
          </div>
          <div style={{ maxWidth: 1100, margin: '24px auto 0', paddingTop: 18, borderTop: '1px solid #1E293B', fontSize: 12, color: '#64748B' }}>
            © {new Date().getFullYear()} Dentaura Prime LLP · Pune, India
          </div>
        </footer>
      </div>
    </>
  )
}

function CounterCard({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '22px 24px', textAlign: 'center', boxShadow: '0 2px 6px rgba(15, 25, 35, 0.04)' }}>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 36, color: '#1D4ED8', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, color: '#64748B', marginTop: 8, fontWeight: 600 }}>{label}</div>
    </div>
  )
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 8 }}>
      {children}
    </div>
  )
}

function SectionHeadline({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 32, color: '#0F1923', textAlign: 'center', lineHeight: 1.2 }}>
      {children}
    </h2>
  )
}

function StepGrid({ steps, accent }: { steps: { n: number; title: string; body: string }[]; accent: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24, marginTop: 32 }}>
      {steps.map(s => (
        <div key={s.n} style={{ position: 'relative', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '24px 22px' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: accent, color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            {s.n}
          </div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, color: '#0F1923', marginBottom: 6 }}>{s.title}</h3>
          <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6 }}>{s.body}</p>
        </div>
      ))}
    </div>
  )
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
