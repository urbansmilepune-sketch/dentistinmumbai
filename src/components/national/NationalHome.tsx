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

// National parent homepage — re-positioned as India's professional
// network for dentists (LinkedIn + Instagram + Facebook shape, not a
// patient directory). The shape we render varies subtly for signed-in
// vs signed-out viewers — signed-in dentists see a CTA to their feed
// instead of the generic "Join the Network" pitch.

export const dynamic = 'force-dynamic'

const DENTIST_STEPS = [
  { n: 1, title: 'Join in 5 minutes',         body: 'Create your verified profile. State Dental Council registration + city + clinic name — that\'s it.' },
  { n: 2, title: 'Share your clinical cases', body: 'Post before/after photos, x-rays, treatment write-ups. Auto-approved after your first three.' },
  { n: 3, title: 'Build your network',        body: 'Follow peers, get followed, take part in case discussions. Featured on dentistin[city].in too.' },
]

interface TopDentist {
  id: string
  slug: string
  name: string
  city: string | null
  specialties: string[] | null
  profile_photo: string | null
  follower_count: number
  case_count: number
}

export default async function NationalHome() {
  const adminClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Auth lookup — used to swap the hero CTAs for "View My Feed" when a
  // dentist is signed in, and to blur the feed-preview cards when they
  // aren't.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const signedIn = !!user?.email

  const [
    { data: allDentistSlim },
    { count: totalDentistsRaw },
    { count: totalCasesRaw },
    { data: followsRaw },
    { data: dentistDirRaw },
  ] = await Promise.all([
    adminClient.from('dentists').select('city, is_active'),
    adminClient.from('dentists').select('*', { count: 'exact', head: true }).eq('is_active', true),
    adminClient.from('cases').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    // Every dentist_follows row so we can derive top-6-by-followers.
    // At platform scale this is < 10k rows — cheap to fetch once.
    adminClient.from('dentist_follows').select('following_id'),
    adminClient.from('dentists').select('id, slug, name, city, specialties, profile_photo').eq('is_active', true).limit(2000),
  ])

  const totalDentists = totalDentistsRaw || 0
  const totalCases    = totalCasesRaw || 0
  const liveCityCount = Object.keys(CITY_CONFIGS).length

  // Per-city aggregate for the map tooltip.
  const dentistCountByCity: { [slug: string]: number } = {}
  for (const d of (allDentistSlim || []) as Array<{ city: string | null; is_active: boolean | null }>) {
    if (!d.city || !d.is_active) continue
    dentistCountByCity[d.city] = (dentistCountByCity[d.city] || 0) + 1
  }

  // Top 6 dentists by follower count, tie-break by name. Aggregate
  // JS-side from the dentist_follows fetch above.
  const followerCountById = new Map<string, number>()
  for (const f of (followsRaw || []) as Array<{ following_id: string }>) {
    followerCountById.set(f.following_id, (followerCountById.get(f.following_id) || 0) + 1)
  }
  const topDentistsBase = (dentistDirRaw || [])
    .map((d: any) => ({
      id: d.id as string, slug: d.slug as string, name: d.name as string, city: (d.city ?? null) as string | null,
      specialties: (d.specialties ?? null) as string[] | null,
      profile_photo: (d.profile_photo ?? null) as string | null,
      follower_count: followerCountById.get(d.id) || 0,
    }))
    .sort((a, b) => b.follower_count - a.follower_count || a.name.localeCompare(b.name))
    .slice(0, 6)

  // Case counts for just the top-6 — one round-trip, JS-side reduce.
  const topIds = topDentistsBase.map(d => d.id)
  const caseCountById = new Map<string, number>()
  if (topIds.length) {
    const { data: caseRows } = await adminClient
      .from('cases').select('dentist_id').in('dentist_id', topIds).eq('status', 'approved')
    for (const c of (caseRows || []) as Array<{ dentist_id: string }>) {
      caseCountById.set(c.dentist_id, (caseCountById.get(c.dentist_id) || 0) + 1)
    }
  }
  const topDentists: TopDentist[] = topDentistsBase.map(d => ({
    ...d, case_count: caseCountById.get(d.id) || 0,
  }))

  // JSON-LD — organisation reframed as a ProfessionalService for the
  // dental community, on top of the original WebSite + MedicalOrganization.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${NATIONAL_ORIGIN}/#organization`, name: 'DentistIn', url: NATIONAL_ORIGIN, logo: `${NATIONAL_ORIGIN}/logo-india.webp`, address: { '@type': 'PostalAddress', addressCountry: 'IN' } },
      { '@type': 'WebSite', '@id': `${NATIONAL_ORIGIN}/#website`, name: 'Dentist In India', url: NATIONAL_ORIGIN, publisher: { '@id': `${NATIONAL_ORIGIN}/#organization` }, inLanguage: 'en-IN' },
      { '@type': 'MedicalOrganization', '@id': `${NATIONAL_ORIGIN}/#medical-organization`, name: 'Dentist In India — National Dental Professional Network', url: NATIONAL_ORIGIN, medicalSpecialty: 'Dentistry', areaServed: { '@type': 'Country', name: 'India' }, memberOf: { '@id': `${NATIONAL_ORIGIN}/#organization` } },
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
              <Link href="/dentists"     style={{ color: '#475569', textDecoration: 'none' }}>Dentists</Link>
              <Link href="/cities"       style={{ color: '#475569', textDecoration: 'none' }}>Cities</Link>
              <Link href="/insights"     style={{ color: '#475569', textDecoration: 'none' }}>Dental Insights</Link>
              {signedIn && <Link href="/feed" style={{ color: '#1D4ED8', textDecoration: 'none', fontWeight: 700 }}>My Feed</Link>}
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
                  <Link href="/join" style={{ padding: '8px 16px', background: '#1D4ED8', color: '#fff', borderRadius: 8, textDecoration: 'none' }}>Join Free →</Link>
                </>
              )}
            </div>
          </div>
        </nav>

        {/* Hero */}
        <section style={{ padding: '72px 20px 32px', background: 'linear-gradient(180deg, #F8FAFC 0%, #fff 100%)' }}>
          <div style={{ maxWidth: 980, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ marginBottom: 22, display: 'flex', justifyContent: 'center' }}>
              <BrandLogo height={64} fontSize={28} />
            </div>
            <div style={{ display: 'inline-block', background: '#EFF6FF', color: '#1D4ED8', padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, marginBottom: 18, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              For dental professionals
            </div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 52, lineHeight: 1.08, marginBottom: 18, color: '#0F1923' }}>
              India's Professional Network <br /><span style={{ color: '#1D4ED8' }}>for Dentists</span>
            </h1>
            <p style={{ fontSize: 18, color: '#475569', maxWidth: 680, margin: '0 auto 28px', lineHeight: 1.55 }}>
              Connect with verified dental professionals across {liveCityCount} cities. Share clinical cases. Learn from peers. Grow your practice.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
              {signedIn ? (
                <>
                  <Link href="/feed" style={{ padding: '14px 26px', minHeight: 48, background: '#1D4ED8', color: '#fff', borderRadius: 10, fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>
                    My Feed →
                  </Link>
                  <Link href="/cases/new" style={{ padding: '14px 26px', minHeight: 48, background: '#fff', color: '#0F1923', borderRadius: 10, fontSize: 15, fontWeight: 700, textDecoration: 'none', border: '1.5px solid #0F1923' }}>
                    Post a Case
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/join" style={{ padding: '14px 26px', minHeight: 48, background: '#1D4ED8', color: '#fff', borderRadius: 10, fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>
                    Join the Network →
                  </Link>
                  <Link href="/cases" style={{ padding: '14px 26px', minHeight: 48, background: '#fff', color: '#0F1923', borderRadius: 10, fontSize: 15, fontWeight: 700, textDecoration: 'none', border: '1.5px solid #0F1923' }}>
                    Browse Cases
                  </Link>
                </>
              )}
            </div>
            {!signedIn && (
              <div style={{ marginTop: 18, fontSize: 14, color: '#64748B' }}>
                Already a member?{' '}
                <Link href="/login" style={{ color: '#1D4ED8', fontWeight: 700, textDecoration: 'none' }}>Sign in →</Link>
              </div>
            )}
          </div>
        </section>

        {/* Stat strip */}
        <section style={{ padding: '20px' }}>
          <div style={{ maxWidth: 880, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <CounterCard value={totalDentists.toLocaleString('en-IN')} label="Dentists" />
            <CounterCard value={totalCases.toLocaleString('en-IN')}    label="Cases Shared" />
            <CounterCard value={liveCityCount.toString()}              label="Cities" />
          </div>
        </section>

        {/* Map */}
        <section style={{ padding: '32px 20px 56px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <NationalMapSection
              statePaths={STATE_PATHS}
              liveDots={LIVE_DOTS}
              soonDots={SOON_DOTS}
              dentistCountByCity={dentistCountByCity}
            />
          </div>
        </section>

        {/* Top dentists — the homepage's main "who's on the network"
            surface. Replaces the older recent-cases preview: cases live
            on each dentist's profile, so the homepage routes there
            instead of showcasing case rows on their own. */}
        {topDentists.length > 0 && (
          <section style={{ padding: '24px 20px 64px', background: '#F8FAFC' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto' }}>
              <SectionEyebrow>Top dental professionals</SectionEyebrow>
              <SectionHeadline>Most-followed on the network</SectionHeadline>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 28 }}>
                {topDentists.map(d => {
                  const cfg = d.city ? (CITY_CONFIGS as any)[d.city] : null
                  const initials = d.name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
                  const primarySpecialty = (d.specialties && d.specialties[0]) || null
                  return (
                    <Link key={d.id} href={`/professional/${d.slug}`} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, textDecoration: 'none', color: '#0F1923' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#EFF6FF', color: '#1D4ED8', fontWeight: 800, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                          {d.profile_photo ? <img src={d.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Dr. {d.name}</div>
                          {primarySpecialty && <div style={{ fontSize: 12, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{primarySpecialty}</div>}
                          {cfg && <div style={{ fontSize: 12, color: '#94A3B8' }}>{cfg.cityName}</div>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #F1F5F9', paddingTop: 12, fontSize: 12, color: '#64748B', fontWeight: 600 }}>
                        <span>{d.case_count} case{d.case_count === 1 ? '' : 's'}</span>
                        <span>{d.follower_count} follower{d.follower_count === 1 ? '' : 's'}</span>
                      </div>
                      <span style={{ fontSize: 13, color: '#1D4ED8', fontWeight: 700, marginTop: -2 }}>View Profile →</span>
                    </Link>
                  )
                })}
              </div>
              <div style={{ textAlign: 'center', marginTop: 28 }}>
                <Link href="/dentists" style={{ fontSize: 13, color: '#1D4ED8', fontWeight: 700, textDecoration: 'none' }}>Discover all dentists →</Link>
              </div>
            </div>
          </section>
        )}

        {/* How it works — dentists */}
        <section style={{ padding: '40px 20px 64px', background: '#F8FAFC' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <SectionEyebrow>How it works</SectionEyebrow>
            <SectionHeadline>Three steps to join the network</SectionHeadline>
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
            <div style={{ textAlign: 'center', marginTop: 28 }}>
              {!signedIn && (
                <Link href="/join" style={{ padding: '12px 24px', minHeight: 44, background: '#0F1923', color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none', display: 'inline-block' }}>
                  Join the network — it's free →
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* Featured cities — patient-facing CTA secondary to the
            professional network framing, but still useful: every city
            has a directory and the network is rooted there. */}
        <section style={{ padding: '64px 20px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <SectionEyebrow>Network presence</SectionEyebrow>
            <SectionHeadline>Live in {liveCityCount} cities, {COMING_SOON_CITIES.length} more coming</SectionHeadline>
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
              <Link href="/cities" style={{ color: '#1D4ED8', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>See all 63 cities →</Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer style={{ background: '#0F1923', color: '#94A3B8', padding: '40px 20px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ maxWidth: 320 }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: '#fff', marginBottom: 8 }}>Dentist In India</div>
              <p style={{ fontSize: 13, lineHeight: 1.6 }}>India's professional network for dentists. Built by dental professionals.</p>
            </div>
            <div style={{ display: 'flex', gap: 32 }}>
              <FooterColumn title="Network">
                <FooterLink href="/cases">Browse cases</FooterLink>
                <FooterLink href="/dentists">Discover dentists</FooterLink>
                <FooterLink href="/cities">Cities</FooterLink>
              </FooterColumn>
              <FooterColumn title="Get started">
                <FooterLink href="/join">Join the network</FooterLink>
                <FooterLink href="/for-dentists/login">Sign in</FooterLink>
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

function CounterCard({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '22px 24px', textAlign: 'center', boxShadow: '0 2px 6px rgba(15, 25, 35, 0.04)' }}>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 36, color: '#1D4ED8', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, color: '#64748B', marginTop: 8, fontWeight: 600 }}>{label}</div>
    </div>
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
