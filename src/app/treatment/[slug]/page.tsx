import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getCityBySlug, cityOrigin } from '@/config/cities'
import SiteHeader from '@/components/SiteHeader'
import ResultFilters from '@/components/ResultFilters'
import ShowMoreButton from '@/app/area/[slug]/ShowMoreButton'
import AreaFAQAccordion from '@/app/area/[slug]/AreaFAQAccordion'
import DentistResultCard from '@/components/DentistResultCard'
import { isOpenNowFromHours } from '@/lib/time'
import { haversineKm } from '@/lib/distance'
import { NAVY, NAVY_SOFT, TEAL } from '@/app/dentist/[slug]/profileTheme'

// headers() forces dynamic rendering; ISR revalidate would be a no-op.
export const dynamic = 'force-dynamic'

// This page lives at /treatment/[slug] — the dynamic segment IS the treatment
// slug. There is no area context here; this is the city-wide landing page for
// a single treatment ("Dental implants in Mumbai"). Area filtering happens on
// the area pages instead.
interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string>>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  const { data: treatment } = await supabase.from('treatments').select('name').eq('slug', slug).single()
  if (!treatment) return {}
  return {
    title: `${treatment.name} in ${city.cityName} | Verified Dentists & Fees`,
    description: `Find top-rated dentists for ${treatment.name} in ${city.cityName}. Compare ${treatment.name.toLowerCase()} fees, read reviews, check who's open now, and book appointments online.`,
    alternates: { canonical: `${cityOrigin(city)}/treatment/${slug}` },
  }
}

