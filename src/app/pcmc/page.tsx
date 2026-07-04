import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCityBySlug, getCityByDomain, cityOrigin, cityBrandName } from '@/config/cities'
import SiteHeader from '@/components/SiteHeader'
import DentistResultCard from '@/components/DentistResultCard'
import LocalFeeGuide from '@/app/area/[slug]/LocalFeeGuide'
import { dentistCountLabel } from '@/lib/dentistCount'
import { NAVY, NAVY_SOFT, TEAL, TEAL_DARK } from '@/app/dentist/[slug]/profileTheme'

// PCMC (Pimpri-Chinchwad Municipal Corporation) umbrella landing page. NOT an
// `areas` row — it aggregates the constituent PCMC sub-locality areas into one
// SEO-targeted cluster page ("dentist in pcmc", "dental clinic pimpri chinchwad").
// Pune-only: served on dentistinpune.in and guarded to 404 on every other city
// domain (the route exists on all of them since it's a static path).
export const dynamic = 'force-dynamic'

// Strict-PCMC membership (verified live). IDs are hardcoded because these are a
// fixed municipal cluster, not user-editable data — a slug rename in the areas
// table would silently drop an area from a slug-based query, whereas the id is
// stable. `name` is the chip label; the live area row still owns its own page.
const PCMC_AREAS = [
  { slug: 'wakad',                   name: 'Wakad',     id: 'e6e610b7-fbe5-497e-9b63-e1b538621c31' },
  { slug: 'chinchwad',               name: 'Chinchwad', id: 'f223e687-f342-4b5d-9b51-db3612edf670' },
  { slug: 'ravet',                   name: 'Ravet',     id: '3868b920-4ba8-4253-8183-56dd428ddaed' },
  { slug: 'pimpri',                  name: 'Pimpri',    id: 'e1f4a081-66ff-4028-abe7-cdea0b748c00' },
  { slug: 'akurdi-pimpri-chinchwad', name: 'Akurdi',    id: 'deb69720-1a06-44c7-937a-0da59a07003d' },
  { slug: 'punawale',                name: 'Punawale',  id: '96a7aadb-88a8-4e4c-9983-c1ebe1e5c62c' },
  { slug: 'moshi',                   name: 'Moshi',     id: '1688a248-ae78-47c6-8510-662fe45bcbe1' },
  { slug: 'bhosari',                 name: 'Bhosari',   id: 'd433a2a6-aff0-4979-b0c6-c42fccd55fda' },
] as const
const PCMC_AREA_IDS = PCMC_AREAS.map(a => a.id)

// Pune is authoritative for this page's brand/URL (it's a Pune-only cluster);
// the request-header check below governs whether we render at all.
const PUNE = getCityBySlug('pune')
const PCMC_LABEL = 'Pimpri-Chinchwad (PCMC)'

const DENTIST_SELECT = `
  id, slug, name, clinic_name, qualifications, experience_years,
  gender, consultation_fee, emi_available, is_verified, tier,
  profile_photo, whatsapp, phone, working_hours, lat, lng,
  avg_rating, review_count,
  areas(name, slug),
  dentist_treatments(treatments(name, slug))
`

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('dentists')
    .select('id', { count: 'exact', head: true })
    .in('area_id', PCMC_AREA_IDS)
    .eq('is_active', true)
    .eq('city', 'pune')
  const n = count || 0
  const lead = n > 0 ? `${n} verified dentists` : 'Verified dentists'
  return {
    title: `Dentists in Pimpri-Chinchwad (PCMC) | ${cityBrandName(PUNE)}`,
    description: `${lead} across Pimpri-Chinchwad (PCMC) — Wakad, Chinchwad, Ravet, Pimpri, Akurdi, Punawale, Moshi & Bhosari. Compare fees, read reviews and book the best dentist in Pimpri Chinchwad. Dental implants, braces & more in PCMC.`,
    keywords: [
      'dentist in pcmc',
      'dental clinic pimpri chinchwad',
      'dental implants pcmc',
      'best dentist in pimpri chinchwad',
      'dentist in pimpri chinchwad',
      'dentist in wakad',
    ],
    alternates: { canonical: `${cityOrigin(PUNE)}/pcmc` },
  }
}

