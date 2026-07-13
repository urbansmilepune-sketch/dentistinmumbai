import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getCityBySlug } from '@/config/cities'
import { getAreaTreatmentCompleteCounts, getAreaCompleteDentistCounts } from '@/lib/cache/public-pages'
import SiteHeader from '@/components/SiteHeader'
import TreatmentNavTabs from '../TreatmentNavTabs'
import ResultFilters from '@/components/ResultFilters'
import ShowMoreButton from '../ShowMoreButton'
import CostGuide from '../CostGuide'
import AreaFAQAccordion from '../AreaFAQAccordion'
import DentistResultCard from '@/components/DentistResultCard'
import { isOpenNowFromHours } from '@/lib/time'
import { haversineKm } from '@/lib/distance'
import { NAVY, NAVY_SOFT, TEAL } from '@/app/dentist/[slug]/profileTheme'

// Mirrors the parent /area/[slug] page: headers()-based city resolution forces
// dynamic rendering, so no generateStaticParams / ISR here.
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string; treatment: string }> }): Promise<Metadata> {
  const { slug, treatment: treatmentSlug } = await params
  const supabase = await createClient()
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  const [{ data: area }, { data: treatment }] = await Promise.all([
    supabase.from('areas').select('id, name, dentist_count').eq('slug', slug).eq('city', city.citySlug).single(),
    supabase.from('treatments').select('id, name').eq('slug', treatmentSlug).single(),
  ])
  if (!area || !treatment) return { title: 'Not Found' }
  // Density gate: this page only exists (and is indexed) when ≥3 complete-
  // profile dentists in this area offer this treatment with a fee set. Below
  // that the page body 404s; the robots flag here keeps metadata consistent
  // for the ≥3 indexable case. Same rule the sitemap emits under.
  const cnt = (await getAreaTreatmentCompleteCounts(city.citySlug))[`${area.id}:${treatment.id}`] ?? 0
  const indexable = cnt >= 3
  return {
    title: `Best ${treatment.name} Dentists in ${area.name}, ${city.cityName} | ${city.domain}`,
    description: `Find top-rated, verified dentists for ${treatment.name} in ${area.name}, ${city.cityName}. Compare ${treatment.name} fees, read reviews, and book appointments instantly.`,
    alternates: { canonical: `https://${city.domain}/area/${slug}/${treatmentSlug}` },
    robots: { index: indexable, follow: true, googleBot: { index: indexable, follow: true } },
  }
}

// Treatment-specific FAQs — these are the three questions requested plus a
// couple of area/treatment combos to keep the FAQPage schema rich.
function getTreatmentFAQs(treatmentName: string, areaName: string, dentistCount: number) {
  return [
    {
      q: `How much does ${treatmentName} cost in ${areaName}?`,
      a: `The cost of ${treatmentName} in ${areaName} varies by clinic tier, doctor experience, and case complexity. Most clinics in ${areaName} provide a written estimate after the first consultation, and many offer EMI or no-cost financing on higher-value treatments. Use the verified listings below to compare ${treatmentName} fees in ${areaName} before you book.`,
    },
    {
      q: `Which is the best dentist for ${treatmentName} in ${areaName}?`,
      a: `The best dentist for ${treatmentName} in ${areaName} is one who is State Dental Council registered, specialises in this treatment, and has strong patient reviews. We list ${dentistCount || 'several'} verified dentists in ${areaName} offering ${treatmentName}, sorted by rating and relevance, so you can compare qualifications, fees, and reviews side by side.`,
    },
    {
      q: `How long does ${treatmentName} take?`,
      a: `The duration of ${treatmentName} depends on your individual case. Routine procedures are often completed in a single visit, while more complex treatments may need multiple appointments over a few weeks. Your dentist in ${areaName} will share an exact timeline during your consultation.`,
    },
    {
      q: `Are there dentists offering ${treatmentName} open on Sunday in ${areaName}?`,
      a: `Yes, several dental clinics in ${areaName} offer ${treatmentName} with limited Sunday hours (usually 10am–2pm). Use the "Open now" filter to find clinics currently accepting patients.`,
    },
    {
      q: `Do dentists in ${areaName} offer EMI for ${treatmentName}?`,
      a: `Many clinics in ${areaName} offer EMI and no-cost financing options for ${treatmentName}, especially on higher-value treatments. Look for the "EMI" filter on the listings below or confirm with the clinic directly.`,
    },
  ]
}