// City-wide treatment FAQ — leads with the cost question that ranks for
// "[treatment] cost in [city]". Mirrors the area+treatment FAQ shape.
function getTreatmentFAQs(treatmentName: string, cityName: string, domain: string, dentistCount: number) {
  const t = treatmentName.toLowerCase()
  return [
    {
      q: `How much does ${treatmentName} cost in ${cityName}?`,
      a: `The cost of ${t} in ${cityName} varies by clinic tier, doctor experience, and case complexity. The verified dentists listed below show their starting fees for ${t} so you can compare before booking. Many clinics also offer EMI or no-cost financing on higher-value treatments.`,
    },
    {
      q: `Which is the best dentist for ${treatmentName} in ${cityName}?`,
      a: `The best dentist for ${t} in ${cityName} is one who is State Dental Council registered, specialises in this treatment, and has strong patient reviews. We list ${dentistCount || 'several'} verified dentists offering ${t} across ${cityName}, sorted by relevance, rating, fee, or distance from you.`,
    },
    {
      q: `Are dentists offering ${treatmentName} open on Sunday in ${cityName}?`,
      a: `Yes, several clinics in ${cityName} offer ${t} with limited Sunday hours (usually 10am–2pm). Use the "Open now" filter above to find clinics currently accepting patients.`,
    },
    {
      q: `Do dentists in ${cityName} offer EMI for ${treatmentName}?`,
      a: `Many clinics in ${cityName} offer EMI and no-cost financing for ${t}, especially on higher-value cases. Use the "EMI" filter above, or confirm directly with the clinic. All dentists on ${domain} are manually verified before listing.`,
    },
  ]
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

export default async function TreatmentPage({ params, searchParams }: Props) {
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
  const origin = cityOrigin(city)

  const [{ data: treatment }, { data: allTreatments }] = await Promise.all([
    supabase.from('treatments').select('*').eq('slug', slug).single(),
    supabase.from('treatments').select('id, name, slug, icon').order('sort_order'),
  ])
  if (!treatment) notFound()

  // Dentists who offer THIS treatment. dentist_treatments!inner + the
  // treatment_id filter turns the embed into a join filter, so only matching
  // dentists return AND the embedded row is just this treatment (giving us its
  // fee_from). avg_rating/review_count (not the legacy `rating` column) are
  // selected to match what DentistResultCard reads for its New / X-reviews
  // logic. lat/lng power the GPS distance sort.
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
    .eq('is_active', true)
    .eq('city', citySlug)
    .eq('dentist_treatments.treatment_id', treatment.id)

  // Attribute filters — honoured server-side (same set as the area page).
  if (genderFilter) dentistQuery = dentistQuery.eq('gender', genderFilter)
  if (verifiedFilter) dentistQuery = dentistQuery.eq('is_verified', true)
  if (emiFilter) dentistQuery = dentistQuery.eq('emi_available', true)
  if (ratingFilter) {
    const minRating = parseFloat(ratingFilter)
    if (Number.isFinite(minRating)) dentistQuery = dentistQuery.gte('avg_rating', minRating)
  }

  // rank_score is the deterministic DB baseline; distance / fee_from / rating
  // re-sorts happen in JS below. fee_from lives on the embedded join row, so
  // "lowest fee" can't be a top-level DB order anyway — keeping all the
  // re-sorts in JS keeps the treatment-fee ordering correct and consistent.
  dentistQuery = dentistQuery.order('rank_score', { ascending: false }).limit(100)

  const { data: dentistsRaw } = await dentistQuery

  // Surface this treatment's fee_from on each row for the card note, the
  // stat row, and the lowest-fee sort.
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
    // Lowest treatment fee first; dentists without a recorded fee_from sink.
    list.sort((a, b) => {
      const af = a._feeFrom, bf = b._feeFrom
      if (af === null && bf === null) return 0
      if (af === null) return 1
      if (bf === null) return -1
      return af - bf
    })
  }

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
  const subtext = `${totalOffering} dentist${totalOffering === 1 ? '' : 's'} offer this${lowestFee !== null ? ` · from ₹${lowestFee.toLocaleString('en-IN')}` : ''}`

  // Treatment context note per card: the dentist's starting fee for THIS
  // treatment, falling back to a plain "offers this" confirmation.
  const noteFor = (d: { _feeFrom: number | null }) =>
    d._feeFrom !== null ? `${treatment.name} from ₹${d._feeFrom.toLocaleString('en-IN')}` : `Offers ${treatment.name}`

  // Sidebar "Top Rated" — only dentists with real ratings, best first.
  const topRated = [...list]
    .filter(d => (d.avg_rating || 0) > 0)
    .sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0))
    .slice(0, 4)

  // Cross-link to other treatments (exclude the current one).
  const otherTreatments = (allTreatments || []).filter(t => t.slug !== slug)

  const faqs = getTreatmentFAQs(treatment.name, city.cityName, city.domain, totalOffering)

  // JSON-LD
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MedicalWebPage',
    name: `${treatment.name} in ${city.cityName}`,
    description: `Find verified dentists for ${treatment.name} in ${city.cityName}`,
    url: `${origin}/treatment/${slug}`,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: origin },
        { '@type': 'ListItem', position: 2, name: 'Treatments', item: `${origin}/dentists` },
        { '@type': 'ListItem', position: 3, name: treatment.name, item: `${origin}/treatment/${slug}` },
      ],
    },
  }
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      {/* NAV — shared across all public pages */}
      <SiteHeader city={city} />

      {/* HERO — navy, patient-first */}
      <section style={{ background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_SOFT} 100%)`, padding: '28px 20px 36px' }}>
        <div className="container">
          <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 16, flexWrap: 'wrap' }}>
            <Link href="/" style={{ color: 'rgba(255,255,255,0.85)' }}>{city.cityName}</Link>
            <span>›</span>
            <Link href="/dentists" style={{ color: 'rgba(255,255,255,0.85)' }}>Treatments</Link>
            <span>›</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>{treatment.name}</span>
          </nav>

          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.6rem, 5vw, 2.4rem)', color: '#fff', marginBottom: 8, lineHeight: 1.2 }}>
            {treatment.name} in {city.cityName}
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

      <main style={{ background: 'var(--bg)', padding: '24px 20px' }}>
        <div className="container">
          <div className="tr-layout">

            {/* MAIN CONTENT */}
            <div className="tr-main">

              {/* Filter / sort pills */}
              <ResultFilters basePath={`/treatment/${slug}`} />

              {/* Dentist list */}
              <div style={{ marginTop: 20 }}>
                {dentistList.length === 0 ? (
                  <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '40px 24px', textAlign: 'center' }}>
                    <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 19, fontWeight: 800, color: NAVY, marginBottom: 8 }}>
                      No dentists offer {treatment.name} in {city.cityName} yet
                    </h2>
                    <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 22 }}>
                      {openNowFilter || verifiedFilter || emiFilter || genderFilter || ratingFilter
                        ? 'No matches for these filters right now. Try clearing some, or explore other treatments:'
                        : 'We’re onboarding specialists. Meanwhile, browse all dentists or explore other treatments:'}
                    </p>
                    {otherTreatments.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 22 }}>
                        {otherTreatments.slice(0, 6).map(t => (
                          <Link key={t.slug} href={`/treatment/${t.slug}`} style={{
                            padding: '8px 16px', background: '#F0FDFA', color: TEAL,
                            border: '1px solid #99F6E4', borderRadius: 20, fontSize: 13, fontWeight: 600,
                          }}>{t.icon || '🦷'} {t.name}</Link>
                        ))}
                      </div>
                    )}
                    <Link href="/dentists" className="btn btn-primary">Browse all {city.cityName} dentists</Link>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {visibleDentists.map((d, i) => (
                        <DentistResultCard key={d.id} dentist={d} highlight={i === 0 ? firstHighlight : null} treatmentNote={noteFor(d)} />
                      ))}
                    </div>
                    <ShowMoreButton key={slug} count={hiddenDentists.length} areaName={city.cityName}>
                      {hiddenDentists.map(d => <DentistResultCard key={d.id} dentist={d} treatmentNote={noteFor(d)} />)}
                    </ShowMoreButton>
                  </>
                )}
              </div>

              {/* FAQ */}
              <div style={{ marginTop: 48 }}>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, marginBottom: 24 }}>
                  Frequently Asked Questions — {treatment.name} in {city.cityName}
                </h2>
                <AreaFAQAccordion items={faqs} />
              </div>

              {/* SEO content block — ranks for "[treatment] in [city]". */}
              <div style={{ marginTop: 48, padding: '40px', background: '#fff', borderRadius: 16, border: '1px solid var(--border)' }}>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, marginBottom: 16 }}>
                  {treatment.name} in {city.cityName} — What to Expect
                </h2>
                <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 16 }}>
                  {city.cityName} has a growing number of specialist clinics offering {treatment.name.toLowerCase()}. The verified dentists listed above can be compared by experience, starting fee, patient ratings, and how close they are to you — so you can shortlist the right {treatment.name.toLowerCase()} provider without travelling across {city.cityName}.
                </p>
                <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 16 }}>
                  Fees for {treatment.name.toLowerCase()} depend on materials, clinic tier, and case complexity. A trustworthy clinic will give you a written treatment plan with costs before starting any procedure, and many offer EMI on higher-value treatments. Always confirm the inclusions — consultation, imaging, and follow-ups are sometimes priced separately.
                </p>
                <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                  All dentists listed on {city.domain} for {treatment.name.toLowerCase()} are State Dental Council-verified and manually reviewed by our team before listing.
                </p>
              </div>
            </div>

            {/* RIGHT SIDEBAR — stacks below on mobile */}
            <aside className="tr-sidebar">
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

              {/* Other treatments */}
              {otherTreatments.length > 0 && (
                <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '20px' }}>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 14 }}>Other Treatments</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {otherTreatments.slice(0, 8).map(t => (
                      <Link key={t.slug} href={`/treatment/${t.slug}`} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0',
                        borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text)',
                      }}>
                        <span>{t.icon || '🦷'}</span>
                        <span style={{ flex: 1 }}>{t.name} in {city.cityName}</span>
                        <span style={{ color: TEAL, fontSize: 12 }}>→</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* For-dentists CTA */}
              <div style={{ background: NAVY, borderRadius: 16, padding: '20px', textAlign: 'center' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: '#fff', marginBottom: 8 }}>
                  Do you offer {treatment.name.toLowerCase()}?
                </h3>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 16, lineHeight: 1.6 }}>
                  Get discovered by patients in {city.cityName} searching for {treatment.name.toLowerCase()} — free.
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
      <footer style={{ background: '#0A1628', padding: '40px 20px 24px', color: 'rgba(255,255,255,0.6)' }}>
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
        .tr-layout { display: flex; gap: 28px; align-items: flex-start; }
        .tr-main { flex: 1; min-width: 0; }
        .tr-sidebar {
          width: 280px; flex-shrink: 0;
          display: flex; flex-direction: column; gap: 20px;
          position: sticky; top: 88px;
        }
        @media (max-width: 900px) {
          .tr-layout { flex-direction: column; align-items: stretch; }
          .tr-sidebar { width: 100%; position: static; margin-top: 32px; }
        }
      `}</style>
    </>
  )
}