export default async function PcmcPage() {
  const h = await headers()
  // Pune-only guard. Prefer the proxy-set slug; fall back to the host so a
  // dropped header on the Pune domain doesn't wrongly 404.
  const headerCity = getCityBySlug(h.get('x-city-slug'))
  const hostCity = getCityByDomain(h.get('x-forwarded-host') || h.get('host'))
  if (headerCity.citySlug !== 'pune' && hostCity.citySlug !== 'pune') notFound()

  const origin = cityOrigin(PUNE)
  const supabase = await createClient()
  const { data: dentistsRaw } = await supabase
    .from('dentists')
    .select(DENTIST_SELECT)
    .in('area_id', PCMC_AREA_IDS)
    .eq('is_active', true)
    .eq('city', 'pune')
    .order('rank_score', { ascending: false })
    .limit(100)

  const list = (dentistsRaw || []) as any[]
  const totalCount = list.length

  // Live fee stats across the cluster (0/NULL excluded as the "unset" sentinel).
  const fees = list.map(d => d.consultation_fee).filter((f): f is number => typeof f === 'number' && f > 0)
  const pricedCount = fees.length
  const avgFee = pricedCount ? Math.round(fees.reduce((s, f) => s + f, 0) / pricedCount) : null
  const lowestFee = pricedCount ? Math.min(...fees) : null
  const highestFee = pricedCount ? Math.max(...fees) : null

  // Per-sub-area counts, derived from the fetched set (it already IS every
  // active dentist in these areas), so the chips never need a second query.
  const countBySlug = new Map<string, number>()
  for (const d of list) {
    const s = d.areas?.slug
    if (s) countBySlug.set(s, (countBySlug.get(s) || 0) + 1)
  }
  const subAreas = PCMC_AREAS.map(a => ({ ...a, count: countBySlug.get(a.slug) || 0 }))

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: origin },
      { '@type': 'ListItem', position: 2, name: 'Dentists', item: `${origin}/dentists` },
      { '@type': 'ListItem', position: 3, name: PCMC_LABEL, item: `${origin}/pcmc` },
    ],
  }
  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'MedicalBusiness',
    name: `Dentists in ${PCMC_LABEL}`,
    areaServed: 'Pimpri-Chinchwad, Pune',
    url: `${origin}/pcmc`,
  }

  const feeStat = avgFee !== null
    ? { value: `₹${avgFee.toLocaleString('en-IN')}`, label: 'avg consultation' }
    : null
  const rangeStat = lowestFee !== null && highestFee !== null && lowestFee !== highestFee
    ? { value: `₹${lowestFee.toLocaleString('en-IN')}–₹${highestFee.toLocaleString('en-IN')}`, label: 'fee range' }
    : null

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }} />

      <SiteHeader city={PUNE} />

      {/* HERO */}
      <section style={{ background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_SOFT} 100%)`, padding: '28px 20px 36px' }}>
        <div className="container">
          <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 16, flexWrap: 'wrap' }}>
            <Link href="/" style={{ color: 'rgba(255,255,255,0.85)' }}>{PUNE.cityName}</Link>
            <span>›</span>
            <Link href="/dentists" style={{ color: 'rgba(255,255,255,0.85)' }}>Dentists</Link>
            <span>›</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>Pimpri-Chinchwad</span>
          </nav>

          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.6rem, 5vw, 2.4rem)', color: '#fff', marginBottom: 8, lineHeight: 1.2 }}>
            Dentists in Pimpri-Chinchwad
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15, marginBottom: 20 }}>
            {totalCount > 0 ? `${totalCount} verified dentist${totalCount === 1 ? '' : 's'}` : 'Verified dentists'} across PCMC — Wakad, Chinchwad, Ravet, Pimpri, Akurdi, Punawale, Moshi &amp; Bhosari.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {[
              { value: String(totalCount), label: totalCount === 1 ? 'dentist' : 'dentists' },
              ...(feeStat ? [feeStat] : []),
              ...(rangeStat ? [rangeStat] : []),
            ].map(stat => (
              <div key={stat.label} style={{
                display: 'inline-flex', alignItems: 'baseline', gap: 6,
                padding: '8px 14px', background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12,
              }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, color: TEAL }}>{stat.value}</span>
                <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)' }}>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <main style={{ background: 'var(--bg)', padding: '24px 20px 48px' }}>
        <div className="container" style={{ maxWidth: 860 }}>

          {/* Sub-area chips */}
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 12 }}>
              Areas in PCMC
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {subAreas.map(a => (
                <Link key={a.slug} href={`/area/${a.slug}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', background: '#fff', color: NAVY,
                  border: '1px solid var(--border)', borderRadius: 20, fontSize: 13, fontWeight: 600,
                }}>
                  📍 {a.name}
                  <span style={{ color: 'var(--muted)', fontWeight: 500 }}>· {dentistCountLabel(a.count)}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Dentist list */}
          {list.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '40px 24px', textAlign: 'center' }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 19, fontWeight: 800, color: NAVY, marginBottom: 8 }}>
                We&apos;re adding dentists in Pimpri-Chinchwad soon
              </h2>
              <Link href="/dentists" className="btn btn-primary">Browse all {PUNE.cityName} dentists</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {list.map(d => <DentistResultCard key={d.id} dentist={d} />)}
            </div>
          )}

          {/* Live fee guide across the cluster */}
          <div style={{ marginTop: 40 }}>
            <LocalFeeGuide
              areaName={PCMC_LABEL}
              totalCount={totalCount}
              pricedCount={pricedCount}
              avgFee={avgFee}
              minFee={lowestFee}
              maxFee={highestFee}
            />
          </div>

          {/* SEO content */}
          <div style={{ marginTop: 40, padding: '32px', background: '#fff', borderRadius: 16, border: '1px solid var(--border)' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, color: NAVY, marginBottom: 16 }}>
              Finding a dentist in Pimpri-Chinchwad (PCMC)
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 16 }}>
              Pimpri-Chinchwad is Pune&apos;s twin industrial city, spanning Wakad, Chinchwad, Ravet, Pimpri,
              Akurdi, Punawale, Moshi and Bhosari. Whether you need a routine check-up, a dental clinic in
              Pimpri Chinchwad for the whole family, braces, or dental implants in PCMC, this page brings every
              verified {cityBrandName(PUNE)} listing across the PCMC belt into one place so you can compare fees
              and reviews before you book.
            </p>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              Each clinic below is manually verified against its State Dental Council registration. Tap any
              area chip above to see dentists in that specific PCMC locality, or browse the full list to find
              the best dentist in Pimpri-Chinchwad for your treatment.
            </p>
          </div>
        </div>
      </main>

      <footer style={{ background: '#0A1628', padding: '32px 20px', color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>
        <p style={{ fontSize: 13 }}>© {new Date().getFullYear()} {PUNE.domain}</p>
      </footer>
    </>
  )
}
