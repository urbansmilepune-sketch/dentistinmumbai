import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { CITY_CONFIGS, NATIONAL_ORIGIN } from '@/config/cities'
import { getSpecialty } from '@/lib/dentalSpecialties'
import BrandLogo from './BrandLogo'

// National parent homepage.
//
// The product's core value is peer recognition and clinical discussion
// between dentists: you publish a case, dentists who understand the work
// review it, and your reputation comes from that. Not a social feed —
// there are no likes, no saves, no follower counts anywhere, and those
// stay gone deliberately. Vendor/lab discovery is a small secondary
// utility and appears exactly once, in the footer.
//
// Nothing on this page invents a number. The peer-reviewed rail renders
// real cases with real review counts or an honest empty state; the
// profile card shows the signed-in dentist's own totals or a labelled
// template. There is no endorsement mechanism in the schema, so that
// stat is not shown at all rather than hard-coded to zero.

export const dynamic = 'force-dynamic'

const STEPS = [
  {
    n: 1,
    title: 'Claim your profile',
    body: 'Your State Dental Council registration confirms you are who you say you are. Nobody reviews anonymously.',
  },
  {
    n: 2,
    title: 'Share a case',
    body: 'Photos, radiographs, what you planned and what actually happened — including the parts that did not go to plan.',
  },
  {
    n: 3,
    title: 'Build reputation',
    body: 'Colleagues who work in your field read it and respond. Recognition comes from the quality of the work, not a follower count.',
  },
]

interface PeerCase {
  id: string
  title: string
  specialty: string
  note: string | null
  reviewCount: number
  thumb: string | null
  dentistName: string
  dentistSpecialty: string | null
  dentistCity: string | null
  dentistVerified: boolean
}

