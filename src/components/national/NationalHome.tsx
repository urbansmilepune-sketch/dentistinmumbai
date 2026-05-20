import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { CITY_CONFIGS, NATIONAL_ORIGIN } from '@/config/cities'
import { COMING_SOON_CITIES } from '@/config/citiesNational'
import NationalMapSection from './NationalMapSection'
// Server-only projection of the India GeoJSON. Imported HERE (server
// component) so d3-geo + the GeoJSON stay out of the client bundle.
import { STATE_PATHS, LIVE_DOTS, SOON_DOTS } from './indiaMapData'
import { getSpecialty } from '@/lib/dentalSpecialties'
import BrandLogo from './BrandLogo'

// National parent homepage — re-positioned as India's professional
// network for dentists (LinkedIn + Instagram + Facebook shape, not a
// patient directory). The shape we render varies subtly for signed-in
// vs signed-out viewers — signed-in dentists see a CTA to their feed
// instead of the generic "Join the Network" pitch.

export const dynamic = 'force-dynamic'

const DENTIST_STEPS = [
  { n: 1, title: 'Join in 5 minutes',         body: 'Create your verified profile. MCI registration + city + clinic name — that\'s it.' },
  { n: 2, title: 'Share your clinical cases', body: 'Post before/after photos, x-rays, treatment write-ups. Auto-approved after your first three.' },
  { n: 3, title: 'Build your network',        body: 'Follow peers, get followed, take part in case discussions. Featured on dentistin[city].in too.' },
]

interface RecentCase {
  id: string
  title: string
  specialty: string
  complexity: number
  thumb: string | null
  dentist: { name: string; slug: string; city: string | null } | null
}

