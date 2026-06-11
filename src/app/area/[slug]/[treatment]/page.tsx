import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getCityBySlug, cityBrandName, cityBrandTld } from '@/config/cities'
import TreatmentNavTabs from '../TreatmentNavTabs'
import QuickFilters from '../QuickFilters'
import ShowMoreButton from '../ShowMoreButton'
import CostGuide from '../CostGuide'
import AreaFAQAccordion from '../AreaFAQAccordion'
import DentistCard from '@/components/DentistCard'
import { isOpenNowFromHours } from '@/lib/time'

// Mirrors the parent /area/[slug] page: headers()-based city resolution forces
// dynamic rendering, so no generateStaticParams / ISR here.
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string; treatment: string }> }): Promise<Metadata> {
  const { slug, treatment: treatmentSlug } = await params
  const supabase = await createClient()
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  const [{ data: area }, { data: treatment }] = await Promise.all([
    supabase.from('areas').select('name, dentist_count').eq('slug', slug).eq('city', city.citySlug).single(),
    supabase.from('treatments').select('name').eq('slug', treatmentSlug).single(),
  ])
  if (!area || !treatment) return { title: 'Not Found' }
  return {
    title: `Best ${treatment.name} Dentists in ${area.name}, ${city.cityName} | ${city.domain}`,
    description: `Find top-rated, verified dentists for ${treatment.name} in ${area.name}, ${city.cityName}. Compare ${treatment.name} fees, read reviews, and book appointments instantly.`,
    alternates: { canonical: `https://${city.domain}/area/${slug}/${treatmentSlug}` },
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
      a: `The best dentist for ${treatmentName} in ${areaName} is one who is MCI registered, specialises in this treatment, and has strong patient reviews. We list ${dentistCount || 'several'} verified dentists in ${areaName} offering ${treatmentName}, sorted by rating and relevance, so you can compare qualifications, fees, and reviews side by side.`,
    },
    {
      q: `How long does ${treatmentName} take?`,
      a: `The duration of ${treatmentName} depends on your individual case. Routine procedures are often completed in a single visit, while more complex treatments may need multiple appointments over a few weeks. Your dentist in ${areaName} will share an exact timeline during your consultation.`,
    },
    {
      q: `Are there dentists offering ${treatmentName} open on Sunday in ${areaName}?`,
      a: `Yes, several dental clinics in ${areaName} offer ${treatmentName} with limited Sunday hours (usually 10am–2pm). Use the "Open Now" filter to find clinics currently accepting patients.`,
    },
    {
      q: `Do dentists in ${areaName} offer EMI for ${treatmentName}?`,
      a: `Many clinics in ${areaName} offer EMI and no-cost financing options for ${treatmentName}, especially on higher-value treatments. Look for the "EMI Available" badge on the listings below or confirm with the clinic directly.`,
    },
  ]
}

function getSEOContent(treatmentName: string, areaName: string, cityName: string, domain: string, dentistCount: number) {
  return {
    intro: `Looking for ${treatmentName} in ${areaName}? ${areaName} is home to a range of dental clinics offering ${treatmentName} — from boutique studios to multi-specialty practices. Whether this is a routine procedure or a complex case, ${domain} helps you find the right ${treatmentName} specialist in ${areaName}, ${cityName}, with transparent fees and verified reviews.`,
    para2: `The clinics offering ${treatmentName} in ${areaName} are staffed by experienced professionals using modern equipment and proven techniques. With ${dentistCount || 'multiple'} verified dentists currently listed for ${treatmentName} in ${areaName}, you can compare fees, check availability, and book an appointment instantly — without travelling across ${cityName}.`,
  }
}

