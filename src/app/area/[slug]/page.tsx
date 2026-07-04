import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getCityAreaDentistCounts } from '@/lib/cache/public-pages'
import { getCityBySlug } from '@/config/cities'
import { dentistCountLabel } from '@/lib/dentistCount'
import SiteHeader from '@/components/SiteHeader'
import TreatmentNavTabs from './TreatmentNavTabs'
import ResultFilters from '@/components/ResultFilters'
import ShowMoreButton from './ShowMoreButton'
import CostGuide from './CostGuide'
import LocalFeeGuide from './LocalFeeGuide'
import TransitLineGuide from './TransitLineGuide'
import AreaFAQAccordion from './AreaFAQAccordion'
import DentistResultCard from '@/components/DentistResultCard'
import { isOpenNowFromHours } from '@/lib/time'
import { haversineKm } from '@/lib/distance'
import { NAVY, NAVY_SOFT, TEAL } from '@/app/dentist/[slug]/profileTheme'

// headers()-based city resolution forces dynamic rendering. Previous
// generateStaticParams + ISR have been removed; per-city traffic is small
// enough that on-demand SSR with edge caching is fine.
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  const { data: area } = await supabase
    .from('areas')
    .select('id, name, dentist_count')
    .eq('slug', slug)
    .eq('city', city.citySlug)
    .single()
  if (!area) return { title: 'Area Not Found' }
  // Live active-dentist count for this area, from the same 300s-cached source
  // the page body uses (getCityAreaDentistCounts keyed by stringified area id)
  // — no extra round-trip. When the count is 0 we drop the number and lead
  // with a count-free line rather than advertise "0 verified dentists". City
  // name stays dynamic so non-Pune area pages aren't mislabelled. lowestFee is
  // intentionally not added here — it would require a separate fee query.
  const areaCounts = await getCityAreaDentistCounts(city.citySlug)
  const liveCount = areaCounts[String(area.id)] ?? 0
  const lead = liveCount > 0
    ? `${liveCount} verified dentists in ${area.name}, ${city.cityName}.`
    : `Verified dentists in ${area.name}, ${city.cityName}.`
  return {
    title: `Best Dentists in ${area.name}, ${city.cityName}`,
    description: `${lead} See real fees, photos and book instantly.`,
    alternates: { canonical: `https://${city.domain}/area/${slug}` },
  }
}

function getFAQs(areaName: string, dentistCount: number, feeStats?: { avgFee: number | null; minFee: number | null; maxFee: number | null; pricedCount: number }) {
  // Prefer a live, data-backed fee answer when clinics in this area publish
  // fees; fall back to the generic range only when we have nothing real to say.
  const feeAnswer = feeStats?.avgFee != null && feeStats.minFee != null && feeStats.maxFee != null
    ? `Verified clinics in ${areaName} list an average consultation fee of ₹${feeStats.avgFee.toLocaleString('en-IN')}${feeStats.minFee !== feeStats.maxFee ? ` (ranging ₹${feeStats.minFee.toLocaleString('en-IN')}–₹${feeStats.maxFee.toLocaleString('en-IN')})` : ''}, based on ${feeStats.pricedCount} clinic${feeStats.pricedCount === 1 ? '' : 's'} that publish their pricing. Many also offer free or discounted first consultations for new patients.`
    : `Consultation fees in ${areaName} typically range from ₹200 to ₹500 depending on the clinic and doctor's experience. Many clinics in ${areaName} offer free initial consultations for new patients.`
  return [
    {
      q: `How many dentists are there in ${areaName}?`,
      a: `There are currently ${dentistCount || 'several'} verified dentists listed in ${areaName} on our platform. The number continues to grow as we verify and onboard new clinics.`,
    },
    {
      q: `What is the consultation fee in ${areaName}?`,
      a: feeAnswer,
    },
    {
      q: `Are there dentists open on Sunday in ${areaName}?`,
      a: `Yes, several dental clinics in ${areaName} are open on Sundays with limited hours (usually 10am–2pm). Use the "Open Now" filter on our search to find currently open dentists.`,
    },
    {
      q: `What is the cost of dental implants in ${areaName}?`,
      a: `Dental implants in ${areaName} cost between ₹25,000 to ₹80,000 per implant, depending on the brand (Korean, European, or Indian) and the clinic tier. Premium clinics in ${areaName} typically charge ₹45,000–₹80,000.`,
    },
    {
      q: `Do dentists in ${areaName} accept insurance?`,
      a: `Several dental clinics in ${areaName} accept dental insurance from major providers like Star Health, HDFC Ergo, and corporate group policies. Check the clinic's profile on our platform or call ahead to confirm.`,
    },
    {
      q: `How do I choose the best dentist in ${areaName}?`,
      a: `Look for a dentist who is State Dental Council registered, has at least 4-star ratings, and specialises in the treatment you need. Our verified listings in ${areaName} include transparent fees, qualification details, and real patient reviews to help you decide.`,
    },
  ]
}