function getSEOContent(treatmentName: string, areaName: string, cityName: string, domain: string, dentistCount: number) {
  return {
    intro: `Looking for ${treatmentName} in ${areaName}? ${areaName} is home to a range of dental clinics offering ${treatmentName} — from boutique studios to multi-specialty practices. Whether this is a routine procedure or a complex case, ${domain} helps you find the right ${treatmentName} specialist in ${areaName}, ${cityName}, with transparent fees and verified reviews.`,
    para2: `The clinics offering ${treatmentName} in ${areaName} are staffed by experienced professionals using modern equipment and proven techniques. With ${dentistCount || 'multiple'} verified dentists currently listed for ${treatmentName} in ${areaName}, you can compare fees, check availability, and book an appointment instantly — without travelling across ${cityName}.`,
  }
}

// GPS coords are user-supplied query params; validate before trusting them.
function parseCoord(v: string | undefined, range: number): number | null {
  if (!v) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  if (Math.abs(n) > range) return null
  return n
}

const SORT_LABELS: Record<string, string> = {
  nearest: 'nearest first',
  rating: 'top rated',
  fee: 'lowest fee first',
  best: 'best match',
}

export default async function AreaTreatmentPage({ params, searchParams }: { params: Promise<{ slug: string; treatment: string }>; searchParams: Promise<Record<string, string>> }) {
  const { slug, treatment: treatmentSlug } = await params
  const sp = await searchParams
  const ratingFilter = sp.rating || ''
  const openNowFilter = sp.open === 'true'
  const genderFilter = sp.gender || ''
  const verifiedFilter = sp.verified === 'true'
  const emiFilter = sp.emi === 'true'
  const sortBy = sp.sort || ''
  const userLat = parseCoord(sp.lat, 90)
  const userLng = parseCoord(sp.lng, 180)
  const hasCoords = userLat !== null && userLng !== null

  const supabase = await createClient()
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  const citySlug = city.citySlug

  const [{ data: area }, { data: treatment }, { data: allAreas }, { data: treatments }, atCompleteCounts, areaCompleteCounts] = await Promise.all([
    // Area slug + city pair — the same slug may exist in multiple cities.
    supabase.from('areas').select('*').eq('slug', slug).eq('city', citySlug).single(),
    supabase.from('treatments').select('*').eq('slug', treatmentSlug).single(),
    supabase.from('areas').select('id, name, slug, zone, dentist_count').eq('city', citySlug).order('dentist_count', { ascending: false }),
    supabase.from('treatments').select('id, name, slug, icon').order('sort_order'),
    getAreaTreatmentCompleteCounts(citySlug),
    // Area-level complete-profile counts — the density gate for the indexed
    // area-page link loop rendered lower down.
    getAreaCompleteDentistCounts(citySlug),
  ])
  const areaCompleteCountOf = (id: number | string) => areaCompleteCounts[String(id)] ?? 0

  // Either segment missing → 404. This is what fixes the broken treatment-tab
  // links across every area page.
  if (!area || !treatment) notFound()

  // Density gate: fewer than 3 complete-profile dentists offering this
  // treatment (with a fee set) in this area → 404. These thin matrix pages are
  // exactly what GSC crawls and rejects; the sitemap drops them under the same
  // rule. Gate runs before the heavy dentist query below.
  if ((atCompleteCounts[`${area.id}:${treatment.id}`] ?? 0) < 3) notFound()

  // Dentists in this area AND offering this treatment. dentist_treatments!inner
  // + the treatment_id filter turns the embed into a join filter, so only
  // matching dentists return AND the embedded row is just this treatment
  // (giving us its fee_from). avg_rating/review_count (not the legacy `rating`)
  // match what DentistResultCard reads; lat/lng power the GPS distance sort.
  let dentistQuery = supabase
    .from('dentists')
    .select(`
      id, slug, name, clinic_name, qualifications, experience_years,
      gender, consultation_fee, emi_available, is_verified, tier,
      profile_photo, whatsapp, phone, working_hours, lat, lng,
      avg_rating, review_count,
      areas(name, slug),
      dentist_treatments!inner(fee_from, fee_to, treatment_id)
    `)
    .eq('area_id', area.id)
    .eq('is_active', true)
    .eq('city', citySlug)
    .eq('dentist_treatments.treatment_id', treatment.id)

  // Attribute filters — honoured server-side (same set as the area/treatment pages).
  if (genderFilter) dentistQuery = dentistQuery.eq('gender', genderFilter)
  if (verifiedFilter) dentistQuery = dentistQuery.eq('is_verified', true)
  if (emiFilter) dentistQuery = dentistQuery.eq('emi_available', true)
  if (ratingFilter) {
    const minRating = parseFloat(ratingFilter)
    if (Number.isFinite(minRating)) dentistQuery = dentistQuery.gte('avg_rating', minRating)
  }

  // rank_score is the deterministic DB baseline; distance / fee_from / rating
  // re-sorts happen in JS below (fee_from lives on the embedded join row).
  dentistQuery = dentistQuery.order('rank_score', { ascending: false }).limit(100)

  const { data: dentistsRaw } = await dentistQuery

  // Surface this treatment's fee_from on each row for the card note, the stat
  // row, and the lowest-fee sort.
  let list = (dentistsRaw || []).map((d: any) => ({
    ...d,
    _feeFrom: (typeof d.dentist_treatments?.[0]?.fee_from === 'number' ? d.dentist_treatments[0].fee_from : null) as number | null,
  }))

  // Distance enrichment + sort when coords are present.
  if (hasCoords) {
    const lat = userLat as number
    const lng = userLng as number
    list = list.map(d => {
      const dl = typeof d.lat === 'number' ? d.lat : null
      const dg = typeof d.lng === 'number' ? d.lng : null
      const distance_km = dl !== null && dg !== null ? haversineKm(lat, lng, dl, dg) : null
      return { ...d, distance_km }
    })
    list.sort((a, b) => {
      const ad = a.distance_km as number | null
      const bd = b.distance_km as number | null
      if (ad === null && bd === null) return 0
      if (ad === null) return 1
      if (bd === null) return -1
      return ad - bd
    })
  } else if (sortBy === 'rating') {
    list.sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0))
  } else if (sortBy === 'fee') {
    list.sort((a, b) => {
      const af = a._feeFrom, bf = b._feeFrom
      if (af === null && bf === null) return 0
      if (af === null) return 1
      if (bf === null) return -1
      return af - bf
    })
  }

  const isMumbai = city.citySlug === 'mumbai'

  // Honest stat-row inputs, computed on the full result set (pre open-now
  // filter so "open now" reflects all matching clinics).
  const totalOffering = list.length
  const openNowCount = list.filter(d => isOpenNowFromHours(d.working_hours)).length
  const feeFroms = list.map(d => d._feeFrom).filter((f): f is number => typeof f === 'number' && f > 0)
  const lowestFee = feeFroms.length ? Math.min(...feeFroms) : null

  const dentistList = openNowFilter ? list.filter(d => isOpenNowFromHours(d.working_hours)) : list
  const visibleDentists = dentistList.slice(0, 4)
  const hiddenDentists = dentistList.slice(4)

  const firstHighlight: 'closest' | 'best' | null = hasCoords
    ? (visibleDentists[0]?.distance_km != null ? 'closest' : null)
    : (!sortBy ? 'best' : null)

  const sortLabel = hasCoords ? SORT_LABELS.nearest : SORT_LABELS[sortBy] || SORT_LABELS.best
  const subtext = `${totalOffering} dentist${totalOffering === 1 ? '' : 's'} offer this in ${area.name}${lowestFee !== null ? ` · from ₹${lowestFee.toLocaleString('en-IN')}` : ''}`

  // Per-card treatment note: the dentist's starting fee for THIS treatment,
  // falling back to a plain "offers this" confirmation.
  const noteFor = (d: { _feeFrom: number | null }) =>
    d._feeFrom !== null ? `${treatment.name} from ₹${d._feeFrom.toLocaleString('en-IN')}` : `Offers ${treatment.name}`

  // Mumbai groups "nearby" by suburban-rail line (zone); other cities fall
  // back to any other area within the same city.
  const nearbyAreas = (allAreas || [])
    .filter(a => a.slug !== slug && (isMumbai ? a.zone === area.zone : true))
    .slice(0, 6)

  // Indexed-only nearby areas — the crawlable link loop between the city's
  // density-gated (≥3 complete-profile dentists) area pages. Area-level counts
  // (treatment-agnostic) so the loop targets the indexed /area/[slug] set.
  // Exclude current; strongest first; cap at 4.
  const indexedNearbyAreas = (allAreas || [])
    .filter(a => a.slug !== slug && areaCompleteCountOf(a.id) >= 3)
    .sort((a, b) => areaCompleteCountOf(b.id) - areaCompleteCountOf(a.id))
    .slice(0, 4)

  // Sidebar "Top Rated" — only dentists with real ratings, best first.
  const topRated = [...list]
    .filter(d => (d.avg_rating || 0) > 0)
    .sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0))
    .slice(0, 4)

  const faqs = getTreatmentFAQs(treatment.name, area.name, totalOffering)
  const seoContent = getSEOContent(treatment.name, area.name, city.cityName, city.domain, totalOffering)

  // JSON-LD schemas
  const origin = `https://${city.domain}`
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: origin },
      { '@type': 'ListItem', position: 2, name: 'Dentists', item: `${origin}/dentists` },
      { '@type': 'ListItem', position: 3, name: area.name, item: `${origin}/area/${slug}` },
      { '@type': 'ListItem', position: 4, name: treatment.name, item: `${origin}/area/${slug}/${treatmentSlug}` },
    ],
  }

  const localBusinessSchema = {
    '@context': 'https://schema.org',
    '@type': 'MedicalBusiness',
    name: `Best ${treatment.name} Dentists in ${area.name}, ${city.cityName}`,
    areaServed: `${area.name}, ${city.cityName}`,
    url: `${origin}/area/${slug}/${treatmentSlug}`,
  }

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  return (
    <>
      {/* JSON-LD */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      {/* NAV — shared across all public pages */}
      <SiteHeader city={city} />

      {/* HERO — navy, patient-first */}
      <section style={{ background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_SOFT} 100%)`, padding: '28px 20px 36px' }}>
        <div className="container">
          <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 16, flexWrap: 'wrap' }}>
            <Link href="/" style={{ color: 'rgba(255,255,255,0.85)' }}>{city.cityName}</Link>
            <span>›</span>
            <Link href="/dentists" style={{ color: 'rgba(255,255,255,0.85)' }}>Dentists</Link>
            <span>›</span>
            <Link href={`/area/${slug}`} style={{ color: 'rgba(255,255,255,0.85)' }}>{area.name}</Link>
            <span>›</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>{treatment.name}</span>
          </nav>

          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.6rem, 5vw, 2.4rem)', color: '#fff', marginBottom: 8, lineHeight: 1.2 }}>
            {treatment.name} in {area.name}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15, marginBottom: 20 }}>
            {subtext} · sorted by {sortLabel}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {[
              { value: String(totalOffering), label: totalOffering === 1 ? 'dentist' : 'dentists' },
              { value: String(openNowCount), label: 'open now' },
              ...(lowestFee !== null ? [{ value: `₹${lowestFee.toLocaleString('en-IN')}`, label: 'lowest fee' }] : []),
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

      {/* TREATMENT NAV TABS — active tab reflects the current treatment */}
      <TreatmentNavTabs areaSlug={slug} treatments={(treatments || []).map(t => ({ name: t.name, slug: t.slug, icon: t.icon || '🦷' }))} activeTab={treatmentSlug} />

      <main style={{ background: 'var(--bg)', padding: '24px 20px' }}>
        <div className="container">
          <div className="at-layout">

            {/* MAIN CONTENT */}
            <div className="at-main">

              {/* Filter / sort pills */}
              <ResultFilters basePath={`/area/${slug}/${treatmentSlug}`} />

              {/* Dentist list */}
              <div style={{ marginTop: 20 }}>
                {dentistList.length === 0 ? (
                  <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '40px 24px', textAlign: 'center' }}>
                    <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 19, fontWeight: 800, color: NAVY, marginBottom: 8 }}>
                      No dentists offer {treatment.name} in {area.name} yet
                    </h2>
                    <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 22 }}>
                      {openNowFilter || verifiedFilter || emiFilter || genderFilter || ratingFilter
                        ? 'No matches for these filters right now. Try clearing some, or see all dentists in this area:'
                        : <>Try <Link href={`/area/${slug}`} style={{ color: TEAL, fontWeight: 600 }}>all dentists in {area.name}</Link>, or explore nearby areas:</>}
                    </p>
                    {nearbyAreas.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 22 }}>
                        {nearbyAreas.map(a => (
                          <Link key={a.slug} href={`/area/${a.slug}/${treatmentSlug}`} style={{
                            padding: '8px 16px', background: '#F0FDFA', color: TEAL,
                            border: '1px solid #99F6E4', borderRadius: 20, fontSize: 13, fontWeight: 600,
                          }}>📍 {a.name}</Link>
                        ))}
                      </div>
                    )}
                    <Link href={`/area/${slug}`} className="btn btn-primary">View all dentists in {area.name}</Link>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {visibleDentists.map((d, i) => (
                        <DentistResultCard key={d.id} dentist={d} highlight={i === 0 ? firstHighlight : null} treatmentNote={noteFor(d)} />
                      ))}
                    </div>
                    <ShowMoreButton key={`${slug}-${treatmentSlug}`} count={hiddenDentists.length} areaName={area.name}>
                      {hiddenDentists.map(d => <DentistResultCard key={d.id} dentist={d} treatmentNote={noteFor(d)} />)}
                    </ShowMoreButton>
                  </>
                )}
              </div>

              {/* Cost Guide */}
              <div style={{ marginTop: 40 }}>
                <CostGuide areaName={area.name} />
              </div>

              {/* FAQ */}
              <div style={{ marginTop: 48 }}>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, marginBottom: 24 }}>
                  Frequently Asked Questions — {treatment.name} in {area.name}
                </h2>
                <AreaFAQAccordion items={faqs} />
              </div>

              {/* Explore dentists in nearby areas — density-gated internal link
                  loop between the city's indexed area pages (≥3 complete
                  profiles). Chips link to /area/[slug]. */}
              {indexedNearbyAreas.length > 0 && (
                <div style={{ marginTop: 48 }}>
                  <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, marginBottom: 16 }}>
                    Explore dentists in nearby areas
                  </h2>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {indexedNearbyAreas.map(a => (
                      <Link key={a.slug} href={`/area/${a.slug}`} style={{
                        padding: '9px 16px', background: '#F0FDFA', color: TEAL,
                        border: '1px solid #99F6E4', borderRadius: 20, fontSize: 13.5, fontWeight: 600,
                        textDecoration: 'none',
                      }}>📍 Dentists in {a.name}</Link>
                    ))}
                  </div>
                </div>
              )}

              {/* SEO Content Block */}
              <div style={{ marginTop: 56, padding: '40px', background: '#fff', borderRadius: 16, border: '1px solid var(--border)' }}>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, marginBottom: 20 }}>
                  {treatment.name} in {area.name}, {city.cityName} — Complete Guide
                </h2>
                <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 20 }}>{seoContent.intro}</p>
                <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 28 }}>{seoContent.para2}</p>

                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, marginBottom: 12 }}>
                  How to Choose a {treatment.name} Dentist in {area.name}
                </h3>
                <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 28 }}>
                  When choosing a dentist for {treatment.name} in {area.name}, verify their State Dental Council registration, confirm they specialise in this treatment, and read at least 10 patient reviews. A trustworthy clinic will give you a written treatment plan with costs before starting. All dentists on {city.domain} are manually verified before listing.
                </p>

                {/* Quick Facts Table */}
                <div style={{ background: 'var(--bg)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <div style={{ padding: '12px 20px', background: '#F0FDFA', fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-heading)', color: NAVY }}>
                    Quick Facts: {treatment.name} in {area.name}
                  </div>
                  {[
                    { label: 'Treatment', value: treatment.name },
                    { label: 'Area', value: area.name },
                    // Zone is Mumbai-only context (Western/Central/Harbour…).
                    ...(isMumbai && area.zone ? [{ label: 'Zone', value: area.zone }] : []),
                    { label: 'Dentists Listed', value: String(totalOffering || '5+') },
                    ...(lowestFee !== null ? [{ label: `${treatment.name} from`, value: `₹${lowestFee.toLocaleString('en-IN')}` }] : []),
                  ].map((row, i) => (
                    <div key={row.label} style={{
                      display: 'flex', padding: '11px 20px',
                      background: i % 2 === 0 ? '#fff' : 'var(--bg)',
                      borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                    }}>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>{row.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT SIDEBAR — lighter; stacks below on mobile */}
            <aside className="at-sidebar">
              {/* All dentists in area */}
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '20px' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 14 }}>All dentists in {area.name}</h3>
                <Link href={`/area/${slug}`} style={{
                  display: 'block', textAlign: 'center', padding: '11px 16px', background: TEAL, color: '#fff',
                  borderRadius: 10, fontSize: 13, fontWeight: 700,
                }}>View All Dentists →</Link>
              </div>

              {/* Top Rated */}
              {topRated.length > 0 && (
                <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '20px' }}>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 14 }}>
                    Top Rated for {treatment.name}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {topRated.map(d => (
                      <Link key={d.id} href={`/dentist/${d.slug}`} style={{ display: 'flex', gap: 10, alignItems: 'center', textDecoration: 'none' }}>
                        <div style={{ width: 40, height: 40, borderRadius: 8, background: '#F0FDFA', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: TEAL, fontWeight: 800 }}>
                          {d.profile_photo ? <img src={d.profile_photo} alt={d.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🦷'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: NAVY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>★ {(d.avg_rating || 0).toFixed(1)}{d._feeFrom ? ` · from ₹${d._feeFrom.toLocaleString('en-IN')}` : ''}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Other Treatments in Area */}
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '20px' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 14 }}>
                  Treatments in {area.name}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(treatments || []).slice(0, 8).map(t => {
                    const isCurrent = t.slug === treatmentSlug
                    return (
                      <Link key={t.slug} href={`/area/${slug}/${t.slug}`} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0',
                        borderBottom: '1px solid var(--border)', fontSize: 13,
                        color: isCurrent ? TEAL : 'var(--text)', fontWeight: isCurrent ? 700 : 400,
                      }}>
                        <span>{t.icon || '🦷'}</span>
                        <span style={{ flex: 1 }}>{t.name} in {area.name}</span>
                        <span style={{ color: TEAL, fontSize: 12 }}>→</span>
                      </Link>
                    )
                  })}
                </div>
              </div>

              {/* CTA */}
              <div style={{ background: NAVY, borderRadius: 16, padding: '20px', textAlign: 'center' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: '#fff', marginBottom: 8 }}>
                  Do you offer {treatment.name.toLowerCase()} in {area.name}?
                </h3>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 16, lineHeight: 1.6 }}>
                  Get discovered by patients in {area.name} for free.
                </p>
                <Link href="/for-dentists/register" style={{
                  display: 'block', padding: '11px 20px', background: TEAL, color: '#fff',
                  borderRadius: 10, fontSize: 13, fontWeight: 700,
                }}>List Your Clinic Free →</Link>
              </div>
            </aside>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer style={{ background: '#0A1628', padding: '40px 20px 24px', color: 'rgba(255,255,255,0.6)', marginTop: 0 }}>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <Link href="/" style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: '#fff', fontSize: 15 }}>
              {city.domain}
            </Link>
            <div style={{ display: 'flex', gap: 20 }}>
              <Link href="/dentists" style={{ fontSize: 13 }}>Find Dentists</Link>
              <Link href="/for-dentists" style={{ fontSize: 13 }}>For Dentists</Link>
              <Link href="/about" style={{ fontSize: 13 }}>About</Link>
            </div>
            <p style={{ fontSize: 13 }}>© {new Date().getFullYear()} {city.domain}</p>
          </div>
        </div>
      </footer>

      <style>{`
        .at-layout { display: flex; gap: 28px; align-items: flex-start; }
        .at-main { flex: 1; min-width: 0; }
        .at-sidebar {
          width: 280px; flex-shrink: 0;
          display: flex; flex-direction: column; gap: 20px;
          position: sticky; top: 88px;
        }
        @media (max-width: 900px) {
          .at-layout { flex-direction: column; align-items: stretch; }
          .at-sidebar { width: 100%; position: static; margin-top: 32px; }
        }
      `}</style>
    </>
  )
}