export default async function NationalHome() {
  const adminClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const signedIn = !!user?.email

  // ── Peer-reviewed cases rail ────────────────────────────────────────
  // Only cases that have actually been reviewed. cases.comment_count is
  // recomputed by count(*) on every comment POST and DELETE (see
  // /api/cases/[id]/comments), so it's trustworthy as a review count.
  // If nothing has been reviewed yet the section renders an honest empty
  // state rather than padding the rail with unreviewed cases under a
  // "peer-reviewed" heading.
  const { data: caseRows } = await adminClient
    .from('cases')
    .select('id, title, specialty, description, comment_count, dentists(name, city, specialties, is_verified)')
    .eq('status', 'approved')
    .gt('comment_count', 0)
    .order('comment_count', { ascending: false })
    .limit(3)

  const caseIds = (caseRows || []).map((c: any) => c.id as string)
  const thumbs = new Map<string, string>()
  if (caseIds.length) {
    const { data: photos } = await adminClient
      .from('case_photos')
      .select('case_id, url, kind, display_order')
      .in('case_id', caseIds)
      .order('display_order')
    for (const p of (photos || []) as Array<{ case_id: string; url: string; kind: string }>) {
      // Prefer a clinical before/after frame; otherwise first photo wins.
      if (!thumbs.has(p.case_id) || p.kind === 'before' || p.kind === 'after') {
        thumbs.set(p.case_id, p.url)
      }
    }
  }

  const peerCases: PeerCase[] = (caseRows || []).map((c: any) => ({
    id: c.id,
    title: c.title,
    specialty: c.specialty,
    note: c.description ?? null,
    reviewCount: c.comment_count ?? 0,
    thumb: thumbs.get(c.id) ?? null,
    dentistName: c.dentists?.name ?? 'A verified dentist',
    dentistSpecialty: c.dentists?.specialties?.[0] ?? getSpecialty(c.specialty)?.label ?? null,
    dentistCity: c.dentists?.city ?? null,
    dentistVerified: !!c.dentists?.is_verified,
  }))

  // ── Verified-profile card ───────────────────────────────────────────
  // Signed in: the viewer's own real totals. Signed out: a labelled
  // template with em-dashes — the shape of a profile, not invented data.
  let myName: string | null = null
  let myVerified = false
  let myCases = 0
  let myReviews = 0
  if (user?.email) {
    const { data: me } = await adminClient
      .from('dentists').select('id, name, is_verified').eq('email', user.email).maybeSingle()
    if (me) {
      myName = (me as any).name
      myVerified = !!(me as any).is_verified
      const [{ count: cCount }, { count: rCount }] = await Promise.all([
        adminClient.from('cases').select('*', { count: 'exact', head: true })
          .eq('dentist_id', (me as any).id).eq('status', 'approved'),
        adminClient.from('case_comments').select('*', { count: 'exact', head: true })
          .eq('dentist_id', (me as any).id),
      ])
      myCases = cCount ?? 0
      myReviews = rCount ?? 0
    }
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${NATIONAL_ORIGIN}/#organization`, name: 'DentistIn', url: NATIONAL_ORIGIN, logo: `${NATIONAL_ORIGIN}/logo-india.webp`, address: { '@type': 'PostalAddress', addressCountry: 'IN' } },
      { '@type': 'WebSite', '@id': `${NATIONAL_ORIGIN}/#website`, name: 'Dentist In India', url: NATIONAL_ORIGIN, publisher: { '@id': `${NATIONAL_ORIGIN}/#organization` }, inLanguage: 'en-IN' },
      { '@type': 'MedicalOrganization', '@id': `${NATIONAL_ORIGIN}/#medical-organization`, name: 'Dentist In India — Clinical Case Review for Dentists', url: NATIONAL_ORIGIN, medicalSpecialty: 'Dentistry', areaServed: { '@type': 'Country', name: 'India' }, memberOf: { '@id': `${NATIONAL_ORIGIN}/#organization` } },
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 14, fontWeight: 600, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {/* No standalone case index exists — /cases was deleted in the
                  social-layer freeze and stays deleted. This anchors to the
                  peer-reviewed rail below until there's a real destination. */}
              <a href="#peer-reviewed" style={{ color: '#475569', textDecoration: 'none' }}>Case discussions</a>
              <Link href="/dentists" style={{ color: '#475569', textDecoration: 'none' }}>Find dentists</Link>
              <Link href="/insights" style={{ color: '#475569', textDecoration: 'none' }}>Dental insights</Link>
              {signedIn ? (
                <>
                  <Link href="/professional/me" style={{ padding: '8px 16px', background: '#0F1923', color: '#fff', borderRadius: 8, textDecoration: 'none' }}>My profile</Link>
                  <form action="/auth/signout" method="post" style={{ margin: 0 }}>
                    <button type="submit" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit', fontSize: 14, fontWeight: 600, color: '#475569' }}>
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" style={{ color: '#475569', textDecoration: 'none' }}>Sign in</Link>
                  <Link href="/join" style={{ padding: '8px 16px', background: '#1D4ED8', color: '#fff', borderRadius: 8, textDecoration: 'none' }}>Claim your profile</Link>
                </>
              )}
            </div>
          </div>
        </nav>

        {/* Hero */}
        <section style={{ padding: '80px 20px 72px', background: 'linear-gradient(180deg, #F8FAFC 0%, #fff 100%)' }}>
          <div style={{ maxWidth: 1060, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 48, alignItems: 'center' }}>
            <div>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 46, lineHeight: 1.12, marginBottom: 20, color: '#0F1923' }}>
                Your clinical work, reviewed by <span style={{ color: '#1D4ED8' }}>dentists who understand it.</span>
              </h1>
              <p style={{ fontSize: 17.5, color: '#475569', lineHeight: 1.6, marginBottom: 30, maxWidth: 480 }}>
                Publish a case. Get considered feedback from verified colleagues in your field. Build a
                reputation on the quality of your work.
              </p>
              <Link href="/join" style={{ display: 'inline-block', padding: '15px 28px', minHeight: 50, background: '#1D4ED8', color: '#fff', borderRadius: 10, fontSize: 15.5, fontWeight: 700, textDecoration: 'none' }}>
                Claim your profile — it&apos;s free
              </Link>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <HeroIllustration />
            </div>
          </div>
        </section>

        {/* Peer-reviewed cases */}
        <section id="peer-reviewed" style={{ padding: '64px 20px', background: '#F8FAFC', scrollMarginTop: 72 }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <SectionEyebrow>Peer-reviewed cases</SectionEyebrow>
            <SectionHeadline>Real cases, read by people who do the work</SectionHeadline>

            {peerCases.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginTop: 34 }}>
                {peerCases.map(c => {
                  const cityCfg = c.dentistCity ? (CITY_CONFIGS as any)[c.dentistCity] : null
                  const initials = c.dentistName.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
                  return (
                    <Link key={c.id} href={`/cases/${c.id}`} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, overflow: 'hidden', textDecoration: 'none', color: '#0F1923', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ height: 168, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {c.thumb
                          ? <img src={c.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ fontSize: 34 }}>🦷</span>}
                      </div>
                      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16.5, lineHeight: 1.35 }}>{c.title}</h3>
                        {c.note && (
                          <p style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.6, margin: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {c.note}
                          </p>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto', paddingTop: 12, borderTop: '1px solid #F1F5F9' }}>
                          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#EFF6FF', color: '#1D4ED8', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {initials}
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Dr. {c.dentistName}</span>
                              {c.dentistVerified && <span title="State Dental Council-verified" style={{ color: '#166534', fontSize: 12 }}>✓</span>}
                            </div>
                            <div style={{ fontSize: 11.5, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {[c.dentistSpecialty, cityCfg?.cityName].filter(Boolean).join(' · ')}
                            </div>
                          </div>
                        </div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1D4ED8' }}>
                          {c.reviewCount} peer review{c.reviewCount === 1 ? '' : 's'} →
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            ) : (
              // Structurally ready, deliberately empty. The rail switches on by
              // itself the moment a case receives its first review — no number
              // here is invented in the meantime.
              <div style={{ marginTop: 32, background: '#fff', border: '1px dashed #CBD5E1', borderRadius: 16, padding: '40px 28px', textAlign: 'center' }}>
                <p style={{ fontSize: 15.5, color: '#475569', lineHeight: 1.6, margin: '0 0 8px' }}>
                  No cases have been peer-reviewed yet.
                </p>
                <p style={{ fontSize: 14, color: '#94A3B8', lineHeight: 1.6, margin: '0 0 22px' }}>
                  The first reviewed cases will appear here. Yours could be one of them.
                </p>
                <Link href="/join" style={{ display: 'inline-block', padding: '12px 24px', minHeight: 44, background: '#0F1923', color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
                  Claim your profile
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Verified profile */}
        <section style={{ padding: '64px 20px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 44, alignItems: 'center' }}>
            <div>
              <SectionEyebrow align="left">Verified profile</SectionEyebrow>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 30, color: '#0F1923', lineHeight: 1.22, marginBottom: 14 }}>
                A profile that stands for something
              </h2>
              <p style={{ fontSize: 16, color: '#475569', lineHeight: 1.65, marginBottom: 18 }}>
                Every profile is tied to a State Dental Council registration, so a review carries the
                weight of the person who wrote it. What accumulates is a record of your clinical work
                and the discussion around it.
              </p>
              <Link href={signedIn ? '/professional/me' : '/join'} style={{ fontSize: 14.5, fontWeight: 700, color: '#1D4ED8', textDecoration: 'none' }}>
                {signedIn ? 'View my profile →' : 'Claim your profile →'}
              </Link>
            </div>

            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 18, padding: 26, boxShadow: '0 6px 20px rgba(15, 25, 35, 0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#EFF6FF', color: '#1D4ED8', fontWeight: 800, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {myName ? myName.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() : '🦷'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {myName ? `Dr. ${myName}` : 'Dr. Your Name'}
                  </div>
                  {(myVerified || !signedIn) && (
                    <span style={{ display: 'inline-block', marginTop: 5, fontSize: 10.5, fontWeight: 700, padding: '3px 9px', background: '#DCFCE7', color: '#166534', borderRadius: 999 }}>
                      ✓ State Dental Council-verified
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <IdentityStat label="Cases shared"       value={signedIn ? String(myCases) : '—'} />
                <IdentityStat label="Peer reviews given" value={signedIn ? String(myReviews) : '—'} />
              </div>
              {!signedIn && (
                <p style={{ fontSize: 11.5, color: '#94A3B8', lineHeight: 1.6, marginTop: 14, marginBottom: 0, textAlign: 'center' }}>
                  An example. Your profile fills in as you publish and review.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section style={{ padding: '56px 20px 72px', background: '#F8FAFC' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <SectionEyebrow>How it works</SectionEyebrow>
            <SectionHeadline>Three steps</SectionHeadline>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24, marginTop: 34 }}>
              {STEPS.map(s => (
                <div key={s.n} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '26px 22px' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1D4ED8', color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                    {s.n}
                  </div>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, color: '#0F1923', marginBottom: 7 }}>{s.title}</h3>
                  <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.65 }}>{s.body}</p>
                </div>
              ))}
            </div>
            {!signedIn && (
              <div style={{ textAlign: 'center', marginTop: 32 }}>
                <Link href="/join" style={{ padding: '13px 26px', minHeight: 46, background: '#0F1923', color: '#fff', borderRadius: 10, fontSize: 14.5, fontWeight: 700, textDecoration: 'none', display: 'inline-block' }}>
                  Claim your profile — it&apos;s free
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Footer */}
        <footer style={{ background: '#0F1923', color: '#94A3B8', padding: '44px 20px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 28, justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ maxWidth: 300 }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: '#fff', marginBottom: 8 }}>Dentist In India</div>
              <p style={{ fontSize: 13, lineHeight: 1.6 }}>Clinical case review between verified Indian dentists.</p>
            </div>
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              <FooterColumn title="Get started">
                <FooterLink href="/join">Claim your profile</FooterLink>
                <FooterLink href="/for-dentists/login">Sign in</FooterLink>
                <FooterLink href="/for-dentists">For dentists</FooterLink>
              </FooterColumn>
              <FooterColumn title="Explore">
                <FooterLink href="/dentists">Find dentists</FooterLink>
                <FooterLink href="/insights">Dental insights</FooterLink>
                <FooterLink href="/cities">Cities</FooterLink>
              </FooterColumn>
              {/* Vendor/lab discovery lives here and nowhere else. It's a
                  secondary utility, not the reason the site exists. */}
              <FooterColumn title="For your practice">
                <FooterLink href="/vendors">Find a lab or vendor peers trust →</FooterLink>
              </FooterColumn>
              <FooterColumn title="Company">
                <FooterLink href="/about">About</FooterLink>
              </FooterColumn>
            </div>
          </div>

          {/* Explore by City — reciprocal dofollow links back to each city
              domain. Inline row so the link juice stays compact rather than
              competing with the brand columns above. */}
          <div style={{ maxWidth: 1100, margin: '28px auto 0', paddingTop: 18, borderTop: '1px solid #1E293B' }}>
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

// Calm, flat illustration: a case card with a radiograph frame and two
// review notes settling onto it. Inline SVG so there's no extra request
// and no dependency on an asset that doesn't exist yet.
function HeroIllustration() {
  return (
    <svg width="380" height="300" viewBox="0 0 380 300" fill="none" role="img" aria-label="A clinical case being reviewed by colleagues" style={{ maxWidth: '100%', height: 'auto' }}>
      <ellipse cx="190" cy="266" rx="140" ry="16" fill="#EFF6FF" />
      {/* Case card */}
      <rect x="62" y="40" width="196" height="212" rx="16" fill="#fff" stroke="#DBEAFE" strokeWidth="2" />
      <rect x="82" y="62" width="156" height="94" rx="9" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="1.5" />
      {/* Tooth motif inside the image frame */}
      <path d="M160 86c-9 0-12 4-18 4s-9-4-15-2c-7 2-9 9-7 18 2 10 5 14 7 23 2 8 3 16 8 16 4 0 5-7 6-13 1-5 2-9 5-9s4 4 5 9c1 6 2 13 6 13 5 0 6-8 8-16 2-9 5-13 7-23 2-9 0-16-7-18-6-2-9 2-15 2z" fill="#BFDBFE" />
      <rect x="82" y="172" width="120" height="9" rx="4.5" fill="#E2E8F0" />
      <rect x="82" y="190" width="156" height="9" rx="4.5" fill="#F1F5F9" />
      <rect x="82" y="208" width="92" height="9" rx="4.5" fill="#F1F5F9" />
      {/* Review note 1 */}
      <g>
        <rect x="236" y="92" width="112" height="56" rx="12" fill="#1D4ED8" />
        <rect x="252" y="110" width="64" height="7" rx="3.5" fill="#93C5FD" />
        <rect x="252" y="124" width="80" height="7" rx="3.5" fill="#60A5FA" />
        <path d="M252 148l-8 14 20-8z" fill="#1D4ED8" />
      </g>
      {/* Review note 2 */}
      <g>
        <rect x="16" y="158" width="104" height="52" rx="12" fill="#fff" stroke="#CBD5E1" strokeWidth="2" />
        <rect x="32" y="174" width="56" height="7" rx="3.5" fill="#E2E8F0" />
        <rect x="32" y="188" width="72" height="7" rx="3.5" fill="#F1F5F9" />
        <path d="M104 210l10 13-22-6z" fill="#fff" stroke="#CBD5E1" strokeWidth="2" strokeLinejoin="round" />
      </g>
      {/* Verified tick */}
      <circle cx="258" cy="52" r="19" fill="#DCFCE7" />
      <path d="M249 52.5l6.5 6.5L268 46.5" stroke="#166534" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IdentityStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, color: '#0F1923', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 6, fontWeight: 600 }}>{label}</div>
    </div>
  )
}

function SectionEyebrow({ children, align = 'center' }: { children: React.ReactNode; align?: 'center' | 'left' }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: align, marginBottom: 8 }}>{children}</div>
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