export default async function AreaTreatmentPage({ params, searchParams }: { params: Promise<{ slug: string; treatment: string }>; searchParams: Promise<Record<string, string>> }) {
  const { slug, treatment: treatmentSlug } = await params
  const sp = await searchParams
  const ratingFilter = sp.rating || ''
  const openNowFilter = sp.open === 'true'
  const supabase = await createClient()
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  const citySlug = city.citySlug

  const [{ data: area }, { data: treatment }, { data: allAreas }, { data: treatments }] = await Promise.all([
    // Area slug + city pair — the same slug may exist in multiple cities.
    supabase.from('areas').select('*').eq('slug', slug).eq('city', citySlug).single(),
    supabase.from('treatments').select('*').eq('slug', treatmentSlug).single(),
    supabase.from('areas').select('id, name, slug, zone, dentist_count').eq('city', citySlug).order('dentist_count', { ascending: false }),
    supabase.from('treatments').select('id, name, slug, icon').order('sort_order'),
  ])

  // Either segment missing → 404. This is what fixes the broken treatment-tab
  // links across every area page.
  if (!area || !treatment) notFound()

  // Dentists in this area AND offering this treatment. The !inner join on
  // dentist_treatments turns the embed into a filter (matches the pattern in
  // /treatment/[slug]); area + city filters are belt-and-suspenders.
  let dentistQuery = supabase
    .from('dentists')
    .select(`
      id, slug, name, clinic_name, qualifications, experience_years,
      gender, consultation_fee, emi_available, is_verified, tier,
      profile_photo, whatsapp, phone, working_hours, avg_rating,
      areas(name, slug),
      dentist_treatments!inner(treatments(name, slug))
    `)
    .eq('area_id', area.id)
    .eq('is_active', true)
    .eq('city', citySlug)
    .eq('dentist_treatments.treatment_id', treatment.id)
    .order('rank_score', { ascending: false })
    .limit(20)

  // Minimum rating filter. NULL avg_rating (no reviews) won't match — "no
  // reviews" is not the same as "at least 4 stars".
  if (ratingFilter) {
    const minRating = parseFloat(ratingFilter)
    if (Number.isFinite(minRating)) dentistQuery = dentistQuery.gte('avg_rating', minRating)
  }

  const { data: dentists } = await dentistQuery

  // openNow is a JS-side filter on the JSONB working_hours; .limit(20) is a
  // curation cap, not pagination.
  const isMumbai = city.citySlug === 'mumbai'
  const dentistList = openNowFilter
    ? (dentists || []).filter(d => isOpenNowFromHours((d as any).working_hours))
    : (dentists || [])
  const visibleDentists = dentistList.slice(0, 4)
  const hiddenDentists = dentistList.slice(4)
  // Mumbai groups "nearby" by suburban-rail line (zone); other cities fall
  // back to any other area within the same city.
  const nearbyAreas = (allAreas || [])
    .filter(a => a.slug !== slug && (isMumbai ? a.zone === area.zone : true))
    .slice(0, 6)
  const topSidebarDentists = dentistList.filter(d => d.tier === 'featured' || d.tier === 'gold').slice(0, 4)
  const faqs = getTreatmentFAQs(treatment.name, area.name, dentistList.length)
  const seoContent = getSEOContent(treatment.name, area.name, city.cityName, city.domain, dentistList.length)

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

      {/* NAV */}
      <header style={{ background: '#fff', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 }}>
        <nav className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 68 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, background: 'var(--blue)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontFamily: 'var(--font-heading)', fontSize: 18 }}>D</div>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17 }}>{cityBrandName(city)}<span style={{ color: 'var(--blue)' }}>{cityBrandTld(city)}</span></span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link href="/dentists" style={{ padding: '8px 16px', fontWeight: 500, fontSize: 14, color: 'var(--text-secondary)' }}>Find Dentists</Link>
            <Link href="/for-dentists" style={{ padding: '8px 16px', fontWeight: 500, fontSize: 14, color: 'var(--text-secondary)' }}>For Dentists</Link>
            <Link href="/for-dentists/register" className="btn btn-primary btn-sm">List Your Clinic</Link>
          </div>
        </nav>
      </header>

      {/* BREADCRUMB */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '10px 20px' }}>
        <div className="container">
          <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', flexWrap: 'wrap' }}>
            <Link href="/" style={{ color: 'var(--blue)' }}>Home</Link>
            <span>›</span>
            <Link href="/dentists" style={{ color: 'var(--blue)' }}>Dentists</Link>
            <span>›</span>
            <Link href={`/area/${slug}`} style={{ color: 'var(--blue)' }}>{area.name}</Link>
            <span>›</span>
            <span style={{ color: 'var(--text)', fontWeight: 500 }}>{treatment.name}</span>
          </nav>
        </div>
      </div>

      {/* HERO */}
      <section style={{ background: 'linear-gradient(135deg, #003F7A 0%, #0057A8 60%, #1A6FC4 100%)', padding: '48px 20px 52px', position: 'relative', overflow: 'hidden' }}>
        {/* Watermark */}
        <div aria-hidden="true" style={{
          position: 'absolute', right: '-5%', top: '50%', transform: 'translateY(-50%)',
          fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(80px, 15vw, 160px)',
          color: 'rgba(255,255,255,0.04)', lineHeight: 1, userSelect: 'none', pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}>{area.name}</div>

        <div className="container" style={{ position: 'relative' }}>
          <div style={{ marginBottom: 16 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
            }}>
              {treatment.icon || '🦷'} {treatment.name} · {area.name}
            </span>
          </div>

          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: '#fff', marginBottom: 12, lineHeight: 1.2 }}>
            Best {treatment.name} Dentists in {area.name}, {city.cityName}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16, maxWidth: 560, marginBottom: 32, lineHeight: 1.7 }}>
            Find top-rated, verified dentists for {treatment.name} in {area.name}. Compare fees, read reviews, book appointments instantly.
          </p>

          {/* Stats chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {[
              { label: `${treatment.name} Dentists`, value: dentistList.length || '5+' },
              { label: 'Verified', value: dentistList.filter(d => d.is_verified).length || '3+' },
              { label: 'Avg Consultation', value: '₹300' },
              { label: 'Avg Rating', value: '4.5★' },
            ].map(stat => (
              <div key={stat.label} style={{
                padding: '10px 20px', background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.2)', borderRadius: 12,
                textAlign: 'center', minWidth: 120,
              }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color: '#fff' }}>{stat.value}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TREATMENT NAV TABS — active tab reflects the current treatment */}
      <TreatmentNavTabs areaSlug={slug} treatments={(treatments || []).map(t => ({ name: t.name, slug: t.slug, icon: t.icon || '🦷' }))} activeTab={treatmentSlug} />

      <main style={{ background: 'var(--bg)', padding: '32px 20px' }}>
        <div className="container">
          <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>

            {/* MAIN CONTENT */}
            <div style={{ flex: 1, minWidth: 0 }}>

              {/* Quick filters */}
              <QuickFilters areaSlug={slug} totalCount={dentistList.length} areaName={area.name} />

              {/* Dentist list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
                {visibleDentists.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 16, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
                    <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No {treatment.name} dentists listed yet in {area.name}</h3>
                    <p style={{ color: 'var(--muted)', marginBottom: 20 }}>
                      Try <Link href={`/area/${slug}`} style={{ color: 'var(--blue)', fontWeight: 600 }}>all dentists in {area.name}</Link>, or be the first {treatment.name} clinic to list here.
                    </p>
                    <Link href="/for-dentists/register" className="btn btn-primary">List Your Clinic Free</Link>
                  </div>
                ) : (
                  visibleDentists.map(d => <DentistCard key={d.id} dentist={d as any} view="list" />)
                )}
              </div>

              {/* Show more */}
              <ShowMoreButton hiddenDentists={hiddenDentists as any} areaName={area.name} />

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

              {/* Nearby Areas */}
              {nearbyAreas.length > 0 && (
                <div style={{ marginTop: 48 }}>
                  <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, marginBottom: 20 }}>
                    {treatment.name} in Nearby Areas
                  </h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                    {nearbyAreas.map(a => (
                      <Link key={a.slug} href={`/area/${a.slug}/${treatmentSlug}`} className="area-card" style={{
                        padding: '16px', background: '#fff', border: '1px solid var(--border)',
                        borderRadius: 12, cursor: 'pointer', transition: 'all 0.2s', display: 'block',
                      }}>
                        <div style={{ fontWeight: 600, fontSize: 15, fontFamily: 'var(--font-heading)', marginBottom: 4 }}>{a.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{treatment.name}</div>
                      </Link>
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
                  When choosing a dentist for {treatment.name} in {area.name}, verify their MCI registration, confirm they specialise in this treatment, and read at least 10 patient reviews. A trustworthy clinic will give you a written treatment plan with costs before starting. All dentists on {city.domain} are manually verified before listing.
                </p>

                {/* Quick Facts Table */}
                <div style={{ background: 'var(--bg)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <div style={{ padding: '12px 20px', background: 'var(--blue-light)', fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-heading)', color: 'var(--blue-dark)' }}>
                    Quick Facts: {treatment.name} in {area.name}
                  </div>
                  {[
                    { label: 'Treatment', value: treatment.name },
                    { label: 'Area', value: area.name },
                    // Zone is Mumbai-only context (Western/Central/Harbour…).
                    ...(isMumbai && area.zone ? [{ label: 'Zone', value: area.zone }] : []),
                    { label: 'Dentists Listed', value: String(dentistList.length || '5+') },
                    { label: 'Avg Consultation Fee', value: '₹200 – ₹500' },
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

            {/* RIGHT SIDEBAR */}
            <aside style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 20, position: 'sticky', top: 88 }} className="filter-sidebar-desktop">

              {/* Quick Search */}
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '20px' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 14 }}>All dentists in {area.name}</h3>
                <Link href={`/area/${slug}`} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                  View All Dentists →
                </Link>
              </div>

              {/* Top Rated */}
              {topSidebarDentists.length > 0 && (
                <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '20px' }}>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 14 }}>
                    Top Rated for {treatment.name}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {topSidebarDentists.map(d => (
                      <Link key={d.id} href={`/dentist/${d.slug}`} style={{ display: 'flex', gap: 10, alignItems: 'center', textDecoration: 'none' }}>
                        <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--blue-light)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                          {d.profile_photo ? <img src={d.profile_photo} alt={d.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }} /> : '🦷'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, fontFamily: 'var(--font-heading)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{d.consultation_fee ? `₹${d.consultation_fee}` : 'Call for price'}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Other Treatments in Area */}
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '20px' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 14 }}>
                  Treatments in {area.name}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(treatments || []).slice(0, 8).map(t => {
                    const isCurrent = t.slug === treatmentSlug
                    return (
                      <Link key={t.slug} href={`/area/${slug}/${t.slug}`} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0',
                        borderBottom: '1px solid var(--border)', fontSize: 13,
                        color: isCurrent ? 'var(--blue)' : 'var(--text)', fontWeight: isCurrent ? 700 : 400,
                      }}>
                        <span>{t.icon}</span>
                        <span style={{ flex: 1 }}>{t.name} in {area.name}</span>
                        <span style={{ color: 'var(--blue)', fontSize: 12 }}>→</span>
                      </Link>
                    )
                  })}
                </div>
              </div>

              {/* Nearby Areas */}
              {nearbyAreas.length > 0 && (
                <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '20px' }}>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Nearby Areas</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {nearbyAreas.map(a => (
                      <Link key={a.slug} href={`/area/${a.slug}/${treatmentSlug}`} style={{
                        padding: '10px', background: 'var(--bg)', border: '1px solid var(--border)',
                        borderRadius: 8, textAlign: 'center',
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{treatment.name}</div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* CTA */}
              <div style={{ background: 'var(--blue-dark)', borderRadius: 16, padding: '24px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🦷</div>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: '#fff', marginBottom: 8 }}>
                  Do you offer {treatment.name} in {area.name}?
                </h3>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 16, lineHeight: 1.6 }}>
                  Get discovered by patients in {area.name} for free.
                </p>
                <Link href="/for-dentists/register" style={{
                  display: 'block', padding: '10px 20px', background: '#fff', color: 'var(--blue)',
                  borderRadius: 8, fontSize: 13, fontWeight: 700,
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
    </>
  )
}