interface TopDentist {
  id: string
  slug: string
  name: string
  city: string | null
  profile_photo: string | null
  follower_count: number
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
    { data: recentRows },
    { data: followsRaw },
    { data: dentistDirRaw },
  ] = await Promise.all([
    adminClient.from('dentists').select('city, is_active'),
    adminClient.from('dentists').select('*', { count: 'exact', head: true }).eq('is_active', true),
    adminClient.from('cases').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    // 3 most recent approved cases for the live feed preview
    adminClient.from('cases')
      .select('id, title, specialty, complexity, created_at, dentists(name, slug, city)')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(3),
    // Every dentist_follows row so we can derive top-3-by-followers.
    // At platform scale this is < 10k rows — cheap to fetch once.
    adminClient.from('dentist_follows').select('following_id'),
    adminClient.from('dentists').select('id, slug, name, city, profile_photo').eq('is_active', true).limit(2000),
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

  // Top 3 dentists by follower count. Aggregate JS-side from the
  // dentist_follows fetch above; cap at 3.
  const followerCountById = new Map<string, number>()
  for (const f of (followsRaw || []) as Array<{ following_id: string }>) {
    followerCountById.set(f.following_id, (followerCountById.get(f.following_id) || 0) + 1)
  }
  const topDentists: TopDentist[] = (dentistDirRaw || [])
    .map((d: any) => ({
      id: d.id, slug: d.slug, name: d.name, city: d.city,
      profile_photo: d.profile_photo,
      follower_count: followerCountById.get(d.id) || 0,
    }))
    .sort((a, b) => b.follower_count - a.follower_count || a.name.localeCompare(b.name))
    .slice(0, 3)

  // Thumbnails for the recent-case feed preview cards.
  const recentIds = (recentRows || []).map((r: any) => r.id as string)
  const thumbs = new Map<string, string>()
  if (recentIds.length) {
    const { data: photos } = await adminClient
      .from('case_photos').select('case_id, url, kind, display_order')
      .in('case_id', recentIds).order('display_order')
    for (const p of (photos || []) as Array<{ case_id: string; url: string; kind: string }>) {
      if (!thumbs.has(p.case_id) || p.kind === 'before' || p.kind === 'after') {
        thumbs.set(p.case_id, p.url)
      }
    }
  }
  const recentCases: RecentCase[] = (recentRows || []).map((r: any) => ({
    id: r.id, title: r.title, specialty: r.specialty, complexity: r.complexity,
    thumb: thumbs.get(r.id) ?? null,
    dentist: r.dentists,
  }))

  // JSON-LD — organisation reframed as a ProfessionalService for the
  // dental community, on top of the original WebSite + MedicalOrganization.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${NATIONAL_ORIGIN}/#organization`, name: 'DentistIn', url: NATIONAL_ORIGIN, logo: `${NATIONAL_ORIGIN}/logo.png`, address: { '@type': 'PostalAddress', addressCountry: 'IN' } },
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
              <Link href="/cases"        style={{ color: '#475569', textDecoration: 'none' }}>Cases</Link>
              <Link href="/dentists"     style={{ color: '#475569', textDecoration: 'none' }}>Dentists</Link>
              <Link href="/cities"       style={{ color: '#475569', textDecoration: 'none' }}>Cities</Link>
              {signedIn && <Link href="/feed" style={{ color: '#1D4ED8', textDecoration: 'none', fontWeight: 700 }}>My Feed</Link>}
              {signedIn
                ? <Link href="/professional/me" style={{ padding: '8px 16px', background: '#0F1923', color: '#fff', borderRadius: 8, textDecoration: 'none' }}>My Profile</Link>
                : <Link href="/join" style={{ padding: '8px 16px', background: '#1D4ED8', color: '#fff', borderRadius: 8, textDecoration: 'none' }}>Join the Network</Link>}
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

        {/* Feed preview — recent cases. Blurred for logged-out viewers
            as a teaser with a Join CTA layered on top. */}
        {recentCases.length > 0 && (
          <section style={{ padding: '24px 20px 64px', background: '#F8FAFC', position: 'relative' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto' }}>
              <SectionEyebrow>{signedIn ? 'Latest from the network' : 'Live from the feed'}</SectionEyebrow>
              <SectionHeadline>Clinical cases shared this week</SectionHeadline>
              <div style={{ position: 'relative', marginTop: 28 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, filter: signedIn ? 'none' : 'blur(3.5px)', pointerEvents: signedIn ? 'auto' : 'none' }}>
                  {recentCases.map(c => {
                    const spec = getSpecialty(c.specialty)
                    const cfg = c.dentist?.city ? (CITY_CONFIGS as any)[c.dentist.city] : null
                    return (
                      <Link key={c.id} href={`/cases/${c.id}`} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden', textDecoration: 'none', color: '#0F1923' }}>
                        <div style={{ width: '100%', aspectRatio: '16 / 9', background: '#F1F5F9', overflow: 'hidden' }}>
                          {c.thumb ? <img src={c.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: '#CBD5E1' }}>🦷</div>}
                        </div>
                        <div style={{ padding: '14px 18px' }}>
                          {spec && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '2px 8px', background: spec.bg, color: spec.color, borderRadius: 999 }}>{spec.label}</span>}
                          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: '#0F1923', marginTop: 6, lineHeight: 1.35 }}>{c.title}</h3>
                          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 8 }}>
                            {c.dentist?.name ? `Dr. ${c.dentist.name}` : ''}{cfg ? ' · ' + cfg.cityName : ''}
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
                {!signedIn && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: 'rgba(255,255,255,0.96)', border: '1px solid #E2E8F0', borderRadius: 14, padding: '28px 32px', textAlign: 'center', boxShadow: '0 12px 32px rgba(15,25,35,0.08)', maxWidth: 460 }}>
                      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: '#0F1923', marginBottom: 6 }}>
                        Sign in to see the full feed
                      </div>
                      <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.55, marginBottom: 16 }}>
                        Cases from India's top dental professionals. Free to join.
                      </p>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <Link href="/join" style={{ padding: '10px 20px', background: '#1D4ED8', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Join Free →</Link>
                        <Link href="/for-dentists/login" style={{ padding: '10px 20px', background: '#fff', color: '#0F1923', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Sign in</Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Top dentists */}
        {topDentists.length > 0 && (
          <section style={{ padding: '64px 20px 32px' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto' }}>
              <SectionEyebrow>Top dental professionals</SectionEyebrow>
              <SectionHeadline>Most-followed on the network</SectionHeadline>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 28 }}>
                {topDentists.map(d => {
                  const cfg = d.city ? (CITY_CONFIGS as any)[d.city] : null
                  const initials = d.name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
                  return (
                    <Link key={d.id} href={`/professional/${d.slug}`} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20, display: 'flex', gap: 12, alignItems: 'center', textDecoration: 'none', color: '#0F1923' }}>
                      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#EFF6FF', color: '#1D4ED8', fontWeight: 800, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                        {d.profile_photo ? <img src={d.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15 }}>Dr. {d.name}</div>
                        {cfg && <div style={{ fontSize: 12, color: '#64748B' }}>{cfg.cityName}</div>}
                        <div style={{ fontSize: 12, color: '#1D4ED8', fontWeight: 700, marginTop: 4 }}>{d.follower_count} follower{d.follower_count === 1 ? '' : 's'}</div>
                      </div>
                    </Link>
                  )
                })}
              </div>
              <div style={{ textAlign: 'center', marginTop: 24 }}>
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
          <div style={{ maxWidth: 1100, margin: '24px auto 0', paddingTop: 18, borderTop: '1px solid #1E293B', fontSize: 12, color: '#64748B' }}>
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
