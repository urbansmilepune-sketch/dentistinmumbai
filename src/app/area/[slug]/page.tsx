import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getCityBySlug, cityBrandName, cityBrandTld } from '@/config/cities'
import TreatmentNavTabs from './TreatmentNavTabs'
import QuickFilters from './QuickFilters'
import ShowMoreButton from './ShowMoreButton'
import CostGuide from './CostGuide'
import AreaFAQAccordion from './AreaFAQAccordion'
import DentistCard from '@/components/DentistCard'
import { isOpenNowFromHours } from '@/lib/time'

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
    .select('name, dentist_count')
    .eq('slug', slug)
    .eq('city', city.citySlug)
    .single()
  if (!area) return { title: 'Area Not Found' }
  return {
    title: `Best Dentists in ${area.name}, ${city.cityName}`,
    description: `Find top-rated, verified dentists in ${area.name}, ${city.cityName}. Compare fees, read reviews, book appointments. ${area.dentist_count || 0}+ dentists listed.`,
    alternates: { canonical: `https://${city.domain}/area/${slug}` },
  }
}

function getFAQs(areaName: string, dentistCount: number) {
  return [
    {
      q: `How many dentists are there in ${areaName}?`,
      a: `There are currently ${dentistCount || 'several'} verified dentists listed in ${areaName} on our platform. The number continues to grow as we verify and onboard new clinics.`,
    },
    {
      q: `What is the consultation fee in ${areaName}?`,
      a: `Consultation fees in ${areaName} typically range from ₹200 to ₹500 depending on the clinic and doctor's experience. Many clinics in ${areaName} offer free initial consultations for new patients.`,
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
      a: `Look for a dentist who is MCI registered, has at least 4-star ratings, and specialises in the treatment you need. Our verified listings in ${areaName} include transparent fees, qualification details, and real patient reviews to help you decide.`,
    },
  ]
}

function getSEOContent(areaName: string, zone: string, dentistCount: number, cityName: string, domain: string) {
  return {
    intro: `${areaName} is one of ${cityName}'s most sought-after residential and commercial localities, and its dental care landscape reflects that diversity. From boutique smile design studios to multi-specialty dental hospitals, ${areaName} offers a comprehensive range of dental services for residents and visitors alike. Whether you need a routine cleaning, orthodontic treatment, or full-mouth rehabilitation, finding the right dentist in ${areaName} is now easier than ever with ${domain}.`,
    para2: `The dental clinics in ${areaName} are staffed by experienced professionals trained at top Indian dental colleges and abroad. Many clinics in ${areaName} have invested in modern equipment — digital X-rays, CAD/CAM crown milling, laser dentistry, and intra-oral cameras — ensuring that patients receive world-class care without having to travel across ${cityName}. With ${dentistCount || 'multiple'} verified dentists currently listed in ${areaName}, you can compare fees, check availability, and book appointments instantly.`,
  }
}

