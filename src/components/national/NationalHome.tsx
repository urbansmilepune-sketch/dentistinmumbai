import Link from 'next/link'
import { NATIONAL_ORIGIN, LIVE_CITY_CONFIGS } from '@/config/cities'
import NationalShell from './NationalShell'
import { adminDb, ui, EVENT_KIND_LABEL, cityNameOf } from '@/lib/national'
import { placeLabel } from '@/lib/eventCountries'
import { SPECIALTIES } from '@/lib/dentalSpecialties'

// dentistinindia.in homepage, v1 of the dentist network (Nov 2026).
//
// Three jobs, in this order: get dentists to claim their national profile,
// show the case library and events, and give a patient a way to find an
// expert. Booking stays on the city sites; the city links at the bottom
// are real anchors so crawlers still reach every live city domain.
//
// Numbers shown are live counts from the database, never targets.

export const dynamic = 'force-dynamic'

export default async function NationalHome() {
  const db = adminDb()
  const today = new Date().toISOString().slice(0, 10)
  const [dentistsRes, casesRes, eventsRes] = await Promise.all([
    db.from('dentists').select('id', { count: 'exact', head: true }).eq('is_active', true),
    db.from('cases').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
    db.from('events').select('*').eq('status', 'approved').gte('starts_on', today).order('starts_on').limit(3),
  ])
  const dentistCount = dentistsRes.count ?? 0
  const caseCount = casesRes.count ?? 0
  const events = (eventsRes.error ? [] : eventsRes.data || []) as Array<Record<string, any>>

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${NATIONAL_ORIGIN}/#organization`, name: 'DentistIn', url: NATIONAL_ORIGIN, logo: `${NATIONAL_ORIGIN}/logo-india.webp`, address: { '@type': 'PostalAddress', addressCountry: 'IN' } },
      { '@type': 'WebSite', '@id': `${NATIONAL_ORIGIN}/#website`, name: 'Dentist In India', url: NATIONAL_ORIGIN, publisher: { '@id': `${NATIONAL_ORIGIN}/#organization` }, inLanguage: 'en-IN' },
    ],
  }

  const pillars = [
    { title: 'Learn from real cases', body: 'Post a case with your X-rays and one question. Dentists across India reply with suggestions, and the best answers are marked helpful.', href: '/cases', cta: 'Browse cases' },
    { title: 'Build your name with patients', body: 'Your cases, follow-ups and helpful answers become a profile patients find when they search your name.', href: '/claim', cta: 'Claim your profile' },
    { title: 'Events and courses', body: 'Exhibitions, seminars, study clubs and hands-on courses across India, in one calendar.', href: '/events', cta: 'See events' },
  ]
  const patientTreatments = ['implants', 'endodontics', 'orthodontics', 'cosmetic', 'periodontics', 'pediatric']

  return (
    <NationalShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section style={{ background: '#fff', borderBottom: '1px solid #E2E8F0' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 16px 36px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <span style={ui.pill('#FEF3C7', '#78350F')}>Free for every dentist</span>
          <h1 style={{ ...ui.h1, fontSize: 34, maxWidth: 720 }}>
            Where India&apos;s dentists share cases and build their name
          </h1>
          <p style={{ ...ui.sub, fontSize: 17, maxWidth: 640 }}>
            On Facebook a case gets lost in a week. Here it stays: filed, searchable, with follow-ups and advice from dentists across India.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href="/claim" style={ui.btn}>Claim your free profile</Link>
            <Link href="/cases" style={ui.btnGhost}>Browse cases</Link>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 8 }}>
            <Stat value={dentistCount} label="dentists on DentistIn" />
            <Stat value={LIVE_CITY_CONFIGS.length} label="cities live" />
            <Stat value={caseCount} label="cases shared" />
          </div>
        </div>
      </section>

      <main style={ui.page}>
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 36 }}>
          {pillars.map(p => (
            <div key={p.title} style={{ ...ui.card, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2 style={{ ...ui.h2, margin: 0 }}>{p.title}</h2>
              <p style={{ ...ui.sub, fontSize: 14, flex: 1 }}>{p.body}</p>
              <Link href={p.href} style={{ fontWeight: 700, fontSize: 14, color: '#1D4ED8', textDecoration: 'none' }}>{p.cta} →</Link>
            </div>
          ))}
        </section>

        <section style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={ui.h2}>Coming up</h2>
            <Link href="/events" style={{ fontWeight: 700, fontSize: 14, color: '#1D4ED8', textDecoration: 'none' }}>All events →</Link>
          </div>
          {events.length === 0 ? (
            <div style={{ ...ui.card, borderStyle: 'dashed', textAlign: 'center', padding: 24 }}>
              <p style={{ ...ui.sub, fontSize: 14, marginBottom: 12 }}>No upcoming events listed yet.</p>
              <Link href="/events/new" style={ui.btnGhost}>List an event or course</Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              {events.map(e => (
                <Link key={e.id} href="/events" style={{ ...ui.card, textDecoration: 'none', color: '#0F1923', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8' }}>{formatDate(e.starts_on)} · {EVENT_KIND_LABEL[e.kind] || 'Event'}</span>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{e.title}</span>
                  <span style={{ fontSize: 13, color: '#475569' }}>{placeLabel(e, cityNameOf)}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section style={{ ...ui.card, padding: 20, marginBottom: 36, background: '#EFF6FF', borderColor: '#BFDBFE' }}>
          <h2 style={ui.h2}>Looking for a dentist?</h2>
          <p style={{ ...ui.sub, fontSize: 14, marginBottom: 14 }}>
            Find dentists by the work they have actually shared with other dentists. Nobody pays to be listed higher.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {patientTreatments.map(slug => {
              const s = SPECIALTIES.find(x => x.slug === slug)
              return s ? <Link key={slug} href={`/experts?t=${slug}`} style={ui.chip(false)}>{s.label}</Link> : null
            })}
          </div>
        </section>

        {/* Crawlable links to every live city domain (discovery layer). */}
        <section>
          <h2 style={ui.h2}>Book a dentist in your city</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {LIVE_CITY_CONFIGS.map(c => (
              <a key={c.citySlug} href={`https://${c.domain}`} style={{ ...ui.card, padding: '12px 14px', textDecoration: 'none', color: '#0F1923' }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Dentists in {c.cityName}</div>
                <div style={{ fontSize: 12, color: '#1D4ED8', fontWeight: 600, marginTop: 2 }}>{c.domain} →</div>
              </a>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <Link href="/cities" style={{ fontSize: 14, fontWeight: 700, color: '#1D4ED8', textDecoration: 'none' }}>See all cities, including those opening soon →</Link>
          </div>
        </section>
      </main>
    </NationalShell>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26, color: '#0F1923' }}>{value.toLocaleString('en-IN')}</div>
      <div style={{ fontSize: 13, color: '#475569' }}>{label}</div>
    </div>
  )
}

function formatDate(d: string | null | undefined): string {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