function getSEOContent(areaName: string, zone: string, dentistCount: number, cityName: string, domain: string) {
  return {
    intro: `${areaName} is one of ${cityName}'s most sought-after residential and commercial localities, and its dental care landscape reflects that diversity. From boutique smile design studios to multi-specialty dental hospitals, ${areaName} offers a comprehensive range of dental services for residents and visitors alike. Whether you need a routine cleaning, orthodontic treatment, or full-mouth rehabilitation, finding the right dentist in ${areaName} is now easier than ever with ${domain}.`,
    para2: `The dental clinics in ${areaName} are staffed by experienced professionals trained at top Indian dental colleges and abroad. Many clinics in ${areaName} have invested in modern equipment — digital X-rays, CAD/CAM crown milling, laser dentistry, and intra-oral cameras — ensuring that patients receive world-class care without having to travel across ${cityName}. With ${dentistCount || 'multiple'} verified dentists currently listed in ${areaName}, you can compare fees, check availability, and book appointments instantly.`,
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

export default async function AreaPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const { slug } = await params
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

  const [{ data: area }, { data: allAreas }, { data: treatments }, areaCounts] = await Promise.all([
    // Area slug + city pair — necessary because the same slug may exist in
    // multiple cities (e.g. "central" in Mumbai and Pune).
    supabase.from('areas').select('*').eq('slug', slug).eq('city', citySlug).single(),
    supabase.from('areas').select('id, name, slug, zone, dentist_count').eq('city', citySlug).order('dentist_count', { ascending: false }),
    supabase.from('treatments').select('id, name, slug, icon').order('sort_order'),
    // Live per-area dentist counts — areas.dentist_count is unmaintained (0s).
    getCityAreaDentistCounts(citySlug),
  ])
  const areaCountOf = (id: number | string) => areaCounts[String(id)] ?? 0

  if (!area) notFound()

  // Fetch dentists in this area (belt-and-suspenders city filter — area_id
  // already encodes city, but explicit filter guards against any cross-city
  // FK quirk). lat/lng + review_count are pulled for distance sort and the
  // honest "New / X reviews" badge on the result card.
  let dentistQuery = supabase
    .from('dentists')
    .select(`
      id, slug, name, clinic_name, qualifications, experience_years,
      gender, consultation_fee, emi_available, is_verified, tier,
      profile_photo, whatsapp, phone, working_hours, lat, lng,
      avg_rating, review_count,
      areas(name, slug),
      dentist_treatments(treatments(name, slug))
    `)
    .eq('area_id', area.id)
    .eq('is_active', true)
    .eq('city', citySlug)

  // Attribute filters — these are honoured server-side (previously the
  // gender/verified/emi quick-filter buttons set the params but the page
  // ignored them).
  if (genderFilter) dentistQuery = dentistQuery.eq('gender', genderFilter)
  if (verifiedFilter) dentistQuery = dentistQuery.eq('is_verified', true)
  if (emiFilter) dentistQuery = dentistQuery.eq('emi_available', true)
  // Minimum rating filter. Dentists with NULL avg_rating (no reviews) won't
  // match — "no reviews" is not the same as "at least 4 stars".
  if (ratingFilter) {
    const minRating = parseFloat(ratingFilter)
    if (Number.isFinite(minRating)) dentistQuery = dentistQuery.gte('avg_rating', minRating)
  }

  // Sort. Distance (GPS) always wins when coords are present and is applied
  // in JS below; otherwise the dropdown choice maps to a DB-side order.
  if (!hasCoords) {
    if (sortBy === 'rating') dentistQuery = dentistQuery.order('avg_rating', { ascending: false, nullsFirst: false })
    else if (sortBy === 'fee') dentistQuery = dentistQuery.order('consultation_fee', { ascending: true, nullsFirst: false })
    else dentistQuery = dentistQuery.order('rank_score', { ascending: false })
  } else {
    dentistQuery = dentistQuery.order('rank_score', { ascending: false })
  }

  // An area holds at most a few dozen clinics, so fetch the whole set and do
  // distance/open-now passes in memory rather than paginating server-side.
  dentistQuery = dentistQuery.limit(50)

  const { data: dentistsRaw } = await dentistQuery
  let list = (dentistsRaw || []) as any[]

  // Distance enrichment + sort when coords are present. Dentists without
  // coords sink to the bottom; among those with coords, closest first.
  if (hasCoords) {
    const lat = userLat as number
    const lng = userLng as number
    list = list
      .map(d => {
        const dl = typeof d.lat === 'number' ? d.lat : null
        const dg = typeof d.lng === 'number' ? d.lng : null
        const distance_km = dl !== null && dg !== null ? haversineKm(lat, lng, dl, dg) : null
        return { ...d, distance_km }
      })
      .sort((a, b) => {
        const ad = a.distance_km as number | null
        const bd = b.distance_km as number | null
        if (ad === null && bd === null) return 0
        if (ad === null) return 1
        if (bd === null) return -1
        return ad - bd
      })
  }

  const isMumbai = city.citySlug === 'mumbai'

  // Honest stat-row inputs, computed on the full area set (pre open-now filter
  // so "X open now" reflects the whole area, not the filtered view).
  const totalInArea = list.length
  const openNowCount = list.filter(d => isOpenNowFromHours(d.working_hours)).length
  const verifiedCount = list.filter(d => d.is_verified).length
  const fees = list.map(d => d.consultation_fee).filter((f): f is number => typeof f === 'number' && f > 0)
  const lowestFee = fees.length ? Math.min(...fees) : null
  // Live per-area fee stats for the computed fee guide (0/NULL fees are the
  // "unset" sentinel, already excluded above). These replace the hardcoded
  // "₹200–₹500" that used to render identically on every area page.
  const pricedCount = fees.length
  const avgFee = pricedCount ? Math.round(fees.reduce((sum, f) => sum + f, 0) / pricedCount) : null
  const highestFee = pricedCount ? Math.max(...fees) : null

  // openNow is a JS-side filter: working_hours is JSONB keyed by day-of-week
  // and "open right now" depends on IST clock time.
  const dentistList = openNowFilter ? list.filter(d => isOpenNowFromHours(d.working_hours)) : list
  const visibleDentists = dentistList.slice(0, 4)
  const hiddenDentists = dentistList.slice(4)

  // Highlight the first result: closest match under GPS, best match under the
  // default sort. No badge once the user has explicitly chosen a sort.
  const firstHighlight: 'closest' | 'best' | null = hasCoords
    ? (visibleDentists[0]?.distance_km != null ? 'closest' : null)
    : (!sortBy ? 'best' : null)

  const sortLabel = hasCoords ? SORT_LABELS.nearest : SORT_LABELS[sortBy] || SORT_LABELS.best
  const subtextCount = verifiedCount > 0 ? `${verifiedCount} verified dentist${verifiedCount === 1 ? '' : 's'}` : `${totalInArea} dentist${totalInArea === 1 ? '' : 's'}`

  // Patient-facing "nearby areas": only areas that actually have dentists (the
  // denormalized areas.dentist_count is unmaintained, so we use live counts).
  // Prefer same-zone (Mumbai) / any-other (other cities); if fewer than the slot
  // count qualify, pad with the city's most-populated remaining areas. A patient
  // must never see a "0 dentists" area. SEO crawl links in the footer/sitemap are
  // untouched — this only governs the human-facing widget.
  const NEARBY_SLOTS = 6
  const hasDentists = (a: any) => areaCountOf(a.id) >= 1
  const primaryNearby = (allAreas || [])
    .filter(a => a.slug !== slug && hasDentists(a) && (isMumbai ? a.zone === area.zone : true))
    .sort((a, b) => areaCountOf(b.id) - areaCountOf(a.id))
  const nearbySlugs = new Set(primaryNearby.map(a => a.slug))
  const padNearby = (allAreas || [])
    .filter(a => a.slug !== slug && hasDentists(a) && !nearbySlugs.has(a.slug))
    .sort((a, b) => areaCountOf(b.id) - areaCountOf(a.id))
  const nearbyAreas = [...primaryNearby, ...padNearby].slice(0, NEARBY_SLOTS)

  // Transit line (Mumbai only): `zone` is the suburban railway line. Same-line
  // areas that actually have dentists feed the "Getting to {area}" block. Empty
  // for non-Mumbai cities or areas with no line, so the block is omitted.
  const showTransit = isMumbai && !!area.zone && area.zone !== 'Other'
  const sameLineAreas = showTransit
    ? (allAreas || [])
        .filter(a => a.slug !== slug && a.zone === area.zone && hasDentists(a))
        .sort((a, b) => areaCountOf(b.id) - areaCountOf(a.id))
        .slice(0, 8)
        .map(a => ({ name: a.name, slug: a.slug, count: areaCountOf(a.id) }))
    : []

  // Sidebar "Top Rated" — only dentists with real ratings, best first.
  const topRated = [...list]
    .filter(d => (d.avg_rating || 0) > 0)
    .sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0))
    .slice(0, 4)

  const faqs = getFAQs(area.name, area.dentist_count || totalInArea, { avgFee, minFee: lowestFee, maxFee: highestFee, pricedCount })
  const seoContent = getSEOContent(area.name, area.zone, area.dentist_count || totalInArea, city.cityName, city.domain)

  // JSON-LD schemas
  const origin = `https://${city.domain}`
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: origin },
      { '@type': 'ListItem', position: 2, name: 'Dentists', item: `${origin}/dentists` },
      { '@type': 'ListItem', position: 3, name: area.name, item: `${origin}/area/${slug}` },
    ],
  }

  const localBusinessSchema = {
    '@context': 'https://schema.org',
    '@type': 'MedicalBusiness',
    name: `Best Dentists in ${area.name}, ${city.cityName}`,
    areaServed: `${area.name}, ${city.cityName}`,
    url: `${origin}/area/${slug}`,
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
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 16, flexWrap: 'wrap' }}>
            <Link href="/" style={{ color: 'rgba(255,255,255,0.85)' }}>{city.cityName}</Link>
            <span>›</span>
            <Link href="/dentists" style={{ color: 'rgba(255,255,255,0.85)' }}>Dentists</Link>
            <span>›</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>{area.name}</span>
          </nav>

          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.6rem, 5vw, 2.4rem)', color: '#fff', marginBottom: 8, lineHeight: 1.2 }}>
            Dentists in {area.name}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15, marginBottom: 20 }}>
            {subtextCount} · sorted by {sortLabel}
          </p>

          {/* Honest stat row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {[
              { value: String(totalInArea), label: totalInArea === 1 ? 'dentist' : 'dentists' },
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

      {/* TREATMENT NAV TABS */}
      <TreatmentNavTabs areaSlug={slug} treatments={(treatments || []).map(t => ({ name: t.name, slug: t.slug, icon: t.icon || '🦷' }))} activeTab="" />

      <main style={{ background: 'var(--bg)', padding: '24px 20px' }}>
        <div className="container">
          <div className="area-layout">

            {/* MAIN CONTENT */}
            <div className="area-main">

              {/* Filter / sort pills */}
              <ResultFilters basePath={`/area/${slug}`} />

              {/* Dentist list */}
              <div style={{ marginTop: 20 }}>
                {dentistList.length === 0 ? (
                  <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '40px 24px', textAlign: 'center' }}>
                    <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 19, fontWeight: 800, color: NAVY, marginBottom: 8 }}>
                      We&apos;re adding dentists in {area.name} soon
                    </h2>
                    <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 22 }}>
                      {openNowFilter || verifiedFilter || emiFilter || genderFilter || ratingFilter
                        ? 'No dentists match these filters right now. Try clearing some, or see nearby areas:'
                        : 'Meanwhile, see dentists in nearby areas:'}
                    </p>
                    {nearbyAreas.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 22 }}>
                        {nearbyAreas.map(a => (
                          <Link key={a.slug} href={`/area/${a.slug}`} style={{
                            padding: '8px 16px', background: '#F0FDFA', color: TEAL,
                            border: '1px solid #99F6E4', borderRadius: 20, fontSize: 13, fontWeight: 600,
                          }}>📍 {a.name}</Link>
                        ))}
                      </div>
                    )}
                    <Link href="/dentists" className="btn btn-primary">Browse all {city.cityName} dentists</Link>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {visibleDentists.map((d, i) => (
                        <DentistResultCard key={d.id} dentist={d} highlight={i === 0 ? firstHighlight : null} />
                      ))}
                    </div>
                    <ShowMoreButton key={slug} count={hiddenDentists.length} areaName={area.name}>
                      {hiddenDentists.map(d => <DentistResultCard key={d.id} dentist={d} />)}
                    </ShowMoreButton>
                  </>
                )}
              </div>

              {/* Local consultation-fee guide — computed live from this area's
                  dentists (unique per area). */}
              <div style={{ marginTop: 40 }}>
                <LocalFeeGuide
                  areaName={area.name}
                  totalCount={totalInArea}
                  pricedCount={pricedCount}
                  avgFee={avgFee}
                  minFee={lowestFee}
                  maxFee={highestFee}
                />
              </div>

              {/* Transit line — Mumbai only, when the area sits on a line with
                  other dentist-bearing areas. */}
              {showTransit && sameLineAreas.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <TransitLineGuide areaName={area.name} zone={area.zone} lineAreas={sameLineAreas} />
                </div>
              )}

              {/* Cost Guide — generic treatment price ranges (indicative). */}
              <div style={{ marginTop: 24 }}>
                <CostGuide areaName={area.name} />
              </div>

              {/* FAQ */}
              <div style={{ marginTop: 48 }}>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, marginBottom: 24 }}>
                  Frequently Asked Questions — Dentists in {area.name}
                </h2>
                <AreaFAQAccordion items={faqs} />
              </div>

              {/* Nearby Areas */}
              {nearbyAreas.length > 0 && (
                <div style={{ marginTop: 48 }}>
                  <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, marginBottom: 20 }}>
                    Dentists in Nearby Areas
                  </h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                    {nearbyAreas.map(a => (
                      <Link key={a.slug} href={`/area/${a.slug}`} className="area-card" style={{
                        padding: '16px', background: '#fff', border: '1px solid var(--border)',
                        borderRadius: 12, cursor: 'pointer', transition: 'all 0.2s', display: 'block',
                      }}>
                        <div style={{ fontWeight: 600, fontSize: 15, fontFamily: 'var(--font-heading)', marginBottom: 4 }}>{a.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{dentistCountLabel(areaCountOf(a.id))}</div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* SEO Content Block */}
              <div style={{ marginTop: 56, padding: '40px', background: '#fff', borderRadius: 16, border: '1px solid var(--border)' }}>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, marginBottom: 20 }}>
                  Dentists in {area.name}, {city.cityName} — Complete Guide
                </h2>
                <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 20 }}>{seoContent.intro}</p>
                <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 28 }}>{seoContent.para2}</p>

                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, marginBottom: 12 }}>
                  Dental Specialities Available in {area.name}
                </h3>
                <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 28 }}>
                  Dental clinics in {area.name} cover the full spectrum of treatments — from preventive care (scaling, cleanings, sealants) to restorative (fillings, crowns, bridges), cosmetic (veneers, teeth whitening, smile makeovers), orthodontic (metal braces, ceramic braces, clear aligners), and surgical (implants, wisdom tooth extraction, bone grafting). Several clinics also offer paediatric dentistry with child-friendly environments.
                </p>

                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, marginBottom: 12 }}>
                  How to Choose a Dentist in {area.name}
                </h3>
                <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 28 }}>
                  When choosing a dentist in {area.name}, verify their State Dental Council registration number, check their specialisation relative to your treatment need, and read at least 10 patient reviews. Fee transparency is also important — a trustworthy clinic will give you a written treatment plan with costs before starting any procedure. All dentists on {city.domain} have been manually verified before listing.
                </p>

                {/* Quick Facts Table */}
                <div style={{ background: 'var(--bg)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <div style={{ padding: '12px 20px', background: '#F0FDFA', fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-heading)', color: NAVY }}>
                    Quick Facts: {area.name}
                  </div>
                  {[
                    { label: 'Area', value: area.name },
                    // Zone is Mumbai-only context (Western/Central/Harbour…).
                    ...(isMumbai && area.zone ? [{ label: 'Zone', value: area.zone }] : []),
                    { label: 'Dentists Listed', value: String(area.dentist_count || totalInArea || '10+') },
                    // Computed from this area's priced clinics; generic range only when none publish a fee.
                    { label: 'Avg Consultation Fee', value: avgFee !== null ? `₹${avgFee.toLocaleString('en-IN')}` : '₹200 – ₹500' },
                    { label: 'Best For', value: 'Implants, Cosmetic Dentistry, Orthodontics' },
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

            {/* RIGHT SIDEBAR — lighter: Top Rated + Nearby (stacks below on mobile) */}
            <aside className="area-sidebar">
              {/* Top Rated */}
              {topRated.length > 0 && (
                <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '20px' }}>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 14 }}>
                    Top Rated in {area.name}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {topRated.map(d => (
                      <Link key={d.id} href={`/dentist/${d.slug}`} style={{ display: 'flex', gap: 10, alignItems: 'center', textDecoration: 'none' }}>
                        <div style={{ width: 40, height: 40, borderRadius: 8, background: '#F0FDFA', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: TEAL, fontWeight: 800 }}>
                          {d.profile_photo ? <img src={d.profile_photo} alt={d.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🦷'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: NAVY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>★ {(d.avg_rating || 0).toFixed(1)}{d.consultation_fee ? ` · ₹${d.consultation_fee}` : ''}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Nearby Areas */}
              {nearbyAreas.length > 0 && (
                <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '20px' }}>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 14 }}>Nearby Areas</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {nearbyAreas.map(a => (
                      <Link key={a.slug} href={`/area/${a.slug}`} style={{
                        padding: '10px', background: 'var(--bg)', border: '1px solid var(--border)',
                        borderRadius: 8, textAlign: 'center',
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{a.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{dentistCountLabel(areaCountOf(a.id))}</div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* For-dentists CTA */}
              <div style={{ background: NAVY, borderRadius: 16, padding: '20px', textAlign: 'center' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: '#fff', marginBottom: 8 }}>
                  Are you a dentist in {area.name}?
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

      {area.slug === 'hinjewadi' && (
        <div style={{
          maxWidth: '680px',
          margin: '1rem auto 0',
          padding: '0 1rem'
        }}>
          <a href="/area/hinjewadi-phase-1" style={{
            fontSize: '14px',
            color: '#185FA5',
            textDecoration: 'none'
          }}>
            Looking for a dentist near Hinjewadi Phase 1? →
          </a>
        </div>
      )}

      {area.description && (
        <div style={{
          maxWidth: '680px',
          margin: '0 auto',
          padding: '2rem 1rem',
          borderTop: '1px solid #E5E7EB'
        }}>
          <p style={{
            fontSize: '14px',
            color: '#52514E',
            lineHeight: '1.7',
            margin: '0 0 1rem 0'
          }}>
            {area.description}
          </p>
          {area.seo_content && (
            <p style={{
              fontSize: '13px',
              color: '#898781',
              lineHeight: '1.7',
              margin: '0'
            }}>
              {area.seo_content}
            </p>
          )}
        </div>
      )}

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
        .area-layout { display: flex; gap: 28px; align-items: flex-start; }
        .area-main { flex: 1; min-width: 0; }
        .area-sidebar {
          width: 280px; flex-shrink: 0;
          display: flex; flex-direction: column; gap: 20px;
          position: sticky; top: 88px;
        }
        @media (max-width: 900px) {
          .area-layout { flex-direction: column; align-items: stretch; }
          .area-sidebar { width: 100%; position: static; margin-top: 32px; }
        }
      `}</style>
    </>
  )
}