export default async function AreaPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const { slug } = await params
  const sp = await searchParams
  const ratingFilter = sp.rating || ''
  const openNowFilter = sp.open === 'true'
  const supabase = await createClient()
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  const citySlug = city.citySlug

  const [{ data: area }, { data: allAreas }, { data: treatments }] = await Promise.all([
    // Area slug + city pair — necessary because the same slug may exist in
    // multiple cities (e.g. "central" in Mumbai and Pune).
    supabase.from('areas').select('*').eq('slug', slug).eq('city', citySlug).single(),
    supabase.from('areas').select('id, name, slug, zone, dentist_count').eq('city', citySlug).order('dentist_count', { ascending: false }),
    supabase.from('treatments').select('id, name, slug, icon').order('sort_order'),
  ])

  if (!area) notFound()

  // Fetch dentists in this area (belt-and-suspenders city filter — area_id
  // already encodes city, but explicit filter guards against any cross-city
  // FK quirk).
  let dentistQuery = supabase
    .from('dentists')
    .select(`
      id, slug, name, clinic_name, qualifications, experience_years,
      gender, consultation_fee, emi_available, is_verified, tier,
      profile_photo, whatsapp, phone, working_hours, avg_rating,
      areas(name, slug),
      dentist_treatments(treatments(name, slug))
    `)
    .eq('area_id', area.id)
    .eq('is_active', true)
    .eq('city', citySlug)
    .order('rank_score', { ascending: false })
    .limit(20)

  // Minimum rating filter. Dentists with NULL avg_rating (no reviews) won't
  // match — "no reviews" is not the same as "at least 4 stars".
  if (ratingFilter) {
    const minRating = parseFloat(ratingFilter)
    if (Number.isFinite(minRating)) dentistQuery = dentistQuery.gte('avg_rating', minRating)
  }

  const { data: dentists } = await dentistQuery

  // openNow is a JS-side filter: working_hours is JSONB keyed by day-of-week
  // and "open right now" depends on IST clock time. The .limit(20) above is
  // a curation cap, not pagination — open-now narrows within those 20.
  const isMumbai = city.citySlug === 'mumbai'
  const dentistList = openNowFilter
    ? (dentists || []).filter(d => isOpenNowFromHours((d as any).working_hours))
    : (dentists || [])
  const visibleDentists = dentistList.slice(0, 4)
  const hiddenDentists = dentistList.slice(4)
  // Mumbai groups "nearby" by suburban-rail line. Other cities don't carry
  // that semantics on their zone column, so fall back to any-other-area
  // within the same city.
  const nearbyAreas = (allAreas || [])
    .filter(a => a.slug !== slug && (isMumbai ? a.zone === area.zone : true))
    .slice(0, 6)
  const topSidebarDentists = dentistList.filter(d => d.tier === 'featured' || d.tier === 'gold').slice(0, 4)
  const faqs = getFAQs(area.name, area.dentist_count || dentistList.length)
  const seoContent = getSEOContent(area.name, area.zone, area.dentist_count || dentistList.length, city.cityName, city.domain)

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
          <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
            <Link href="/" style={{ color: 'var(--blue)' }}>Home</Link>
            <span>›</span>
            <Link href="/dentists" style={{ color: 'var(--blue)' }}>Dentists</Link>
            <span>›</span>
            <span style={{ color: 'var(--text)', fontWeight: 500 }}>{area.name}</span>
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
              📍 {isMumbai && area.zone ? `${area.zone} · ${city.cityName}` : area.name}
            </span>
          </div>

          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: '#fff', marginBottom: 12, lineHeight: 1.2 }}>
            Best Dentists in {area.name}, {city.cityName}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16, maxWidth: 560, marginBottom: 32, lineHeight: 1.7 }}>
            Find top-rated, verified dental clinics in {area.name}. Compare fees, read reviews, book appointments instantly.
          </p>

          {/* Stats chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {[
              { label: 'Dentists Listed', value: area.dentist_count || dentistList.length || '10+' },
              { label: 'Verified', value: dentistList.filter(d => d.is_verified).length || '5+' },
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

      {/* TREATMENT NAV TABS */}
      <TreatmentNavTabs areaSlug={slug} treatments={(treatments || []).map(t => ({ name: t.name, slug: t.slug, icon: t.icon || '🦷' }))} activeTab="" />

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
                    <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No dentists listed yet in {area.name}</h3>
                    <p style={{ color: 'var(--muted)', marginBottom: 20 }}>Be the first dental clinic to list in {area.name}</p>
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
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{a.dentist_count || 0} dentists</div>
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
                  When choosing a dentist in {area.name}, verify their MCI registration number, check their specialisation relative to your treatment need, and read at least 10 patient reviews. Fee transparency is also important — a trustworthy clinic will give you a written treatment plan with costs before starting any procedure. All dentists on {city.domain} have been manually verified before listing.
                </p>

                {/* Quick Facts Table */}
                <div style={{ background: 'var(--bg)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <div style={{ padding: '12px 20px', background: 'var(--blue-light)', fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-heading)', color: 'var(--blue-dark)' }}>
                    Quick Facts: {area.name}
                  </div>
                  {[
                    { label: 'Area', value: area.name },
                    // Zone is Mumbai-only context (Western/Central/Harbour…).
                    ...(isMumbai && area.zone ? [{ label: 'Zone', value: area.zone }] : []),
                    { label: 'Dentists Listed', value: String(area.dentist_count || dentistList.length || '10+') },
                    { label: 'Avg Consultation Fee', value: '₹200 – ₹500' },
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

            {/* RIGHT SIDEBAR */}
            <aside style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 20, position: 'sticky', top: 88 }} className="filter-sidebar-desktop">

              {/* Quick Search */}
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '20px' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Find in {area.name}</h3>
                <Link href={`/dentists?area=${slug}`} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                  Search All Dentists →
                </Link>
              </div>

              {/* Top Rated */}
              {topSidebarDentists.length > 0 && (
                <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '20px' }}>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 14 }}>
                    Top Rated in {area.name}
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

              {/* Treatments in Area */}
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '20px' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 14 }}>
                  Treatments in {area.name}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(treatments || []).slice(0, 8).map(t => (
                    <Link key={t.slug} href={`/area/${slug}/${t.slug}`} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0',
                      borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text)',
                    }}>
                      <span>{t.icon}</span>
                      <span style={{ flex: 1 }}>{t.name} in {area.name}</span>
                      <span style={{ color: 'var(--blue)', fontSize: 12 }}>→</span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Nearby Areas */}
              {nearbyAreas.length > 0 && (
                <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '20px' }}>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Nearby Areas</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {nearbyAreas.map(a => (
                      <Link key={a.slug} href={`/area/${a.slug}`} style={{
                        padding: '10px', background: 'var(--bg)', border: '1px solid var(--border)',
                        borderRadius: 8, textAlign: 'center',
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.dentist_count || 0} dentists</div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* CTA */}
              <div style={{ background: 'var(--blue-dark)', borderRadius: 16, padding: '24px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🦷</div>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: '#fff', marginBottom: 8 }}>
                  Are you a dentist in {area.name}?
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

